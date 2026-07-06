import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/link-parent-student — REMOVED (June 2026).
// The old implementation enumerated all auth users via auth.admin.listUsers()
// to find a child by email — a privacy and scaling hazard flagged in the May
// 2026 security audit. Parents now link via a student-generated invite code:
// POST /api/parent/link (redeem) + POST /api/parent/link/code (mint).
export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "link-parent-student", limit: 30, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  return NextResponse.json(
    {
      error:
        "This endpoint has been removed. Link your child using their invite code instead.",
    },
    { status: 410 }
  );
}

// GET /api/link-parent-student — teacher fetches pending links for their students
export async function GET(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "link-parent-student", limit: 30, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: teacherProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!teacherProfile || teacherProfile.role !== "teacher") {
      return NextResponse.json({ error: "Only teachers can view link requests." }, { status: 403 });
    }

    // Get pending links where this teacher is the teacher_id
    const { data: links, error } = await supabase
      .from("parent_student_links")
      .select("*")
      .eq("teacher_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!links || links.length === 0) {
      return NextResponse.json({ links: [] });
    }

    // Fetch parent and student profiles
    const parentIds = [...new Set(links.map((l) => l.parent_id))];
    const studentIds = [...new Set(links.map((l) => l.student_id))];

    const [{ data: parentProfiles }, { data: studentProfiles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role").in("id", parentIds),
      supabase.from("profiles").select("id, full_name, grade").in("id", studentIds),
    ]);

    const parentMap = new Map(
      (parentProfiles ?? []).map((p) => [p.id, p])
    );
    const studentMap = new Map(
      (studentProfiles ?? []).map((p) => [p.id, p])
    );

    const enriched = links.map((link) => ({
      ...link,
      parent: parentMap.get(link.parent_id) ?? null,
      student: studentMap.get(link.student_id) ?? null,
    }));

    return NextResponse.json({ links: enriched });
  } catch (err) {
    console.error("get pending links error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
