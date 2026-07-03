import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * POST /api/messages/send — two-way teacher ↔ parent messaging.
 *
 * Teacher body: { parentId, studentId, body, title?, bodySpanish? }
 * Parent body:  { teacherId, studentId, body }
 *
 * Both directions require an APPROVED parent_student_link between the two
 * parties for that student. Inserts run under the caller's RLS (the
 * pm_teacher_insert / pm_parent_insert policies are the enforcement).
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(request, {
    routeKey: "messages-send",
    limit: 30,
    windowSec: 60,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const { parentId, teacherId, studentId, body, title, bodySpanish } =
      await request.json();

    if (!studentId || !body || typeof body !== "string" || !body.trim()) {
      return NextResponse.json(
        { error: "studentId and a non-empty body are required." },
        { status: 400 }
      );
    }
    if (body.length > 4000) {
      return NextResponse.json(
        { error: "Message is too long (4000 characters max)." },
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "teacher" && profile?.role !== "parent") {
      return NextResponse.json(
        { error: "Only teachers and parents can send messages." },
        { status: 403 }
      );
    }

    const isTeacher = profile.role === "teacher";
    const otherId = isTeacher ? parentId : teacherId;
    if (!otherId) {
      return NextResponse.json(
        { error: isTeacher ? "parentId is required." : "teacherId is required." },
        { status: 400 }
      );
    }

    // Verify the approved link explicitly for a friendly error (RLS is the
    // actual enforcement on insert).
    const { data: link } = await supabase
      .from("parent_student_links")
      .select("id")
      .eq("parent_id", isTeacher ? otherId : user.id)
      .eq("teacher_id", isTeacher ? user.id : otherId)
      .eq("student_id", studentId)
      .eq("status", "approved")
      .maybeSingle();
    if (!link) {
      return NextResponse.json(
        { error: "No approved parent-student link found for this conversation." },
        { status: 403 }
      );
    }

    const { data: message, error } = await supabase
      .from("parent_messages")
      .insert({
        teacher_id: isTeacher ? user.id : otherId,
        parent_id: isTeacher ? otherId : user.id,
        student_id: studentId,
        sender_role: profile.role,
        title: isTeacher ? title ?? null : null,
        body_english: body.trim(),
        body_spanish: isTeacher ? bodySpanish ?? null : null,
      })
      .select()
      .single();

    if (error || !message) {
      console.error("Message insert error:", error);
      return NextResponse.json({ error: "Could not send message." }, { status: 500 });
    }

    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
