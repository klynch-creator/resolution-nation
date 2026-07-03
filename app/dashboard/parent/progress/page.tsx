"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Lesson, ParentStudentLink, StudentSkillTier } from "@/types";
import { levelToGradeLabel, deriveTier } from "@/lib/adaptive";
import { TrendingUp, Sparkles, LifeBuoy, BookOpen, Star } from "lucide-react";

interface ChildData {
  link: ParentStudentLink;
  name: string;
  grade: string | null;
  tiers: StudentSkillTier[];
  lessons: Lesson[];
}

const TIER_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  below: { label: "Building Up", color: "#0369A1", bg: "#E0F2FE" },
  at: { label: "On Level", color: "#047857", bg: "#D1FAE5" },
  above: { label: "Challenge", color: "#6D28D9", bg: "#EDE9FE" },
};

export default function ParentProgressPage() {
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<ChildData[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: links } = await supabase
        .from("parent_student_links")
        .select("*")
        .eq("parent_id", user.id)
        .eq("status", "approved");
      const approved = (links ?? []) as ParentStudentLink[];
      if (approved.length === 0) {
        setLoading(false);
        return;
      }

      const studentIds = approved.map((l) => l.student_id);
      const [{ data: profiles }, { data: tiers }, { data: lessons }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, grade").in("id", studentIds),
        supabase.from("student_skill_tiers").select("*").in("student_id", studentIds),
        supabase
          .from("lessons")
          .select("*")
          .in("student_id", studentIds)
          .order("created_at", { ascending: false })
          .limit(120),
      ]);
      const profById = new Map((profiles ?? []).map((p) => [p.id, p]));

      setChildren(
        approved.map((link) => ({
          link,
          name: profById.get(link.student_id)?.full_name ?? "Your child",
          grade: profById.get(link.student_id)?.grade ?? null,
          tiers: ((tiers ?? []) as StudentSkillTier[]).filter(
            (t) => t.student_id === link.student_id && t.level != null
          ),
          lessons: ((lessons ?? []) as Lesson[]).filter(
            (l) => l.student_id === link.student_id
          ),
        }))
      );
      setLoading(false);
    }
    load();
  }, []);  

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

  if (children.length === 0) {
    return (
      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "3rem 1.25rem" }}>
        <div className="card text-center" style={{ padding: "3rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
          <p style={{ color: "#64748B" }}>
            Progress appears here once your child link is approved. Start from the Dashboard.
          </p>
        </div>
      </main>
    );
  }

  const child = children[activeIdx];
  const firstName = child.name.split(" ")[0];
  const graded = child.lessons.filter(
    (l) => l.status === "completed" && l.score_pct != null
  );

  // Per-subject average score from completed lessons.
  const bySubject = new Map<string, { total: number; count: number }>();
  graded.forEach((l) => {
    const e = bySubject.get(l.subject) ?? { total: 0, count: 0 };
    e.total += Number(l.score_pct);
    e.count += 1;
    bySubject.set(l.subject, e);
  });
  const subjectRows = [...bySubject.entries()]
    .map(([subject, v]) => ({ subject, avg: Math.round(v.total / v.count), count: v.count }))
    .sort((a, b) => b.avg - a.avg);

  // Topic-level wins & struggles from the most recent 30 graded lessons.
  const recentGraded = graded.slice(0, 30);
  const wins = recentGraded.filter((l) => Number(l.score_pct) >= 85).slice(0, 5);
  const struggles = recentGraded.filter((l) => Number(l.score_pct) < 60).slice(0, 5);
  const recent = child.lessons
    .filter((l) => l.status === "completed" || l.status === "failed")
    .slice(0, 6);

  // Prefer library rows (goal_id null) for level chips, dedupe by subject.
  const levelBySubject = new Map<string, StudentSkillTier>();
  child.tiers.forEach((t) => {
    if (!levelBySubject.has(t.subject) || t.goal_id === null) {
      levelBySubject.set(t.subject, t);
    }
  });

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
          {firstName}&apos;s Progress 📈
        </h1>
        <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
          Where {firstName} is thriving and where a little extra practice would help.
        </p>
      </div>

      {children.length > 1 && (
        <div className="flex gap-2 mb-6">
          {children.map((c, i) => (
            <button
              key={c.link.id}
              onClick={() => setActiveIdx(i)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "100px",
                border: "1.5px solid",
                borderColor: i === activeIdx ? "#028090" : "#E2E8F0",
                background: i === activeIdx ? "#F0FAFA" : "white",
                color: i === activeIdx ? "#028090" : "#64748B",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              {c.name.split(" ")[0]}
            </button>
          ))}
        </div>
      )}

      {/* Working level by subject */}
      {levelBySubject.size > 0 && (
        <div className="card mb-6" style={{ padding: "1.5rem" }}>
          <h2
            className="flex items-center gap-2"
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.0625rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.35rem",
            }}
          >
            <TrendingUp size={18} color="#028090" aria-hidden="true" />
            Working Level by Subject
          </h2>
          <p style={{ fontSize: "0.8125rem", color: "#94A3B8", marginBottom: "1rem" }}>
            Lessons automatically adjust so {firstName} succeeds about 80% of the time. This shows
            the level each subject is currently pitched at.
          </p>
          <div className="flex flex-wrap gap-3">
            {[...levelBySubject.values()].map((t) => {
              const badge = TIER_BADGE[deriveTier(Number(t.level), child.grade)];
              return (
                <div
                  key={t.subject}
                  className="flex items-center gap-2"
                  style={{ border: "1px solid #E2E8F0", borderRadius: "10px", padding: "0.5rem 0.875rem" }}
                >
                  <span style={{ fontWeight: 600, color: "#0C2340", fontSize: "0.9375rem" }}>
                    {t.subject}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "#475569", fontWeight: 600 }}>
                    ≈ {levelToGradeLabel(Number(t.level))}
                  </span>
                  <span
                    style={{
                      background: badge.bg,
                      color: badge.color,
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      padding: "0.125rem 0.5rem",
                      borderRadius: "100px",
                    }}
                  >
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Going well / needs practice */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        <div className="card" style={{ padding: "1.5rem", borderTop: "4px solid #02C39A" }}>
          <h2
            className="flex items-center gap-2"
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.0625rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.75rem",
            }}
          >
            <Sparkles size={18} color="#02C39A" aria-hidden="true" />
            Going Well
          </h2>
          {wins.length === 0 ? (
            <p style={{ color: "#94A3B8", fontSize: "0.875rem" }}>
              Wins will show up here as {firstName} completes lessons.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {wins.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: "0.9375rem", color: "#374151" }}>
                    {l.topic} <span style={{ color: "#94A3B8" }}>· {l.subject}</span>
                  </span>
                  <span style={{ color: "#047857", fontWeight: 700, fontSize: "0.875rem", flexShrink: 0 }}>
                    {Math.round(Number(l.score_pct))}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: "1.5rem", borderTop: "4px solid #D97706" }}>
          <h2
            className="flex items-center gap-2"
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.0625rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.75rem",
            }}
          >
            <LifeBuoy size={18} color="#D97706" aria-hidden="true" />
            Could Use Practice
          </h2>
          {struggles.length === 0 ? (
            <p style={{ color: "#94A3B8", fontSize: "0.875rem" }}>
              Nothing right now — {firstName} is handling their lessons well!
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {struggles.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: "0.9375rem", color: "#374151" }}>
                    {l.topic} <span style={{ color: "#94A3B8" }}>· {l.subject}</span>
                  </span>
                  <span style={{ color: "#B45309", fontWeight: 700, fontSize: "0.875rem", flexShrink: 0 }}>
                    {Math.round(Number(l.score_pct))}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Subject averages */}
      {subjectRows.length > 0 && (
        <div className="card mb-6" style={{ padding: "1.5rem" }}>
          <h2
            className="flex items-center gap-2"
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.0625rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "1rem",
            }}
          >
            <BookOpen size={18} color="#028090" aria-hidden="true" />
            Average Score by Subject
          </h2>
          <div className="flex flex-col gap-3">
            {subjectRows.map((row) => (
              <div key={row.subject}>
                <div className="flex justify-between" style={{ fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                  <span style={{ fontWeight: 600, color: "#0C2340" }}>{row.subject}</span>
                  <span style={{ color: "#64748B" }}>
                    {row.avg}% · {row.count} lesson{row.count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div style={{ background: "#E2E8F0", borderRadius: "100px", height: "8px" }}>
                  <div
                    style={{
                      width: `${row.avg}%`,
                      height: "100%",
                      borderRadius: "100px",
                      background:
                        row.avg >= 80
                          ? "linear-gradient(90deg, #028090, #02C39A)"
                          : row.avg >= 60
                          ? "#D97706"
                          : "#DC2626",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recent.length > 0 && (
        <div className="card" style={{ padding: "1.5rem" }}>
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.0625rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.75rem",
            }}
          >
            Recent Lessons
          </h2>
          <div className="flex flex-col gap-2">
            {recent.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3"
                style={{
                  padding: "0.625rem 0.875rem",
                  background: "#F8FAFC",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                }}
              >
                <span style={{ fontSize: "0.9375rem", color: "#0C2340", flex: 1 }}>
                  {l.title} <span style={{ color: "#94A3B8" }}>· {l.subject}</span>
                </span>
                {l.status === "failed" ? (
                  <span style={{ color: "#B45309", fontWeight: 700, fontSize: "0.8125rem", flexShrink: 0 }}>
                    Retrying
                  </span>
                ) : (
                  <>
                    {l.score_pct != null && (
                      <span style={{ color: "#047857", fontWeight: 700, fontSize: "0.875rem", flexShrink: 0 }}>
                        {Math.round(Number(l.score_pct))}%
                      </span>
                    )}
                    <span
                      className="flex items-center gap-1"
                      style={{ color: "#D97706", fontWeight: 700, fontSize: "0.8125rem", flexShrink: 0 }}
                    >
                      <Star size={13} color="#D97706" fill="#D97706" aria-hidden="true" />
                      {l.stars_awarded ?? 0}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
