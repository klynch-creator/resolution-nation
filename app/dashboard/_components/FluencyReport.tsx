"use client";

import { useState } from "react";
import { Play, TrendingUp, Volume2 } from "lucide-react";
import type { FluencyAssessment, FluencyAttempt, FluencyLevel } from "@/types";

const LEVEL_STYLE: Record<FluencyLevel, { label: string; color: string; bg: string }> = {
  below: { label: "Below grade level", color: "#B91C1C", bg: "#FEE2E2" },
  approaching: { label: "Approaching grade level", color: "#B45309", bg: "#FEF3C7" },
  on: { label: "On / above grade level", color: "#047857", bg: "#D1FAE5" },
};

function levelBadge(level: FluencyLevel | null) {
  if (!level) {
    return (
      <span
        style={{
          background: "#F1F5F9",
          color: "#64748B",
          fontSize: "0.75rem",
          fontWeight: 700,
          padding: "0.125rem 0.625rem",
          borderRadius: "100px",
        }}
      >
        Not normed
      </span>
    );
  }
  const s = LEVEL_STYLE[level];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        fontSize: "0.75rem",
        fontWeight: 700,
        padding: "0.125rem 0.625rem",
        borderRadius: "100px",
      }}
    >
      {s.label}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: "64px" }}>
      <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0C2340" }}>{value}</div>
      <div style={{ fontSize: "0.6875rem", color: "#94A3B8", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

export default function FluencyReport({
  assessments,
  attempts,
}: {
  assessments: FluencyAssessment[];
  attempts: FluencyAttempt[];
}) {
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  async function loadAudio(attemptId: string) {
    setAudioError(null);
    setLoadingAudio(attemptId);
    try {
      const res = await fetch(`/api/fluency/audio/${attemptId}`);
      const json = await res.json();
      if (!res.ok) {
        setAudioError(json.error ?? "Could not load the recording.");
        return;
      }
      setAudioUrls((prev) => ({ ...prev, [attemptId]: json.url }));
    } catch {
      setAudioError("Could not load the recording.");
    } finally {
      setLoadingAudio(null);
    }
  }

  if (assessments.length === 0) {
    return (
      <div className="card text-center" style={{ padding: "2.5rem" }}>
        <Volume2 size={32} color="#CBD5E1" aria-hidden="true" style={{ margin: "0 auto 0.75rem" }} />
        <p style={{ color: "#64748B" }}>No read-aloud sessions yet.</p>
      </div>
    );
  }

  const byAssessment = new Map<string, FluencyAttempt[]>();
  for (const a of attempts) {
    const list = byAssessment.get(a.assessment_id) ?? [];
    list.push(a);
    byAssessment.set(a.assessment_id, list);
  }

  return (
    <div className="flex flex-col gap-4">
      {audioError && (
        <div className="error-banner" role="alert">
          {audioError}
        </div>
      )}

      {assessments.map((asmt) => {
        const reads = (byAssessment.get(asmt.id) ?? []).sort(
          (a, b) => a.attempt_number - b.attempt_number
        );
        const first = reads[0];
        const last = reads[reads.length - 1];
        const improved =
          reads.length > 1 && last && first ? last.wcpm - first.wcpm : null;

        return (
          <div key={asmt.id} className="card">
            <div className="flex items-center justify-between gap-2" style={{ marginBottom: "0.75rem" }}>
              <div>
                <div style={{ fontWeight: 800, color: "#0C2340", fontSize: "1.0625rem" }}>
                  {asmt.passage_title}
                </div>
                <div style={{ color: "#94A3B8", fontSize: "0.8125rem" }}>
                  {asmt.passage_word_count} words
                  {asmt.grade ? ` · Grade ${asmt.grade}` : ""} ·{" "}
                  {new Date(asmt.created_at).toLocaleDateString()}
                </div>
              </div>
              {levelBadge(asmt.best_level)}
            </div>

            {reads.length === 0 && (
              <p style={{ color: "#94A3B8", fontSize: "0.875rem" }}>Assigned, not yet read.</p>
            )}

            {reads.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "#F7F9FC",
                  border: "1px solid #E2E8F0",
                  borderRadius: "10px",
                  padding: "0.875rem 1rem",
                  marginBottom: "0.5rem",
                }}
              >
                <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontWeight: 700,
                      color: "#475569",
                      fontSize: "0.8125rem",
                      minWidth: "70px",
                    }}
                  >
                    Read {r.attempt_number}
                  </span>
                  <Metric label="WCPM" value={String(r.wcpm)} />
                  <Metric label="Accuracy" value={r.accuracy_pct != null ? `${r.accuracy_pct}%` : "—"} />
                  <Metric label="Errors" value={String(r.errors)} />
                  <Metric
                    label="Time"
                    value={r.duration_seconds != null ? `${Math.round(r.duration_seconds)}s` : "—"}
                  />
                  <div style={{ minWidth: "120px", textAlign: "right" }}>{levelBadge(r.level)}</div>
                </div>

                {r.norm_p50 != null && (
                  <div style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "0.375rem" }}>
                    Benchmark ({r.norm_season}): 50th pct {r.norm_p50} WCPM, 25th pct {r.norm_p25}
                    {r.norm_source === "proxy" ? " (grade 6 reference)" : ""}
                  </div>
                )}

                {r.audio_path && (
                  <div style={{ marginTop: "0.625rem" }}>
                    {audioUrls[r.id] ? (
                      <audio controls src={audioUrls[r.id]} style={{ width: "100%", height: "36px" }} />
                    ) : (
                      <button
                        onClick={() => loadAudio(r.id)}
                        disabled={loadingAudio === r.id}
                        className="flex items-center gap-1.5"
                        style={{
                          background: "white",
                          color: "#028090",
                          border: "1px solid #028090",
                          borderRadius: "8px",
                          padding: "0.375rem 0.75rem",
                          fontSize: "0.8125rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <Play size={14} aria-hidden="true" />
                        {loadingAudio === r.id ? "Loading…" : "Play recording"}
                      </button>
                    )}
                  </div>
                )}

                {r.miscues && r.miscues.length > 0 && (
                  <details style={{ marginTop: "0.5rem" }}>
                    <summary
                      style={{ fontSize: "0.8125rem", color: "#028090", fontWeight: 600, cursor: "pointer" }}
                    >
                      Miscues ({r.miscues.length})
                    </summary>
                    <div className="flex flex-wrap gap-1.5" style={{ marginTop: "0.5rem" }}>
                      {r.miscues.slice(0, 40).map((m, i) => (
                        <span
                          key={i}
                          title={m.type}
                          style={{
                            fontSize: "0.75rem",
                            padding: "0.125rem 0.5rem",
                            borderRadius: "6px",
                            background:
                              m.type === "omission"
                                ? "#FEF3C7"
                                : m.type === "substitution"
                                  ? "#FEE2E2"
                                  : "#E0E7FF",
                            color: "#334155",
                          }}
                        >
                          {m.type === "omission"
                            ? `skipped "${m.expected}"`
                            : m.type === "substitution"
                              ? `"${m.expected}" → "${m.heard}"`
                              : `added "${m.heard}"`}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}

            {improved != null && (
              <div
                className="flex items-center gap-1.5"
                style={{
                  color: improved >= 0 ? "#047857" : "#B45309",
                  fontWeight: 700,
                  fontSize: "0.8125rem",
                  marginTop: "0.25rem",
                }}
              >
                <TrendingUp size={15} aria-hidden="true" />
                {improved >= 0
                  ? `+${improved} WCPM from first to second read`
                  : `${improved} WCPM from first to second read`}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
