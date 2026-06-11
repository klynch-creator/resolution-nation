"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Goal, GoalStatus, ParentStudentLink, LearningRoadmap, RoadmapStep } from "@/types";

function statusBadge(status: GoalStatus) {
  const map: Record<GoalStatus, { bg: string; color: string; label: string }> = {
    not_started: { bg: "#E2E8F0", color: "#64748B", label: "Not Started" },
    in_progress: { bg: "#7C3AED", color: "white", label: "In Progress" },
    completed: { bg: "#02C39A", color: "white", label: "Completed" },
  };
  const s = map[status];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: "100px",
        padding: "0.125rem 0.625rem",
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      {s.label}
    </span>
  );
}

interface GoalWithProgress {
  goal: Goal;
  stepsTotal: number;
  stepsCompleted: number;
  starsEarned: number;
  hasRoadmap: boolean;
}

export default function ParentGoalsPage() {
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [childName, setChildName] = useState("");
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);

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

      // All goals for this child
      const { data: goalsData } = await supabase
        .from("goals")
        .select("*")
        .eq("student_id", childId)
        .order("created_at", { ascending: false });

      if (!goalsData || goalsData.length === 0) {
        setGoals([]);
        setLoading(false);
        return;
      }

      const goalList = goalsData as Goal[];
      const goalIds = goalList.map((g) => g.id);

      // Roadmaps for these goals
      const { data: roadmaps } = await supabase
        .from("learning_roadmaps")
        .select("id, goal_id")
        .in("goal_id", goalIds)
        .eq("status", "approved");

      const roadmapList = (roadmaps ?? []) as Pick<LearningRoadmap, "id" | "goal_id">[];
      const roadmapIds = roadmapList.map((r) => r.id);
      const goalToRoadmap = new Map(roadmapList.map((r) => [r.goal_id, r.id]));

      // Steps for those roadmaps
      let steps: (Pick<RoadmapStep, "id" | "roadmap_id" | "status"> & {
        star_reward: number;
      })[] = [];
      if (roadmapIds.length > 0) {
        const { data: stepData } = await supabase
          .from("roadmap_steps")
          .select("id, roadmap_id, status, star_reward")
          .in("roadmap_id", roadmapIds);
        steps = (stepData ?? []) as typeof steps;
      }

      // Build goal progress
      const roadmapToGoal = new Map(roadmapList.map((r) => [r.id, r.goal_id]));
      const goalSteps = new Map<
        string,
        { total: number; completed: number; stars: number }
      >();

      for (const step of steps) {
        const goalId = roadmapToGoal.get(step.roadmap_id);
        if (!goalId) continue;
        const existing = goalSteps.get(goalId) ?? { total: 0, completed: 0, stars: 0 };
        existing.total++;
        if (step.status === "completed") {
          existing.completed++;
          existing.stars += step.star_reward ?? 0;
        }
        goalSteps.set(goalId, existing);
      }

      const enriched: GoalWithProgress[] = goalList.map((g) => {
        const prog = goalSteps.get(g.id) ?? { total: 0, completed: 0, stars: 0 };
        return {
          goal: g,
          stepsTotal: prog.total,
          stepsCompleted: prog.completed,
          starsEarned: prog.stars,
          hasRoadmap: goalToRoadmap.has(g.id),
        };
      });

      setGoals(enriched);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          {firstName}&apos;s Goals 🎯
        </h1>
        <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
          {goals.length} goal{goals.length !== 1 ? "s" : ""} assigned
        </p>
      </div>

      {goals.length === 0 ? (
        <div className="card text-center" style={{ padding: "3rem", color: "#64748B" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📭</div>
          <p>No goals have been assigned yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {goals.map((gp) => {
            const pct =
              gp.stepsTotal > 0
                ? Math.round((gp.stepsCompleted / gp.stepsTotal) * 100)
                : 0;
            return (
              <div
                key={gp.goal.id}
                className="card"
                style={{ padding: "1.25rem" }}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        fontWeight: 600,
                        color: "#0C2340",
                        fontSize: "1rem",
                        lineHeight: 1.4,
                        marginBottom: "0.5rem",
                      }}
                    >
                      {gp.goal.friendly_text}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(gp.goal.status)}
                      {gp.goal.subject && (
                        <span
                          style={{
                            background: "#F0FAFA",
                            color: "#028090",
                            borderRadius: "100px",
                            padding: "0.125rem 0.625rem",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          {gp.goal.subject}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: "1.125rem",
                        fontWeight: 700,
                        color: "#D97706",
                      }}
                    >
                      ⭐ {gp.starsEarned}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
                      stars
                    </div>
                  </div>
                </div>

                {gp.hasRoadmap ? (
                  <>
                    <div
                      style={{
                        height: "8px",
                        background: "#E2E8F0",
                        borderRadius: "100px",
                        overflow: "hidden",
                        marginBottom: "0.5rem",
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
                      style={{ fontSize: "0.8125rem", color: "#64748B" }}
                    >
                      {gp.stepsCompleted} of {gp.stepsTotal} steps completed ·{" "}
                      <strong>{pct}%</strong>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "#94A3B8",
                      fontStyle: "italic",
                    }}
                  >
                    No roadmap assigned yet
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
