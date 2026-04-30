"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkoutResponse {
  id: string;
  user_id: string;
  step_id: string;
  difficulty: "easy" | "medium" | "hard" | null;
  is_correct: boolean | null;
  created_at: string;
}

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

interface StudentProfile {
  userId: string;
  name: string;
  grade: string | null;
}

interface StarTransaction {
  user_id: string;
  amount: number;
  type: string;
}

interface AnalyticsState {
  loading: boolean;
  students: StudentProfile[];
  responses: WorkoutResponse[];
  goals: Goal[];
  roadmaps: Roadmap[];
  steps: Step[];
  stars: StarTransaction[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function adaptiveLevel(
  studentResponses: WorkoutResponse[]
): "Below" | "At" | "Above" {
  const last10 = studentResponses.slice(-10);
  if (last10.length === 0) return "At";
  const counts: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
  last10.forEach((r) => {
    if (r.difficulty) counts[r.difficulty]++;
  });
  const modal = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  return modal === "easy" ? "Below" : modal === "hard" ? "Above" : "At";
}

function accuracy(responses: WorkoutResponse[]): number {
  if (responses.length === 0) return 0;
  const correct = responses.filter((r) => r.is_correct).length;
  return Math.round((correct / responses.length) * 100);
}

function navLinkStyle(active: boolean): React.CSSProperties {
  return {
    color: active ? "#028090" : "#64748B",
    fontWeight: active ? 600 : 400,
    fontSize: "0.9375rem",
    padding: "0 1rem",
    height: "100%",
    display: "flex",
    alignItems: "center",
    borderBottom: active ? "2px solid #028090" : "2px solid transparent",
    textDecoration: "none",
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="card"
      style={{ padding: "1.25rem", animation: "pulse 1.5s infinite" }}
    >
      <div
        style={{
          height: "1rem",
          background: "#E2E8F0",
          borderRadius: "4px",
          marginBottom: "0.75rem",
          width: "60%",
        }}
      />
      <div
        style={{
          height: "2rem",
          background: "#E2E8F0",
          borderRadius: "4px",
          width: "40%",
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  borderColor,
}: {
  label: string;
  value: string | number;
  sub?: string;
  borderColor: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "1.25rem 1.5rem",
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      <p style={{ fontSize: "0.8125rem", color: "#64748B", marginBottom: "0.375rem" }}>
        {label}
      </p>
      <p
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          color: "#0C2340",
          lineHeight: 1,
          marginBottom: "0.25rem",
        }}
      >
        {value}
      </p>
      {sub && <p style={{ fontSize: "0.75rem", color: "#94A3B8" }}>{sub}</p>}
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "0.3rem",
            }}
          >
            <span style={{ fontSize: "0.875rem", color: "#374151" }}>
              {bar.label}
            </span>
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

function AdaptiveDistChart({
  below,
  at,
  above,
  total,
}: {
  below: number;
  at: number;
  above: number;
  total: number;
}) {
  if (total === 0)
    return (
      <p style={{ color: "#94A3B8", fontSize: "0.9375rem" }}>
        No data yet. Complete some workouts to see adaptive distribution.
      </p>
    );

  const bars = [
    { label: "Below Level", count: below, color: "#DC2626" },
    { label: "At Level", count: at, color: "#028090" },
    { label: "Above Level", count: above, color: "#7C3AED" },
  ];
  const maxCount = Math.max(below, at, above, 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {bars.map((bar) => (
        <div
          key={bar.label}
          style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
        >
          <span
            style={{
              fontSize: "0.8125rem",
              color: "#64748B",
              width: "90px",
              flexShrink: 0,
            }}
          >
            {bar.label}
          </span>
          <div
            style={{
              flex: 1,
              height: "24px",
              background: "#F1F5F9",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round((bar.count / maxCount) * 100)}%`,
                background: bar.color,
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                paddingLeft: "0.5rem",
                transition: "width 0.6s ease",
                minWidth: bar.count > 0 ? "2rem" : 0,
              }}
            >
              {bar.count > 0 && (
                <span
                  style={{ fontSize: "0.75rem", color: "white", fontWeight: 600 }}
                >
                  {bar.count}
                </span>
              )}
            </div>
          </div>
          {bar.count === 0 && (
            <span style={{ fontSize: "0.8125rem", color: "#CBD5E1" }}>0</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = "overview" | "roster" | "standards";

export default function TeacherAnalyticsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [teacherName, setTeacherName] = useState("");
  const [state, setState] = useState<AnalyticsState>({
    loading: true,
    students: [],
    responses: [],
    goals: [],
    roadmaps: [],
    steps: [],
    stars: [],
  });

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (!profile || profile.role !== "teacher") {
        router.push("/auth/login");
        return;
      }
      setTeacherName(profile.full_name);

      // 1. Teacher's pods
      const { data: pods } = await supabase
        .from("pods")
        .select("id")
        .eq("created_by", user.id);
      const podIds = (pods ?? []).map((p: { id: string }) => p.id);

      // 2. Students in those pods
      let students: StudentProfile[] = [];
      let studentIds: string[] = [];
      if (podIds.length > 0) {
        const { data: members } = await supabase
          .from("pod_members")
          .select("user_id, profiles(id, full_name, grade)")
          .in("pod_id", podIds)
          .neq("role", "admin");
        (members ?? []).forEach(
          (m: { user_id: string; profiles: { id: string; full_name: string; grade: string | null } | { id: string; full_name: string; grade: string | null }[] | null }) => {
            const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            if (p) {
              students.push({
                userId: m.user_id,
                name: p.full_name,
                grade: p.grade ?? null,
              });
              studentIds.push(m.user_id);
            }
          }
        );
      }
      // Deduplicate students (may appear in multiple pods)
      const seen = new Set<string>();
      students = students.filter((s) => {
        if (seen.has(s.userId)) return false;
        seen.add(s.userId);
        return true;
      });
      studentIds = [...new Set(studentIds)];

      // 3. Workout responses (RLS filters to teacher's roadmaps)
      let responses: WorkoutResponse[] = [];
      if (studentIds.length > 0) {
        const { data: resp } = await supabase
          .from("workout_responses")
          .select("id, user_id, step_id, difficulty, is_correct, created_at")
          .in("user_id", studentIds)
          .order("created_at", { ascending: true });
        responses = resp ?? [];
      }

      // 4. Goals for teacher
      const { data: goalsData } = await supabase
        .from("goals")
        .select("id, student_id, friendly_text, standard_code, subject, status")
        .eq("teacher_id", user.id);
      const goals: Goal[] = goalsData ?? [];

      // 5. Roadmaps + steps for teacher
      const { data: roadmapsData } = await supabase
        .from("learning_roadmaps")
        .select("id, goal_id, student_id")
        .eq("teacher_id", user.id);
      const roadmaps: Roadmap[] = roadmapsData ?? [];

      let steps: Step[] = [];
      if (roadmaps.length > 0) {
        const roadmapIds = roadmaps.map((r) => r.id);
        const { data: stepsData } = await supabase
          .from("roadmap_steps")
          .select("id, roadmap_id, status")
          .in("roadmap_id", roadmapIds);
        steps = stepsData ?? [];
      }

      // 6. Star transactions for students
      let stars: StarTransaction[] = [];
      if (studentIds.length > 0) {
        const { data: starData } = await supabase
          .from("star_transactions")
          .select("user_id, amount, type")
          .in("user_id", studentIds)
          .in("type", ["earned", "bonus"]);
        stars = starData ?? [];
      }

      setState({ loading: false, students, responses, goals, roadmaps, steps, stars });
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  const { loading, students, responses, goals, roadmaps, steps, stars } = state;

  // ── Computed stats ────────────────────────────────────────────────────────

  // Class average accuracy (all time)
  const classAccuracy = accuracy(responses);

  // Goals completed %
  const goalsCompletedPct =
    goals.length > 0
      ? Math.round(
          (goals.filter((g) => g.status === "completed").length / goals.length) * 100
        )
      : 0;

  // Workout completion %
  const workoutCompletionPct =
    steps.length > 0
      ? Math.round(
          (steps.filter((s) => s.status === "completed").length / steps.length) * 100
        )
      : 0;

  // Total stars
  const totalStars = stars.reduce((sum, t) => sum + t.amount, 0);

  // Adaptive distribution
  const adaptiveDist = { below: 0, at: 0, above: 0 };
  students.forEach((s) => {
    const sr = responses.filter((r) => r.user_id === s.userId);
    const level = adaptiveLevel(sr);
    if (level === "Below") adaptiveDist.below++;
    else if (level === "Above") adaptiveDist.above++;
    else adaptiveDist.at++;
  });

  // Literacy skills breakdown
  const stepToGoal = new Map<string, string>(); // step_id → goal_id
  roadmaps.forEach((rm) => {
    steps
      .filter((s) => s.roadmap_id === rm.id)
      .forEach((s) => stepToGoal.set(s.id, rm.goal_id));
  });

  const SKILLS = ["Phonics", "Sight Words", "Fluency", "Comprehension"];
  const skillKeywords: Record<string, string[]> = {
    Phonics: ["phonics", "phoneme", "phonological"],
    "Sight Words": ["sight word", "sight-word", "high frequency"],
    Fluency: ["fluency", "fluent", "reading rate"],
    Comprehension: ["comprehension", "understand", "main idea", "inference"],
  };
  const skillStats: Record<string, { correct: number; total: number }> = {};
  SKILLS.forEach((s) => (skillStats[s] = { correct: 0, total: 0 }));

  const goalMap = new Map(goals.map((g) => [g.id, g]));
  responses.forEach((r) => {
    const goalId = stepToGoal.get(r.step_id);
    if (!goalId) return;
    const goal = goalMap.get(goalId);
    if (!goal) return;
    const text = (goal.friendly_text + " " + (goal.subject ?? "")).toLowerCase();
    SKILLS.forEach((skill) => {
      if (skillKeywords[skill].some((kw) => text.includes(kw))) {
        skillStats[skill].total++;
        if (r.is_correct) skillStats[skill].correct++;
      }
    });
  });

  const literacyBars = SKILLS.map((skill) => ({
    label: skill,
    pct:
      skillStats[skill].total > 0
        ? Math.round((skillStats[skill].correct / skillStats[skill].total) * 100)
        : 0,
    hasData: skillStats[skill].total > 0,
  }));

  // Student roster rows (sorted by accuracy ascending)
  const rosterRows = students
    .map((s) => {
      const sr = responses.filter((r) => r.user_id === s.userId);
      const sGoals = goals.filter((g) => g.student_id === s.userId);
      return {
        ...s,
        accuracy: accuracy(sr),
        level: adaptiveLevel(sr),
        goalsCompleted: sGoals.filter((g) => g.status === "completed").length,
        goalsTotal: sGoals.length,
        hasData: sr.length > 0,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy);

  // Standards performance
  const standardMap = new Map<
    string,
    { description: string; correct: number; total: number; below: number; at: number; above: number }
  >();
  goals.forEach((g) => {
    if (!g.standard_code) return;
    const gRoadmaps = roadmaps.filter((rm) => rm.goal_id === g.id);
    const gStepIds = new Set(
      steps.filter((s) => gRoadmaps.some((rm) => rm.id === s.roadmap_id)).map((s) => s.id)
    );
    const gResponses = responses.filter((r) => gStepIds.has(r.step_id));
    if (!standardMap.has(g.standard_code)) {
      standardMap.set(g.standard_code, {
        description: g.friendly_text,
        correct: 0,
        total: 0,
        below: 0,
        at: 0,
        above: 0,
      });
    }
    const stat = standardMap.get(g.standard_code)!;
    gResponses.forEach((r) => {
      stat.total++;
      if (r.is_correct) stat.correct++;
      if (r.difficulty === "easy") stat.below++;
      else if (r.difficulty === "hard") stat.above++;
      else stat.at++;
    });
  });
  const standardRows = [...standardMap.entries()].map(([code, s]) => ({
    code,
    description: s.description,
    below: s.below,
    at: s.at,
    above: s.above,
    avgAccuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
    total: s.total,
  }));

  // ── Render ─────────────────────────────────────────────────────────────────

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
          justifyContent: "space-between",
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
        <div className="flex items-center gap-4">
          <span style={{ color: "#94A3B8", fontSize: "0.875rem" }}>{teacherName}</span>
          <button
            onClick={handleSignOut}
            style={{
              color: "#94A3B8",
              fontSize: "0.875rem",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Nav */}
      <nav
        style={{
          background: "white",
          borderBottom: "1px solid #E2E8F0",
          padding: "0 2rem",
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            display: "flex",
            height: "48px",
            alignItems: "stretch",
          }}
        >
          <Link href="/dashboard/teacher" style={navLinkStyle(false)}>
            Dashboard
          </Link>
          <Link href="/dashboard/teacher/students" style={navLinkStyle(false)}>
            My Students
          </Link>
          <Link href="/dashboard/teacher/analytics" style={navLinkStyle(true)}>
            📊 Analytics
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "0.25rem",
              }}
            >
              Class Analytics
            </h1>
            <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
              {students.length} student{students.length !== 1 ? "s" : ""} •{" "}
              {responses.length} total responses
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            borderBottom: "2px solid #E2E8F0",
            marginBottom: "1.75rem",
            gap: "0",
          }}
        >
          {(
            [
              { id: "overview", label: "Class Overview" },
              { id: "roster", label: "Student Roster" },
              { id: "standards", label: "Standards" },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "0.75rem 1.5rem",
                fontSize: "0.9375rem",
                fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? "#028090" : "#64748B",
                background: "none",
                border: "none",
                borderBottom: tab === t.id ? "2px solid #028090" : "2px solid transparent",
                marginBottom: "-2px",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview ─────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div>
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <StatCard
                  label="Class Avg Accuracy"
                  value={`${classAccuracy}%`}
                  sub="all responses"
                  borderColor={classAccuracy >= 80 ? "#028090" : classAccuracy >= 60 ? "#D97706" : "#DC2626"}
                />
                <StatCard
                  label="Goals Completed"
                  value={`${goalsCompletedPct}%`}
                  sub={`${goals.filter((g) => g.status === "completed").length} / ${goals.length}`}
                  borderColor="#028090"
                />
                <StatCard
                  label="Workout Completion"
                  value={`${workoutCompletionPct}%`}
                  sub={`${steps.filter((s) => s.status === "completed").length} / ${steps.length} steps`}
                  borderColor="#7C3AED"
                />
                <StatCard
                  label="Total Stars Earned"
                  value={totalStars.toLocaleString()}
                  sub="by all students"
                  borderColor="#D97706"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Adaptive Level Distribution */}
              <div className="card" style={{ padding: "1.5rem" }}>
                <h2
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    color: "#0C2340",
                    marginBottom: "1.25rem",
                  }}
                >
                  Adaptive Level Distribution
                </h2>
                {loading ? (
                  <div style={{ height: "120px", background: "#F1F5F9", borderRadius: "8px" }} />
                ) : (
                  <AdaptiveDistChart
                    below={adaptiveDist.below}
                    at={adaptiveDist.at}
                    above={adaptiveDist.above}
                    total={students.length}
                  />
                )}
                {!loading && students.length > 0 && (
                  <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "1rem" }}>
                    Based on each student&apos;s last 10 responses
                  </p>
                )}
              </div>

              {/* Literacy Skills Breakdown */}
              <div className="card" style={{ padding: "1.5rem" }}>
                <h2
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    color: "#0C2340",
                    marginBottom: "1.25rem",
                  }}
                >
                  Literacy Skills Breakdown
                </h2>
                {loading ? (
                  <div style={{ height: "120px", background: "#F1F5F9", borderRadius: "8px" }} />
                ) : literacyBars.every((b) => !b.hasData) ? (
                  <p style={{ color: "#94A3B8", fontSize: "0.9375rem" }}>
                    No data yet. Complete some workouts to see skill breakdowns.
                  </p>
                ) : (
                  <HBarChart bars={literacyBars} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Roster ───────────────────────────────────────────────────── */}
        {tab === "roster" && (
          <div>
            {loading ? (
              <div className="card" style={{ padding: "2rem", textAlign: "center", color: "#64748B" }}>
                Loading students…
              </div>
            ) : students.length === 0 ? (
              <div
                className="card"
                style={{ padding: "3rem", textAlign: "center", color: "#64748B" }}
              >
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎒</div>
                <p style={{ fontSize: "1.125rem", color: "#374151", marginBottom: "0.5rem" }}>
                  No students yet
                </p>
                <p>Students will appear here once they join your classroom.</p>
              </div>
            ) : (
              <div className="card" style={{ overflow: "hidden", padding: 0 }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.9375rem",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: "#F8FAFC",
                        borderBottom: "2px solid #E2E8F0",
                      }}
                    >
                      {[
                        "Student",
                        "Grade",
                        "Accuracy",
                        "Adaptive Level",
                        "6-Wk Growth",
                        "Goals",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "0.875rem 1rem",
                            textAlign: "left",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            color: "#64748B",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rosterRows.map((row, i) => {
                      const levelColor =
                        row.level === "Above"
                          ? "#7C3AED"
                          : row.level === "Below"
                          ? "#DC2626"
                          : "#028090";
                      const levelBg =
                        row.level === "Above"
                          ? "#F5F3FF"
                          : row.level === "Below"
                          ? "#FEF2F2"
                          : "#F0FAFA";
                      const progressPct =
                        row.goalsTotal > 0
                          ? Math.round((row.goalsCompleted / row.goalsTotal) * 100)
                          : 0;

                      return (
                        <tr
                          key={row.userId}
                          onClick={() =>
                            router.push(
                              `/dashboard/teacher/students/${row.userId}/analytics`
                            )
                          }
                          style={{
                            background: i % 2 === 0 ? "white" : "#FAFBFC",
                            borderBottom: "1px solid #F1F5F9",
                            cursor: "pointer",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLTableRowElement).style.background =
                              "#F0FAFA";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLTableRowElement).style.background =
                              i % 2 === 0 ? "white" : "#FAFBFC";
                          }}
                        >
                          <td style={{ padding: "0.875rem 1rem" }}>
                            <span style={{ fontWeight: 600, color: "#0C2340" }}>
                              {row.name}
                            </span>
                          </td>
                          <td
                            style={{ padding: "0.875rem 1rem", color: "#64748B" }}
                          >
                            {row.grade ?? "—"}
                          </td>
                          <td style={{ padding: "0.875rem 1rem" }}>
                            <span
                              style={{
                                fontWeight: 600,
                                color:
                                  row.accuracy >= 80
                                    ? "#028090"
                                    : row.accuracy >= 60
                                    ? "#D97706"
                                    : "#DC2626",
                              }}
                            >
                              {row.hasData ? `${row.accuracy}%` : "—"}
                            </span>
                          </td>
                          <td style={{ padding: "0.875rem 1rem" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.2rem 0.625rem",
                                borderRadius: "100px",
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                color: levelColor,
                                background: levelBg,
                              }}
                            >
                              {row.level} Level
                            </span>
                          </td>
                          <td
                            style={{ padding: "0.875rem 1rem", color: "#94A3B8" }}
                          >
                            —
                          </td>
                          <td style={{ padding: "0.875rem 1rem" }}>
                            {row.goalsTotal > 0 ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span style={{ fontSize: "0.8125rem", color: "#64748B", whiteSpace: "nowrap" }}>
                                  {row.goalsCompleted}/{row.goalsTotal}
                                </span>
                                <div
                                  style={{
                                    width: "60px",
                                    height: "6px",
                                    background: "#E2E8F0",
                                    borderRadius: "3px",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: `${progressPct}%`,
                                      background: "#028090",
                                      borderRadius: "3px",
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: "#94A3B8" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "#94A3B8",
                    padding: "0.75rem 1rem",
                    borderTop: "1px solid #F1F5F9",
                  }}
                >
                  Sorted by accuracy (lowest first) · Click a row to view student details
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Standards ────────────────────────────────────────────────── */}
        {tab === "standards" && (
          <div>
            {loading ? (
              <div className="card" style={{ padding: "2rem", textAlign: "center", color: "#64748B" }}>
                Loading standards data…
              </div>
            ) : standardRows.length === 0 ? (
              <div
                className="card"
                style={{ padding: "3rem", textAlign: "center", color: "#64748B" }}
              >
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📋</div>
                <p style={{ fontSize: "1.125rem", color: "#374151", marginBottom: "0.5rem" }}>
                  No standards data yet
                </p>
                <p>
                  Standards will appear here once goals with standard codes have workout responses.
                </p>
              </div>
            ) : (
              <div className="card" style={{ overflow: "hidden", padding: 0 }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.9375rem",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: "#F8FAFC",
                        borderBottom: "2px solid #E2E8F0",
                      }}
                    >
                      {["Standard", "Description", "Below", "At", "Above", "Avg %"].map(
                        (h) => (
                          <th
                            key={h}
                            style={{
                              padding: "0.875rem 1rem",
                              textAlign: "left",
                              fontSize: "0.8125rem",
                              fontWeight: 600,
                              color: "#64748B",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {standardRows.map((row, i) => {
                      const rowBg =
                        row.avgAccuracy >= 80
                          ? "#F0FFF4"
                          : row.avgAccuracy >= 60
                          ? "#FFFBEB"
                          : "#FFF5F5";
                      const avgColor =
                        row.avgAccuracy >= 80
                          ? "#16A34A"
                          : row.avgAccuracy >= 60
                          ? "#D97706"
                          : "#DC2626";

                      return (
                        <tr
                          key={row.code}
                          style={{
                            background: row.total > 0 ? rowBg : i % 2 === 0 ? "white" : "#FAFBFC",
                            borderBottom: "1px solid #F1F5F9",
                          }}
                        >
                          <td style={{ padding: "0.875rem 1rem" }}>
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontWeight: 700,
                                color: "#0C2340",
                                fontSize: "0.875rem",
                              }}
                            >
                              {row.code}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "0.875rem 1rem",
                              color: "#374151",
                              maxWidth: "300px",
                            }}
                          >
                            <span
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {row.description}
                            </span>
                          </td>
                          <td
                            style={{ padding: "0.875rem 1rem", color: "#DC2626", fontWeight: 600 }}
                          >
                            {row.below}
                          </td>
                          <td
                            style={{ padding: "0.875rem 1rem", color: "#028090", fontWeight: 600 }}
                          >
                            {row.at}
                          </td>
                          <td
                            style={{ padding: "0.875rem 1rem", color: "#7C3AED", fontWeight: 600 }}
                          >
                            {row.above}
                          </td>
                          <td style={{ padding: "0.875rem 1rem" }}>
                            {row.total > 0 ? (
                              <span
                                style={{
                                  fontWeight: 700,
                                  fontSize: "1rem",
                                  color: avgColor,
                                }}
                              >
                                {row.avgAccuracy}%
                              </span>
                            ) : (
                              <span style={{ color: "#94A3B8" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "#94A3B8",
                    padding: "0.75rem 1rem",
                    borderTop: "1px solid #F1F5F9",
                  }}
                >
                  Red &lt; 60% · Yellow 60–79% · Green ≥ 80%
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
