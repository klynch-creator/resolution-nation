"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  Goal,
  ParentStudentLink,
  LearningRoadmap,
  RoadmapStep,
} from "@/types";

// ─── Inline link-request form ─────────────────────────────────────────────────

function LinkRequestForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/link-parent-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childEmail: email.trim().toLowerCase() }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    onSuccess();
  }

  return (
    <div
      className="card"
      style={{ maxWidth: "480px", margin: "0 auto", textAlign: "center" }}
    >
      <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>👧🧒</div>
      <h2
        style={{
          fontFamily: "Georgia, serif",
          fontSize: "1.375rem",
          fontWeight: 700,
          color: "#0C2340",
          marginBottom: "0.5rem",
        }}
      >
        Link Your Child&apos;s Account
      </h2>
      <p
        style={{
          color: "#64748B",
          fontSize: "0.9375rem",
          lineHeight: 1.6,
          marginBottom: "1.5rem",
        }}
      >
        Enter your child&apos;s email address. Their teacher will receive a
        request and approve the connection.
      </p>

      {error && (
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            color: "#DC2626",
            fontSize: "0.875rem",
            marginBottom: "1rem",
            textAlign: "left",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="child@school.com"
          required
          autoFocus
          style={{ textAlign: "left" }}
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-primary"
          style={{ height: "2.75rem" }}
        >
          {loading ? "Sending request…" : "Send Link Request"}
        </button>
      </form>

      <p
        style={{
          marginTop: "1rem",
          fontSize: "0.8125rem",
          color: "#94A3B8",
          lineHeight: 1.5,
        }}
      >
        Your child must already have a Resolution Nation account. The request
        will be reviewed by their teacher for COPPA compliance.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface WorkoutActivity {
  date: string;
  goalName: string;
  correct: number;
  total: number;
  starsEarned: number;
}

interface GoalProgress {
  goal: Goal;
  stepsTotal: number;
  stepsCompleted: number;
  starsEarned: number;
}

export default function ParentDashboard() {
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState<ParentStudentLink | null>(null);
  const [child, setChild] = useState<Profile | null>(null);
  const [starBalance, setStarBalance] = useState(0);
  const [goalProgress, setGoalProgress] = useState<GoalProgress[]>([]);
  const [recentActivity, setRecentActivity] = useState<WorkoutActivity[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get most recent parent_student_link for this parent
      const { data: links } = await supabase
        .from("parent_student_links")
        .select("*")
        .eq("parent_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const currentLink = links?.[0] ?? null;
      setLink(currentLink as ParentStudentLink | null);

      if (!currentLink || currentLink.status !== "approved") {
        setLoading(false);
        return;
      }

      const childId = currentLink.student_id;

      // Load child profile
      const { data: childProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", childId)
        .single();
      setChild(childProfile);

      // Load star balance
      const { data: transactions } = await supabase
        .from("star_transactions")
        .select("amount")
        .eq("user_id", childId);
      const balance = (transactions ?? []).reduce(
        (sum: number, t: { amount: number }) => sum + t.amount,
        0
      );
      setStarBalance(balance);

      // Load goals with roadmap progress
      const { data: goals } = await supabase
        .from("goals")
        .select("*")
        .eq("student_id", childId)
        .order("created_at", { ascending: false });

      if (goals && goals.length > 0) {
        const goalIds = (goals as Goal[]).map((g) => g.id);

        const { data: roadmaps } = await supabase
          .from("learning_roadmaps")
          .select("id, goal_id")
          .in("goal_id", goalIds)
          .eq("status", "approved");

        if (roadmaps && roadmaps.length > 0) {
          const roadmapIds = (roadmaps as Pick<LearningRoadmap, "id" | "goal_id">[]).map(
            (r) => r.id
          );
          const { data: steps } = await supabase
            .from("roadmap_steps")
            .select("id, roadmap_id, status, star_reward")
            .in("roadmap_id", roadmapIds);

          const roadmapToGoal = new Map(
            (roadmaps as Pick<LearningRoadmap, "id" | "goal_id">[]).map((r) => [
              r.id,
              r.goal_id,
            ])
          );

          const goalSteps = new Map<
            string,
            { total: number; completed: number; stars: number }
          >();
          for (const step of steps ?? []) {
            const s = step as Pick<RoadmapStep, "id" | "roadmap_id" | "status"> & {
              star_reward: number;
            };
            const goalId = roadmapToGoal.get(s.roadmap_id);
            if (!goalId) continue;
            const existing = goalSteps.get(goalId) ?? {
              total: 0,
              completed: 0,
              stars: 0,
            };
            existing.total++;
            if (s.status === "completed") {
              existing.completed++;
              existing.stars += s.star_reward ?? 0;
            }
            goalSteps.set(goalId, existing);
          }

          setGoalProgress(
            (goals as Goal[]).map((g) => {
              const prog = goalSteps.get(g.id) ?? {
                total: 0,
                completed: 0,
                stars: 0,
              };
              return {
                goal: g,
                stepsTotal: prog.total,
                stepsCompleted: prog.completed,
                starsEarned: prog.stars,
              };
            })
          );
        } else {
          setGoalProgress(
            (goals as Goal[]).map((g) => ({
              goal: g,
              stepsTotal: 0,
              stepsCompleted: 0,
              starsEarned: 0,
            }))
          );
        }
      }

      // Recent workout activity (last 5 step sessions)
      const { data: responses } = await supabase
        .from("workout_responses")
        .select("step_id, is_correct, created_at")
        .eq("user_id", childId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (responses && responses.length > 0) {
        const stepGroups = new Map<
          string,
          { correct: number; total: number; date: string }
        >();
        for (const r of responses as {
          step_id: string;
          is_correct: boolean;
          created_at: string;
        }[]) {
          if (!stepGroups.has(r.step_id)) {
            stepGroups.set(r.step_id, { correct: 0, total: 0, date: r.created_at });
          }
          const g = stepGroups.get(r.step_id)!;
          g.total++;
          if (r.is_correct) g.correct++;
        }

        const recentStepIds = [...stepGroups.keys()].slice(0, 5);

        if (recentStepIds.length > 0) {
          const { data: stepData } = await supabase
            .from("roadmap_steps")
            .select("id, star_reward, learning_roadmaps(goal_id, goals(friendly_text))")
            .in("id", recentStepIds);

          type StepWithJoins = {
            id: string;
            star_reward: number;
            learning_roadmaps: {
              goal_id: string;
              goals: { friendly_text: string } | null;
            } | null;
          };

          const activity: WorkoutActivity[] = recentStepIds.map((sid) => {
            const group = stepGroups.get(sid)!;
            const step = (stepData ?? []).find(
              (s: { id: string }) => s.id === sid
            ) as StepWithJoins | undefined;
            const goalName =
              step?.learning_roadmaps?.goals?.friendly_text ?? "Unknown goal";
            return {
              date: group.date,
              goalName,
              correct: group.correct,
              total: group.total,
              starsEarned: step?.star_reward ?? 0,
            };
          });

          setRecentActivity(activity);
        }
      }

      setLoading(false);
    }

    load();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  if (loading) {
    return (
      <main
        className="flex items-center justify-center"
        style={{ minHeight: "calc(100vh - 112px)" }}
      >
        <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading…</div>
      </main>
    );
  }

  // ── No link yet ──────────────────────────────────────────────────────────────
  if (!link) {
    return (
      <main
        style={{ maxWidth: "900px", margin: "0 auto", padding: "3rem 1.25rem" }}
      >
        <div className="mb-8">
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.375rem",
            }}
          >
            Welcome to Your Parent Dashboard 👪
          </h1>
          <p style={{ color: "#64748B" }}>
            Connect to your child&apos;s account to start tracking their progress.
          </p>
        </div>
        <LinkRequestForm onSuccess={() => setRefreshKey((k) => k + 1)} />
      </main>
    );
  }

  // ── Pending ──────────────────────────────────────────────────────────────────
  if (link.status === "pending") {
    return (
      <main
        style={{ maxWidth: "900px", margin: "0 auto", padding: "3rem 1.25rem" }}
      >
        <div
          className="card"
          style={{
            maxWidth: "500px",
            margin: "0 auto",
            textAlign: "center",
            padding: "3rem",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⏳</div>
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.375rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.5rem",
            }}
          >
            Waiting for Teacher Approval
          </h2>
          <p style={{ color: "#64748B", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Your link request has been sent to your child&apos;s teacher. Once
            they approve it, you&apos;ll be able to see your child&apos;s progress
            here.
          </p>
          <div
            style={{
              background: "#F0FAFA",
              border: "1px solid #028090",
              borderRadius: "8px",
              padding: "0.75rem 1rem",
              fontSize: "0.875rem",
              color: "#028090",
            }}
          >
            Request submitted on {formatDate(link.created_at)}
          </div>
        </div>
      </main>
    );
  }

  // ── Denied ───────────────────────────────────────────────────────────────────
  if (link.status === "denied") {
    return (
      <main
        style={{ maxWidth: "900px", margin: "0 auto", padding: "3rem 1.25rem" }}
      >
        <div
          className="card"
          style={{
            maxWidth: "500px",
            margin: "0 auto",
            textAlign: "center",
            padding: "3rem",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>❌</div>
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.375rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.5rem",
            }}
          >
            Link Request Denied
          </h2>
          <p style={{ color: "#64748B", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Your request to link to your child&apos;s account was not approved.
            Please contact your child&apos;s teacher directly.
          </p>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="btn-secondary"
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  // ── Approved — full dashboard ─────────────────────────────────────────────────
  const firstName = child?.full_name?.split(" ")[0] ?? "your child";

  return (
    <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.25rem" }}>
      {/* Welcome */}
      <div className="mb-6">
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#0C2340",
            marginBottom: "0.375rem",
          }}
        >
          Here&apos;s how {firstName} is doing! 🎉
        </h1>
        <p style={{ color: "#64748B" }}>
          {child?.full_name}
          {child?.grade ? ` · Grade ${child.grade}` : ""}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {[
          {
            icon: "⭐",
            value: starBalance,
            label: "Stars Earned",
            color: "#D97706",
          },
          {
            icon: "🎯",
            value: goalProgress.length,
            label: "Active Goals",
            color: "#028090",
          },
          {
            icon: "✅",
            value: goalProgress.filter((g) => g.goal.status === "completed").length,
            label: "Goals Completed",
            color: "#02C39A",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="card"
            style={{ padding: "1.25rem", textAlign: "center" }}
          >
            <div style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>
              {stat.icon}
            </div>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                color: stat.color,
                lineHeight: 1,
                marginBottom: "0.25rem",
              }}
            >
              {stat.value}
            </div>
            <div style={{ fontSize: "0.8125rem", color: "#64748B" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Goal progress cards */}
      {goalProgress.length > 0 && (
        <div className="card mb-6">
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.125rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "1rem",
            }}
          >
            Goal Progress
          </h2>
          <div className="flex flex-col gap-3">
            {goalProgress.slice(0, 4).map((gp) => {
              const pct =
                gp.stepsTotal > 0
                  ? Math.round((gp.stepsCompleted / gp.stepsTotal) * 100)
                  : 0;
              return (
                <div
                  key={gp.goal.id}
                  style={{
                    background: "#F8FAFC",
                    borderRadius: "10px",
                    padding: "0.875rem 1rem",
                    border: "1px solid #E2E8F0",
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#0C2340",
                        fontSize: "0.9375rem",
                        flex: 1,
                        marginRight: "1rem",
                      }}
                    >
                      {gp.goal.friendly_text}
                    </span>
                    <span
                      style={{
                        fontSize: "0.8125rem",
                        color: "#D97706",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      ⭐ {gp.starsEarned}
                    </span>
                  </div>
                  <div
                    style={{
                      height: "6px",
                      background: "#E2E8F0",
                      borderRadius: "100px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: pct === 100 ? "#02C39A" : "#028090",
                        borderRadius: "100px",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: "0.375rem",
                      fontSize: "0.8125rem",
                      color: "#64748B",
                    }}
                  >
                    {gp.stepsCompleted}/{gp.stepsTotal} steps ·{" "}
                    <span style={{ fontWeight: 600 }}>{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="card">
        <h2
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "1.125rem",
            fontWeight: 700,
            color: "#0C2340",
            marginBottom: "1rem",
          }}
        >
          Recent Workout Activity
        </h2>
        {recentActivity.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "#64748B" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📋</div>
            <p style={{ fontSize: "0.9375rem" }}>
              No workouts yet. {firstName} will appear here once they start
              working on their goals.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recentActivity.map((a, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "0.75rem",
                  background: i % 2 === 0 ? "#F8FAFC" : "transparent",
                  borderRadius: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "0.8125rem",
                    color: "#94A3B8",
                    flexShrink: 0,
                    width: "52px",
                  }}
                >
                  {formatDate(a.date)}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: "0.9375rem",
                    color: "#374151",
                    fontWeight: 500,
                  }}
                >
                  {a.goalName}
                </span>
                <span
                  style={{
                    fontSize: "0.875rem",
                    color: "#028090",
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {a.correct}/{a.total}
                </span>
                <span
                  style={{
                    fontSize: "0.875rem",
                    color: "#D97706",
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  ⭐ {a.starsEarned}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
