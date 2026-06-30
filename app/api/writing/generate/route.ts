import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { extractJson } from "@/lib/writing-moderation";
import {
  gradeToLevel,
  deriveTier,
  levelToGradeLabel,
  describeReadingLevel,
  shortResponseCount,
  needsWritingScaffold,
} from "@/lib/adaptive";

export const dynamic = "force-dynamic";

interface PromptSupport {
  stems: string[];
  structure: string;
}
interface GenResult {
  passage: { title: string; text: string };
  standard_alignment: string | null;
  prompts: string[];
  supports?: (PromptSupport | null)[] | null;
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "writing-generate", limit: 20, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const body = await request.json();
    const mode: string = body.mode;
    const topic: string | null = body.topic ?? null;
    if (mode !== "short_response" && mode !== "essay") {
      return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("grade, role, is_frozen")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "student") {
      return NextResponse.json({ error: "Only students can practice writing." }, { status: 403 });
    }
    if (profile?.is_frozen) {
      return NextResponse.json({ error: "Your account is paused. Please see your teacher." }, { status: 423 });
    }
    const grade = profile?.grade ?? "not specified";

    // Continuous WRITING level (init from enrolled grade the first time).
    const { data: tierRow } = await supabase
      .from("student_skill_tiers")
      .select("level")
      .eq("student_id", user.id)
      .eq("subject", "Writing")
      .is("goal_id", null)
      .maybeSingle();
    const level: number = tierRow?.level != null ? Number(tierRow.level) : gradeToLevel(grade);
    const tier = deriveTier(level, grade);
    const reading = describeReadingLevel(level);
    const scaffold = needsWritingScaffold(level, grade);
    const promptCount = mode === "short_response" ? shortResponseCount(level) : 1;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const supportRule = scaffold
      ? `\n- The student is an EMERGING/struggling writer. For EACH prompt also provide "supports": { "stems": [2–4 sentence starters the student can copy and finish, e.g. "The passage is mostly about ___" , "One detail that shows this is ___"], "structure": "a one-sentence, kid-friendly reminder of how to organize the answer (Restate, Answer, Cite evidence, Explain)" }. Keep stems at the student's level: ${reading.guidance}`
      : `\n- The student does NOT need scaffolds. Set "supports" to null.`;

    const shortRules = `Produce a "short_response" set:
- One original reading passage of about ${reading.passageWords}, in the style of a state ELA test. DIFFICULTY (match exactly): ${reading.guidance}
- Exactly ${promptCount} short-response question${promptCount > 1 ? "s" : ""} that require text evidence and follow RACE/RADD (Restate, Answer, Cite evidence, Explain), pitched to the level above.${supportRule}`;
    const essayRules = `Produce an "essay" set:
- One original reading passage of about ${reading.passageWords}, in the style of a state ELA test. DIFFICULTY (match exactly): ${reading.guidance}
- Exactly 1 essay prompt tied to the passage (argument, informational/explanatory, OR narrative as fits the level), phrased like a state extended-response task. Use evidence from the passage.${supportRule}`;

    const system = `You are an expert K-12 ELA teacher and assessment item writer. Pitch the passage, prompts, and vocabulary to the difficulty level described — a struggling writer must get genuinely simple, supportive material; an advanced writer must be challenged.

Return ONLY valid JSON, no other text:
{
  "passage": { "title": "string", "text": "string" },
  "standard_alignment": "string (e.g. W.4.1 / RI.4.1) or null",
  "prompts": ["string", ...],
  "supports": [ { "stems": ["string"], "structure": "string" } ] or null
}

${mode === "short_response" ? shortRules : essayRules}
- If "supports" is provided, it MUST be an array parallel to "prompts" (one entry per prompt, same order).
- Age-appropriate and safe for K-12.`;

    const userMsg = `Target writing level: ${levelToGradeLabel(level)} (the student's measured level — pitch here, not necessarily their enrolled grade ${grade}).
${topic ? `Preferred theme/topic: ${topic}` : "Choose an engaging, fresh topic."}

Generate the passage and ${promptCount} ${mode === "short_response" ? "short-response question(s)" : "essay prompt"} now${scaffold ? ", including supports for each prompt" : ""}.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    if (message.stop_reason === "max_tokens") {
      return NextResponse.json({ error: "Generation was too long. Please try again." }, { status: 500 });
    }
    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Unexpected AI response." }, { status: 500 });
    }

    let gen: GenResult;
    try {
      gen = JSON.parse(extractJson(content.text)) as GenResult;
    } catch {
      return NextResponse.json({ error: "AI returned invalid data. Please try again." }, { status: 500 });
    }
    if (!gen.passage?.text || !Array.isArray(gen.prompts) || gen.prompts.length === 0) {
      return NextResponse.json({ error: "Incomplete generation. Please try again." }, { status: 500 });
    }

    const maxPrompts = mode === "short_response" ? promptCount : 1;
    const prompts = gen.prompts.slice(0, maxPrompts);
    const supports =
      scaffold && Array.isArray(gen.supports)
        ? prompts.map((_, i) => gen.supports?.[i] ?? null)
        : null;

    return NextResponse.json({
      assignmentId: randomUUID(),
      mode,
      passage: gen.passage,
      prompts,
      supports,
      scaffold,
      standard_alignment: gen.standard_alignment ?? null,
      rubric_max: mode === "short_response" ? 2 : 4,
      tier,
      level,
      gradeLabel: levelToGradeLabel(level),
      grade,
    });
  } catch (err) {
    console.error("Writing generate error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
