import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { requireTeacherOfStudent } from "@/lib/authz";
import { isValidGrade } from "@/lib/grades";

export const dynamic = "force-dynamic";

/**
 * POST /api/teacher/student-grade — set a student's grade LEVEL.
 *
 * Added alongside migration 038, which revoked UPDATE (grade) from
 * `authenticated` so a student can no longer change their own grade level.
 * Grade drives adaptive lesson tier and fluency WCPM norms, so it needs to be
 * correctable — by the teacher, not the student.
 *
 * Body: { studentId: string, grade: string | null }
 * Passing `grade: null` clears it.
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "student-grade", limit: 30, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { studentId, grade } = await request.json();

    const authz = await requireTeacherOfStudent(user.id, studentId);
    if (!authz.ok) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    if (grade !== null && !isValidGrade(grade)) {
      return NextResponse.json(
        { error: "Pick a grade from K through 12, or clear it." },
        { status: 400 }
      );
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Capture the prior value so the audit entry is meaningful.
    const { data: before } = await admin
      .from("profiles")
      .select("grade, role")
      .eq("id", studentId)
      .single<{ grade: string | null; role: string }>();

    if (before?.role !== "student") {
      return NextResponse.json(
        { error: "Grade level applies to student accounts only." },
        { status: 400 }
      );
    }

    const { error: updateErr } = await admin
      .from("profiles")
      .update({ grade })
      .eq("id", studentId);

    if (updateErr) {
      console.error("Student grade update error:", updateErr);
      return NextResponse.json({ error: "Could not save the grade." }, { status: 500 });
    }

    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "student_grade_changed",
      target_type: "profile",
      target_id: studentId,
      metadata: { from: before?.grade ?? null, to: grade },
    });

    return NextResponse.json({ ok: true, grade });
  } catch (err) {
    console.error("Student grade route error:", err);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
