"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { PenLine, Sparkles, Check, Star, Lightbulb, Ban } from "lucide-react";
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
  paste_flagged?: boolean;
}

export default function EssayPage() {
  const [phase, setPhase] = useState<"idle" | "loading" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);
  const [a, setA] = useState<Assignment | null>(null);
  const [response, setResponse] = useState("");
  const [pastes, setPastes] = useState<PasteEvent[]>([]);
  const [pasteNote, setPasteNote] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function generate() {
    setPhase("loading"); setError(null); setResult(null); setResponse(""); setPastes([]); setPasteNote(false);
    try {
      const res = await fetch("/api/writing/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "essay" }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Could not start. Please try again."); setPhase("idle"); return; }
      setA(json); setPhase("ready");
    } catch { setError("Could not start. Please try again."); setPhase("idle"); }
  }

  async function submit() {
    if (!a || response.trim().length < 10) { setError("Write at least a few sentences first."); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/writing/grade", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "essay", assignmentId: a.assignmentId, subject: "Writing",
          standard_alignment: a.standard_alignment, passageTitle: a.passage.title,
          passageText: a.passage.text, prompt: a.prompts[0], response, pasteEvents: pastes,
        }),
      });
      const json = await res.json();
      if (res.status === 423 || json.blocked) { window.location.reload(); return; }
      if (!res.ok) { setError(json.error ?? "Could not submit. Please try again."); setSubmitting(false); return; }
      setResult(json as GradeResult);
    } catch { setError("Could not submit. Please try again."); }
    setSubmitting(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F7F9FC", fontFamily: "var(--font-nunito), sans-serif" }}>
      <header style={{ background: "#0C2340", padding: "0 1.5rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="flex items-center gap-2">
          <PenLine size={20} color="#9F67FA" aria-hidden="true" />
          <span style={{ color: "#F7F9FC", fontSize: "1.125rem", fontWeight: 800 }}>Essay Practice</span>
        </div>
        <Link href="/dashboard/student/writing" style={{ color: "#94A3B8", fontSize: "0.875rem", textDecoration: "none" }}>← Writing</Link>
      </header>

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        {error && <div className="error-banner" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}

        {phase === "idle" && (
          <div className="card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <PenLine size={40} color="#7C3AED" aria-hidden="true" style={{ margin: "0 auto 1rem" }} />
            <h1 style={{ fontSize: "1.375rem", fontWeight: 800, color: "#0C2340", marginBottom: "0.5rem" }}>Essay Practice</h1>
            <p style={{ color: "#64748B", marginBottom: "1.5rem" }}>
              Read a passage, then plan and write a full essay using evidence from the text. You&apos;ll get rubric feedback and editing help.
            </p>
            <button onClick={generate} className="btn-primary flex items-center justify-center gap-2" style={{ margin: "0 auto" }}>
              <Sparkles size={16} aria-hidden="true" /> Generate a passage & prompt
            </button>
          </div>
        )}

        {phase === "loading" && (
          <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
            <div className="spinner" aria-hidden="true" style={{ margin: "0 auto 1rem" }} />
            <p style={{ color: "#64748B" }}>Writing a fresh passage and essay prompt…</p>
          </div>
        )}

        {phase === "ready" && a && (
          <>
            <div className="card" style={{ padding: "1.5rem", marginBottom: "1.25rem", borderLeft: "4px solid #7C3AED" }}>
              <div className="flex items-center justify-between gap-2" style={{ marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 800, color: "#0C2340", fontSize: "1.0625rem" }}>{a.passage.title}</span>
                <ReadAloud text={`${a.passage.title}. ${a.passage.text}`} label="Read passage" color="#7C3AED" />
              </div>
              <div style={{ color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{a.passage.text}</div>
            </div>

            <div className="card" style={{ padding: "1.5rem", marginBottom: "1.25rem", background: "#FAF5FF" }}>
              <span style={{ fontWeight: 800, color: "#6D28D9" }}>Your prompt</span>
              <p style={{ color: "#0C2340", lineHeight: 1.6, marginTop: "0.375rem" }}>{a.prompts[0]}</p>
            </div>

            {!result ? (
              <div className="card" style={{ padding: "1.5rem" }}>
                <WritingTextarea
                  value={response}
                  onChange={setResponse}
                  onPasteAttempt={(c) => { setPastes((p) => [...p, { at: new Date().toISOString(), chars: c }]); setPasteNote(true); }}
                  placeholder="Plan your essay (intro, body paragraphs with evidence, conclusion) and write it here."
                  minHeight={320}
                />
                {pasteNote && (
                  <p className="flex items-center gap-1" style={{ color: "#B45309", fontSize: "0.8125rem", marginTop: "0.5rem" }}>
                    <Ban size={14} aria-hidden="true" /> Pasting is turned off — please write in your own words.
                  </p>
                )}
                <div className="flex items-center justify-between" style={{ marginTop: "0.75rem" }}>
                  <span style={{ color: "#94A3B8", fontSize: "0.8125rem" }}>
                    {response.trim() ? response.trim().split(/\s+/).length : 0} words
                  </span>
                  <button onClick={submit} disabled={submitting} className="btn-primary">
                    {submitting ? "Checking…" : "Submit essay"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: "1.5rem" }}>
                <div className="flex items-center gap-2" style={{ marginBottom: "0.75rem" }}>
                  <span className="flex items-center gap-1" style={{ background: "#ECFDF5", color: "#059669", borderRadius: "100px", padding: "0.25rem 0.875rem", fontWeight: 800, fontSize: "1rem" }}>
                    <Star size={15} color="#059669" fill="#059669" aria-hidden="true" /> {result.score} / {result.rubric_max}
                  </span>
                  {result.paste_flagged && (
                    <span style={{ background: "#FEF3C7", color: "#B45309", borderRadius: "100px", padding: "0.2rem 0.6rem", fontSize: "0.75rem", fontWeight: 700 }}>paste detected</span>
                  )}
                </div>
                {result.strengths && (
                  <p className="flex items-start gap-2" style={{ color: "#047857", marginBottom: "0.5rem", lineHeight: 1.6 }}>
                    <Check size={18} style={{ flexShrink: 0, marginTop: "1px" }} aria-hidden="true" /> <span>{result.strengths}</span>
                  </p>
                )}
                {result.feedback && <p style={{ color: "#374151", lineHeight: 1.6, marginBottom: "0.75rem" }}>{result.feedback}</p>}
                {result.improvement && (
                  <div className="flex items-start gap-2" style={{ background: "#FEF3C7", borderRadius: "8px", padding: "0.75rem 1rem", color: "#92400E", lineHeight: 1.6, marginBottom: "1rem" }}>
                    <Lightbulb size={18} style={{ flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
                    <span><strong>Editing help: </strong>{result.improvement}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setResult(null); }} className="btn-secondary">Revise this essay</button>
                  <button onClick={generate} className="btn-primary">New prompt</button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
