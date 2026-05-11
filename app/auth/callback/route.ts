import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (profile?.role) {
        return NextResponse.redirect(`${origin}/dashboard`);
      }

      // Profile missing (trigger may not exist yet) — create it from metadata.
      const meta = data.user.user_metadata ?? {};
      const role = (meta.role as string) || "student";
      await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          full_name: (meta.full_name as string) || "",
          role,
          grade: (meta.grade as string) || null,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );
      return NextResponse.redirect(`${origin}/dashboard/${role}`);
    }
  }

  if (next !== "/") {
    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/auth/login?error=callback_failed`);
}
