import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import type { LessonTier, RoadmapQuestion } from "@/types";

export const dynamic = "force-dynamic";

const TIER_GUIDANCE: Record<LessonTier, string> = {
  below:
    "Slightly below grade level — foundational and confidence-building. Scaffold heavily, keep vocabulary simple.",
  at: "On grade level — matches the student's current grade expectations.",
  above:
    "Above grade level — a stretch/challenge. Introduce harder vocabulary and multi-step reasoning.",
};

const SYSTEM_PROMPT = `You are an expert K-12 teacher writing a single short, engaging lesson for one student.

Return ONLY valid JSON in exactly this format, no other text:
{
  "title": "string (short, friendly lesson title)",
  "topic": "string (the specific topic/skill, 2-5 words)",
  "standard_alignment": "string (e.g. RI.3.2) or null",
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

Rules:
- Exactly 6 questions: 2 easy, 2 medium, 2 hard.
- Multiple choice, exactly 4 options each.
- correct_index is 0-based (0=A, 1=B, 2=C, 3=D).
- Age-appropriate and safe for K-12. No violence, adult themes, or sensitive content.
- Make it specific and interesting, not generic.
- Do NOT reproduce any of the topics listed as already-completed.`;

interface GeneratedLesson {
  title: string;
  topic: string;
  standard_alignment: string | null;
  questions: RoadmapQuestion[];
}

function computeContentKey(
  subject: string,
  topic: string,
  tier: string,
  questions: RoadmapQuestion[]
): string {
  const stems = questions
    .map((q) => q.question.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40))
    .sort()
    .join("|");
  return createHash("sha256")
    .update(`${subject.toLowerCase()}::${topic.toLowerCase()}::${tier}::${stems}`)
    .digest("hex")
    .slice(0, 32);
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, {
    routeKey: "lessons-generate",
    limit: 20,
    windowSec: 60,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const body = await request.json();
    const subject: string | undefined = body.subject;
    const requestedTopic: string | null = body.topic ?? null;
    const goalId: string | null = body.goalId ?? null;
    const roadmapStepId: string | null = body.roadmapStepId ?? null;

    if (!subject) {
      return NextResponse.json(
        { error: "Missing required field: subject." },
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
    const studentId = user.id;

    // Student profile (grade) + role check.
    const { data: profile } = await supabase
      .from("profiles")
      .select("grade, role")
      .eq("id", studentId)
      .single();

    if (profile?.role !== "student") {
      return NextResponse.json(
        { error: "Only students can generate lessons." },
        { status: 403 }
      );
    }
    const grade = profile?.grade ?? "not specified";

    // If a goal is supplied, fetch it for context (must belong to this student).
    let goalText: string | null = null;
    let goalStandard: string | null = null;
    if (goalId) {
      const { data: goal } = await supabase
        .from("goals")
        .select("friendly_text, standard_code, subject, student_id")
        .eq("id", goalId)
        .single();
      if (!goal || goal.student_id !== studentId) {
        return NextResponse.json({ error: "Goal not found." }, { status: 404 });
      }
      goalText = goal.friendly_text;
      goalStandard = goal.standard_code;
    }

    const source = goalId || roadmapStepId ? "roadmap" : "library";

    // Resolve current tier from persisted skill tier (default 'at').
    const { data: tierRow } = await supabase
      .from("student_skill_tiers")
      .select("tier")
      .eq("student_id", studentId)
      .eq("subject", subject)
      .is("goal_id", goalId ?? null)
      .maybeSingle();
    const tier: LessonTier = (tierRow?.tier as LessonTier) ?? "at";

    // Retry path: if a failed lesson exists for this subject (+topic), reactivate
    // and return it rather than generating a fresh one.
    let retryQuery = supabase
      .from("lessons")
      .select("*")
      .eq("student_id", studentId)
      .eq("subject", subject)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1);
    if (requestedTopic) retryQuery = retryQuery.eq("topic", requestedTopic);
    const { data: failedLessons } = await retryQuery;
    if (failedLessons && failedLessons.length > 0) {
      const failed = failedLessons[0];
      const { data: reactivated } = await supabase
        .from("lessons")
        .update({ status: "active" })
        .eq("id", failed.id)
        .select()
        .single();
      return NextResponse.json({ lesson: reactivated ?? failed, retry: true });
    }

    // Build the exclusion set: topics/keys the student already has (non-failed).
    const { data: priorLessons } = await supabase
      .from("lessons")
      .select("topic, content_key")
      .eq("student_id", studentId)
      .eq("subject", subject)
      .in("status", ["active", "completed"]);
    const priorTopics = Array.from(
      new Set((priorLessons ?? []).map((l) => l.topic))
    );
    const priorKeys = new Set((priorLessons ?? []).map((l) => l.content_key));

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const userMessage = `Subject: ${subject}
Grade level: ${grade}
Difficulty tier: ${tier} — ${TIER_GUIDANCE[tier]}
${requestedTopic ? `Requested topic: ${requestedTopic}` : "Topic: you choose a fresh, engaging topic in this subject."}
${goalText ? `This lesson should help the student toward their goal: "${goalText}"${goalStandard ? ` (standard ${goalStandard})` : ""}.` : ""}
Already-completed topics (do NOT repeat any of these): ${priorTopics.length ? priorTopics.join("; ") : "none yet"}

Write the lesson now.`;

    // Generate, with a couple of retries if we hit a content_key collision.
    let generated: GeneratedLesson | null = null;
    let contentKey = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
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
        const parsed = JSON.parse(cleaned) as GeneratedLesson;
        if (!parsed.questions || parsed.questions.length === 0) continue;
        const key = computeContentKey(
          subject,
          parsed.topic ?? requestedTopic ?? subject,
          tier,
          parsed.questions
        );
        if (priorKeys.has(key)) continue; // duplicate — try again
        generated = parsed;
        contentKey = key;
        break;
      } catch {
        continue;
      }
    }

    if (!generated) {
      return NextResponse.json(
        { error: "Could not generate a fresh lesson. Please try again." },
        { status: 502 }
      );
    }

    const topic = generated.topic ?? requestedTopic ?? subject;
    const starReward = tier === "below" ? 5 : tier === "above" ? 15 : 10;

    const { data: lesson, error: insertError } = await supabase
      .from("lessons")
      .insert({
        student_id: studentId,
        source,
        goal_id: goalId,
        roadmap_step_id: roadmapStepId,
        subject,
        topic,
        title: generated.title ?? topic,
        tier,
        standard_alignment: generated.standard_alignment ?? null,
        activities: { questions: generated.questions },
        star_reward: starReward,
        content_key: contentKey,
        status: "active",
      })
      .select()
      .single();

    if (insertError || !lesson) {
      // 23505 = unique violation (no-repeat index). Surface a friendly message.
      if (insertError?.code === "23505") {
        return NextResponse.json(
          { error: "You've already done this lesson. Pick another topic." },
          { status: 409 }
        );
      }
      console.error("Lesson insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save lesson." },
        { status: 500 }
      );
    }

    return NextResponse.json({ lesson });
  } catch (err) {
    console.error("Generate lesson error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
