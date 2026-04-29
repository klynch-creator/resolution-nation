"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Goal, LearningRoadmap, RoadmapStep } from "@/types";

export default function StudentRoadmapPage() {
  const router = useRouter();
  const params = useParams();
  const goalId = params.goalId as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [roadmap, setRoadmap] = useState<LearningRoadmap | null>(null);
  const [steps, setSteps] = useState<RoadmapStep[]>([]);
  const [loading, setLoading] = useState(true);

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

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!profileData || profileData.role !== "student") {
        router.push("/auth/login");
        return;
      }
      setProfile(profileData);

      const { data: goalData } = await supabase
        .from("goals")
        .select("*")
        .eq("id", goalId)
        .eq("student_id", user.id)
        .single();

      if (goalData) setGoal(goalData as Goal);

      const { data: roadmapData } = await supabase
        .from("learning_roadmaps")
        .select("*")
        .eq("goal_id", goalId)
        .eq("student_id", user.id)
        .eq("status", "approved")
        .maybeSingle();

      if (roadmapData) {
        setRoadmap(roadmapData as LearningRoadmap);

        const { data: stepsData } = await supabase
          .from("roadmap_steps")
          .select("*")
          .eq("roadmap_id", roadmapData.id)
          .order("step_order", { ascending: true });

        setSteps((stepsData as RoadmapStep[]) ?? []);
      }

      setLoading(false);
    }
    load();
  }, [goalId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F7F9FC" }}>
        <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading your roadmap…</div>
      </div>
    );
  }

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const totalStars = steps.reduce((sum, s) => sum + (s.star_reward ?? 0), 0);
  const progressPct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="min-h-screen" style={{ background: "#F7F9FC" }}>
      {/* Header */}
      <header
        style={{
          background: "#0C2340",
          padding: "0 1.5rem",
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
          <span style={{ color: "#94A3B8", fontSize: "0.875rem" }}>{profile?.full_name}</span>
          <button
            onClick={async () => {
              const supabase = createClient();
              await supabase.auth.signOut();
              router.push("/");
            }}
            style={{ color: "#94A3B8", fontSize: "0.875rem", background: "none", border: "none", cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Nav */}
      <nav style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "0 1.5rem" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", height: "48px", alignItems: "stretch" }}>
          <Link
            href="/dashboard/student"
            style={{
              color: "#64748B",
              fontWeight: 400,
              fontSize: "0.9375rem",
              padding: "0 1rem",
              height: "100%",
              display: "flex",
              alignItems: "center",
              borderBottom: "2px solid transparent",
              textDecoration: "none",
            }}
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/student/goals"
            style={{
              color: "#64748B",
              fontWeight: 400,
              fontSize: "0.9375rem",
              padding: "0 1rem",
              height: "100%",
              display: "flex",
              alignItems: "center",
              borderBottom: "2px solid transparent",
              textDecoration: "none",
            }}
          >
            My Goals
          </Link>
          <span
            style={{
              color: "#028090",
              fontWeight: 600,
              fontSize: "0.9375rem",
              padding: "0 1rem",
              height: "100%",
              display: "flex",
              alignItems: "center",
              borderBottom: "2px solid #028090",
            }}
          >
            Roadmap
          </span>
        </div>
      </nav>

      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        {/* Goal */}
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "1.625rem",
            fontWeight: 700,
            color: "#0C2340",
            lineHeight: 1.35,
            marginBottom: "1.5rem",
          }}
        >
          {goal?.friendly_text ?? "Your Learning Roadmap"}
        </h1>

        {/* No approved roadmap */}
        {!roadmap && (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
            <p style={{ fontFamily: "Georgia, serif", fontSize: "1.125rem", fontWeight: 700, color: "#0C2340", marginBottom: "0.5rem" }}>
              Roadmap not ready yet
            </p>
            <p style={{ color: "#64748B", marginBottom: "1.5rem" }}>
              Your teacher is still building your learning roadmap. Check back soon!
            </p>
            <Link href="/dashboard/student/goals" className="btn-secondary" style={{ textDecoration: "none" }}>
              ← Back to Goals
            </Link>
          </div>
        )}

        {/* Progress bar */}
        {roadmap && steps.length > 0 && (
          <>
            <div className="card" style={{ marginBottom: "1.5rem", padding: "1.25rem" }}>
              <div className="flex items-center justify-between" style={{ marginBottom: "0.625rem" }}>
                <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#374151" }}>
                  Your Progress
                </span>
                <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#028090" }}>
                  {completedCount}/{steps.length} steps · ⭐ {totalStars} stars to earn
                </span>
              </div>
              <div
                style={{
                  height: "12px",
                  background: "#E2E8F0",
                  borderRadius: "100px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progressPct}%`,
                    background: "linear-gradient(90deg, #028090, #02C39A)",
                    borderRadius: "100px",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <p style={{ fontSize: "0.8125rem", color: "#64748B", marginTop: "0.375rem" }}>
                {progressPct}% complete
              </p>
            </div>

            {/* Steps path */}
            <div className="flex flex-col gap-4">
              {steps.map((step, index) => {
                const isCompleted = step.status === "completed";
                const isActive = step.status === "active";
                const isLocked = step.status === "locked";

                return (
                  <div key={step.id} style={{ position: "relative" }}>
                    {/* Connector line */}
                    {index < steps.length - 1 && (
                      <div
                        style={{
                          position: "absolute",
                          left: "27px",
                          top: "100%",
                          width: "2px",
                          height: "1rem",
                          background: isCompleted ? "#02C39A" : "#E2E8F0",
                          zIndex: 0,
                        }}
                      />
                    )}

                    <div
                      className="card"
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "1rem",
                        padding: "1.25rem",
                        borderLeft: `4px solid ${
                          isCompleted ? "#02C39A" : isActive ? "#028090" : "#E2E8F0"
                        }`,
                        opacity: isLocked ? 0.65 : 1,
                        outline: isActive ? "2px solid #028090" : "none",
                        outlineOffset: "2px",
                      }}
                    >
                      {/* Step icon */}
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "50%",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: isCompleted ? "1.25rem" : isLocked ? "1.125rem" : "1rem",
                          fontWeight: 700,
                          background: isCompleted
                            ? "#02C39A"
                            : isActive
                            ? "linear-gradient(135deg, #028090, #02C39A)"
                            : "#E2E8F0",
                          color: isCompleted || isActive ? "white" : "#94A3B8",
                          animation: isActive ? "pulse 2s ease-in-out infinite" : "none",
                        }}
                      >
                        {isCompleted ? "✓" : isLocked ? "🔒" : step.step_order}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1 }}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <p
                              style={{
                                fontFamily: "Georgia, serif",
                                fontSize: "1rem",
                                fontWeight: 700,
                                color: isLocked ? "#94A3B8" : "#0C2340",
                                marginBottom: "0.25rem",
                              }}
                            >
                              {step.title}
                            </p>
                            {step.description && (
                              <p
                                style={{
                                  fontSize: "0.875rem",
                                  color: isLocked ? "#9CA3AF" : "#374151",
                                  lineHeight: 1.5,
                                  marginBottom: "0.5rem",
                                }}
                              >
                                {step.description}
                              </p>
                            )}
                            <span
                              style={{
                                fontSize: "0.8125rem",
                                color: "#D97706",
                                fontWeight: 600,
                              }}
                            >
                              ⭐ {step.star_reward} stars
                            </span>
                          </div>

                          {isActive && (
                            <Link
                              href={`/dashboard/student/goals/${goalId}/roadmap/${step.id}/workout`}
                              style={{
                                background: "linear-gradient(135deg, #028090, #02C39A)",
                                color: "white",
                                border: "none",
                                borderRadius: "8px",
                                padding: "0.625rem 1.25rem",
                                fontSize: "0.9375rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                flexShrink: 0,
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                            >
                              Start Workout →
                            </Link>
                          )}

                          {isCompleted && (
                            <span
                              style={{
                                background: "#ECFDF5",
                                color: "#059669",
                                borderRadius: "100px",
                                padding: "0.25rem 0.875rem",
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                flexShrink: 0,
                              }}
                            >
                              ✓ Done
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(2, 128, 144, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(2, 128, 144, 0); }
        }
      `}</style>
    </div>
  );
}
