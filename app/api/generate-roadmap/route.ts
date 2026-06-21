import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { CurriculumExtract, RoadmapQuestion } from "@/types";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are an expert K-12 curriculum designer creating a personalized learning roadmap for one student.

A roadmap is organized into SUBGOALS (milestones that build toward the main goal). Each subgoal targets a specific skill and contains 2-3 scaffolded steps the student works through. You also produce teacher-only ASSESSMENT checkpoints aligned to the school's curriculum — these are for the teacher to gauge progress and are never shown to students or parents.

Return ONLY valid JSON in exactly this format, no other text:
{
  "subgoals": [
    {
      "title": "string (the milestone)",
      "description": "string (1 sentence)",
      "target_skill": "string (the specific skill this builds toward the main goal)",
      "standard_alignment": "string (e.g. RI.3.2) or null",
      "steps": [
        {
          "title": "string",
          "description": "string (1-2 sentences)",
          "workout_type": "lesson|practice|quiz|test-prep",
          "standard_alignment": "string or null",
          "star_reward": 10,
          "activities": {
            "questions": [
              { "difficulty": "easy|medium|hard", "question": "string", "options": ["A","B","C","D"], "correct_index": 0, "hint": "string" }
            ]
          }
        }
      ]
    }
  ],
  "assessments": [
    { "title": "string", "curriculum_unit": "string or null", "standard_alignment": "string or null", "teacher_notes": "string (how the teacher can assess this)" }
  ]
}

Rules:
- 3-4 subgoals, scaffolded from foundational to grade-level to challenge.
- Each subgoal has 2-3 steps. Each step has exactly 6 questions: 2 easy, 2 medium, 2 hard.
- Multiple choice, exactly 4 options, correct_index 0-based.
- star_reward: 5 easy, 10 medium, 15-20 hard/test-prep.
- Questions match NYSTP style for ELA and math, age-appropriate for the grade.
- The first subgoal's first step must be accessible even to a struggling student.
- assessments: 2-4 teacher-facing checkpoints. If a curriculum is provided, align them to its units; otherwise base them on the goal's standard. These must NOT duplicate student step content.`;

interface GenStep {
  title: string;
  description: string;
  workout_type: string;
  standard_alignment: string | null;
  star_reward: number;
  activities: { questions: RoadmapQuestion[] };
}
interface GenSubgoal {
  title: string;
  description: string | null;
  target_skill: string | null;
  standard_alignment: string | null;
  steps: GenStep[];
}
interface GenAssessment {
  title: string;
  curriculum_unit: string | null;
  standard_alignment: string | null;
  teacher_notes: string | null;
}
interface GenRoadmap {
  subgoals?: GenSubgoal[];
  steps?: GenStep[]; // legacy flat format
  assessments?: GenAssessment[];
}

