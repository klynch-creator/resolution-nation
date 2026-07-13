import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/teacher/parent-invite — teacher mints a parent-link code for a
// student in their class (RN-41). Authorization (teacher role + student in
// the caller's class pod) is enforced inside the SECURITY DEFINER RPC.
export async function POST(request: Request) {
  const rl = checkRateLimit(request, {
    routeKey: "teacher-parent-invite",
    limit: 30,
    windowSec: 60,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const { studentId } = await request.json();

    if (!studentId || typeof studentId !== "string") {
      return NextResponse.json(
        { error: "studentId is required." },
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

    const { data, error } = await supabase.rpc(
      "teacher_generate_parent_link_code",
      { p_student_id: studentId }
    );

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("only_teachers_can_generate")) {
        return NextResponse.json(
          { error: "Only teachers can create parent invites." },
          { status: 403 }
        );
      }
      if (msg.includes("student_not_in_your_class")) {
        return NextResponse.json(
          { error: "This student is not in one of your classes." },
          { status: 403 }
        );
      }
      console.error("teacher-parent-invite rpc error:", error);
      return NextResponse.json(
        { error: "Could not create an invite code. Please try again." },
        { status: 500 }
      );
    }

    // data = { code: string, expires_at: string }
    return NextResponse.json({
      code: data.code,
      expiresAt: data.expires_at,
    });
  } catch (err) {
    console.error("teacher-parent-invite error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
