"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FluencyAnalyticsCard from "@/app/dashboard/_components/FluencyAnalyticsCard";
import {
  computeMathSkills,
  parseMathDomain,
  subjectColor,
  type MathResponse,
  type SkillBar,
} from "@/lib/analytics/skills";
import { levelToGradeLabel, deriveTier } from "@/lib/adaptive";

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

interface SubjectRow {
  subject: string;
  lessonsCompleted: number;
  questions: number;
  accuracy: number;
  stars: number;
}

interface DayRow {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Mon 6/30"
  questions: number;
  accuracy: number;
  lessons: number;
  stars: number;
  subjects: string[];
}

interface StudentStats {
  name: string;
  grade: string | null;
  accuracy: number;
  totalQuestions: number;
  lessonsCompleted: number;
  goalsCompleted: number;
  goalsTotal: number;
  totalStars: number;
  adaptiveLevel: "Below" | "At" | "Above";
  adaptiveAvgLevel: number | null;
  weeklyAccuracy: { week: string; pct: number; total: number }[];
  // Promotional literacy standards.
  comprehension: { pct: number; hasData: boolean };
  writing: { pct: number; hasData: boolean };
  fluencyWcpm: number | null;
  fluencyLevel: FluencyLevel | null;
  // Math promotional skills + CCSS domains.
  mathCurated: SkillBar[];
  mathDomains: SkillBar[];
  mathHasData: boolean;
  // Adaptive working level per subject (grade-equivalent).
  levels: { subject: string; level: number; tier: string }[];
  // Daily + subject breakdowns.
  daily: DayRow[];
  subjects: SubjectRow[];
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

// Overall working level vs enrolled grade, from the adaptive engine's MEASURED
// per-subject levels (student_skill_tiers.level). Replaces the old heuristic
// that looked only at the difficulty mix of the last 10 questions — which
// ignored whether answers were correct and routinely mislabeled students.
function measuredAdaptiveLevel(
  levels: { level: number }[],
  grade: string | null
): { label: "Below" | "At" | "Above"; avg: number | null } {
  if (levels.length === 0) return { label: "At", avg: null };
  const avg = levels.reduce((s, l) => s + l.level, 0) / levels.length;
  const tier = deriveTier(avg, grade);
  return { label: tier === "below" ? "Below" : tier === "above" ? "Above" : "At", avg };
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

// Local date key YYYY-MM-DD for grouping by day.
function dayKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Last N day keys, oldest → newest.
function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(dayKey(d.toISOString()));
  }
  return days;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} ${m}/${d}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MiniStatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div className="card" style={{ padding: "1rem 1.25rem", borderLeft: `4px solid ${color}` }}>
      <p style={{ fontSize: "0.75rem", color: "#64748B", marginBottom: "0.25rem" }}>{label}</p>
      <p style={{ fontSize: "1.625rem", fontWeight: 700, color: "#0C2340", lineHeight: 1 }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: "0.6875rem", color: "#94A3B8", marginTop: "0.3rem" }}>{sub}</p>
      )}
    </div>
  );
}

// Subject-colored chip.
function SubjectChip({ subject }: { subject: string }) {
  const c = subjectColor(subject);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.1rem 0.5rem",
        borderRadius: "100px",
        fontSize: "0.6875rem",
        fontWeight: 700,
        color: c,
        background: `${c}18`,
        whiteSpace: "nowrap",
      }}
    >
      {subject}
    </span>
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

