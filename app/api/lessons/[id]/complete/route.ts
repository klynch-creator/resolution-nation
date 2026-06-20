import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import type { LessonResponse } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(request, {
    routeKey: "lessons-complete",
    limit: 30,
    windowSec: 60,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const { id: lessonId } = await params;
    const body = await request.json();
    const scorePct: number = body.score_pct;
    const responses: LessonResponse[] = Array.isArray(body.responses)
      ? body.responses
      : [];

    if (
      typeof scorePct !== "number" ||
      Number.isNaN(scorePct) ||
      scorePct < 0 ||
      scorePct > 100
    ) {
      return NextResponse.json(
        { error: "Invalid score_pct (expected 0–100)." },
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

    // All grading, star award, and tier movement happen inside the RPC
    // (SECURITY DEFINER). Ownership + idempotency are enforced there.
    const { data, error } = await supabase.rpc("complete_lesson", {
      p_lesson_id: lessonId,
      p_score_pct: scorePct,
      p_responses: responses,
    });

    if (error) {
      const map: Record<string, [string, number]> = {
        lesson_not_found: ["Lesson not found.", 404],
        lesson_not_owned: ["This isn't your lesson.", 403],
        lesson_already_completed: ["Lesson already completed.", 409],
        invalid_score: ["Invalid score.", 400],
        not_authenticated: ["Not authenticated.", 401],
      };
      const matched = Object.keys(map).find((k) => error.message.includes(k));
      if (matched) {
        const [msg, status] = map[matched];
        return NextResponse.json({ error: msg }, { status });
      }
      console.error("complete_lesson RPC error:", error);
      return NextResponse.json(
        { error: "Failed to complete lesson." },
        { status: 500 }
      );
    }

    return NextResponse.json({ result: data });
  } catch (err) {
    console.error("Complete lesson error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
