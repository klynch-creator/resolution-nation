// ============================================================
// Speech-to-text abstraction for the fluency reader.
//
// One interface, swappable providers, so we can change vendors (or add an
// on-device option) without touching the scoring or API layers. Whichever
// provider is used MUST return word-level timestamps — fluency scoring depends
// on them.
//
// Provider is chosen by FLUENCY_STT_PROVIDER ("deepgram" | "openai").
// Required env per provider: DEEPGRAM_API_KEY or OPENAI_API_KEY.
//
// SECURITY / COMPLIANCE: audio here is a child's voice recording. Only send it
// to a vendor covered by a signed DPA with no-training and (ideally) zero-
// retention terms. See docs/fluency-workflow-spec.md.
// ============================================================

import type { SttWord } from "./score";

export interface Transcription {
  transcript: string;
  words: SttWord[];
  /** total audio duration in seconds, per the provider */
  durationSeconds: number;
  provider: string;
}

export class SttError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "SttError";
    this.status = status;
  }
}

type Provider = "deepgram" | "openai";

function activeProvider(): Provider {
  const p = (process.env.FLUENCY_STT_PROVIDER ?? "deepgram").toLowerCase();
  return p === "openai" ? "openai" : "deepgram";
}

/** Transcribe an audio buffer to text + word timestamps. */
export async function transcribeAudio(
  audio: Buffer,
  mimeType: string
): Promise<Transcription> {
  const provider = activeProvider();
  if (provider === "openai") return transcribeOpenAI(audio, mimeType);
  return transcribeDeepgram(audio, mimeType);
}

// ─── Deepgram (default) ─────────────────────────────────────────────────────
async function transcribeDeepgram(audio: Buffer, mimeType: string): Promise<Transcription> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new SttError("Speech service is not configured.", 503);

  const model = process.env.DEEPGRAM_MODEL ?? "nova-2";
  const url = `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(
    model
  )}&language=en&punctuate=true&smart_format=false`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": mimeType || "audio/webm" },
      body: new Uint8Array(audio),
    });
  } catch {
    throw new SttError("Could not reach the speech service.");
  }

  if (!res.ok) {
    throw new SttError(`Speech service error (${res.status}).`);
  }

  const json = (await res.json()) as DeepgramResponse;
  const alt = json.results?.channels?.[0]?.alternatives?.[0];
  if (!alt) throw new SttError("No speech could be transcribed.");

  const words: SttWord[] = (alt.words ?? []).map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));
  const durationSeconds = json.metadata?.duration ?? estimateDuration(words);

  return { transcript: alt.transcript ?? "", words, durationSeconds, provider: "deepgram" };
}

// ─── OpenAI Whisper (alternate) ─────────────────────────────────────────────
async function transcribeOpenAI(audio: Buffer, mimeType: string): Promise<Transcription> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new SttError("Speech service is not configured.", 503);

  const form = new FormData();
  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("wav") ? "wav" : "webm";
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), `read.${ext}`);
  form.append("model", process.env.OPENAI_STT_MODEL ?? "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("language", "en");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch {
    throw new SttError("Could not reach the speech service.");
  }

  if (!res.ok) throw new SttError(`Speech service error (${res.status}).`);

  const json = (await res.json()) as OpenAIResponse;
  const words: SttWord[] = (json.words ?? []).map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));
  return {
    transcript: json.text ?? "",
    words,
    durationSeconds: json.duration ?? estimateDuration(words),
    provider: "openai",
  };
}

function estimateDuration(words: SttWord[]): number {
  if (!words.length) return 0;
  const ends = words.map((w) => w.end).filter(Number.isFinite);
  const starts = words.map((w) => w.start).filter(Number.isFinite);
  if (!ends.length || !starts.length) return 0;
  return Math.max(0, Math.max(...ends) - Math.min(...starts));
}

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        words?: Array<{ word: string; start: number; end: number }>;
      }>;
    }>;
  };
}

interface OpenAIResponse {
  text?: string;
  duration?: number;
  words?: Array<{ word: string; start: number; end: number }>;
}
