import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Use the service-role client to bypass RLS entirely — the client-side
  // RLS policies have an infinite recursion bug (profiles → pod_members →
  // pods → pod_members) that causes 500 errors for anon/user-role queries.
  // Reading the profile server-side with the service role is safe because
  // we've already verified the identity above via auth.getUser().
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role) {
    redirect("/auth/login");
  }

  redirect(`/dashboard/${profile.role}`);
}
