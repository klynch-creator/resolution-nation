"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { IepGoal, IepProgressNote, IepProgressLevel, ParentStudentLink } from "@/types";

const PROGRESS_LEVELS: Record<
  IepProgressLevel,
  { color: string; bg: string }
> = {
  Emerging: { color: "#DC2626", bg: "#FEF2F2" },
  Developing: { color: "#D97706", bg: "#FFF7ED" },
  Approaching: { color: "#2563EB", bg: "#EFF6FF" },
  Meeting: { color: "#059669", bg: "#ECFDF5" },
  Exceeding: { color: "#7C3AED", bg: "#F5F3FF" },
};

const AREA_EMOJI: Record<string, string> = {
  ELA: "📖",
  Math: "🔢",
  Writing: "✏️",
  Behavior: "🧠",
  "Social-Emotional": "💛",
  Other: "📌",
};

function ProgressBadge({ level }: { level: IepProgressLevel }) {
  const s = PROGRESS_LEVELS[level] ?? { color: "#64748B", bg: "#F1F5F9" };
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: "100px",
        padding: "0.25rem 0.75rem",
        fontSize: "0.8125rem",
        fontWeight: 700,
      }}
    >
      {level}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ParentIepPage() {
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [childName, setChildName] = useState("");
  const [iepGoals, setIepGoals] = useState<IepGoal[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get approved link
      const { data: links } = await supabase
        .from("parent_student_links")
        .select("*")
        .eq("parent_id", user.id)
        .eq("status", "approved")
        .limit(1);

      const link = links?.[0] as ParentStudentLink | undefined;
      if (!link) {
        setNotLinked(true);
        setLoading(false);
        return;
      }

      const childId = link.student_id;

      // Child profile
      const { data: child } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", childId)
        .single();
      setChildName(child?.full_name ?? "");

      // Shared IEP goals for this child
      const { data: goals } = await supabase
        .from("iep_goals")
        .select("*")
        .eq("student_id", childId)
        .eq("shared_with_parent", true)
        .order("created_at", { ascending: false });

      setIepGoals((goals ?? []) as IepGoal[]);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <main
        className="flex flex-col gap-3 items-center justify-center"
        style={{ minHeight: "calc(100vh - 112px)" }}
      >
        <div className="spinner" aria-hidden="true" />
        <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading…</div>
      </main>
    );
  }

  if (notLinked) {
    return (
      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "3rem 1.25rem" }}>
        <div className="card text-center" style={{ padding: "3rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
          <p style={{ color: "#64748B" }}>
            No approved child link found. Go to the Dashboard to request a
            connection.
          </p>
        </div>
      </main>
    );
  }

  const firstName = childName.split(" ")[0] ?? "your child";

  return (
    <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.25rem" }}>
      <div className="mb-6">
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#0C2340",
            marginBottom: "0.25rem",
          }}
        >
          {firstName}&apos;s IEP Goals 📋
        </h1>
        <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
          Goals shared by {firstName}&apos;s teacher. Read-only view.
        </p>
      </div>

      {iepGoals.length === 0 ? (
        <div className="card text-center" style={{ padding: "3rem", color: "#64748B" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📭</div>
          <p style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "#374151" }}>
            No IEP updates shared yet
          </p>
          <p style={{ fontSize: "0.9375rem" }}>
            When {firstName}&apos;s teacher shares IEP goals with you,
            they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {iepGoals.map((goal) => {
            const isOpen = expanded.has(goal.id);
            const latestNote = goal.progress_notes?.slice(-1)[0] as
              | IepProgressNote
              | undefined;
            const emoji = AREA_EMOJI[goal.area] ?? "📌";

            return (
              <div key={goal.id} className="card" style={{ padding: 0 }}>
                {/* Header — click to expand */}
                <button
                  onClick={() => toggleExpand(goal.id)}
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "1.25rem",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.875rem",
                  }}
                >
                  <span style={{ fontSize: "1.5rem", flexShrink: 0 }}>
                    {emoji}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        style={{
                          background: "#F0FAFA",
                          color: "#028090",
                          borderRadius: "100px",
                          padding: "0.125rem 0.625rem",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                        }}
                      >
                        {goal.area}
                      </span>
                      {latestNote && (
                        <ProgressBadge level={latestNote.progress_level} />
                      )}
                    </div>
                    <p
                      style={{
                        fontWeight: 600,
                        color: "#0C2340",
                        fontSize: "0.9375rem",
                        lineHeight: 1.4,
                      }}
                    >
                      {goal.goal_text}
                    </p>
                  </div>
                  <span
                    style={{
                      color: "#94A3B8",
                      fontSize: "1.25rem",
                      flexShrink: 0,
                      transition: "transform 0.2s",
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    ▾
                  </span>
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div
                    style={{
                      padding: "0 1.25rem 1.25rem 1.25rem",
                      borderTop: "1px solid #F1F5F9",
                    }}
                  >
                    {/* Goal details */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "0.75rem",
                        marginTop: "1rem",
                        marginBottom: "1rem",
                      }}
                    >
                      {goal.baseline && (
                        <div
                          style={{
                            background: "#F8FAFC",
                            borderRadius: "8px",
                            padding: "0.75rem",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "#64748B",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              marginBottom: "0.375rem",
                            }}
                          >
                            Baseline
                          </div>
                          <div style={{ fontSize: "0.875rem", color: "#374151" }}>
                            {goal.baseline}
                          </div>
                        </div>
                      )}
                      {goal.target && (
                        <div
                          style={{
                            background: "#F8FAFC",
                            borderRadius: "8px",
                            padding: "0.75rem",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "#64748B",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              marginBottom: "0.375rem",
                            }}
                          >
                            Target
                          </div>
                          <div style={{ fontSize: "0.875rem", color: "#374151" }}>
                            {goal.target}
                          </div>
                        </div>
                      )}
                      {goal.measurement && (
                        <div
                          style={{
                            background: "#F8FAFC",
                            borderRadius: "8px",
                            padding: "0.75rem",
                            gridColumn: "1 / -1",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "#64748B",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              marginBottom: "0.375rem",
                            }}
                          >
                            How it&apos;s measured
                          </div>
                          <div style={{ fontSize: "0.875rem", color: "#374151" }}>
                            {goal.measurement}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Progress notes */}
                    {goal.progress_notes && goal.progress_notes.length > 0 && (
                      <div>
                        <div
                          style={{
                            fontSize: "0.8125rem",
                            fontWeight: 700,
                            color: "#64748B",
                            textTransform: "uppercase",
                            marginBottom: "0.75rem",
                          }}
                        >
                          Progress Notes ({goal.progress_notes.length})
                        </div>
                        <div className="flex flex-col gap-3">
                          {[...goal.progress_notes].reverse().map((note) => (
                            <div
                              key={note.id}
                              style={{
                                background: "#FAFAFA",
                                border: "1px solid #E2E8F0",
                                borderRadius: "8px",
                                padding: "0.875rem 1rem",
                              }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <ProgressBadge level={note.progress_level} />
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#94A3B8",
                                  }}
                                >
                                  {formatDate(note.created_at)}
                                </span>
                              </div>
                              <p
                                style={{
                                  fontSize: "0.9375rem",
                                  color: "#374151",
                                  lineHeight: 1.6,
                                }}
                              >
                                {note.progress_note}
                              </p>
                              {note.data_points && note.data_points.length > 0 && (
                                <div style={{ marginTop: "0.75rem" }}>
                                  {note.data_points.map((dp, j) => (
                                    <div
                                      key={j}
                                      style={{
                                        fontSize: "0.8125rem",
                                        color: "#64748B",
                                        padding: "0.25rem 0",
                                        borderTop:
                                          j > 0 ? "1px solid #F1F5F9" : "none",
                                      }}
                                    >
                                      • {dp}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(!goal.progress_notes || goal.progress_notes.length === 0) && (
                      <p
                        style={{
                          fontSize: "0.875rem",
                          color: "#94A3B8",
                          fontStyle: "italic",
                        }}
                      >
                        No progress notes added yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
