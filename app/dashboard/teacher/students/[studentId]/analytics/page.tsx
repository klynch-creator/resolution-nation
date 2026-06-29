"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FluencyAnalyticsCard from "@/app/dashboard/_components/FluencyAnalyticsCard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkoutResponse {
  id: string;
  user_id: string;
  step_id: string | null;
  lesson_id: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  is_correct: boolean | null;
  created_at: string;
}

type FluencyLevel = "below" | "approaching" | "on";

interface Goal {
  id: string;
  student_id: string;
  friendly_text: string;
  standard_code: string | null;
  subject: string | null;
  status: string;
}

interface Roadmap {
  id: string;
  goal_id: string;
  student_id: string;
}

interface Step {
  id: string;
  roadmap_id: string;
  status: string;
}

interface StudentStats {
  name: string;
  grade: string | null;
  accuracy: number;
  goalsCompleted: number;
  goalsTotal: number;
  totalStars: number;
  adaptiveLevel: "Below" | "At" | "Above";
  weeklyAccuracy: { week: string; pct: number; total: number }[];
  // Promotional literacy standards.
  comprehension: { pct: number; hasData: boolean };
  writing: { pct: number; hasData: boolean };
  fluencyWcpm: number | null;
  fluencyLevel: FluencyLevel | null;
}

