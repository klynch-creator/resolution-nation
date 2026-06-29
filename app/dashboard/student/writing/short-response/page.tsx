"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { FileText, Sparkles, Check, Star, Lightbulb, Ban } from "lucide-react";
import { ReadAloud } from "@/lib/read-aloud";
import { WritingTextarea } from "@/lib/writing-textarea";
import type { PasteEvent } from "@/types";

interface Assignment {
  assignmentId: string;
  passage: { title: string; text: string };
  prompts: string[];
  standard_alignment: string | null;
  rubric_max: number;
}
interface GradeResult {
  score: number;
  rubric_max: number;
  strengths: string;
  feedback: string;
  improvement: string;
  flagged?: boolean;
  paste_flagged?: boolean;
}

export default function ShortResponsePage() {
  const [phase, setPhase] = useState<"idle" | "loading" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);
  const [a, setA] = useState<Assignment | null>(null);
  const [responses, setResponses] = useState<string[]>([]);
  const [pastes, setPastes] = useState<PasteEvent[][]>([]);
  const [pasteNote, setPasteNote] = useState<boolean[]>([]);
  const [results, setResults] = useState<(GradeResult | null)[]>([]);
  const [submitting, setSubmitting] = useState<number | null>(null);

  async function generate() {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/writing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "short_response" }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Could not start. Please try again."); setPhase("idle"); return; }
      setA(json);
      setResponses(json.prompts.map(() => ""));
      setPastes(json.prompts.map(() => []));
      setPasteNote(json.prompts.map(() => false));
      setResults(json.prompts.map(() => null));
      setPhase("ready");
    } catch {
      setError("Could not start. Please try again.");
      setPhase("idle");
    }
  }

  function recordPaste(i: number, chars: number) {
    setPastes((prev) => prev.map((p, idx) => (idx === i ? [...p, { at: new Date().toISOString(), chars }] : p)));
    setPasteNote((prev) => prev.map((n, idx) => (idx === i ? true : n)));
  }

  async function submit(i: number) {
    if (!a || (responses[i] ?? "").trim().length < 2) return;
    setSubmitting(i);
    setError(null);
    try {
      const res = await fetch("/api/writing/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "short_response",
          assignmentId: a.assignmentId,
          subject: "Writing",
          standard_alignment: a.standard_alignment,
          passageTitle: a.passage.title,
          passageText: a.passage.text,
          prompt: a.prompts[i],
          response: responses[i],
          pasteEvents: pastes[i],
        }),
      });
      const json = await res.json();
      if (res.status === 423 || json.blocked) {
        // Account was paused — reload so the lockout screen takes over.
        window.location.reload();
        return;
      }
      if (!res.ok) { setError(json.error ?? "Could not submit. Please try again."); setSubmitting(null); return; }
      setResults((prev) => prev.map((r, idx) => (idx === i ? (json as GradeResult) : r)));
    } catch {
      setError("Could not submit. Please try again.");
    }
    setSubmitting(null);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F7F9FC", fontFamily: "var(--font-nunito), sans-serif" }}>
      <header style={{ background: "#0C2340", padding: "0 1.5rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="flex items-center gap-2">
          <FileText size={20} color="#02C39A" aria-hidden="true" />
          <span style={{ color: "#F7F9FC", fontSize: "1.125rem", fontWeight: 800 }}>Short Response</span>
        </div>
        <Link href="/dashboard/student/writing" style={{ color: "#94A3B8", fontSize: "0.875rem", textDecoration: "none" }}>← Writing</Link>
      </header>

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        {error && <div className="error-banner" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}

        {phase === "idle" && (
          <div className="card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <FileText size={40} color="#028090" aria-hidden="true" style={{ margin: "0 auto 1rem" }} />
            <h1 style={{ fontSize: "1.375rem", fontWeight: 800, color: "#0C2340", marginBottom: "0.5rem" }}>Short Response Practice</h1>
            <p style={{ color: "#64748B", marginBottom: "1.5rem" }}>
              You&apos;ll read a passage and answer 2 questions using text evidence — just like a state test. Use RACE/RADD: Restate, Answer, Cite evidence, Explain.
            </p>
            <button onClick={generate} className="btn-primary flex items-center justify-center gap-2" style={{ margin: "0 auto" }}>
              <Sparkles size={16} aria-hidden="true" /> Generate a passage
            </button>
          </div>
        )}

        {phase === "loading" && (
          <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
            <div className="spinner" aria-hidden="true" style={{ margin: "0 auto 1rem" }} />
            <p style={{ color: "#64748B" }}>Writing a fresh passage and questions…</p>
          </div>
        )}

        {phase === "ready" && a && (
          <>
            {/* Passage */}
            <div className="card" style={{ padding: "1.5rem", marginBottom: "1.25rem", borderLeft: "4px solid #028090" }}>
              <div className="flex items-center justify-between gap-2" style={{ marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 800, color: "#0C2340", fontSize: "1.0625rem" }}>{a.passage.title}</span>
                <ReadAloud text={`${a.passage.title}. ${a.passage.text}`} label="Read passage" />
              </div>
              <div style={{ color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{a.passage.text}</div>
            </div>

            {/* Prompts */}
            {a.prompts.map((p, i) => {
              const result = results[i];
              return (
                <div key={i} className="card" style={{ padding: "1.5rem", marginBottom: "1.25rem" }}>
                  <div className="flex items-start gap-2" style={{ marginBottom: "0.75rem" }}>
                    <span style={{ fontWeight: 800, color: "#7C3AED" }}>Q{i + 1}.</span>
                    <p style={{ fontWeight: 700, color: "#0C2340", lineHeight: 1.5 }}>{p}</p>
                  </div>

                  {!result ? (
                    <>
                      <WritingTextarea
                        value={responses[i] ?? ""}
                        onChange={(v) => setResponses((prev) => prev.map((r, idx) => (idx === i ? v : r)))}
                        onPasteAttempt={(chars) => recordPaste(i, chars)}
                        placeholder="Write your answer here. Restate the question, answer it, cite evidence from the passage, and explain."
                        minHeight={150}
                      />
                      {pasteNote[i] && (
                        <p className="flex items-center gap-1" style={{ color: "#B45309", fontSize: "0.8125rem", marginTop: "0.5rem" }}>
                          <Ban size={14} aria-hidden="true" /> Pasting is turned off — please type your own answer.
                        </p>
                      )}
                      <button
                        onClick={() => submit(i)}
                        disabled={submitting === i || (responses[i] ?? "").trim().length < 2}
                        className="btn-primary"
                        style={{ marginTop: "0.75rem" }}
                      >
                        {submitting === i ? "Checking…" : "Submit for feedback"}
                      </button>
                    </>
                  ) : (
                    <FeedbackCard result={result} response={responses[i]} />
                  )}
                </div>
              );
            })}

            <button onClick={generate} className="btn-secondary">↻ New passage</button>
          </>
        )}
      </main>
    </div>
  );
}

function FeedbackCard({ result, response }: { result: GradeResult; response: string }) {
  return (
    <div>
      <div style={{ background: "#F8FAFC", borderRadius: "10px", padding: "0.875rem 1rem", marginBottom: "0.875rem", whiteSpace: "pre-wrap", color: "#0C2340" }}>
        {response}
      </div>
      <div className="flex items-center gap-2" style={{ marginBottom: "0.75rem" }}>
        <span className="flex items-center gap-1" style={{ background: "#ECFDF5", color: "#059669", borderRadius: "100px", padding: "0.25rem 0.75rem", fontWeight: 800 }}>
          <Star size={14} color="#059669" fill="#059669" aria-hidden="true" /> {result.score} / {result.rubric_max}
        </span>
        {result.paste_flagged && (
          <span style={{ background: "#FEF3C7", color: "#B45309", borderRadius: "100px", padding: "0.2rem 0.6rem", fontSize: "0.75rem", fontWeight: 700 }}>
            paste detected
          </span>
        )}
      </div>
      {result.strengths && (
        <p className="flex items-start gap-2" style={{ color: "#047857", marginBottom: "0.5rem", lineHeight: 1.6 }}>
          <Check size={18} style={{ flexShrink: 0, marginTop: "1px" }} aria-hidden="true" /> <span>{result.strengths}</span>
        </p>
      )}
      {result.feedback && <p style={{ color: "#374151", lineHeight: 1.6, marginBottom: "0.5rem" }}>{result.feedback}</p>}
      {result.improvement && (
        <div className="flex items-start gap-2" style={{ background: "#FEF3C7", borderRadius: "8px", padding: "0.75rem 1rem", color: "#92400E", lineHeight: 1.6 }}>
          <Lightbulb size={18} style={{ flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
          <span><strong>To improve: </strong>{result.improvement}</span>
        </div>
      )}
    </div>
  );
}
