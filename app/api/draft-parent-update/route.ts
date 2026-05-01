import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `Write a brief, encouraging parent update about their child's learning progress. Use simple, jargon-free language. Avoid educational acronyms. Be positive and specific.

Return JSON: { "english": "string", "spanish": "string" }`;

export async function POST(request: Request) {
  try {
    const { studentId, studentName } = await request.json();

    if (!studentId) {
      return NextResponse.json(
        { error: "Missing required field: studentId." },
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

    // Gather recent workout stats
    const { data: responses } = await supabase
      .from("workout_responses")
      .select("is_correct, difficulty, created_at")
      .eq("user_id", studentId)
      .order("created_at", { ascending: false })
      .limit(30);

    const total = responses?.length ?? 0;
    const correct = responses?.filter((r) => r.is_correct).length ?? 0;
    const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : null;

    // Recent goals progress
    const { data: goals } = await supabase
      .from("goals")
      .select("friendly_text, status, subject")
      .eq("student_id", studentId)
      .eq("teacher_id", user.id)
      .limit(5);

    const completedGoals = goals?.filter((g) => g.status === "completed") ?? [];
    const inProgressGoals = goals?.filter((g) => g.status === "in_progress") ?? [];

    // IEP goals count
    const { count: iepGoalCount } = await supabase
      .from("iep_goals")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("teacher_id", user.id);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const userMessage = `Student: ${studentName ?? "your child"}
Recent practice sessions: ${total} questions answered
Accuracy: ${accuracyPct !== null ? `${accuracyPct}%` : "No data yet"}
Goals completed: ${completedGoals.length}
Goals in progress: ${inProgressGoals.length}${inProgressGoals.length > 0 ? ` (${inProgressGoals.map((g) => g.subject ?? g.friendly_text.slice(0, 40)).join(", ")})` : ""}
Active learning goals: ${iepGoalCount ?? 0}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
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

    let result: { english: string; spanish: string };
    try {
      const cleaned = content.text
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();
      result = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse error. Raw response:", content.text);
      return NextResponse.json(
        { error: "Parent update generation failed — try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Draft parent update error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
