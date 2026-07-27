import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * POST /api/parent/export — parental data export (RN-26).
 *
 * FERPA / NY Ed Law 2-d parental access right, promised in the privacy
 * policy ("Settings -> Export my data"). An APPROVED parent downloads a
 * JSON snapshot of their child's educational record.
 *
 * Rules:
 *   - Requester must be the authenticated parent of an APPROVED
 *     parent_student_link for the requested student.
 *   - IEP goals are included only when shared_with_parent = true,
 *     matching in-product visibility.
 *   - Fluency audio files are NOT inlined (binary); the export lists
 *     attempt metadata + transcripts and notes how to request audio.
 *   - Every export is written to the audit log.
 */

const EXPORT_VERSION = 1;
const ROW_CAP = 5000; // safety cap per table

export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "parent-export", limit: 5, windowSec: 3600 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const { studentId } = await request.json();
    if (!studentId || typeof studentId !== "string") {
      return NextResponse.json({ error: "studentId is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Verify the approved link using the caller's own RLS context.
    const { data: link } = await supabase
      .from("parent_student_links")
      .select("id")
      .eq("parent_id", user.id)
      .eq("student_id", studentId)
      .eq("status", "approved")
      .single();

    if (!link) {
      return NextResponse.json(
        { error: "No approved link to this student." },
        { status: 403 }
      );
    }

    // Service-role client for the read: the parent's RLS context deliberately
    // cannot see every table, but the FERPA export must be complete.
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const s = (table: string, cols: string, key = "student_id") =>
      admin.from(table).select(cols).eq(key, studentId).limit(ROW_CAP);

    const [
      profile,
      goals,
      roadmaps,
      lessons,
      skillTiers,
      fluencyAssessments,
      fluencyAttempts,
      writingSubmissions,
      creativeStories,
      moderationFlags,
      starTransactions,
      inventory,
      iepGoals,
      messages,
      workoutResponses,
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, role, grade, created_at")
        .eq("id", studentId)
        .single(),
      s("goals", "*"),
      s("learning_roadmaps", "*"),
      s(
        "lessons",
        "id, source, subject, topic, title, tier, standard_alignment, status, score_pct, stars_awarded, attempts, created_at, completed_at"
      ),
      s("student_skill_tiers", "subject, tier, win_streak, loss_streak, updated_at"),
      s(
        "fluency_assessments",
        "id, source, subject, grade, passage_title, passage_word_count, status, best_wcpm, best_level, attempts, created_at, completed_at"
      ),
      s(
        "fluency_attempts",
        "id, assessment_id, attempt_number, transcript, duration_seconds, words_correct, words_read, errors, wcpm, accuracy_pct, completion_pct, level, feedback, stars_awarded, created_at"
      ),
      s(
        "writing_submissions",
        "id, mode, subject, grade, passage_title, prompt, response_text, score, rubric_max, strengths, feedback, improvement, status, created_at, graded_at"
      ),
      s("creative_stories", "id, title, content, word_count, created_at, updated_at"),
      s(
        "moderation_flags",
        "id, source_type, mode, reason, categories, severity, resolved, resolved_at, created_at"
      ),
      s("star_transactions", "amount, type, created_at", "user_id"),
      s("user_inventory", "item_id, acquired_at, gifted_from_user_id", "user_id"),
      admin
        .from("iep_goals")
        .select(
          "goal_text, area, baseline, target, measurement, standard, progress_notes, created_at, updated_at"
        )
        .eq("student_id", studentId)
        .eq("shared_with_parent", true)
        .limit(ROW_CAP),
      admin
        .from("parent_messages")
        .select("title, body_english, body_spanish, sender_role, sent_at, read_at")
        .eq("student_id", studentId)
        .eq("parent_id", user.id)
        .limit(ROW_CAP),
      s("workout_responses", "question_index, difficulty, is_correct, response_time_ms, created_at", "user_id"),
    ]);

    if (profile.error || !profile.data) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    // Audit the export (Ed Law 2-d recordkeeping).
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "parent_data_export",
      target_type: "profile",
      target_id: studentId,
      metadata: { export_version: EXPORT_VERSION },
    });

    const exportBody = {
      export_info: {
        version: EXPORT_VERSION,
        generated_at: new Date().toISOString(),
        generated_for_parent_id: user.id,
        student_id: studentId,
        notes: [
          "This is a complete export of your child's educational record in Resolution Nation, in machine-readable JSON.",
          "Read Aloud audio recordings are stored as private files and are not inlined here; to receive copies, email privacy@resolutionnation.app.",
          "IEP goals appear only if the teacher has shared them with parents; for the full IEP record, contact your school.",
        ],
      },
      student: profile.data,
      goals: goals.data ?? [],
      learning_roadmaps: roadmaps.data ?? [],
      lessons: lessons.data ?? [],
      skill_tiers: skillTiers.data ?? [],
      reading_fluency: {
        assessments: fluencyAssessments.data ?? [],
        attempts: fluencyAttempts.data ?? [],
      },
      writing: {
        submissions: writingSubmissions.data ?? [],
        creative_stories: creativeStories.data ?? [],
      },
      moderation_flags: moderationFlags.data ?? [],
      star_economy: {
        transactions: starTransactions.data ?? [],
        inventory: inventory.data ?? [],
      },
      iep_goals_shared_with_parent: iepGoals.data ?? [],
      messages_with_teacher: messages.data ?? [],
      workout_responses: workoutResponses.data ?? [],
    };

    const filename = `resolution-nation-export-${studentId.slice(0, 8)}-${
      new Date().toISOString().slice(0, 10)
    }.json`;

    return new NextResponse(JSON.stringify(exportBody, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    // Security review 2026-07-26 (L5): don't return raw error text. Supabase
    // and Postgres errors carry table, column and constraint names.
    console.error("Parent export error:", e);
    return NextResponse.json(
      { error: "Export failed. Please try again, or email privacy@resolutionnation.app." },
      { status: 500 }
    );
  }
}
