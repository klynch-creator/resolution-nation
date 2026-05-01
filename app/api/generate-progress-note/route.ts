import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { IepProgressLevel } from "@/types";

const SYSTEM_PROMPT = `You are a special education teacher writing a formal progress note for a student's IEP. Write in professional, legally appropriate language suitable for DOE submission. Be specific about data from the student's work.

Return ONLY valid JSON:
{
  "progress_note": "string — 3-4 sentence professional progress note",
  "progress_level": "Emerging|Developing|Approaching|Meeting|Exceeding",
  "data_points": ["string describing specific performance data point"]
}`;

interface GeneratedProgressNote {
  progress_note: string;
  progress_level: IepProgressLevel;
  data_points: string[];
}

export async function POST(request: Request) {
  try {
    const { goalText, timePeriod, studentId } = await request.json();

    if (!goalText || !timePeriod || !studentId) {
      return NextResponse.json(
        { error: "Missing required fields: goalText, timePeriod, studentId." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Gather recent workout accuracy stats for this student
    const { data: responses } = await supabase
      .from("workout_responses")
      .select("is_correct, difficulty, created_at")
      .eq("user_id", studentId)
      .order("created_at", { ascending: false })
      .limit(50);

    const total = responses?.length ?? 0;
    const correct = responses?.filter((r) => r.is_correct).length ?? 0;
    const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : null;

    const difficultyBreakdown: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
    responses?.forEach((r) => {
      if (r.difficulty) difficultyBreakdown[r.difficulty]++;
    });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const userMessage = `IEP Goal: ${goalText}
Time Period: ${timePeriod}
Student Performance Data (last ${total} workout responses):
- Overall accuracy: ${accuracyPct !== null ? `${accuracyPct}%` : "No data available"}
- Easy questions answered: ${difficultyBreakdown.easy}
- Medium questions answered: ${difficultyBreakdown.medium}
- Hard questions answered: ${difficultyBreakdown.hard}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected response format from AI." },
        { status: 500 }
      );
    }

    let result: GeneratedProgressNote;
    try {
      const cleaned = content.text
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();
      result = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse error. Raw response:", content.text);
      return NextResponse.json(
        { error: "Progress note generation failed — try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Generate progress note error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