const FLUENCY_LEVEL: Record<FluencyLevel, { label: string; color: string; bg: string }> = {
  below: { label: "Below", color: "#B91C1C", bg: "#FEE2E2" },
  approaching: { label: "Approaching", color: "#B45309", bg: "#FEF3C7" },
  on: { label: "On / above", color: "#047857", bg: "#D1FAE5" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function accuracy(responses: WorkoutResponse[]): number {
  if (responses.length === 0) return 0;
  const correct = responses.filter((r) => r.is_correct).length;
  return Math.round((correct / responses.length) * 100);
}

function adaptiveLevel(responses: WorkoutResponse[]): "Below" | "At" | "Above" {
  const last10 = responses.slice(-10);
  if (last10.length === 0) return "At";
  const counts: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
  last10.forEach((r) => { if (r.difficulty) counts[r.difficulty]++; });
  const modal = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  return modal === "easy" ? "Below" : modal === "hard" ? "Above" : "At";
}

// Get ISO week string "YYYY-Www" for a date
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const weekNum = Math.ceil(
    ((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7
  );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// Get last 6 week labels (YYYY-Www)
function last6Weeks(): string[] {
  const weeks: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    weeks.push(isoWeek(d.toISOString()));
  }
  return weeks;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MiniStatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="card" style={{ padding: "1rem 1.25rem", borderLeft: `4px solid ${color}` }}>
      <p style={{ fontSize: "0.75rem", color: "#64748B", marginBottom: "0.25rem" }}>{label}</p>
      <p style={{ fontSize: "1.625rem", fontWeight: 700, color: "#0C2340", lineHeight: 1 }}>
        {value}
      </p>
    </div>
  );
}

function HBarChart({
  bars,
}: {
  bars: { label: string; pct: number; hasData: boolean }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
      {bars.map((bar) => (
        <div key={bar.label}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
            <span style={{ fontSize: "0.875rem", color: "#374151" }}>{bar.label}</span>
            <span style={{ fontSize: "0.875rem", color: "#64748B" }}>
              {bar.hasData ? `${bar.pct}%` : "No data yet"}
            </span>
          </div>
          <div
            style={{
              height: "10px",
              background: "#E2E8F0",
              borderRadius: "5px",
              overflow: "hidden",
            }}
          >
            {bar.hasData && (
              <div
                style={{
                  height: "100%",
                  width: `${bar.pct}%`,
                  background: bar.pct >= 80 ? "#028090" : bar.pct >= 60 ? "#D97706" : "#DC2626",
                  borderRadius: "5px",
                  transition: "width 0.6s ease",
                }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function WeeklyBarChart({
  weeks,
}: {
  weeks: { week: string; pct: number; total: number }[];
}) {
  const maxPct = 100;
  const hasAnyData = weeks.some((w) => w.total > 0);

  if (!hasAnyData) {
    return (
      <p style={{ color: "#94A3B8", fontSize: "0.9375rem" }}>
        No weekly data yet.
      </p>
    );
  }

  // Show short week label like "W12"
  const shortLabel = (week: string) => week.split("-")[1]; // "W12"

  return (
    <div>
      <svg
        viewBox={`0 0 ${weeks.length * 60} 120`}
        style={{ width: "100%", height: "140px" }}
      >
        {weeks.map((w, i) => {
          const barHeight = w.total > 0 ? Math.round((w.pct / maxPct) * 90) : 0;
          const x = i * 60 + 8;
          const barWidth = 44;
          const y = 90 - barHeight;
          const barColor = w.pct >= 80 ? "#028090" : w.pct >= 60 ? "#D97706" : "#DC2626";

          return (
            <g key={w.week}>
              {/* Background bar */}
              <rect x={x} y={0} width={barWidth} height={90} fill="#F1F5F9" rx={4} />
              {/* Data bar */}
              {w.total > 0 && (
                <rect x={x} y={y} width={barWidth} height={barHeight} fill={barColor} rx={4} />
              )}
              {/* Percentage label */}
              {w.total > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#374151"
                  fontWeight="600"
                >
                  {w.pct}%
                </text>
              )}
              {/* Week label */}
              <text
                x={x + barWidth / 2}
                y={106}
                textAnchor="middle"
                fontSize="10"
                fill="#64748B"
              >
                {shortLabel(w.week)}
              </text>
            </g>
          );
        })}
      </svg>
      <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "0.25rem" }}>
        Last 6 weeks · % correct
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StudentAnalyticsPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params.studentId as string;

  const [loading, setLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(false);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [insight, setInsight] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { router.push("/dashboard"); return; }

      const { data: teacherProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (!teacherProfile || teacherProfile.role !== "teacher") {
        router.push("/dashboard");
        return;
      }

      // Student profile
      const { data: studentProfile } = await supabase
        .from("profiles")
        .select("id, full_name, grade")
        .eq("id", studentId)
        .single();
      if (!studentProfile) { router.push("/dashboard/teacher/analytics"); return; }

      // Workout responses for this student (roadmap steps AND library lessons)
      const { data: responseData } = await supabase
        .from("workout_responses")
        .select("id, user_id, step_id, lesson_id, difficulty, is_correct, created_at")
        .eq("user_id", studentId)
        .order("created_at", { ascending: true });
      const responses: WorkoutResponse[] = responseData ?? [];

      // Lessons (library + roadmap) so reading/writing lessons feed the skills.
      const { data: lessonData } = await supabase
        .from("lessons")
        .select("id, subject, topic, title, standard_alignment")
        .eq("student_id", studentId);
      const lessonMap = new Map(
        (lessonData ?? []).map((l) => [
          l.id as string,
          `${l.subject ?? ""} ${l.topic ?? ""} ${l.title ?? ""} ${l.standard_alignment ?? ""}`.toLowerCase(),
        ])
      );

      // Reading fluency — highest current WCPM + that attempt's level.
      const { data: fluencyData } = await supabase
        .from("fluency_attempts")
        .select("wcpm, level, created_at")
        .eq("student_id", studentId)
        .order("wcpm", { ascending: false });
      const bestFluency = (fluencyData ?? [])[0] as
        | { wcpm: number; level: FluencyLevel | null }
        | undefined;
      const fluencyWcpm = bestFluency ? bestFluency.wcpm : null;
      const fluencyLevel = bestFluency?.level ?? null;

      // Goals for this student (teacher's goals)
      const { data: goalsData } = await supabase
        .from("goals")
        .select("id, student_id, friendly_text, standard_code, subject, status")
        .eq("student_id", studentId)
        .eq("teacher_id", user.id);
      const goals: Goal[] = goalsData ?? [];

      // Roadmaps + steps
      const { data: roadmapsData } = await supabase
        .from("learning_roadmaps")
        .select("id, goal_id, student_id")
        .eq("student_id", studentId)
        .eq("teacher_id", user.id);
      const roadmaps: Roadmap[] = roadmapsData ?? [];

      let steps: Step[] = [];
      if (roadmaps.length > 0) {
        const { data: stepsData } = await supabase
          .from("roadmap_steps")
          .select("id, roadmap_id, status")
          .in("roadmap_id", roadmaps.map((r) => r.id));
        steps = stepsData ?? [];
      }

      // Stars for this student
      const { data: starData } = await supabase
        .from("star_transactions")
        .select("user_id, amount, type")
        .eq("user_id", studentId)
        .in("type", ["earned", "bonus"]);
      const totalStars = (starData ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

      // Step → goal map
      const stepToGoal = new Map<string, string>();
      roadmaps.forEach((rm) => {
        steps.filter((s) => s.roadmap_id === rm.id).forEach((s) => stepToGoal.set(s.id, rm.goal_id));
      });
      const goalMap = new Map(goals.map((g) => [g.id, g]));

      // Promotional literacy standards: Comprehension + Writing, scored from
      // BOTH library lessons (lesson_id) and roadmap steps (step_id). Fluency is
      // shown separately as WCPM (above). Each response's text comes from its
      // lesson or its step's goal, then is classified by keyword.
      const COMPREHENSION = /comprehen|main idea|inferen|\brl\.|\bri\.|reading|\bela\b|literacy|passage|theme|author|context|summar|detail/i;
      const WRITING = /writ|essay|paragraph|grammar|convention|\bw\.\d|sentence|punctuat|narrative|opinion|informative/i;

      const skillStats = {
        comprehension: { correct: 0, total: 0 },
        writing: { correct: 0, total: 0 },
      };
      responses.forEach((r) => {
        let text: string | null = null;
        if (r.lesson_id) {
          text = lessonMap.get(r.lesson_id) ?? null;
        } else if (r.step_id) {
          const goalId = stepToGoal.get(r.step_id);
          const goal = goalId ? goalMap.get(goalId) : undefined;
          if (goal) text = (goal.friendly_text + " " + (goal.subject ?? "")).toLowerCase();
        }
        if (!text) return;
        if (COMPREHENSION.test(text)) {
          skillStats.comprehension.total++;
          if (r.is_correct) skillStats.comprehension.correct++;
        }
        if (WRITING.test(text)) {
          skillStats.writing.total++;
          if (r.is_correct) skillStats.writing.correct++;
        }
      });
      const comprehension = {
        pct: skillStats.comprehension.total > 0
          ? Math.round((skillStats.comprehension.correct / skillStats.comprehension.total) * 100)
          : 0,
        hasData: skillStats.comprehension.total > 0,
      };
      const writing = {
        pct: skillStats.writing.total > 0
          ? Math.round((skillStats.writing.correct / skillStats.writing.total) * 100)
          : 0,
        hasData: skillStats.writing.total > 0,
      };

      // Weekly accuracy (last 6 weeks)
      const weeks = last6Weeks();
      const weeklyMap: Record<string, { correct: number; total: number }> = {};
      weeks.forEach((w) => (weeklyMap[w] = { correct: 0, total: 0 }));
      responses.forEach((r) => {
        const w = isoWeek(r.created_at);
        if (weeklyMap[w]) {
          weeklyMap[w].total++;
          if (r.is_correct) weeklyMap[w].correct++;
        }
      });
      const weeklyAccuracy = weeks.map((w) => ({
        week: w,
        pct: weeklyMap[w].total > 0
          ? Math.round((weeklyMap[w].correct / weeklyMap[w].total) * 100)
          : 0,
        total: weeklyMap[w].total,
      }));

      const studentStats: StudentStats = {
        name: studentProfile.full_name,
        grade: studentProfile.grade ?? null,
        accuracy: accuracy(responses),
        goalsCompleted: goals.filter((g) => g.status === "completed").length,
        goalsTotal: goals.length,
        totalStars,
        adaptiveLevel: adaptiveLevel(responses),
        weeklyAccuracy,
        comprehension,
        writing,
        fluencyWcpm,
        fluencyLevel,
      };

      setStats(studentStats);
      setLoading(false);
    }
    load();
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generateInsight() {
    if (!stats) return;
    setInsightLoading(true);
    try {
      const res = await fetch("/api/student-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentStats: stats }),
      });
      const { insight: text } = await res.json();
      setInsight(text);
    } catch {
      setInsight("Unable to generate insight at this time.");
    } finally {
      setInsightLoading(false);
    }
  }

  const levelColor =
    stats?.adaptiveLevel === "Above"
      ? "#7C3AED"
      : stats?.adaptiveLevel === "Below"
      ? "#DC2626"
      : "#028090";

  return (
    <div className="min-h-screen" style={{ background: "#F7F9FC" }}>
      {/* Header */}
      <header
        style={{
          background: "#0C2340",
          padding: "0 2rem",
          height: "64px",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "1.5rem" }}>🌟</span>
          <span
            style={{
              fontFamily: "Georgia, serif",
              color: "#F7F9FC",
              fontSize: "1.25rem",
              fontWeight: 700,
            }}
          >
            Resolution Nation
          </span>
        </div>
      </header>

      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Back */}
        <Link
          href="/dashboard/teacher/analytics"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            color: "#028090",
            fontSize: "0.9375rem",
            fontWeight: 500,
            textDecoration: "none",
            marginBottom: "1.5rem",
          }}
        >
          ← Back to Analytics
        </Link>

        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "#64748B" }}>
            Loading student data…
          </div>
        ) : !stats ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "#64748B" }}>
            Student not found.
          </div>
        ) : (
          <>
            {/* Student header */}
            <div className="flex items-center gap-4 mb-6 flex-wrap">
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "#028090",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.5rem",
                  color: "white",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {stats.name.charAt(0)}
              </div>
              <div>
                <h1
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "1.625rem",
                    fontWeight: 700,
                    color: "#0C2340",
                    marginBottom: "0.2rem",
                  }}
                >
                  {stats.name}
                </h1>
                <div className="flex items-center gap-3">
                  {stats.grade && (
                    <span style={{ fontSize: "0.875rem", color: "#64748B" }}>
                      Grade {stats.grade}
                    </span>
                  )}
                  <span
                    style={{
                      display: "inline-block",
                      padding: "0.15rem 0.6rem",
                      borderRadius: "100px",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: levelColor,
                      background: `${levelColor}18`,
                    }}
                  >
                    {stats.adaptiveLevel} Level
                  </span>
                </div>
              </div>
            </div>

            {/* Mini stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <MiniStatCard
                label="Accuracy"
                value={`${stats.accuracy}%`}
                color={stats.accuracy >= 80 ? "#028090" : stats.accuracy >= 60 ? "#D97706" : "#DC2626"}
              />
              <MiniStatCard
                label="Goals Completed"
                value={`${stats.goalsCompleted}/${stats.goalsTotal}`}
                color="#028090"
              />
              <MiniStatCard
                label="Stars Earned"
                value={stats.totalStars}
                color="#D97706"
              />
              <MiniStatCard
                label="Adaptive Level"
                value={stats.adaptiveLevel}
                color={levelColor}
              />
            </div>

            {/* Reading fluency (read-aloud) summary + link to full report */}
            <FluencyAnalyticsCard studentId={studentId} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
              {/* Literacy Skills */}
              <div className="card" style={{ padding: "1.5rem" }}>
                <h2
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "1.0625rem",
                    fontWeight: 700,
                    color: "#0C2340",
                    marginBottom: "1.25rem",
                  }}
                >
                  Literacy Skills
                </h2>

                {/* Fluency — highest current WCPM */}
                <div
                  className="flex items-center justify-between"
                  style={{
                    background: "#F8FAFC",
                    borderRadius: "10px",
                    padding: "0.75rem 1rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.875rem", color: "#374151", fontWeight: 600 }}>
                      Fluency
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "#94A3B8" }}>
                      highest WCPM
                    </div>
                  </div>
                  {stats.fluencyWcpm != null ? (
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#7C3AED", lineHeight: 1 }}>
                        {stats.fluencyWcpm}
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748B" }}> wcpm</span>
                      </span>
                      {stats.fluencyLevel && (
                        <span
                          style={{
                            background: FLUENCY_LEVEL[stats.fluencyLevel].bg,
                            color: FLUENCY_LEVEL[stats.fluencyLevel].color,
                            fontSize: "0.6875rem",
                            fontWeight: 700,
                            padding: "0.15rem 0.55rem",
                            borderRadius: "100px",
                          }}
                        >
                          {FLUENCY_LEVEL[stats.fluencyLevel].label}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: "0.8125rem", color: "#94A3B8" }}>No reads yet</span>
                  )}
                </div>

                {/* Comprehension + Writing */}
                {!stats.comprehension.hasData && !stats.writing.hasData ? (
                  <p style={{ color: "#94A3B8", fontSize: "0.9375rem" }}>
                    No comprehension or writing data yet. Completed reading and writing lessons will show here.
                  </p>
                ) : (
                  <HBarChart
                    bars={[
                      { label: "Comprehension", pct: stats.comprehension.pct, hasData: stats.comprehension.hasData },
                      { label: "Writing", pct: stats.writing.pct, hasData: stats.writing.hasData },
                    ]}
                  />
                )}
              </div>

              {/* Weekly Accuracy */}
              <div className="card" style={{ padding: "1.5rem" }}>
                <h2
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "1.0625rem",
                    fontWeight: 700,
                    color: "#0C2340",
                    marginBottom: "1.25rem",
                  }}
                >
                  Weekly Accuracy
                </h2>
                <WeeklyBarChart weeks={stats.weeklyAccuracy} />
              </div>
            </div>

            {/* AI Insight */}
            <div className="card" style={{ padding: "1.5rem" }}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                <h2
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "1.0625rem",
                    fontWeight: 700,
                    color: "#0C2340",
                  }}
                >
                  ✨ AI-Generated Insight
                </h2>
                {!insight && (
                  <button
                    onClick={generateInsight}
                    disabled={insightLoading}
                    className="btn-primary"
                    style={{
                      padding: "0.5rem 1.25rem",
                      fontSize: "0.9375rem",
                    }}
                  >
                    {insightLoading ? "Generating…" : "Generate Insight"}
                  </button>
                )}
              </div>
              {insight ? (
                <p
                  style={{
                    fontSize: "1rem",
                    lineHeight: 1.7,
                    color: "#374151",
                    borderLeft: "3px solid #028090",
                    paddingLeft: "1rem",
                    margin: 0,
                  }}
                >
                  {insight}
                </p>
              ) : (
                <p style={{ color: "#94A3B8", fontSize: "0.9375rem" }}>
                  Click &ldquo;Generate Insight&rdquo; to get an AI-powered summary of this
                  student&apos;s progress and what to focus on next.
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
