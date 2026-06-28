import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Mints a short-lived signed URL for a fluency recording, but ONLY after the
// caller proves (via RLS) they may read the attempt row — i.e. the student,
// the student's teacher, or an approved-linked parent. The recording lives in
// a private bucket; the signed URL is created with the service role only once
// authorization is confirmed.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const rl = checkRateLimit(request, {
    routeKey: "fluency-audio",
    limit: 60,
    windowSec: 60,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const { attemptId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // RLS authorization check: this returns a row only if the caller is allowed
    // to read this attempt (student / teacher / approved parent).
    const { data: attempt } = await supabase
      .from("fluency_attempts")
      .select("id, audio_path")
      .eq("id", attemptId)
      .single<{ id: string; audio_path: string | null }>();

    if (!attempt) {
      return NextResponse.json({ error: "Recording not found." }, { status: 404 });
    }
    if (!attempt.audio_path) {
      return NextResponse.json({ error: "No recording is stored for this read." }, { status: 404 });
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: signed, error: signError } = await admin.storage
      .from("fluency-audio")
      .createSignedUrl(attempt.audio_path, 300);

    if (signError || !signed?.signedUrl) {
      console.error("Fluency signed URL error:", signError);
      return NextResponse.json({ error: "Could not load the recording." }, { status: 500 });
    }

    return NextResponse.json({ url: signed.signedUrl });
  } catch (err) {
    console.error("Fluency audio route error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
