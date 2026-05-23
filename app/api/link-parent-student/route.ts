import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// POST /api/link-parent-student — parent requests to link to their child
export async function POST(request: Request) {
  try {
    const { childEmail } = await request.json();

    if (!childEmail || typeof childEmail !== "string") {
      return NextResponse.json(
        { error: "Child email is required." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user: parentUser },
    } = await supabase.auth.getUser();

    if (!parentUser) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Verify the caller is a parent
    const { data: parentProfile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", parentUser.id)
      .single();

    if (!parentProfile || parentProfile.role !== "parent") {
      return NextResponse.json(
        { error: "Only parents can request child links." },
        { status: 403 }
      );
    }

    // Use admin client to look up child by email
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: authUsers, error: authError } =
      await adminClient.auth.admin.listUsers();

    if (authError) {
      return NextResponse.json(
        { error: "Could not look up user." },
        { status: 500 }
      );
    }

    const childAuthUser = authUsers.users.find(
      (u) => u.email?.toLowerCase() === childEmail.trim().toLowerCase()
    );

    if (!childAuthUser) {
      return NextResponse.json(
        {
          error:
            "No account found with that email. Make sure your child has already signed up.",
        },
        { status: 404 }
      );
    }

    // Get child's profile — must use adminClient because parent has no RLS access yet
    const { data: childProfile } = await adminClient
      .from("profiles")
      .select("id, full_name, role, grade")
      .eq("id", childAuthUser.id)
      .single();

    if (!childProfile) {
      return NextResponse.json(
        { error: "No profile found for that email." },
        { status: 404 }
      );
    }

    if (childProfile.role !== "student") {
      return NextResponse.json(
        { error: "That account is not a student account." },
        { status: 400 }
      );
    }

    // Find the teacher from the child's class pod — must use adminClient (parent has no pod_members access)
    let teacherId: string | null = null;
    const { data: childMembership } = await adminClient
      .from("pod_members")
      .select("pod_id, pods(created_by, type)")
      .eq("user_id", childProfile.id)
      .eq("role", "member")
      .limit(10);

    if (childMembership) {
      for (const m of childMembership) {
        const pod = m.pods as unknown as { created_by: string; type: string } | null;
        if (pod?.type === "class" && pod.created_by) {
          teacherId = pod.created_by;
          break;
        }
      }
    }

    // Check if a link already exists
    const { data: existingLink } = await supabase
      .from("parent_student_links")
      .select("id, status")
      .eq("parent_id", parentUser.id)
      .eq("student_id", childProfile.id)
      .single();

    if (existingLink) {
      if (existingLink.status === "approved") {
        return NextResponse.json(
          { error: "You are already linked to this child." },
          { status: 409 }
        );
      }
      if (existingLink.status === "pending") {
        return NextResponse.json({
          success: true,
          childName: childProfile.full_name,
          status: "pending",
          message: "A link request is already pending teacher approval.",
        });
      }
      // If denied, reset to pending
      await supabase
        .from("parent_student_links")
        .update({ status: "pending", teacher_id: teacherId, updated_at: new Date().toISOString() })
        .eq("id", existingLink.id);

      return NextResponse.json({
        success: true,
        childName: childProfile.full_name,
        status: "pending",
      });
    }

    // Create a new pending link
    const { error: insertError } = await supabase
      .from("parent_student_links")
      .insert({
        parent_id: parentUser.id,
        student_id: childProfile.id,
        teacher_id: teacherId,
        status: "pending",
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      childName: childProfile.full_name,
      status: "pending",
      teacherFound: teacherId !== null,
    });
  } catch (err) {
    console.error("link-parent-student error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

// GET /api/link-parent-student — teacher fetches pending links for their students
export async function GET() {
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
