"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle, FileText, PenLine, BookOpen, Star, Lightbulb, Check, ClipboardX } from "lucide-react";
import type { WritingSubmission, CreativeStory, ModerationFlag } from "@/types";

/**
 * Teacher-facing review of a student's written work + content-moderation
 * controls. Self-contained (own fetch) so it can't break the host page.
 */
export default function WritingReview({ studentId }: { studentId: string }) {
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<WritingSubmission[]>([]);
  const [stories, setStories] = useState<CreativeStory[]>([]);
  const [flags, setFlags] = useState<ModerationFlag[]>([]);
  const [frozen, setFrozen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [unfreezing, setUnfreezing] = useState(false);

  async function fetchAll() {
    const supabase = createClient();
    const [{ data: s }, { data: st }, { data: f }, { data: prof }] = await Promise.all([
      supabase.from("writing_submissions").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
      supabase.from("creative_stories").select("*").eq("student_id", studentId).order("updated_at", { ascending: false }),
      supabase.from("moderation_flags").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
      supabase.from("profiles").select("is_frozen").eq("id", studentId).single(),
    ]);
    return {
      subs: (s as WritingSubmission[]) ?? [],
      stories: (st as CreativeStory[]) ?? [],
      flags: (f as ModerationFlag[]) ?? [],
      frozen: !!prof?.is_frozen,
    };
  }

  function apply(d: Awaited<ReturnType<typeof fetchAll>>) {
    setSubs(d.subs);
    setStories(d.stories);
    setFlags(d.flags);
    setFrozen(d.frozen);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const d = await fetchAll();
      if (active) apply(d);
    })();
    return () => { active = false; };
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function unfreeze() {
    setUnfreezing(true);
    const supabase = createClient();
    const blockFlags = flags.filter((f) => f.severity === "block" && !f.resolved);
    for (const f of blockFlags) {
      await supabase.rpc("resolve_moderation_flag", { p_flag_id: f.id });
    }
    apply(await fetchAll());
    setUnfreezing(false);
  }

  if (loading) return null;

  const openFlags = flags.filter((f) => !f.resolved);
  const blockFlags = openFlags.filter((f) => f.severity === "block");
  const borderlineFlags = openFlags.filter((f) => f.severity === "flag");

  return (
    <div style={{ marginTop: "2rem" }}>
      {/* Moderation banner */}
      {(frozen || openFlags.length > 0) && (
        <div
          className="card"
          style={{
            padding: "1.25rem",
            marginBottom: "1.5rem",
            borderLeft: `4px solid ${frozen ? "#DC2626" : "#D97706"}`,
            background: frozen ? "#FEF2F2" : "#FFF7ED",
          }}
        >
          <div className="flex items-center gap-2" style={{ marginBottom: "0.5rem" }}>
            <AlertTriangle size={18} color={frozen ? "#DC2626" : "#D97706"} aria-hidden="true" />
            <span style={{ fontWeight: 800, color: "#0C2340" }}>
              {frozen ? "Account paused — content flagged" : "Content flagged for review"}
            </span>
          </div>
          {(blockFlags.length > 0 ? blockFlags : borderlineFlags).map((f) => (
            <div key={f.id} style={{ marginBottom: "0.75rem" }}>
              <p style={{ fontSize: "0.8125rem", color: "#64748B", marginBottom: "0.25rem" }}>
                {new Date(f.created_at).toLocaleString()} · {f.mode ?? "writing"}
                {f.reason ? ` — ${f.reason}` : ""}
                {f.categories ? ` (${f.categories})` : ""}
              </p>
              {f.excerpt && (
                <div style={{ background: "white", border: "1px solid #FCA5A5", borderRadius: "8px", padding: "0.75rem 1rem", color: "#0C2340", whiteSpace: "pre-wrap", fontSize: "0.875rem", lineHeight: 1.6 }}>
                  {f.excerpt}
                </div>
              )}
            </div>
          ))}
          {frozen && (
            <button
              onClick={unfreeze}
              disabled={unfreezing}
              className="btn-primary"
              style={{ marginTop: "0.5rem" }}
            >
              {unfreezing ? "Unfreezing…" : "✓ Reviewed — unfreeze account"}
            </button>
          )}
        </div>
      )}

      <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.25rem", fontWeight: 700, color: "#0C2340", marginBottom: "1rem" }}>
        Written Work
      </h2>

      {subs.length === 0 && stories.length === 0 ? (
        <p style={{ color: "#94A3B8", fontSize: "0.9375rem" }}>No writing submitted yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {subs.map((s) => {
            const isOpen = expanded === s.id;
            return (
              <div key={s.id} className="card" style={{ padding: "1rem 1.25rem" }}>
                <div className="flex items-center justify-between gap-2 flex-wrap" style={{ cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : s.id)}>
                  <div className="flex items-center gap-2">
                    {s.mode === "essay" ? <PenLine size={16} color="#7C3AED" aria-hidden="true" /> : <FileText size={16} color="#028090" aria-hidden="true" />}
                    <span style={{ fontWeight: 700, color: "#0C2340", fontSize: "0.9375rem" }}>
                      {s.mode === "essay" ? "Essay" : "Short Response"}
                    </span>
                    <span style={{ color: "#94A3B8", fontSize: "0.8125rem" }}>{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.paste_flagged && (
                      <span className="flex items-center gap-1" style={{ background: "#FEF3C7", color: "#B45309", borderRadius: "100px", padding: "0.15rem 0.55rem", fontSize: "0.6875rem", fontWeight: 700 }}>
                        <ClipboardX size={11} aria-hidden="true" /> pasted
                      </span>
                    )}
                    {s.score != null && s.rubric_max != null && (
                      <span className="flex items-center gap-1" style={{ background: "#ECFDF5", color: "#059669", borderRadius: "100px", padding: "0.15rem 0.6rem", fontSize: "0.8125rem", fontWeight: 700 }}>
                        <Star size={12} color="#059669" fill="#059669" aria-hidden="true" /> {s.score}/{s.rubric_max}
                      </span>
                    )}
                    <span style={{ color: "#028090", fontSize: "0.8125rem", fontWeight: 600 }}>{isOpen ? "Hide ▲" : "View ▼"}</span>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ marginTop: "0.875rem", borderTop: "1px solid #E2E8F0", paddingTop: "0.875rem" }}>
                    {s.prompt && <p style={{ fontWeight: 700, color: "#0C2340", marginBottom: "0.5rem" }}>Prompt: {s.prompt}</p>}
                    <p style={{ fontSize: "0.75rem", color: "#64748B", fontWeight: 700, marginBottom: "0.25rem" }}>Student response</p>
                    <div style={{ background: "#F8FAFC", borderRadius: "8px", padding: "0.75rem 1rem", whiteSpace: "pre-wrap", color: "#0C2340", lineHeight: 1.6, marginBottom: "0.75rem" }}>
                      {s.response_text || "(empty)"}
                    </div>
                    {s.strengths && (
                      <p className="flex items-start gap-2" style={{ color: "#047857", marginBottom: "0.375rem", lineHeight: 1.6 }}>
                        <Check size={16} style={{ flexShrink: 0, marginTop: "1px" }} aria-hidden="true" /> <span>{s.strengths}</span>
                      </p>
                    )}
                    {s.feedback && <p style={{ color: "#374151", lineHeight: 1.6, marginBottom: "0.375rem" }}>{s.feedback}</p>}
                    {s.improvement && (
                      <p className="flex items-start gap-2" style={{ color: "#92400E", lineHeight: 1.6 }}>
                        <Lightbulb size={16} style={{ flexShrink: 0, marginTop: "1px" }} aria-hidden="true" /> <span>{s.improvement}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {stories.map((s) => {
            const isOpen = expanded === s.id;
            return (
              <div key={s.id} className="card" style={{ padding: "1rem 1.25rem" }}>
                <div className="flex items-center justify-between gap-2" style={{ cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : s.id)}>
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} color="#D97706" aria-hidden="true" />
                    <span style={{ fontWeight: 700, color: "#0C2340", fontSize: "0.9375rem" }}>{s.title}</span>
                    <span style={{ color: "#94A3B8", fontSize: "0.8125rem" }}>story · {s.word_count} words</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.paste_flagged && (
                      <span className="flex items-center gap-1" style={{ background: "#FEF3C7", color: "#B45309", borderRadius: "100px", padding: "0.15rem 0.55rem", fontSize: "0.6875rem", fontWeight: 700 }}>
                        <ClipboardX size={11} aria-hidden="true" /> pasted
                      </span>
                    )}
                    <span style={{ color: "#028090", fontSize: "0.8125rem", fontWeight: 600 }}>{isOpen ? "Hide ▲" : "Read ▼"}</span>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ marginTop: "0.875rem", borderTop: "1px solid #E2E8F0", paddingTop: "0.875rem", whiteSpace: "pre-wrap", color: "#0C2340", lineHeight: 1.7 }}>
                    {s.content || "(empty)"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
