import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/lib/writing-moderation";
import { NextResponse } from "next/server";
import { THEMES } from "@/lib/themes";
import { PRESET_AVATARS } from "@/lib/avatars";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const THEME_IDS = new Set(THEMES.map((t) => t.id));
const PRESET_IDS = new Set(PRESET_AVATARS.map((a) => a.id));

// Saves a student's dashboard preferences: theme and/or a PRESET avatar choice.
// (Uploaded avatars go through /api/avatar/upload, which moderates first.)
export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "account-preferences", limit: 30, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await request.json()) as { theme?: string; avatar?: string };
    const update: { theme?: string; avatar_url?: string } = {};

    if (typeof body.theme === "string") {
      if (!THEME_IDS.has(body.theme)) {
        return NextResponse.json({ error: "Unknown theme." }, { status: 400 });
      }
      update.theme = body.theme;
    }

    if (typeof body.avatar === "string") {
      // Only preset choices are accepted here (id like "fox" or "preset:fox").
      const id = body.avatar.replace(/^preset:/, "");
      if (!PRESET_IDS.has(id)) {
        return NextResponse.json({ error: "Unknown avatar." }, { status: 400 });
      }
      // If the user is switching away from an uploaded avatar, drop the file.
      const admin = getAdmin();
      const { data: prev } = await admin
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .single<{ avatar_url: string | null }>();
      const prevUrl = prev?.avatar_url ?? "";
      if (prevUrl && !prevUrl.startsWith("preset:")) {
        await admin.storage.from("avatars").remove([prevUrl]).catch(() => {});
      }
      update.avatar_url = `preset:${id}`;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const admin = getAdmin();
    const { error } = await admin.from("profiles").update(update).eq("id", user.id);
    if (error) {
      return NextResponse.json({ error: "Could not save your changes." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Preferences route error:", err);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
