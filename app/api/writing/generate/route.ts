import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { extractJson } from "@/lib/writing-moderation";

export const dynamic = "force-dynamic";

interface GenResult {
  passage: { title: string; text: string };
  standard_alignment: string | null;
  prompts: string[];
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

    // Difficulty tier (persisted) for Writing, default 'at'.
    const { data: tierRow } = await supabase
      .from("student_skill_tiers")
      .select("tier")
      .eq("student_id", user.id)
      .eq("subject", "Writing")
      .is("goal_id", null)
      .maybeSingle();
    const tier = (tierRow?.tier as string) ?? "at";

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const shortRules = `Produce a "short_response" set:
- One original, grade-level reading passage (~250–400 words, scaled to the grade) in the style of a state ELA test (e.g. NYSTP): informational or literary, clear main idea and structure, grade-appropriate academic vocabulary.
- 2 short-response questions that require text evidence and follow the RACE/RADD structure (Restate, Answer, Cite evidence, Explain). These should mirror real state-test short-response items.`;
    const essayRules = `Produce an "essay" set:
- One original, grade-level reading passage (~350–500 words, scaled to the grade) in the style of a state ELA test.
- Exactly 1 essay prompt tied to the passage (argument, informational/explanatory, OR narrative as fits the grade), phrased like a state extended-response task. Ask the student to use evidence from the passage and organize a multi-paragraph response.`;

    const system = `You are an expert K-12 ELA teacher and state-assessment item writer. Create rigorous, on-grade writing practice that mirrors state tests.

Return ONLY valid JSON, no other text:
{
  "passage": { "title": "string", "text": "string" },
  "standard_alignment": "string (e.g. W.4.1 / RI.4.1) or null",
  "prompts": ["string", ...]
}

${mode === "short_response" ? shortRules : essayRules}
- Age-appropriate and safe for K-12.`;

    const userMsg = `Grade level: ${grade}
Writing difficulty tier: ${tier}
${topic ? `Preferred theme/topic: ${topic}` : "Choose an engaging, fresh topic."}

Generate the ${mode === "short_response" ? "passage and 2 short-response questions" : "passage and 1 essay prompt"} now.`;

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

    return NextResponse.json({
      assignmentId: randomUUID(),
      mode,
      passage: gen.passage,
      prompts: gen.prompts.slice(0, mode === "short_response" ? 3 : 1),
      standard_alignment: gen.standard_alignment ?? null,
      rubric_max: mode === "short_response" ? 2 : 4,
      tier,
      grade,
    });
  } catch (err) {
    console.error("Writing generate error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
