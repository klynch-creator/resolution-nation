import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { IepArea } from "@/types";

const SYSTEM_PROMPT = `You are a special education expert who writes legally compliant, measurable IEP goals. Generate 2-3 specific, measurable, achievable, relevant, and time-bound (SMART) IEP goals based on the teacher's input.

Return ONLY valid JSON:
{
  "goals": [
    {
      "goal_text": "By [date one year from now], [student] will [specific measurable skill] as measured by [assessment method], improving from [baseline] to [target] with [support level].",
      "area": "ELA|Math|Writing|Behavior|Social-Emotional|Other",
      "baseline": "string describing current performance",
      "target": "string describing goal target",
      "measurement": "string describing how it will be measured",
      "standard": "standard code if applicable or null"
    }
  ]
}`;

interface GeneratedIepGoal {
  goal_text: string;
  area: IepArea;
  baseline: string;
  target: string;
  measurement: string;
  standard: string | null;
}

export async function POST(request: Request) {
  try {
    const { grade, subject, needs, currentPerformance } = await request.json();

    if (!grade || !subject || !needs) {
      return NextResponse.json(
        { error: "Missing required fields: grade, subject, needs." },
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

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const userMessage = `Grade: ${grade}
Subject: ${subject}
Needs: ${needs}
Current performance: ${currentPerformance ?? "Not provided"}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
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

    let goals: GeneratedIepGoal[];
    try {
      const cleaned = content.text
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      goals = parsed.goals;
    } catch {
      console.error("JSON parse error. Raw response:", content.text);
      return NextResponse.json(
        { error: "Goal generation failed — try again." },
        { status: 500 }
      );
    }

    if (!Array.isArray(goals) || goals.length === 0) {
      return NextResponse.json(
        { error: "No goals were generated. Try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ goals });
  } catch (err) {
    console.error("Generate IEP goals error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
