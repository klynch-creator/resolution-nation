import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// PATCH /api/approve-parent-link — teacher approves or denies a parent-student link
export async function PATCH(request: Request) {
  try {
    const { linkId, action } = await request.json();

    if (!linkId || !action) {
      return NextResponse.json(
        { error: "linkId and action ('approve' | 'deny') are required." },
        { status: 400 }
      );
    }

    if (action !== "approve" && action !== "deny") {
      return NextResponse.json(
        { error: "action must be 'approve' or 'deny'." },
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

    // Verify caller is a teacher
    const { data: teacherProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!teacherProfile || teacherProfile.role !== "teacher") {
      return NextResponse.json({ error: "Only teachers can approve links." }, { status: 403 });
    }

    // Get the link — must belong to this teacher
    const { data: link, error: linkError } = await supabase
      .from("parent_student_links")
      .select("*")
      .eq("id", linkId)
      .eq("teacher_id", user.id)
      .single();

    if (linkError || !link) {
      return NextResponse.json(
        { error: "Link not found or you don't have permission to update it." },
        { status: 404 }
      );
    }

    const newStatus = action === "approve" ? "approved" : "denied";

    // Update status
    const { error: updateError } = await supabase
      .from("parent_student_links")
      .update({ status: newStatus })
      .eq("id", linkId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // If approved, add parent as pod viewer so existing RLS policies work
    if (action === "approve") {
      // Find the student's class pod
      const { data: memberships } = await supabase
        .from("pod_members")
        .select("pod_id, pods(type, created_by)")
        .eq("user_id", link.student_id)
        .eq("role", "member");

      let targetPodId: string | null = null;

      if (memberships) {
        for (const m of memberships) {
          const pod = m.pods as unknown as { type: string; created_by: string } | null;
          if (pod?.type === "class" && pod.created_by === user.id) {
            targetPodId = m.pod_id;
            break;
          }
        }
        // Fall back to any pod the student is in
        if (!targetPodId && memberships.length > 0) {
          targetPodId = memberships[0].pod_id;
        }
      }

      if (targetPodId) {
        // Check if parent is already a viewer in this pod
        const { data: existing } = await supabase
          .from("pod_members")
          .select("id")
          .eq("pod_id", targetPodId)
          .eq("user_id", link.parent_id)
          .single();

        if (!existing) {
          await supabase.from("pod_members").insert({
            pod_id: targetPodId,
            user_id: link.parent_id,
            role: "viewer",
          });
        }
      } else {
        // No existing pod — create a family pod
        const { data: familyPod } = await supabase
          .from("pods")
          .insert({
            name: "Family",
            type: "family",
            created_by: user.id,
          })
          .select()
          .single();

        if (familyPod) {
          await supabase.from("pod_members").insert([
            { pod_id: familyPod.id, user_id: link.student_id, role: "member" },
            { pod_id: familyPod.id, user_id: link.parent_id, role: "viewer" },
          ]);
        }
      }
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (err) {
    console.error("approve-parent-link error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
