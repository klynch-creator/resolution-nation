"use client";

import type { Lesson, StudentSkillTier, LessonTier } from "@/types";
import { levelToGradeLabel } from "@/lib/adaptive";

const TIER_BADGE: Record<LessonTier, { label: string; color: string; bg: string }> = {
  below: { label: "Building Up", color: "#0369A1", bg: "#E0F2FE" },
  at: { label: "On Level", color: "#047857", bg: "#D1FAE5" },
  above: { label: "Challenge", color: "#6D28D9", bg: "#EDE9FE" },
};

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="card" style={{ padding: "1rem 1.25rem", borderLeft: `4px solid ${color}` }}>
      <p style={{ fontSize: "0.75rem", color: "#64748B", marginBottom: "0.25rem" }}>{label}</p>
      <p style={{ fontSize: "1.625rem", fontWeight: 700, color: "#0C2340", lineHeight: 1 }}>{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: Lesson["status"] }) {
  const map = {
    completed: { label: "Completed", color: "#047857", bg: "#D1FAE5" },
    failed: { label: "Retry needed", color: "#B45309", bg: "#FEF3C7" },
    active: { label: "In progress", color: "#0369A1", bg: "#E0F2FE" },
  }[status];
  return (
    <span
      style={{
        background: map.bg,
        color: map.color,
        fontSize: "0.6875rem",
        fontWeight: 700,
        padding: "0.125rem 0.5rem",
        borderRadius: "100px",
        whiteSpace: "nowrap",
      }}
    >
      {map.label}
    </span>
  );
}

export default function LessonHistory({
  lessons,
  skillTiers,
}: {
  lessons: Lesson[];
  skillTiers: StudentSkillTier[];
}) {
  const completed = lessons.filter((l) => l.status === "completed");
  const totalStars = completed.reduce((sum, l) => sum + (l.stars_awarded ?? 0), 0);
  const subjects = Array.from(new Set(lessons.map((l) => l.subject)));

  // Current tier + working level per subject (prefer the goal-less/library row).
  const tierBySubject = new Map<string, { tier: LessonTier; level: number | null }>();
  for (const t of skillTiers) {
    if (!tierBySubject.has(t.subject) || t.goal_id === null) {
      tierBySubject.set(t.subject, { tier: t.tier, level: t.level ?? null });
    }
  }

  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

  if (lessons.length === 0) {
    return (
      <div className="card" style={{ padding: "2.5rem", textAlign: "center", color: "#64748B" }}>
        <p style={{ fontSize: "1.0625rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>
          No lessons yet
        </p>
        <p style={{ fontSize: "0.9375rem" }}>
          When this student completes lessons in the Library, they&apos;ll appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Lessons Completed" value={completed.length} color="#028090" />
        <StatCard label="Lessons Started" value={lessons.length} color="#0369A1" />
        <StatCard label="Stars from Lessons" value={totalStars} color="#D97706" />
        <StatCard label="Subjects Explored" value={subjects.length} color="#7C3AED" />
      </div>

      {/* Current level per subject */}
      {tierBySubject.size > 0 && (
        <div className="card mb-6" style={{ padding: "1.5rem" }}>
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.0625rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "1rem",
            }}
          >
            Current Level by Subject
          </h2>
          <p style={{ fontSize: "0.8125rem", color: "#94A3B8", marginBottom: "1rem" }}>
            Each student works at their own measured level so they can succeed at ~80%. The
            grade estimate is the difficulty the lessons are currently pitched to.
          </p>
          <div className="flex flex-wrap gap-3">
            {Array.from(tierBySubject.entries()).map(([subject, info]) => {
              const badge = TIER_BADGE[info.tier];
              return (
                <div
                  key={subject}
                  className="flex items-center gap-2"
                  style={{
                    border: "1px solid #E2E8F0",
                    borderRadius: "10px",
                    padding: "0.5rem 0.875rem",
                  }}
                >
                  <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#0C2340" }}>{subject}</span>
                  {info.level != null && (
                    <span style={{ fontSize: "0.8125rem", color: "#475569", fontWeight: 600 }}>
                      ≈ {levelToGradeLabel(info.level)}
                    </span>
                  )}
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

      {/* History table */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <h2
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "1.0625rem",
            fontWeight: 700,
            color: "#0C2340",
            marginBottom: "1rem",
          }}
        >
          Lesson History ({lessons.length})
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748B", borderBottom: "1px solid #E2E8F0" }}>
                <th style={{ padding: "0.5rem 0.75rem 0.5rem 0" }}>Lesson</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Subject</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Level</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Status</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Score</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Stars</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((l) => {
                const badge = TIER_BADGE[l.tier];
                return (
                  <tr key={l.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "0.625rem 0.75rem 0.625rem 0", color: "#0C2340", fontWeight: 500 }}>
                      {l.title}
                      {l.topic && l.topic !== l.title ? (
                        <span style={{ color: "#94A3B8", fontWeight: 400 }}> · {l.topic}</span>
                      ) : null}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", color: "#374151" }}>{l.subject}</td>
                    <td style={{ padding: "0.625rem 0.75rem" }}>
                      <span
                        style={{
                          background: badge.bg,
                          color: badge.color,
                          fontSize: "0.6875rem",
                          fontWeight: 700,
                          padding: "0.125rem 0.5rem",
                          borderRadius: "100px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem" }}>
                      <StatusPill status={l.status} />
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", color: "#374151" }}>
                      {l.score_pct != null ? `${Math.round(l.score_pct)}%` : "—"}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", color: "#D97706", fontWeight: 700 }}>
                      {l.stars_awarded ? `★ ${l.stars_awarded}` : "—"}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", color: "#64748B", whiteSpace: "nowrap" }}>
                      {fmtDate(l.completed_at ?? l.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
