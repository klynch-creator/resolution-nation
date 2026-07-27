import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * Shared server-side authorization helpers (security review 2026-07-26).
 *
 * Several AI routes accepted a caller-supplied `studentId` and never checked
 * that the caller actually teaches that student. They were not leaking data,
 * because each one happened to query through the caller's own RLS context and
 * so got zero rows — but that is incidental, not a control. The moment one of
 * those routes is refactored to use the admin client (as several already were,
 * to work around the pod_members RLS recursion issue) it silently becomes a
 * live IDOR with nothing in review to flag it.
 *
 * These helpers make the check explicit and consistent.
 */

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export type AuthzFailure = { ok: false; status: number; error: string };
export type AuthzSuccess = { ok: true; role: string };
export type AuthzResult = AuthzSuccess | AuthzFailure;

/** Fetches the caller's role. Uses the admin client to dodge RLS recursion. */
export async function getRole(userId: string): Promise<string> {
  const { data } = await admin()
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single<{ role: string }>();
  return data?.role ?? "";
}

/**
 * Caller must be a teacher (or admin) who is connected to `studentId` — either
 * they own a pod the student belongs to, or they set a goal for the student.
 * Mirrors the authorization used by `resolve_moderation_flag`.
 */
export async function requireTeacherOfStudent(
  userId: string,
  studentId: unknown
): Promise<AuthzResult> {
  if (typeof studentId !== "string" || studentId.length === 0) {
    return { ok: false, status: 400, error: "A studentId is required." };
  }

  const db = admin();

  const { data: me } = await db
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single<{ role: string }>();
  const role = me?.role ?? "";

  if (role !== "teacher" && role !== "admin") {
    return { ok: false, status: 403, error: "Only teachers can do that." };
  }

  // Shares a pod the caller created.
  const { data: pods } = await db.from("pods").select("id").eq("created_by", userId);
  const podIds = (pods ?? []).map((p: { id: string }) => p.id);
  if (podIds.length > 0) {
    const { data: member } = await db
      .from("pod_members")
      .select("user_id")
      .eq("user_id", studentId)
      .in("pod_id", podIds)
      .limit(1);
    if ((member ?? []).length > 0) return { ok: true, role };
  }

  // Or has set a goal for this student.
  const { data: goal } = await db
    .from("goals")
    .select("id")
    .eq("student_id", studentId)
    .eq("teacher_id", userId)
    .limit(1);
  if ((goal ?? []).length > 0) return { ok: true, role };

  return { ok: false, status: 403, error: "That student isn't in your class." };
}