function DailyActivity({ days }: { days: DayRow[] }) {
  const active = days.filter((d) => d.questions > 0 || d.lessons > 0 || d.stars > 0);
  const maxStars = Math.max(1, ...days.map((d) => d.stars));

  if (active.length === 0) {
    return (
      <p style={{ color: "#94A3B8", fontSize: "0.9375rem" }}>
        No activity in the last 14 days.
      </p>
    );
  }

  return (
    <div>
      {/* Stars-per-day sparkbar across the full 14-day window */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "3px",
          height: "56px",
          marginBottom: "1.25rem",
        }}
      >
        {days.map((d) => (
          <div
            key={d.date}
            title={`${d.label}: ${d.stars} stars`}
            style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}
          >
            <div
              style={{
                height: `${Math.round((d.stars / maxStars) * 100)}%`,
                minHeight: d.stars > 0 ? "4px" : "0",
                background: "#D97706",
                borderRadius: "3px 3px 0 0",
              }}
            />
          </div>
        ))}
      </div>

      {/* Active-day rows */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {active
          .slice()
          .reverse()
          .map((d) => (
            <div
              key={d.date}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.6rem 0",
                borderBottom: "1px solid #F1F5F9",
                flexWrap: "wrap",
              }}
            >
              <span style={{ width: "72px", fontSize: "0.8125rem", color: "#374151", fontWeight: 600, flexShrink: 0 }}>
                {d.label}
              </span>
              {d.questions > 0 && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "0.1rem 0.5rem",
                    borderRadius: "100px",
                    color: d.accuracy >= 80 ? "#028090" : d.accuracy >= 60 ? "#D97706" : "#DC2626",
                    background:
                      (d.accuracy >= 80 ? "#028090" : d.accuracy >= 60 ? "#D97706" : "#DC2626") + "18",
                  }}
                >
                  {d.accuracy}% acc
                </span>
              )}
              <span style={{ fontSize: "0.8125rem", color: "#64748B" }}>
                {d.lessons > 0 && `${d.lessons} lesson${d.lessons !== 1 ? "s" : ""}`}
                {d.lessons > 0 && d.questions > 0 && " · "}
                {d.questions > 0 && `${d.questions} q`}
              </span>
              {d.stars > 0 && (
                <span style={{ fontSize: "0.8125rem", color: "#D97706", fontWeight: 700 }}>
                  +{d.stars} ⭐
                </span>
              )}
              <span style={{ display: "flex", gap: "0.3rem", marginLeft: "auto", flexWrap: "wrap" }}>
                {d.subjects.map((s) => (
                  <SubjectChip key={s} subject={s} />
                ))}
              </span>
            </div>
          ))}
      </div>
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

      // Lessons (library + roadmap) so reading/writing/math lessons feed the
      // skills, the subject breakdown, and the daily activity feed.
      const { data: lessonData } = await supabase
        .from("lessons")
        .select(
          "id, subject, topic, title, standard_alignment, status, stars_awarded, completed_at"
        )
        .eq("student_id", studentId);
      const lessonRows = lessonData ?? [];
      const lessonMap = new Map(
        lessonRows.map((l) => [
          l.id as string,
          `${l.subject ?? ""} ${l.topic ?? ""} ${l.title ?? ""} ${l.standard_alignment ?? ""}`.toLowerCase(),
        ])
      );
      const lessonSubject = new Map(
        lessonRows.map((l) => [l.id as string, (l.subject as string | null) ?? null])
      );
      const lessonStandard = new Map(
        lessonRows.map((l) => [l.id as string, (l.standard_alignment as string | null) ?? null])
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

      // Adaptive working level per subject (prefer the goal-less/library row).
      const { data: tierData } = await supabase
        .from("student_skill_tiers")
        .select("subject, tier, level, goal_id")
        .eq("student_id", studentId);
      const levelBySubject = new Map<string, { subject: string; level: number; tier: string }>();
      (tierData ?? []).forEach((t) => {
        if (t.level == null) return;
        const existing = levelBySubject.get(t.subject);
        if (!existing || t.goal_id === null) {
          levelBySubject.set(t.subject, {
            subject: t.subject,
            level: Number(t.level),
            tier: t.tier,
          });
        }
      });
      const levels = [...levelBySubject.values()].sort((a, b) => a.subject.localeCompare(b.subject));

      // Stars for this student (with timestamps for the daily feed)
      const { data: starData } = await supabase
        .from("star_transactions")
        .select("user_id, amount, type, created_at")
        .eq("user_id", studentId)
        .in("type", ["earned", "bonus"]);
      const starRows = (starData ?? []) as { amount: number; created_at: string }[];
      const totalStars = starRows.reduce((sum, t) => sum + t.amount, 0);

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

      // ── Math skills + subject breakdown + daily activity ──────────────────
      const mathResponses: MathResponse[] = [];

      const days = lastNDays(14);
      const dayAgg: Record<
        string,
        { questions: number; correct: number; lessons: number; stars: number; subjects: Set<string> }
      > = {};
      days.forEach(
        (d) => (dayAgg[d] = { questions: 0, correct: 0, lessons: 0, stars: 0, subjects: new Set() })
      );

      const subjAgg: Record<
        string,
        { lessons: number; questions: number; correct: number; stars: number }
      > = {};
      const ensureSubj = (s: string) => {
        if (!subjAgg[s]) subjAgg[s] = { lessons: 0, questions: 0, correct: 0, stars: 0 };
        return subjAgg[s];
      };

      responses.forEach((r) => {
        let subject: string | null = null;
        let standard: string | null = null;
        let text = "";
        if (r.lesson_id) {
          subject = lessonSubject.get(r.lesson_id) ?? null;
          standard = lessonStandard.get(r.lesson_id) ?? null;
          text = lessonMap.get(r.lesson_id) ?? "";
        } else if (r.step_id) {
          const goalId = stepToGoal.get(r.step_id);
          const goal = goalId ? goalMap.get(goalId) : undefined;
          if (goal) {
            subject = goal.subject ?? null;
            standard = goal.standard_code ?? null;
            text = (goal.friendly_text + " " + (goal.subject ?? "")).toLowerCase();
          }
        }

        const isMath = subject === "Math" || /\bmath\b/.test(text) || parseMathDomain(standard) != null;
        if (isMath) mathResponses.push({ is_correct: r.is_correct, standard, text });

        if (subject) {
          const sa = ensureSubj(subject);
          sa.questions++;
          if (r.is_correct) sa.correct++;
        }

        const dk = dayKey(r.created_at);
        if (dayAgg[dk]) {
          dayAgg[dk].questions++;
          if (r.is_correct) dayAgg[dk].correct++;
          if (subject) dayAgg[dk].subjects.add(subject);
        }
      });

      // Completed lessons → subject totals + daily lessons.
      lessonRows.forEach((l) => {
        const completed = l.status === "completed" || l.completed_at != null;
        if (!completed) return;
        const subject = (l.subject as string | null) ?? null;
        const stars = (l.stars_awarded as number | null) ?? 0;
        if (subject) {
          const sa = ensureSubj(subject);
          sa.lessons++;
          sa.stars += stars;
        }
        if (l.completed_at) {
          const dk = dayKey(l.completed_at as string);
          if (dayAgg[dk]) {
            dayAgg[dk].lessons++;
            if (subject) dayAgg[dk].subjects.add(subject);
          }
        }
      });

      // Daily stars come from star_transactions (source of truth across all
      // activities — lessons, fluency, writing, roadmap steps).
      starRows.forEach((t) => {
        const dk = dayKey(t.created_at);
        if (dayAgg[dk]) dayAgg[dk].stars += t.amount;
      });

      const mathSkills = computeMathSkills(mathResponses);

      const daily: DayRow[] = days.map((d) => ({
        date: d,
        label: dayLabel(d),
        questions: dayAgg[d].questions,
        accuracy:
          dayAgg[d].questions > 0 ? Math.round((dayAgg[d].correct / dayAgg[d].questions) * 100) : 0,
        lessons: dayAgg[d].lessons,
        stars: dayAgg[d].stars,
        subjects: [...dayAgg[d].subjects],
      }));

      const subjects: SubjectRow[] = Object.entries(subjAgg)
        .map(([subject, v]) => ({
          subject,
          lessonsCompleted: v.lessons,
          questions: v.questions,
          accuracy: v.questions > 0 ? Math.round((v.correct / v.questions) * 100) : 0,
          stars: v.stars,
        }))
        .sort(
          (a, b) =>
            b.questions + b.lessonsCompleted * 5 - (a.questions + a.lessonsCompleted * 5)
        );

      const lessonsCompleted = lessonRows.filter(
        (l) => l.status === "completed" || l.completed_at != null
      ).length;

      const studentStats: StudentStats = {
        name: studentProfile.full_name,
        grade: studentProfile.grade ?? null,
        accuracy: accuracy(responses),
        totalQuestions: responses.length,
        lessonsCompleted,
        mathCurated: mathSkills.curated,
        mathDomains: mathSkills.domains,
        mathHasData: mathSkills.totalResponses > 0,
        levels,
        daily,
        subjects,
        goalsCompleted: goals.filter((g) => g.status === "completed").length,
        goalsTotal: goals.length,
        totalStars,
        adaptiveLevel: measuredAdaptiveLevel(levels, studentProfile.grade ?? null).label,
        adaptiveAvgLevel: measuredAdaptiveLevel(levels, studentProfile.grade ?? null).avg,
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
        body: JSON.stringify({ studentId, studentStats: stats }),
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
              <MiniStatCard
                label="Accuracy"
                value={`${stats.accuracy}%`}
                sub={`${stats.totalQuestions} question${stats.totalQuestions !== 1 ? "s" : ""} answered`}
                color={stats.accuracy >= 80 ? "#028090" : stats.accuracy >= 60 ? "#D97706" : "#DC2626"}
              />
              <MiniStatCard
                label="Lessons Done"
                value={stats.lessonsCompleted}
                sub="completed"
                color="#0EA5E9"
              />
              <MiniStatCard
                label="Goals Completed"
                value={`${stats.goalsCompleted}/${stats.goalsTotal}`}
                color="#028090"
              />
              <MiniStatCard
                label="Stars Earned"
                value={stats.totalStars}
                sub="all time"
                color="#D97706"
              />
              <MiniStatCard
                label="Adaptive Level"
                value={stats.adaptiveLevel}
                sub={
                  stats.adaptiveAvgLevel != null
                    ? `≈ ${levelToGradeLabel(stats.adaptiveAvgLevel)}`
                    : "no adaptive lessons yet"
                }
                color={levelColor}
              />
            </div>

            {/* Adaptive working level per subject */}
            {stats.levels.length > 0 && (
              <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                <h2
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "1.0625rem",
                    fontWeight: 700,
                    color: "#0C2340",
                    marginBottom: "0.35rem",
                  }}
                >
                  Working Level by Subject
                </h2>
                <p style={{ fontSize: "0.8125rem", color: "#94A3B8", marginBottom: "1.25rem" }}>
                  Where the adaptive engine is currently pitching each subject so {stats.name.split(" ")[0]} succeeds at ~80%. Hidden from students.
                </p>
                <div className="flex flex-wrap gap-3">
                  {stats.levels.map((lv) => {
                    const c =
                      lv.tier === "above" ? "#7C3AED" : lv.tier === "below" ? "#0369A1" : "#047857";
                    const label =
                      lv.tier === "above" ? "Challenge" : lv.tier === "below" ? "Building Up" : "On Level";
                    return (
                      <div
                        key={lv.subject}
                        className="flex items-center gap-2"
                        style={{ border: "1px solid #E2E8F0", borderRadius: "10px", padding: "0.5rem 0.875rem" }}
                      >
                        <SubjectChip subject={lv.subject} />
                        <span style={{ fontSize: "0.875rem", color: "#374151", fontWeight: 700 }}>
                          ≈ {levelToGradeLabel(lv.level)}
                        </span>
                        <span
                          style={{
                            background: `${c}18`,
                            color: c,
                            fontSize: "0.6875rem",
                            fontWeight: 700,
                            padding: "0.125rem 0.5rem",
                            borderRadius: "100px",
                          }}
                        >
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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

            {/* Math Skills */}
            <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
              <h2
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1.0625rem",
                  fontWeight: 700,
                  color: "#0C2340",
                  marginBottom: "0.35rem",
                }}
              >
                Math Skills
              </h2>
              <p style={{ fontSize: "0.8125rem", color: "#94A3B8", marginBottom: "1.25rem" }}>
                Promotional skills first, then a full CCSS-domain breakdown. Scored from completed
                math lessons and roadmap steps.
              </p>

              {!stats.mathHasData ? (
                <p style={{ color: "#94A3B8", fontSize: "0.9375rem" }}>
                  No math data yet. Completed math lessons and roadmap steps will show here.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                  <div>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#0C2340",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginBottom: "0.875rem",
                      }}
                    >
                      Key promotional skills
                    </p>
                    <HBarChart
                      bars={stats.mathCurated.map((b) => ({
                        label: b.label,
                        pct: b.pct,
                        hasData: b.hasData,
                      }))}
                    />
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#0C2340",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginBottom: "0.875rem",
                      }}
                    >
                      By CCSS domain
                    </p>
                    {stats.mathDomains.length === 0 ? (
                      <p style={{ color: "#94A3B8", fontSize: "0.875rem" }}>
                        No standards-tagged math activity yet.
                      </p>
                    ) : (
                      <HBarChart
                        bars={stats.mathDomains.map((b) => ({
                          label: b.label,
                          pct: b.pct,
                          hasData: b.hasData,
                        }))}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Subject Breakdown */}
            <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
              <h2
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1.0625rem",
                  fontWeight: 700,
                  color: "#0C2340",
                  marginBottom: "1.25rem",
                }}
              >
                By Subject
              </h2>
              {stats.subjects.length === 0 ? (
                <p style={{ color: "#94A3B8", fontSize: "0.9375rem" }}>
                  No subject activity yet.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #E2E8F0", textAlign: "left" }}>
                        <th style={{ padding: "0.5rem 0.75rem 0.5rem 0", color: "#64748B", fontWeight: 600 }}>
                          Subject
                        </th>
                        <th style={{ padding: "0.5rem 0.75rem", color: "#64748B", fontWeight: 600, textAlign: "right" }}>
                          Lessons
                        </th>
                        <th style={{ padding: "0.5rem 0.75rem", color: "#64748B", fontWeight: 600, textAlign: "right" }}>
                          Questions
                        </th>
                        <th style={{ padding: "0.5rem 0.75rem", color: "#64748B", fontWeight: 600, textAlign: "right" }}>
                          Accuracy
                        </th>
                        <th style={{ padding: "0.5rem 0 0.5rem 0.75rem", color: "#64748B", fontWeight: 600, textAlign: "right" }}>
                          Stars
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.subjects.map((s) => (
                        <tr key={s.subject} style={{ borderBottom: "1px solid #F1F5F9" }}>
                          <td style={{ padding: "0.6rem 0.75rem 0.6rem 0" }}>
                            <SubjectChip subject={s.subject} />
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", color: "#374151" }}>
                            {s.lessonsCompleted}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", textAlign: "right", color: "#374151" }}>
                            {s.questions}
                          </td>
                          <td style={{ padding: "0.6rem 0.75rem", textAlign: "right" }}>
                            {s.questions > 0 ? (
                              <span
                                style={{
                                  fontWeight: 700,
                                  color:
                                    s.accuracy >= 80 ? "#028090" : s.accuracy >= 60 ? "#D97706" : "#DC2626",
                                }}
                              >
                                {s.accuracy}%
                              </span>
                            ) : (
                              <span style={{ color: "#CBD5E1" }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "0.6rem 0 0.6rem 0.75rem", textAlign: "right", color: "#D97706", fontWeight: 700 }}>
                            {s.stars}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Daily Activity */}
            <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
              <h2
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1.0625rem",
                  fontWeight: 700,
                  color: "#0C2340",
                  marginBottom: "0.35rem",
                }}
              >
                Daily Activity
              </h2>
              <p style={{ fontSize: "0.8125rem", color: "#94A3B8", marginBottom: "1.25rem" }}>
                Last 14 days · accuracy, lessons, and stars per day with subjects worked.
              </p>
              <DailyActivity days={stats.daily} />
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
