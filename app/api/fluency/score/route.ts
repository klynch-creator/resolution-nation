import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { transcribeAudio, SttError } from "@/lib/fluency/stt";
import { scoreReading } from "@/lib/fluency/score";
import { classifyWcpm } from "@/lib/fluency/norms";
import type { FluencyAssessment } from "@/types";

export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15 MB — ~10 min of Opus

function extFor(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "mp4";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "webm";
}

const FEEDBACK_SYSTEM = `You are a warm, encouraging K-12 reading coach speaking directly to a young student about how they just read a passage aloud.

Write 2-3 short sentences of supportive, specific feedback.
Rules:
- Be kind and motivating first. Celebrate effort.
- Give ONE concrete, doable tip (e.g. "read in small phrases", "slow down on longer words", "take a breath at each period").
- If specific tricky words are provided, gently encourage practicing them by name.
- Do NOT mention any numbers, scores, words-per-minute, percentages, grade level, or whether they are "below/approaching/on" level.
- Speak to the student ("you"), simple language, no headings. Return plain text only.`;

export async function POST(request: Request) {
  const rl = checkRateLimit(request, {
    routeKey: "fluency-score",
    limit: 15,
    windowSec: 60,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  try {
    const form = await request.formData();
    const assessmentId = form.get("assessmentId");
    const attemptNumberRaw = form.get("attemptNumber");
    const audio = form.get("audio");

    if (typeof assessmentId !== "string" || !assessmentId) {
      return NextResponse.json({ error: "Missing assessmentId." }, { status: 400 });
    }
    const attemptNumber = Math.max(1, parseInt(String(attemptNumberRaw ?? "1"), 10) || 1);
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio recording." }, { status: 400 });
    }
    if (audio.size === 0) {
      return NextResponse.json({ error: "The recording was empty." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Recording is too long." }, { status: 413 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const studentId = user.id;

    // Load assessment (RLS limits to own; double-check ownership).
    const { data: assessment } = await supabase
      .from("fluency_assessments")
      .select("*")
      .eq("id", assessmentId)
      .single<FluencyAssessment>();
    if (!assessment || assessment.student_id !== studentId) {
      return NextResponse.json({ error: "Passage not found." }, { status: 404 });
    }

    const mime = audio.type || "audio/webm";
    const buffer = Buffer.from(await audio.arrayBuffer());

    // 1) Store the recording (private bucket; folder = uid so RLS allows it).
    const audioPath = `${studentId}/${assessmentId}/${attemptNumber}.${extFor(mime)}`;
    const { error: uploadError } = await supabase.storage
      .from("fluency-audio")
      .upload(audioPath, buffer, { contentType: mime, upsert: true });
    if (uploadError) {
      console.error("Fluency audio upload error:", uploadError);
      return NextResponse.json({ error: "Could not save the recording." }, { status: 500 });
    }

    // 2) Transcribe with word timestamps.
    let transcription;
    try {
      transcription = await transcribeAudio(buffer, mime);
    } catch (e) {
      const err = e as SttError;
      return NextResponse.json(
        { error: err.message ?? "Could not process the recording." },
        { status: err.status ?? 502 }
      );
    }

    // 3) Score against the reference passage.
    const score = scoreReading({
      passage: assessment.passage_text,
      words: transcription.words,
      durationSeconds: transcription.durationSeconds,
    });

    // 4) Classify against ORF norms (teacher/parent-facing only).
    const norm = classifyWcpm(score.wcpm, assessment.grade);

    // 5) Focus words from miscues (distinct expected words), for the student tip.
    const focusWords = Array.from(
      new Set(
        score.miscues
          .filter((m) => m.type !== "insertion" && m.expected)
          .map((m) => m.expected as string)
      )
    ).slice(0, 3);

    // 6) Supportive, level-free feedback (best-effort; never blocks scoring).
    let feedback =
      attemptNumber > 1
        ? "Nice work reading that again! Keep practicing the tricky words and reading in smooth little phrases."
        : "Great job reading out loud! Try reading in smooth little phrases and taking a breath at each period.";
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 220,
        system: FEEDBACK_SYSTEM,
        messages: [
          {
            role: "user",
            content: `This is read ${attemptNumber} of the passage "${assessment.passage_title}".
Accuracy was ${score.accuracyPct}% and they read about ${score.completionPct}% of the passage.
Tricky words to practice (may be empty): ${focusWords.join(", ") || "none in particular"}.
Write the encouraging feedback now.`,
          },
        ],
      });
      const c = msg.content[0];
      if (c.type === "text" && c.text.trim()) feedback = c.text.trim();
    } catch (e) {
      console.error("Fluency feedback generation failed (using fallback):", e);
    }

    // 7) Persist via SECURITY DEFINER RPC (awards capped stars, rolls up best).
    const metrics = {
      wcpm: score.wcpm,
      wordsCorrect: score.wordsCorrect,
      wordsRead: score.wordsRead,
      substitutions: score.substitutions,
      omissions: score.omissions,
      insertions: score.insertions,
      errors: score.errors,
      durationSeconds: score.durationSeconds,
      accuracyPct: score.accuracyPct,
      completionPct: score.completionPct,
      level: norm.level,
      normP25: norm.p25,
      normP50: norm.p50,
      normSeason: norm.season,
      normSource: norm.normSource,
      miscues: score.miscues,
    };

    const { data: rpcResult, error: rpcError } = await supabase.rpc("record_fluency_attempt", {
      p_assessment_id: assessmentId,
      p_attempt_number: attemptNumber,
      p_audio_path: audioPath,
      p_transcript: transcription.transcript,
      p_metrics: metrics,
      p_feedback: feedback,
    });

    if (rpcError) {
      const map: Record<string, [string, number]> = {
        assessment_not_found: ["Passage not found.", 404],
        assessment_not_owned: ["This isn't your passage.", 403],
        attempt_already_recorded: ["That read was already recorded.", 409],
        not_authenticated: ["Not authenticated.", 401],
      };
      const matched = Object.keys(map).find((k) => rpcError.message.includes(k));
      if (matched) {
        const [m, s] = map[matched];
        return NextResponse.json({ error: m }, { status: s });
      }
      console.error("record_fluency_attempt RPC error:", rpcError);
      return NextResponse.json({ error: "Could not save your reading." }, { status: 500 });
    }

    const stars = (rpcResult as { stars_awarded?: number } | null)?.stars_awarded ?? 0;

    // Student-safe payload only: NO wcpm / accuracy / level.
    return NextResponse.json({
      result: {
        attempt_number: attemptNumber,
        feedback,
        focus_words: focusWords,
        stars_awarded: stars,
        can_retry: attemptNumber < 2,
      },
    });
  } catch (err) {
    console.error("Fluency score error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
