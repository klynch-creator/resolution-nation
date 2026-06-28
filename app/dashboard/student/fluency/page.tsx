"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Star, Mic, Square, BookOpen, Sparkles, RotateCcw, Check } from "lucide-react";
import type { FluencyAssessment, FluencyScoreResponse } from "@/types";

type Phase =
  | "intro"
  | "loadingPassage"
  | "ready"
  | "recording"
  | "scoring"
  | "feedback";

export default function FluencyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("intro");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<FluencyAssessment | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [result, setResult] = useState<FluencyScoreResponse | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/dashboard");
          return;
        }
        const meRes = await fetch("/api/me");
        const meJson = meRes.ok ? await meRes.json() : { profile: null };
        if (meJson.profile && meJson.profile.role !== "student") {
          window.location.href = "/dashboard";
          return;
        }
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => {
      stopTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function startPassage() {
    setError(null);
    setPhase("loadingPassage");
    try {
      const res = await fetch("/api/fluency/passage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not start your reading. Please try again.");
        setPhase("intro");
        return;
      }
      setAssessment(json.assessment as FluencyAssessment);
      setAttemptNumber(1);
      setResult(null);
      setPhase("ready");
    } catch {
      setError("Something went wrong. Please try again.");
      setPhase("intro");
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        submitRecording(blob);
      };
      recorder.start();
      setElapsed(0);
      stopTimer();
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setPhase("recording");
    } catch {
      setError(
        "I couldn't turn on the microphone. Please allow microphone access and try again."
      );
    }
  }

  function stopRecording() {
    stopTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      setPhase("scoring");
    }
  }

  async function submitRecording(blob: Blob) {
    if (!assessment) return;
    try {
      const fd = new FormData();
      fd.append("assessmentId", assessment.id);
      fd.append("attemptNumber", String(attemptNumber));
      fd.append("audio", blob, "read.webm");
      const res = await fetch("/api/fluency/score", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "I couldn't listen to that reading. Please try again.");
        setPhase("ready");
        return;
      }
      setResult(json.result as FluencyScoreResponse);
      setPhase("feedback");
    } catch {
      setError("Something went wrong while saving your reading. Please try again.");
      setPhase("ready");
    }
  }

  function readAgain() {
    setAttemptNumber(2);
    setResult(null);
    setError(null);
    setPhase("ready");
  }

  function newPassage() {
    setAssessment(null);
    setResult(null);
    setTopic("");
    setError(null);
    setPhase("intro");
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" aria-hidden="true" />
        <div>Loading…</div>
      </div>
    );
  }

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(1, "0")}:${String(
    elapsed % 60
  ).padStart(2, "0")}`;

  return (
    <div className="min-h-screen" style={{ background: "#F7F9FC" }}>
      <header
        style={{
          background: "#0C2340",
          padding: "0 1.5rem",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href="/dashboard/student"
          className="flex items-center gap-2"
          style={{ textDecoration: "none" }}
        >
          <Star size={22} color="#D97706" fill="#D97706" aria-hidden="true" />
          <span
            style={{
              fontFamily: "var(--font-nunito), sans-serif",
              color: "#F7F9FC",
              fontSize: "1.25rem",
              fontWeight: 800,
            }}
          >
            Resolution Nation
          </span>
        </Link>
      </header>

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <Link
            href="/dashboard/student"
            style={{ color: "#028090", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}
          >
            ← Dashboard
          </Link>
          <h1
            className="flex items-center gap-2"
            style={{
              fontFamily: "var(--font-nunito), sans-serif",
              fontSize: "1.875rem",
              fontWeight: 800,
              color: "#0C2340",
              marginTop: "0.5rem",
            }}
          >
            <Mic size={28} color="#028090" aria-hidden="true" />
            Read Aloud
          </h1>
          <p style={{ color: "#64748B", fontSize: "1rem", marginTop: "0.25rem" }}>
            Read a short passage out loud and I&apos;ll listen along, then give you tips to read
            even better. Find a quiet spot!
          </p>
        </div>

        {error && (
          <div className="error-banner" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {/* INTRO */}
        {phase === "intro" && (
          <div className="card mb-6">
            <label
              htmlFor="topic"
              style={{
                display: "block",
                fontSize: "0.9375rem",
                fontWeight: 600,
                color: "#374151",
                marginBottom: "0.5rem",
              }}
            >
              Want to read about something special? (optional)
            </label>
            <input
              id="topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. sharks, soccer, outer space…"
              maxLength={80}
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: "10px",
                border: "1px solid #CBD5E1",
                fontSize: "1rem",
                marginBottom: "1rem",
              }}
            />
            <button
              onClick={startPassage}
              className="flex items-center justify-center gap-2"
              style={{
                width: "100%",
                background: "linear-gradient(135deg, #028090, #02C39A)",
                color: "white",
                border: "none",
                borderRadius: "10px",
                padding: "0.9375rem",
                fontSize: "1.0625rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Sparkles size={18} aria-hidden="true" />
              Get my passage
            </button>
          </div>
        )}

        {/* LOADING PASSAGE */}
        {phase === "loadingPassage" && (
          <div className="card mb-6 text-center" style={{ padding: "2.5rem" }}>
            <div className="spinner" aria-hidden="true" style={{ margin: "0 auto 1rem" }} />
            <div style={{ color: "#028090", fontSize: "1.0625rem", fontWeight: 600 }}>
              Picking out a great passage for you…
            </div>
          </div>
        )}

        {/* READY / RECORDING — show the passage */}
        {(phase === "ready" || phase === "recording" || phase === "scoring") && assessment && (
          <div className="card mb-6">
            <div className="flex items-center gap-2" style={{ marginBottom: "0.75rem" }}>
              <BookOpen size={20} color="#028090" aria-hidden="true" />
              <h2
                style={{
                  fontFamily: "var(--font-nunito), sans-serif",
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: "#0C2340",
                }}
              >
                {assessment.passage_title}
              </h2>
              {attemptNumber > 1 && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: "#EDE9FE",
                    color: "#6D28D9",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "0.125rem 0.625rem",
                    borderRadius: "100px",
                  }}
                >
                  Second read
                </span>
              )}
            </div>

            <p
              style={{
                fontSize: "1.3125rem",
                lineHeight: 1.9,
                color: "#1E293B",
                fontFamily: "Georgia, serif",
                marginBottom: "1.5rem",
                whiteSpace: "pre-wrap",
              }}
            >
              {assessment.passage_text}
            </p>

            {phase === "ready" && (
              <button
                onClick={startRecording}
                className="flex items-center justify-center gap-2"
                style={{
                  width: "100%",
                  background: "linear-gradient(135deg, #DC2626, #EF4444)",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  padding: "0.9375rem",
                  fontSize: "1.0625rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Mic size={20} aria-hidden="true" />
                {attemptNumber > 1 ? "Start my second read" : "Start reading"}
              </button>
            )}

            {phase === "recording" && (
              <div className="flex flex-col items-center gap-3">
                <div
                  className="flex items-center gap-2"
                  style={{ color: "#DC2626", fontWeight: 700, fontSize: "1rem" }}
                >
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      background: "#DC2626",
                      display: "inline-block",
                      animation: "pulse 1s ease-in-out infinite",
                    }}
                    aria-hidden="true"
                  />
                  Listening… {mmss}
                </div>
                <button
                  onClick={stopRecording}
                  className="flex items-center justify-center gap-2"
                  style={{
                    width: "100%",
                    background: "#0C2340",
                    color: "white",
                    border: "none",
                    borderRadius: "10px",
                    padding: "0.9375rem",
                    fontSize: "1.0625rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <Square size={18} fill="white" aria-hidden="true" />
                  I&apos;m done reading
                </button>
              </div>
            )}

            {phase === "scoring" && (
              <div className="text-center" style={{ padding: "0.5rem" }}>
                <div className="spinner" aria-hidden="true" style={{ margin: "0 auto 0.75rem" }} />
                <div style={{ color: "#028090", fontWeight: 600 }}>
                  Listening to your reading…
                </div>
              </div>
            )}
          </div>
        )}

        {/* FEEDBACK */}
        {phase === "feedback" && result && (
          <div className="card mb-6" style={{ borderLeft: "4px solid #02C39A" }}>
            <h2
              className="flex items-center gap-2"
              style={{
                fontFamily: "var(--font-nunito), sans-serif",
                fontSize: "1.25rem",
                fontWeight: 800,
                color: "#0C2340",
                marginBottom: "0.75rem",
              }}
            >
              <Check size={22} color="#02C39A" aria-hidden="true" />
              Awesome reading!
            </h2>

            {result.stars_awarded > 0 && (
              <div
                className="flex items-center gap-2"
                style={{
                  background: "#FFF7ED",
                  border: "1px solid #FED7AA",
                  borderRadius: "10px",
                  padding: "0.625rem 1rem",
                  color: "#D97706",
                  fontWeight: 700,
                  marginBottom: "1rem",
                  width: "fit-content",
                }}
              >
                <Star size={16} color="#D97706" fill="#D97706" aria-hidden="true" />
                +{result.stars_awarded} stars
              </div>
            )}

            <p style={{ fontSize: "1.0625rem", lineHeight: 1.6, color: "#1E293B" }}>
              {result.feedback}
            </p>

            {result.focus_words.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <div
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "#374151",
                    marginBottom: "0.5rem",
                  }}
                >
                  Words to practice:
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.focus_words.map((w) => (
                    <span
                      key={w}
                      style={{
                        background: "#E0F2FE",
                        color: "#0369A1",
                        fontWeight: 700,
                        fontSize: "0.9375rem",
                        padding: "0.25rem 0.75rem",
                        borderRadius: "100px",
                      }}
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2" style={{ marginTop: "1.5rem" }}>
              {result.can_retry && (
                <button
                  onClick={readAgain}
                  className="flex items-center justify-center gap-2"
                  style={{
                    width: "100%",
                    background: "linear-gradient(135deg, #028090, #02C39A)",
                    color: "white",
                    border: "none",
                    borderRadius: "10px",
                    padding: "0.9375rem",
                    fontSize: "1.0625rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <RotateCcw size={18} aria-hidden="true" />
                  Read it again to improve
                </button>
              )}
              <button
                onClick={newPassage}
                className="flex items-center justify-center gap-2"
                style={{
                  width: "100%",
                  background: "white",
                  color: "#028090",
                  border: "1px solid #028090",
                  borderRadius: "10px",
                  padding: "0.75rem",
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <Sparkles size={16} aria-hidden="true" />
                Try a new passage
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
