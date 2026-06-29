import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getAdmin, moderate, applyModeration } from "@/lib/writing-moderation";
import type { PasteEvent } from "@/types";

export const dynamic = "force-dynamic";

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

export async function POST(request: Request) {
  const rl = checkRateLimit(request, { routeKey: "writing-creative-save", limit: 60, windowSec: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const body = await request.json();
    const storyId: string | null = body.storyId ?? null;
    const title: string = (body.title ?? "Untitled Story").toString().slice(0, 200);
    const content: string = (body.content ?? "").toString();
    const pasteEvents: PasteEvent[] = Array.isArray(body.pasteEvents) ? body.pasteEvents : [];

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_frozen")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "student") {
      return NextResponse.json({ error: "Only students can write stories." }, { status: 403 });
    }
    if (profile?.is_frozen) {
      return NextResponse.json({ error: "Your account is paused. Please see your teacher." }, { status: 423 });
    }

    const admin = getAdmin();
    const pasteFlagged = pasteEvents.length > 0;
    const wc = wordCount(content);

    // Save first so the teacher always sees exactly what was written.
    let id = storyId;
    if (id) {
      // Ownership check before updating.
      const { data: owned } = await admin
        .from("creative_stories")
        .select("id")
        .eq("id", id)
        .eq("student_id", user.id)
        .maybeSingle();
      if (!owned) return NextResponse.json({ error: "Story not found." }, { status: 404 });
      await admin
        .from("creative_stories")
        .update({
          title,
          content,
          word_count: wc,
          paste_flagged: pasteFlagged,
          paste_events: pasteFlagged ? pasteEvents : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    } else {
      const { data: created, error: cErr } = await admin
        .from("creative_stories")
        .insert({
          student_id: user.id,
          title,
          content,
          word_count: wc,
          paste_flagged: pasteFlagged,
          paste_events: pasteFlagged ? pasteEvents : null,
        })
        .select()
        .single();
      if (cErr || !created) {
        console.error("creative story insert error:", cErr);
        return NextResponse.json({ error: "Could not save your story." }, { status: 500 });
      }
      id = created.id;
    }

    // Moderate the story content. Block (freeze) on clearly inappropriate.
    let blocked = false;
    if (content.trim().length > 0) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const mod = await moderate(anthropic, content, "creative");
      const res = await applyModeration(admin, {
        studentId: user.id,
        sourceType: "creative_story",
        sourceId: id,
        mode: "creative",
        text: content,
        result: mod,
      });
      blocked = res.blocked;
    }

    return NextResponse.json({ storyId: id, word_count: wc, blocked });
  } catch (err) {
    console.error("Creative save error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
