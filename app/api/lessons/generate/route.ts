import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import type { LessonTier, RoadmapQuestion, CurriculumExtract } from "@/types";

export const dynamic = "force-dynamic";

const TIER_GUIDANCE: Record<LessonTier, string> = {
  below:
    "Slightly below grade level — foundational and confidence-building. Scaffold heavily, keep vocabulary simple.",
  at: "On grade level — matches the student's current grade expectations.",
  above:
    "Above grade level — a stretch/challenge. Introduce harder vocabulary and multi-step reasoning.",
};

// Stronger students get longer lessons (capped at 20). Distribution feeds the
// adaptive player, which needs questions in each difficulty bucket.
const QUESTION_PLAN: Record<LessonTier, { total: number; easy: number; medium: number; hard: number }> = {
  below: { total: 6, easy: 2, medium: 2, hard: 2 },
  at: { total: 10, easy: 3, medium: 4, hard: 3 },
  above: { total: 16, easy: 4, medium: 6, hard: 6 },
};

function isMathSubject(subject: string): boolean {
  return /\bmath/i.test(subject);
}

function isSpellingSubject(subject: string): boolean {
  return /\bspell/i.test(subject);
}

/** Pull the JSON object out of a model response, tolerating fences/prose. */
function extractJson(text: string): string {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) return t.slice(first, last + 1);
  return t;
}

function buildSystemPrompt(
  plan: { total: number; easy: number; medium: number; hard: number },
  opts: { math: boolean; spelling: boolean; spellingCurriculum: string | null }
): string {
  const { math, spelling, spellingCurriculum } = opts;
  const usePassage = !math && !spelling;
  const passageBlock = usePassage
    ? `  "passage": { "title": "string", "text": "string (the reading passage)" },
`
    : "";

  let contentRules: string;
  if (spelling) {
    contentRules = `- This is a SPELLING lesson: no reading passage. Set "passage" to null.
- Each question targets spelling. Vary the formats: choose the correctly spelled word; find the misspelled word; pick the right spelling to complete a sentence; choose the correct plural/past-tense/affixed form. Use the word in a short sentence for context where helpful.
- Distractors must be realistic misspellings (common errors for the grade), not random.
- Scale word difficulty to the grade and tier.${
      spellingCurriculum
        ? `\n- ALIGN to the teacher's curriculum. Use these spelling words / patterns from the school's curriculum as the basis of the lesson:\n${spellingCurriculum}`
        : `\n- No curriculum was provided, so build a grade-appropriate spelling lesson at the student's level (grade-level high-frequency words and spelling patterns/word families).`
    }`;
  } else if (math) {
    contentRules = `- This is MATH: no reading passage. Use clear, self-contained word problems and computation questions. Set "passage" to null.`;
  } else {
    contentRules = `- Include a "passage": an original, grade-level reading passage (about 200–400 words, scaled to the grade) written in the style of a state standardized test (e.g. NYSTP / state ELA & content-area tests): informational or literary, with a clear main idea, structure, and grade-appropriate academic vocabulary.
- MOST questions must require reading the passage to answer (main idea, key details, inference, vocabulary-in-context, author's purpose, text structure) — mirroring real state-test items. Quote or reference the passage where natural.`;
  }

  return `You are an expert K-12 teacher and assessment writer creating a single rigorous, engaging lesson for one student. Your questions should mirror the rigor and style of state standardized tests — not easy trivia.

Return ONLY valid JSON in exactly this format, no other text:
{
  "title": "string (short, friendly lesson title)",
  "topic": "string (the specific topic/skill, 2-5 words)",
  "standard_alignment": "string (e.g. RI.3.2) or null",
${passageBlock}  "questions": [
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
- Exactly ${plan.total} questions: ${plan.easy} easy, ${plan.medium} medium, ${plan.hard} hard.
- Multiple choice, exactly 4 options each. Exactly ONE option is correct; the other three are plausible distractors (common misconceptions), not obviously wrong.
- correct_index is 0-based (0=A, 1=B, 2=C, 3=D) and MUST point to the genuinely correct option. Double-check every answer, especially math computations.
- Questions should be challenging and test-like — favor reasoning, multi-step problems, and inference over recall.
${contentRules}
- Age-appropriate and safe for K-12. No violence, adult themes, or sensitive content.
- Make it specific and interesting, not generic.
- Do NOT reproduce any of the topics listed as already-completed.`;
}

interface GeneratedLesson {
  title: string;
  topic: string;
  standard_alignment: string | null;
  passage?: { title: string; text: string } | null;
  questions: RoadmapQuestion[];
}

/**
 * Independent answer-key check. Re-solves each question with a fresh model pass
 * and corrects a wrong correct_index or drops a broken (ambiguous / no-correct
 * / multiple-correct) question, so students never see a question that would
 * teach the wrong thing. Runs for ALL subjects. Returns the cleaned questions
 * (falls back to the originals if the check itself fails).
 */
