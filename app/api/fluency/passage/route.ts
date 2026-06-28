import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { parseGrade } from "@/lib/fluency/norms";

export const dynamic = "force-dynamic";

// Target passage length (words) so a typical reader spends roughly a minute.
function targetWords(grade: number | null): number {
  if (grade === null) return 90;
  if (grade <= 1) return 50;
  if (grade === 2) return 75;
  if (grade === 3) return 100;
  if (grade <= 5) return 140;
  return 180;
}

const SYSTEM_PROMPT = `You are an expert K-12 reading teacher writing ONE short passage for a student to read ALOUD so we can measure their oral reading fluency.

Return ONLY valid JSON in exactly this format, no other text:
{
  "title": "string (short, friendly title)",
  "passage": "string (the passage the student will read aloud)",
  "standard_alignment": "string (e.g. RF.3.4) or null"
}

Rules:
- The passage must be DECODABLE and natural to read aloud at the requested grade level.
- Use common, age-appropriate vocabulary and sentence length for the grade.
- Be engaging (a tiny story or an interesting nonfiction snippet), not a list.
- Plain prose only: no headings, bullet points, dialogue tags overload, or unusual symbols, numerals, or abbreviations (spell out numbers).
- Hit approximately the requested word count (±15%).
- Age-appropriate and safe for K-12. No violence, adult themes, or sensitive content.
- Do NOT reuse any of the listed already-used titles/topics.`;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, {
    routeKey: "fluency-passage",
    limit: 20,
    windowSec: 60,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const body = await request.json().catch(() => ({}));
    const requestedTopic: string | null = body.topic ?? null;
    const goalId: string | null = body.goalId ?? null;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const studentId = user.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("grade, role")
      .eq("id", studentId)
      .single();
    if (profile?.role !== "student") {
      return NextResponse.json(
        { error: "Only students can start a fluency reading." },
        { status: 403 }
      );
    }
    const gradeRaw = profile?.grade ?? null;
    const grade = parseGrade(gradeRaw);
    const target = targetWords(grade);

    // Exclude passages the student already has.
    const { data: prior } = await supabase
      .from("fluency_assessments")
      .select("passage_title, content_key")
      .eq("student_id", studentId);
    const priorTitles = (prior ?? []).map((p) => p.passage_title);
    const priorKeys = new Set((prior ?? []).map((p) => p.content_key));

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const userMessage = `Grade level: ${gradeRaw ?? "not specified"}
Target length: about ${target} words.
${requestedTopic ? `Topic to write about: ${requestedTopic}` : "Topic: you choose something fresh and interesting."}
Already-used titles (do NOT repeat): ${priorTitles.length ? priorTitles.join("; ") : "none yet"}

Write the passage now.`;

    let generated: { title: string; passage: string; standard_alignment: string | null } | null =
      null;
    let contentKey = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });
      const content = message.content[0];
      if (content.type !== "text") continue;
      try {
        const cleaned = content.text
          .replace(/^```(?:json)?\n?/m, "")
          .replace(/\n?```$/m, "")
          .trim();
        const parsed = JSON.parse(cleaned);
        if (!parsed.passage || typeof parsed.passage !== "string") continue;
        const key = createHash("sha256")
          .update(parsed.passage.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 200))
          .digest("hex")
          .slice(0, 32);
        if (priorKeys.has(key)) continue;
        generated = parsed;
        contentKey = key;
        break;
      } catch {
        continue;
      }
    }

    if (!generated) {
      return NextResponse.json(
        { error: "Could not create a reading passage. Please try again." },
        { status: 502 }
      );
    }

    const wordCount = countWords(generated.passage);
    const source = goalId ? "roadmap" : "library";

    const { data: assessment, error: insertError } = await supabase
      .from("fluency_assessments")
      .insert({
        student_id: studentId,
        source,
        goal_id: goalId,
        subject: "Reading",
        grade: gradeRaw,
        passage_title: generated.title ?? "Reading Passage",
        passage_text: generated.passage.trim(),
        passage_word_count: wordCount,
        standard_alignment: generated.standard_alignment ?? null,
        content_key: contentKey,
        status: "active",
      })
      .select()
      .single();

    if (insertError || !assessment) {
      if (insertError?.code === "23505") {
        return NextResponse.json(
          { error: "You already have this passage. Try another topic." },
          { status: 409 }
        );
      }
      console.error("Fluency passage insert error:", insertError);
      return NextResponse.json({ error: "Failed to save passage." }, { status: 500 });
    }

    return NextResponse.json({ assessment });
  } catch (err) {
    console.error("Fluency passage error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
