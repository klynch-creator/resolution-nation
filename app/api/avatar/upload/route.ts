import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAdmin, extractJson } from "@/lib/writing-moderation";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 5 * 1024 * 1024;

const AVATAR_MOD_SYSTEM = `You are a child-safety moderator reviewing an image a K-12 STUDENT wants to use as their PROFILE PICTURE in a school app. The picture will be visible to classmates, teachers, and parents.

Return ONLY JSON: { "verdict": "ok" | "inappropriate", "reason": "one short sentence" }

Mark "inappropriate" if the image contains ANY of:
- nudity, sexual, or suggestive content
- violence, blood/gore, weapons
- drugs, alcohol, vaping, or smoking
- hate symbols, slurs, or offensive gestures
- frightening, disturbing, or clearly age-inappropriate content
- text that shares personal info (full name, address, phone, email, school)

Mark "ok" for normal, school-appropriate profile pictures: a child's face, a pet, a drawing, a cartoon, a hobby, scenery, an avatar, etc. When the image is clearly harmless, return "ok".`;

export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "avatar-upload", limit: 10, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = (await request.json()) as { dataUrl?: string };
    const dataUrl = body?.dataUrl ?? "";
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: "Invalid image data." }, { status: 400 });
    }
    const mediaType = match[1];
    const base64 = match[2];
    const ext = ALLOWED[mediaType];
    if (!ext) {
      return NextResponse.json(
        { error: "Please upload a PNG, JPG, WEBP, or GIF image." },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "That image is too large. Please use one under 5 MB." },
        { status: 400 }
      );
    }

    // ── AI vision moderation ─────────────────────────────────────────────────
    const anthropic = new Anthropic();
    let verdict: "ok" | "inappropriate" = "inappropriate";
    let reason = "Could not check this image.";
    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        system: AVATAR_MOD_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
                  data: base64,
                },
              },
              { type: "text", text: "Is this profile picture appropriate for a K-12 school app?" },
            ],
          },
        ],
      });
      const c = msg.content[0];
      if (c.type === "text") {
        const parsed = JSON.parse(extractJson(c.text)) as { verdict?: string; reason?: string };
        verdict = parsed.verdict === "ok" ? "ok" : "inappropriate";
        reason = parsed.reason ?? reason;
      }
    } catch (e) {
      // Fail safe: do NOT store an image we couldn't verify.
      console.error("Avatar moderation error:", e);
      return NextResponse.json(
        { ok: false, error: "We couldn't check that image right now. Please try again." },
        { status: 503 }
      );
    }

    if (verdict !== "ok") {
      return NextResponse.json({
        ok: false,
        rejected: true,
        error:
          "That picture can't be used here. Please pick a different one, or choose a fun avatar from the gallery.",
        reason,
      });
    }

    // ── Store (service role) + point the profile at it ───────────────────────
    const admin = getAdmin();
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("avatars")
      .upload(path, bytes, { contentType: mediaType, upsert: true });
    if (upErr) {
      console.error("Avatar upload error:", upErr);
      return NextResponse.json({ ok: false, error: "Could not save the image." }, { status: 500 });
    }

    // Best-effort cleanup of any previous uploaded avatar for this user.
    const { data: prev } = await admin
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .single<{ avatar_url: string | null }>();
    const prevUrl = prev?.avatar_url ?? "";
    if (prevUrl && !prevUrl.startsWith("preset:") && prevUrl !== path) {
      await admin.storage.from("avatars").remove([prevUrl]).catch(() => {});
    }

    await admin.from("profiles").update({ avatar_url: path }).eq("id", user.id);

    return NextResponse.json({ ok: true, path });
  } catch (err) {
    console.error("Avatar upload route error:", err);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