async function verifyQuestions(
  anthropic: Anthropic,
  subject: string,
  grade: string,
  passage: { title: string; text: string } | null,
  questions: RoadmapQuestion[]
): Promise<RoadmapQuestion[]> {
  const checkerSystem = `You are a meticulous answer-key checker for K-12 assessment items. For each question you INDEPENDENTLY work out the correct answer (do the math, read the passage), then judge the provided answer key.

Return ONLY JSON: { "results": [ { "index": number, "verdict": "ok" | "fix" | "drop", "correct_index": number, "reason": "string" } ] }
- "ok": exactly one option is correct and it matches the given correct_index.
- "fix": exactly one option is correct but the given correct_index is wrong — put the right 0-based index in correct_index.
- "drop": the item is broken (no correct option, more than one correct option, or ambiguous/unanswerable).
Be strict about math: actually compute the result.`;

  const payload = {
    subject,
    grade,
    passage: passage ?? undefined,
    questions: questions.map((q, i) => ({
      index: i,
      difficulty: q.difficulty,
      question: q.question,
      options: q.options,
      given_correct_index: q.correct_index,
    })),
  };

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: checkerSystem,
      messages: [{ role: "user", content: `Check these items:\n${JSON.stringify(payload)}` }],
    });
    const c = msg.content[0];
    if (c.type !== "text") return questions;
    const parsed = JSON.parse(extractJson(c.text)) as {
      results?: { index: number; verdict: string; correct_index?: number }[];
    };
    const results = parsed.results ?? [];
    const byIndex = new Map(results.map((r) => [r.index, r]));

    const cleaned: RoadmapQuestion[] = [];
    questions.forEach((q, i) => {
      const r = byIndex.get(i);
      if (!r || r.verdict === "ok") {
        cleaned.push(q);
      } else if (r.verdict === "fix" && typeof r.correct_index === "number" && r.correct_index >= 0 && r.correct_index < q.options.length) {
        cleaned.push({ ...q, correct_index: r.correct_index });
      }
      // "drop" (or malformed fix) → omit the question entirely.
    });
    return cleaned.length > 0 ? cleaned : questions;
  } catch {
    // If verification fails, don't block the lesson — return originals.
    return questions;
  }
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

    const math = isMathSubject(subject);
    const spelling = isSpellingSubject(subject);
    const plan = QUESTION_PLAN[tier];

    // Spelling lessons align to the student's teacher's confirmed curriculum if
    // one exists; otherwise the AI defaults to grade-level spelling.
    let spellingCurriculum: string | null = null;
    if (spelling) {
      const { data: studentGoals } = await supabase
        .from("goals")
        .select("teacher_id")
        .eq("student_id", studentId);
      const teacherIds = Array.from(
        new Set((studentGoals ?? []).map((g) => g.teacher_id).filter(Boolean))
      );
      if (teacherIds.length > 0) {
        const { data: curric } = await supabase
          .from("curricula")
          .select("title, extracted, subject, created_at")
          .in("teacher_id", teacherIds as string[])
          .order("created_at", { ascending: false });
        // Prefer a spelling/ELA curriculum, else the most recent confirmed one.
        const pick =
          (curric ?? []).find((c) => /spell|ela|english|reading|word/i.test(c.subject ?? "")) ??
          (curric ?? [])[0];
        const extract = pick?.extracted as CurriculumExtract | null;
        const units = (extract?.units ?? [])
          .map(
            (u) =>
              `- ${u.name}${u.skills?.length ? ` — words/patterns: ${u.skills.join(", ")}` : ""}`
          )
          .join("\n");
        if (units) spellingCurriculum = `Curriculum "${pick?.title}":\n${units}`;
      }
    }

    const systemPrompt = buildSystemPrompt(plan, { math, spelling, spellingCurriculum });

    const usePassage = !math && !spelling;
    const userMessage = `Subject: ${subject}
Grade level: ${grade}
Difficulty tier: ${tier} — ${TIER_GUIDANCE[tier]}
${requestedTopic ? `Requested topic: ${requestedTopic}` : "Topic: you choose a fresh, engaging topic in this subject."}
${goalText ? `This lesson should help the student toward their goal: "${goalText}"${goalStandard ? ` (standard ${goalStandard})` : ""}.` : ""}
Already-completed topics (do NOT repeat any of these): ${priorTopics.length ? priorTopics.join("; ") : "none yet"}

Write a ${plan.total}-question lesson now${usePassage ? ", including the reading passage" : ""}. Make it as rigorous as a real state test for this grade.`;

    // Generate, with a couple of retries if we hit a content_key collision.
    let generated: GeneratedLesson | null = null;
    let verifiedQuestions: RoadmapQuestion[] = [];
    let contentKey = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 12000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });
      if (message.stop_reason === "max_tokens") continue; // truncated — retry
      const content = message.content[0];
      if (content.type !== "text") continue;
      try {
        const parsed = JSON.parse(extractJson(content.text)) as GeneratedLesson;
        if (!parsed.questions || parsed.questions.length === 0) continue;

        // Independent answer-key check — fix wrong keys, drop broken items.
        const passage = usePassage ? parsed.passage ?? null : null;
        const cleanedQuestions = await verifyQuestions(
          anthropic,
          subject,
          grade,
          passage,
          parsed.questions
        );
        // Need a usable spread for the adaptive player.
        if (cleanedQuestions.length < 4) continue;

        const key = computeContentKey(
          subject,
          parsed.topic ?? requestedTopic ?? subject,
          tier,
          cleanedQuestions
        );
        if (priorKeys.has(key)) continue; // duplicate — try again
        generated = parsed;
        verifiedQuestions = cleanedQuestions;
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
    const passageOut = usePassage ? generated.passage ?? null : null;

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
        activities: { questions: verifiedQuestions, passage: passageOut },
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
