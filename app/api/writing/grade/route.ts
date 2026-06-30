import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getAdmin, moderate, applyModeration, extractJson } from "@/lib/writing-moderation";
import { gradeToLevel, deriveTier, nextLevel, writingStars } from "@/lib/adaptive";
import type { PasteEvent } from "@/types";

export const dynamic = "force-dynamic";

interface GradeResult {
  score: number;
  strengths: string;
  feedback: string;
  improvement: string;
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "writing-grade", limit: 30, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const body = await request.json();
    const mode: string = body.mode;
    const response: string = (body.response ?? "").toString();
    const prompt: string = (body.prompt ?? "").toString();
    const passageText: string = (body.passageText ?? "").toString();
    const passageTitle: string | null = body.passageTitle ?? null;
    const subject: string | null = body.subject ?? "Writing";
    const standard: string | null = body.standard_alignment ?? null;
    const assignmentId: string | null = body.assignmentId ?? null;
    const pasteEvents: PasteEvent[] = Array.isArray(body.pasteEvents) ? body.pasteEvents : [];

    if (mode !== "short_response" && mode !== "essay") {
      return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
    }
    if (response.trim().length < 2) {
      return NextResponse.json({ error: "Please write a response first." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, grade, is_frozen")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "student") {
      return NextResponse.json({ error: "Only students can submit writing." }, { status: 403 });
    }
    if (profile?.is_frozen) {
      return NextResponse.json({ error: "Your account is paused. Please see your teacher." }, { status: 423 });
    }

    const admin = getAdmin();
    const rubricMax = mode === "short_response" ? 2 : 4;
    const pasteFlagged = pasteEvents.length > 0;

    // 1. Store the submission first (so the teacher can always see exactly what
    //    was written, even if it's blocked or grading fails).
    const { data: inserted, error: insErr } = await admin
      .from("writing_submissions")
      .insert({
        student_id: user.id,
        assignment_id: assignmentId,
        mode,
        subject,
        grade: profile?.grade ?? null,
        standard_alignment: standard,
        passage_title: passageTitle,
        passage_text: passageText,
        prompt,
        response_text: response,
        rubric_max: rubricMax,
        status: "submitted",
        paste_flagged: pasteFlagged,
        paste_events: pasteFlagged ? pasteEvents : null,
      })
      .select()
      .single();
    if (insErr || !inserted) {
      console.error("writing submission insert error:", insErr);
      return NextResponse.json({ error: "Could not save your response." }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    // 2. Moderate. Block (freeze) on clearly inappropriate content.
    const mod = await moderate(anthropic, response, mode);
    const { blocked } = await applyModeration(admin, {
      studentId: user.id,
      sourceType: "writing_submission",
      sourceId: inserted.id,
      mode,
      text: response,
      result: mod,
    });
    if (blocked) {
      return NextResponse.json({ blocked: true });
    }

    // 3. Grade on the state rubric with specific, actionable feedback.
    const system =
      mode === "short_response"
        ? `You are an expert ELA teacher scoring a STUDENT short response like a state test. Use a 2-point rubric (0, 1, or 2): 2 = fully answers with a clear claim and relevant, accurate text evidence and explanation; 1 = partial (vague claim, weak/insufficient evidence); 0 = incorrect/irrelevant/off-topic. Coach using the RACE/RADD structure (Restate, Answer, Cite Evidence, Explain).

Return ONLY JSON: { "score": 0|1|2, "strengths": "string", "feedback": "string", "improvement": "string (a concrete, RACE/RADD-aligned next step, ideally with a model sentence stem)" }
Be warm, specific, and grade-appropriate. Never include anything unsafe.`
        : `You are an expert ELA teacher scoring a STUDENT essay like a state extended-response. Use a 4-point rubric (0–4) weighing: focus/claim, organization, use of text evidence, elaboration/analysis, and language/conventions. 4 = strong across all; lower scores reflect gaps.

Return ONLY JSON: { "score": 0|1|2|3|4, "strengths": "string", "feedback": "string (overall, by rubric area)", "improvement": "string (specific editing/revision help: what to fix and how, with an example)" }
Be warm, specific, and grade-appropriate. Never include anything unsafe.`;

    const userMsg = `Grade level: ${profile?.grade ?? "n/a"}
${passageText ? `PASSAGE (${passageTitle ?? "untitled"}):\n"""${passageText.slice(0, 6000)}"""\n` : ""}
PROMPT: ${prompt}

STUDENT RESPONSE:
"""${response.slice(0, 6000)}"""
${pasteFlagged ? "\nNOTE: The student pasted text into the response field. Consider originality, but still score the writing present." : ""}

Score it now.`;

    let grade: GradeResult | null = null;
    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: userMsg }],
      });
      const c = msg.content[0];
      if (c.type === "text") {
        const parsed = JSON.parse(extractJson(c.text)) as GradeResult;
        const s = Math.max(0, Math.min(rubricMax, Math.round(Number(parsed.score))));
        grade = {
          score: Number.isFinite(s) ? s : 0,
          strengths: parsed.strengths ?? "",
          feedback: parsed.feedback ?? "",
          improvement: parsed.improvement ?? "",
        };
      }
    } catch {
      grade = null;
    }

    if (!grade) {
      return NextResponse.json(
        { error: "Saved your response, but grading failed. Please try again.", submissionId: inserted.id },
        { status: 502 }
      );
    }

    await admin
      .from("writing_submissions")
      .update({
        score: grade.score,
        strengths: grade.strengths,
        feedback: grade.feedback,
        improvement: grade.improvement,
        status: "graded",
        graded_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);

    // 4. Award stars by rubric (idempotent per submission), then nudge the
    //    student's adaptive Writing level toward the ~80% target band.
    let starsAwarded = writingStars(rubricMax, grade.score);
    const { data: priorStar } = await admin
      .from("star_transactions")
      .select("id")
      .eq("type", "earned")
      .eq("item_id", inserted.id)
      .limit(1);
    if (priorStar && priorStar.length > 0) {
      starsAwarded = 0;
    } else {
      await admin
        .from("star_transactions")
        .insert({ user_id: user.id, amount: starsAwarded, type: "earned", item_id: inserted.id });
    }

    // Adaptive level update for Writing (dampened — each prompt grades separately).
    const scorePct = rubricMax > 0 ? (grade.score / rubricMax) * 100 : 0;
    const { data: wTier } = await admin
      .from("student_skill_tiers")
      .select("level, lessons_completed")
      .eq("student_id", user.id)
      .eq("subject", "Writing")
      .is("goal_id", null)
      .maybeSingle();
    const curLevel =
      wTier?.level != null ? Number(wTier.level) : gradeToLevel(profile?.grade ?? null);
    const done = wTier?.lessons_completed ?? 0;
    const newLevel = nextLevel(curLevel, scorePct, done, 0.5);
    const newTier = deriveTier(newLevel, profile?.grade ?? null);
    if (wTier) {
      await admin
        .from("student_skill_tiers")
        .update({ level: newLevel, tier: newTier, lessons_completed: done + 1, updated_at: new Date().toISOString() })
        .eq("student_id", user.id)
        .eq("subject", "Writing")
        .is("goal_id", null);
    } else {
      await admin.from("student_skill_tiers").insert({
        student_id: user.id,
        goal_id: null,
        subject: "Writing",
        tier: newTier,
        level: newLevel,
        lessons_completed: 1,
      });
    }

    return NextResponse.json({
      submissionId: inserted.id,
      score: grade.score,
      rubric_max: rubricMax,
      stars_awarded: starsAwarded,
      strengths: grade.strengths,
      feedback: grade.feedback,
      improvement: grade.improvement,
      flagged: mod.verdict === "borderline",
      paste_flagged: pasteFlagged,
    });
  } catch (err) {
    console.error("Writing grade error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
