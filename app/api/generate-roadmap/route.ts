import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are an expert K-12 curriculum designer creating personalized learning roadmaps. Create a step-by-step learning plan that is curriculum-aligned, scaffolded from easier to harder, and engaging for students.

Return ONLY valid JSON in exactly this format, no other text:
{
  "steps": [
    {
      "step_order": 1,
      "title": "string",
      "description": "string (1-2 sentences describing what the student will do)",
      "workout_type": "lesson|practice|quiz|test-prep",
      "standard_alignment": "string (e.g. RI.3.2) or null",
      "star_reward": 10,
      "activities": {
        "questions": [
          {
            "difficulty": "easy|medium|hard",
            "question": "string",
            "options": ["A", "B", "C", "D"],
            "correct_index": 0,
            "hint": "string"
          }
        ]
      }
    }
  ]
}

Rules:
- Generate 5-7 steps, scaffolded from foundational to grade-level to challenge
- Each step must have exactly 6 questions: 2 easy, 2 medium, 2 hard
- Questions should be multiple choice with 4 options
- correct_index is 0-based (0=A, 1=B, 2=C, 3=D)
- star_reward: 5 for easy steps, 10 for medium, 15-20 for hard/test-prep steps
- workout_type progression: lesson → practice → practice → quiz → quiz → test-prep (adjust as needed)
- Questions should match NYSTP (New York State Testing Program) style for ELA and math
- Make questions age-appropriate for the student's grade level
- The first step should be accessible even for struggling students`;

export async function POST(request: Request) {
  try {
    const { goalId, studentId } = await request.json();

    if (!goalId || !studentId) {
      return NextResponse.json(
        { error: "Missing required fields: goalId, studentId." },
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

    // Fetch the goal
    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("*")
      .eq("id", goalId)
      .eq("teacher_id", user.id)
      .single();

    if (goalError || !goal) {
      return NextResponse.json({ error: "Goal not found." }, { status: 404 });
    }

    // Fetch student grade from profiles
    const { data: studentProfile } = await supabase
      .from("profiles")
      .select("grade, full_name")
      .eq("id", studentId)
      .single();

    const grade = studentProfile?.grade ?? "not specified";

    // Call Claude API
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const userMessage = `Student goal: ${goal.friendly_text}
Standard: ${goal.standard_code ?? "not specified"}
Subject: ${goal.subject ?? "not specified"}
Grade level: ${grade}
Current performance: ${goal.source ?? "not specified"}
Priority: ${goal.priority}

Generate a complete learning roadmap with 5-7 steps and 6 questions per step (2 easy, 2 medium, 2 hard).`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
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

    // Parse JSON — strip markdown code fences if present
    let roadmapData: { steps: Array<{
      step_order: number;
      title: string;
      description: string;
      workout_type: string;
      standard_alignment: string | null;
      star_reward: number;
      activities: { questions: unknown[] };
    }> };
    try {
      const cleaned = content.text
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();
      roadmapData = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse error. Raw response:", content.text);
      return NextResponse.json(
        { error: "AI returned invalid data. Please try again." },
        { status: 500 }
      );
    }

    if (!roadmapData.steps || !Array.isArray(roadmapData.steps)) {
      return NextResponse.json(
        { error: "AI returned unexpected structure. Please try again." },
        { status: 500 }
      );
    }

    // Delete any existing roadmap for this goal+teacher (handles regeneration)
    const { data: existingRoadmap } = await supabase
      .from("learning_roadmaps")
      .select("id")
      .eq("goal_id", goalId)
      .eq("teacher_id", user.id)
      .maybeSingle();

    if (existingRoadmap) {
      // Steps cascade-delete via FK
      await supabase
        .from("learning_roadmaps")
        .delete()
        .eq("id", existingRoadmap.id);
    }

    // Insert new roadmap
    const { data: roadmap, error: roadmapError } = await supabase
      .from("learning_roadmaps")
      .insert({
        goal_id: goalId,
        student_id: studentId,
        teacher_id: user.id,
        status: "draft",
      })
      .select()
      .single();

    if (roadmapError || !roadmap) {
      console.error("Roadmap insert error:", roadmapError);
      return NextResponse.json(
        { error: "Failed to save roadmap." },
        { status: 500 }
      );
    }

    // Insert steps — first step active, rest locked
    const stepsToInsert = roadmapData.steps.map((step, index) => ({
      roadmap_id: roadmap.id,
      step_order: step.step_order ?? index + 1,
      title: step.title,
      description: step.description,
      workout_type: step.workout_type,
      standard_alignment: step.standard_alignment ?? null,
      star_reward: step.star_reward ?? 10,
      activities: step.activities,
      status: index === 0 ? "active" : "locked",
    }));

    const { data: steps, error: stepsError } = await supabase
      .from("roadmap_steps")
      .insert(stepsToInsert)
      .select();

    if (stepsError) {
      console.error("Steps insert error:", stepsError);
      return NextResponse.json(
        { error: "Failed to save roadmap steps." },
        { status: 500 }
      );
    }

    return NextResponse.json({ roadmap: { ...roadmap, roadmap_steps: steps } });
  } catch (err) {
    console.error("Generate roadmap error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
