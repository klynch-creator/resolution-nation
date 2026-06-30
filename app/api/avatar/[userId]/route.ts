import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { resolveAvatar } from "@/lib/avatars";

export const dynamic = "force-dynamic";

// Resolves a user's avatar for display. Presets are returned inline; uploaded
// avatars (private bucket) are returned as a short-lived signed URL, but ONLY
// after the caller is authorized to view that user: the user themselves, a
// teacher who shares a pod with them, or an approved-linked parent.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const rl = checkRateLimit(request, { routeKey: "avatar", limit: 120, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const { userId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Authorization (skip the lookups when viewing your own avatar).
    let authorized = user.id === userId;

    if (!authorized) {
      const { data: me } = await admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single<{ role: string }>();
      const role = me?.role ?? "";

      if (role === "teacher" || role === "admin") {
        // Teacher may view a student in any pod the teacher created.
        const { data: pods } = await admin
          .from("pods")
          .select("id")
          .eq("created_by", user.id);
        const podIds = (pods ?? []).map((p: { id: string }) => p.id);
        if (podIds.length > 0) {
          const { data: membership } = await admin
            .from("pod_members")
            .select("user_id")
            .eq("user_id", userId)
            .in("pod_id", podIds)
            .limit(1);
          authorized = (membership ?? []).length > 0;
        }
      } else if (role === "parent") {
        const { data: link } = await admin
          .from("parent_student_links")
          .select("id")
          .eq("parent_id", user.id)
          .eq("student_id", userId)
          .eq("status", "approved")
          .limit(1);
        authorized = (link ?? []).length > 0;
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .single<{ avatar_url: string | null }>();

    const resolved = resolveAvatar(profile?.avatar_url);
    if (resolved.kind !== "upload") {
      // Nothing to sign — caller should render preset/initial from avatar_url.
      return NextResponse.json({ kind: resolved.kind, url: null });
    }

    const { data: signed, error: signErr } = await admin.storage
      .from("avatars")
      .createSignedUrl(resolved.path, 600);
    if (signErr || !signed?.signedUrl) {
      return NextResponse.json({ kind: "upload", url: null });
    }
    return NextResponse.json({ kind: "upload", url: signed.signedUrl });
  } catch (err) {
    console.error("Avatar route error:", err);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