export async function POST(request: Request) {
  try {
    const { goalId, studentId, curriculumId } = await request.json();

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

    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("*")
      .eq("id", goalId)
      .eq("teacher_id", user.id)
      .single();
    if (goalError || !goal) {
      return NextResponse.json({ error: "Goal not found." }, { status: 404 });
    }

    const { data: studentProfile } = await supabase
      .from("profiles")
      .select("grade, full_name")
      .eq("id", studentId)
      .single();
    const grade = studentProfile?.grade ?? "not specified";

    // Optional curriculum context (must belong to this teacher).
    let curriculumBlock = "";
    let curriculumExtract: CurriculumExtract | null = null;
    if (curriculumId) {
      const { data: curriculum } = await supabase
        .from("curricula")
        .select("title, extracted, teacher_id")
        .eq("id", curriculumId)
        .single();
      if (curriculum && curriculum.teacher_id === user.id) {
        curriculumExtract = curriculum.extracted as CurriculumExtract | null;
        const units = (curriculumExtract?.units ?? [])
          .map(
            (u) =>
              `- ${u.name}${u.standards?.length ? ` [${u.standards.join(", ")}]` : ""}${
                u.skills?.length ? ` — skills: ${u.skills.join(", ")}` : ""
              }`
          )
          .join("\n");
        if (units) {
          curriculumBlock = `\n\nSchool curriculum "${curriculum.title}" — align subgoals and teacher assessments to these units:\n${units}`;
        }
      }
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const userMessage = `Student goal: ${goal.friendly_text}
Standard: ${goal.standard_code ?? "not specified"}
Subject: ${goal.subject ?? "not specified"}
Grade level: ${grade}
Current performance: ${goal.source ?? "not specified"}
Priority: ${goal.priority}${curriculumBlock}

Generate the roadmap as 3-4 subgoals (2-3 steps each, 6 questions per step) plus 2-4 teacher-only assessment checkpoints.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
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

    let data: GenRoadmap;
    try {
      const cleaned = content.text
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();
      data = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse error. Raw response:", content.text);
      return NextResponse.json(
        { error: "AI returned invalid data. Please try again." },
        { status: 500 }
      );
    }

    // Normalize: support both subgoal format and legacy flat steps.
    let subgoals: GenSubgoal[] = [];
    if (Array.isArray(data.subgoals) && data.subgoals.length > 0) {
      subgoals = data.subgoals;
    } else if (Array.isArray(data.steps) && data.steps.length > 0) {
      subgoals = [
        {
          title: "Core Skills",
          description: null,
          target_skill: goal.subject ?? null,
          standard_alignment: goal.standard_code ?? null,
          steps: data.steps,
        },
      ];
    } else {
      return NextResponse.json(
        { error: "AI returned unexpected structure. Please try again." },
        { status: 500 }
      );
    }

    // Replace any existing roadmap for this goal (cascade clears subgoals/steps/assessments).
    const { data: existing } = await supabase
      .from("learning_roadmaps")
      .select("id")
      .eq("goal_id", goalId)
      .eq("teacher_id", user.id)
      .maybeSingle();
    if (existing) {
      await supabase.from("learning_roadmaps").delete().eq("id", existing.id);
    }

    const { data: roadmap, error: roadmapError } = await supabase
      .from("learning_roadmaps")
      .insert({
        goal_id: goalId,
        student_id: studentId,
        teacher_id: user.id,
        status: "draft",
        curriculum_source: curriculumId ?? null,
      })
      .select()
      .single();
    if (roadmapError || !roadmap) {
      console.error("Roadmap insert error:", roadmapError);
      return NextResponse.json({ error: "Failed to save roadmap." }, { status: 500 });
    }

    // Insert subgoals + their steps. Global step_order across the whole roadmap;
    // the very first step is active, the rest are locked.
    let globalOrder = 0;
    for (let si = 0; si < subgoals.length; si++) {
      const sg = subgoals[si];
      const { data: subgoalRow, error: sgErr } = await supabase
        .from("roadmap_subgoals")
        .insert({
          roadmap_id: roadmap.id,
          sort_order: si + 1,
          title: sg.title,
          description: sg.description ?? null,
          target_skill: sg.target_skill ?? null,
          standard_alignment: sg.standard_alignment ?? null,
        })
        .select()
        .single();
      if (sgErr || !subgoalRow) {
        console.error("Subgoal insert error:", sgErr);
        return NextResponse.json({ error: "Failed to save subgoals." }, { status: 500 });
      }

      const stepsToInsert = (sg.steps ?? []).map((step) => {
        globalOrder += 1;
        return {
          roadmap_id: roadmap.id,
          subgoal_id: subgoalRow.id,
          step_order: globalOrder,
          title: step.title,
          description: step.description,
          workout_type: step.workout_type,
          standard_alignment: step.standard_alignment ?? null,
          star_reward: step.star_reward ?? 10,
          activities: step.activities,
          status: globalOrder === 1 ? "active" : "locked",
        };
      });
      if (stepsToInsert.length > 0) {
        const { error: stepsErr } = await supabase.from("roadmap_steps").insert(stepsToInsert);
        if (stepsErr) {
          console.error("Steps insert error:", stepsErr);
          return NextResponse.json({ error: "Failed to save roadmap steps." }, { status: 500 });
        }
      }
    }

    // Teacher-only assessments.
    const assessments = Array.isArray(data.assessments) ? data.assessments : [];
    if (assessments.length > 0) {
      await supabase.from("roadmap_assessments").insert(
        assessments.map((a) => ({
          roadmap_id: roadmap.id,
          curriculum_id: curriculumId ?? null,
          title: a.title,
          curriculum_unit: a.curriculum_unit ?? null,
          standard_alignment: a.standard_alignment ?? null,
          teacher_notes: a.teacher_notes ?? null,
        }))
      );
    }

    return NextResponse.json({ roadmap });
  } catch (err) {
    console.error("Generate roadmap error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
