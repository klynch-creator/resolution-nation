import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { childEmail } = await request.json();

    if (!childEmail) {
      return NextResponse.json({ error: "Child email is required." }, { status: 400 });
    }

    // Get the current (parent) user from the request cookies
    const supabase = await createClient();
    const {
      data: { user: parentUser },
    } = await supabase.auth.getUser();

    if (!parentUser) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Verify the current user is a parent
    const { data: parentProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", parentUser.id)
      .single();

    if (parentProfile?.role !== "parent") {
      return NextResponse.json({ error: "Only parents can link children." }, { status: 403 });
    }

    // Use the admin client to look up the child's user ID by email
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: authUsers, error: authError } =
      await adminClient.auth.admin.listUsers();

    if (authError) {
      return NextResponse.json({ error: "Could not look up user." }, { status: 500 });
    }

    const childAuthUser = authUsers.users.find(
      (u) => u.email?.toLowerCase() === childEmail.toLowerCase()
    );

    if (!childAuthUser) {
      return NextResponse.json(
        { error: "No account found with that email. Make sure your child has signed up first." },
        { status: 404 }
      );
    }

    // Get the child's profile and verify they're a student
    const { data: childProfile } = await supabase
      .from("profiles")
      .select("*")
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

    // Find the child's classroom pod
    const { data: childMembership } = await supabase
      .from("pod_members")
      .select("pod_id")
      .eq("user_id", childProfile.id)
      .eq("role", "member")
      .limit(1)
      .single();

    if (!childMembership) {
      // Child isn't in a classroom yet — still link them via a special "family" pod
      const { data: familyPod, error: podError } = await supabase
        .from("pods")
        .insert({
          name: `${childProfile.full_name}'s Family`,
          type: "family",
          created_by: parentUser.id,
        })
        .select()
        .single();

      if (podError) {
        return NextResponse.json({ error: podError.message }, { status: 500 });
      }

      // Add child as member
      await supabase.from("pod_members").insert({
        pod_id: familyPod.id,
        user_id: childProfile.id,
        role: "member",
      });

      // Add parent as viewer
      await supabase.from("pod_members").insert({
        pod_id: familyPod.id,
        user_id: parentUser.id,
        role: "viewer",
      });
    } else {
      // Check if parent is already a viewer in this pod
      const { data: existingViewership } = await supabase
        .from("pod_members")
        .select("id")
        .eq("pod_id", childMembership.pod_id)
        .eq("user_id", parentUser.id)
        .single();

      if (!existingViewership) {
        await supabase.from("pod_members").insert({
          pod_id: childMembership.pod_id,
          user_id: parentUser.id,
          role: "viewer",
        });
      }
    }

    return NextResponse.json({
      success: true,
      childName: childProfile.full_name,
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
