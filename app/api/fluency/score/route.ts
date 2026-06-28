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

const FEEDBACK_SYSTEM = `You are a real K-12 reading teacher leaving a short, personal note for a student about the passage they just read aloud. It should read like a human teacher who actually listened — not a chatbot.

Write 2 to 3 sentences.
Do:
- Be specific to THIS read. When given words the student missed, name a couple of them directly (e.g. "the word 'thought' tripped you up").
- Point out ONE concrete thing to work on, tied to what actually happened — for example a sound or pattern in the words they missed, slowing down on longer words, reading in phrases instead of word-by-word, or watching for words that got skipped.
- If it is their second read, say something true about what changed since the first read (faster, smoother, fewer skips, etc.).
- Sound warm and matter-of-fact, like a quick handwritten comment.

Do NOT:
- Do NOT open with "Great job", "Amazing", "Awesome", "Well done", or similar generic praise. Vary how you start.
- Do NOT use em dashes, and do not put an exclamation point on every sentence.
- Do NOT use buzzwords or coach-speak ("keep crushing it", "you've got this", "level up").
- Do NOT state a grade level, a percentile, words-per-minute, or percentages, and do not say "below/approaching/on grade level". The student sees those numbers separately.

Return plain text only, no headings or quotes around the whole thing.`;

function rateDescriptor(level: string | null): string {
  if (level === "on") return "at or above the grade-level reading rate";
  if (level === "approaching") return "a bit slower than the grade-level reading rate";
  if (level === "below") return "well below the grade-level reading rate";
  return "not compared to a grade norm";
}

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

    // Prior read (for read 2 improvement, shown to student + used in feedback).
    let prevWcpm: number | null = null;
    if (attemptNumber > 1) {
      const { data: priorAttempts } = await supabase
        .from("fluency_attempts")
        .select("wcpm, attempt_number")
        .eq("assessment_id", assessmentId)
        .lt("attempt_number", attemptNumber)
        .order("attempt_number", { ascending: true });
      if (priorAttempts && priorAttempts.length > 0) {
        prevWcpm = priorAttempts[0].wcpm; // first read
      }
    }

    // Concrete miscue detail for the feedback model (not shown raw to student).
    const subs = score.miscues
      .filter((m) => m.type === "substitution")
      .slice(0, 5)
      .map((m) => `said "${m.heard}" for "${m.expected}"`);
    const skips = score.miscues
      .filter((m) => m.type === "omission")
      .slice(0, 5)
      .map((m) => `skipped "${m.expected}"`);
    const miscueDetail =
      [...subs, ...skips].join("; ") || "no notable word errors";

    let improvementNote = "";
    if (attemptNumber > 1 && prevWcpm != null) {
      const faster = score.wcpm - prevWcpm;
      improvementNote = `This is the second read. First read rate was ${prevWcpm} WPM, this read ${score.wcpm} WPM (${
        faster > 0 ? `${faster} faster` : faster < 0 ? `${-faster} slower` : "same pace"
      }).`;
    }

    // 6) Specific, human feedback (best-effort; never blocks scoring).
    let feedback =
      attemptNumber > 1
        ? "On this second read you kept going even on the harder parts. Pick two of the tricky words above and read the sentence they're in a few times, so they start to feel automatic."
        : "You made it through the whole passage. Try reading it again in small phrases instead of one word at a time, and slow down a touch on the longer words.";
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 240,
        system: FEEDBACK_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Student grade: ${assessment.grade ?? "unknown"}.
Passage: "${assessment.passage_title}".
This is read number ${attemptNumber}.
They read ${rateDescriptor(norm.level)}, with ${score.accuracyPct}% accuracy, and got through about ${score.completionPct}% of the passage.
Word errors this read: ${miscueDetail}.
${improvementNote}
Write the note now.`,
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

    // Student now sees their reading rate and goal so they know where they stand
    // and what to aim for. (Teacher/parent get the full clinical view elsewhere.)
    return NextResponse.json({
      result: {
        attempt_number: attemptNumber,
        feedback,
        focus_words: focusWords,
        stars_awarded: stars,
        can_retry: attemptNumber < 2,
        wcpm: score.wcpm,
        accuracy_pct: score.accuracyPct,
        completion_pct: score.completionPct,
        level: norm.level,
        target_wcpm: norm.p50,
        prev_wcpm: prevWcpm,
      },
    });
  } catch (err) {
    console.error("Fluency score error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
