"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Goal, LearningRoadmap, RoadmapStep, WorkoutType } from "@/types";

function workoutBadge(type: WorkoutType | null) {
  if (!type) return null;
  const map: Record<WorkoutType, { bg: string; color: string }> = {
    lesson: { bg: "#EFF6FF", color: "#2563EB" },
    practice: { bg: "#F0FDF4", color: "#16A34A" },
    quiz: { bg: "#FAF5FF", color: "#7C3AED" },
    "test-prep": { bg: "#FFF7ED", color: "#D97706" },
  };
  const s = map[type];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: "100px",
        padding: "0.125rem 0.625rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        textTransform: "capitalize",
      }}
    >
      {type}
    </span>
  );
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

export default function TeacherRoadmapPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params.studentId as string;
  const goalId = params.goalId as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [student, setStudent] = useState<Profile | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [roadmap, setRoadmap] = useState<LearningRoadmap | null>(null);
  const [steps, setSteps] = useState<RoadmapStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

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

      if (!profileData || profileData.role !== "teacher") {
        router.push("/auth/login");
        return;
      }
      setProfile(profileData);

      const [{ data: studentData }, { data: goalData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", studentId).single(),
        supabase.from("goals").select("*").eq("id", goalId).eq("teacher_id", user.id).single(),
      ]);

      if (studentData) setStudent(studentData);
      if (goalData) setGoal(goalData as Goal);

      await loadRoadmap(supabase);
      setLoading(false);
    }
    load();
  }, [studentId, goalId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRoadmap(supabase: ReturnType<typeof createClient>) {
    const { data: roadmapData } = await supabase
      .from("learning_roadmaps")
      .select("*")
      .eq("goal_id", goalId)
      .maybeSingle();

    if (roadmapData) {
      setRoadmap(roadmapData as LearningRoadmap);

      const { data: stepsData } = await supabase
        .from("roadmap_steps")
        .select("*")
        .eq("roadmap_id", roadmapData.id)
        .order("step_order", { ascending: true });

      setSteps((stepsData as RoadmapStep[]) ?? []);
    } else {
      setRoadmap(null);
      setSteps([]);
    }
  }

  async function handleApprove() {
    if (!roadmap) return;
    setApproving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("learning_roadmaps")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", roadmap.id);

    if (!error) {
      setRoadmap((r) => r ? { ...r, status: "approved" } : r);
    }
    setApproving(false);
  }

  async function handleRegenerate() {
    if (!goal) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/generate-roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId, studentId }),
      });
      if (res.ok) {
        const supabase = createClient();
        await loadRoadmap(supabase);
      } else {
        const { error } = await res.json();
        alert(error ?? "Failed to regenerate. Please try again.");
      }
    } catch {
      alert("Failed to regenerate. Please try again.");
    }
    setRegenerating(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F7F9FC" }}>
        <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading…</div>
      </div>
    );
  }

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
      <nav style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "0 2rem" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", height: "48px", alignItems: "stretch" }}>
          <Link href="/dashboard/teacher" style={navLinkStyle(false)}>Dashboard</Link>
          <Link href="/dashboard/teacher/students" style={navLinkStyle(false)}>My Students</Link>
          <Link href={`/dashboard/teacher/students/${studentId}/goals`} style={navLinkStyle(false)}>
            {student?.full_name ?? "Student"}&apos;s Goals
          </Link>
          <span style={{ ...navLinkStyle(true), cursor: "default" }}>Roadmap</span>
        </div>
      </nav>

      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Goal title */}
        <div style={{ marginBottom: "2rem" }}>
          <p style={{ fontSize: "0.875rem", color: "#64748B", marginBottom: "0.375rem" }}>
            Learning Roadmap for {student?.full_name}
          </p>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "#0C2340",
              lineHeight: 1.3,
              marginBottom: "1rem",
            }}
          >
            {goal?.friendly_text ?? "Goal"}
          </h1>

          <div className="flex items-center gap-3 flex-wrap">
            {roadmap && (
              <span
                style={{
                  background: roadmap.status === "approved" ? "#ECFDF5" : "#FFF7ED",
                  color: roadmap.status === "approved" ? "#059669" : "#D97706",
                  borderRadius: "100px",
                  padding: "0.25rem 0.875rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                }}
              >
                {roadmap.status === "approved" ? "✓ Approved" : "Draft"}
              </span>
            )}
            <span style={{ fontSize: "0.875rem", color: "#64748B" }}>
              {steps.length} steps · {steps.reduce((sum, s) => sum + (s.star_reward ?? 0), 0)} total stars
            </span>
          </div>
        </div>

        {/* Loading / no roadmap state */}
        {regenerating && (
          <div
            className="card"
            style={{ textAlign: "center", padding: "3rem", marginBottom: "1.5rem" }}
          >
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>✨</div>
            <p style={{ fontFamily: "Georgia, serif", fontSize: "1.25rem", fontWeight: 700, color: "#0C2340", marginBottom: "0.5rem" }}>
              Building your roadmap…
            </p>
            <p style={{ color: "#64748B" }}>Claude is generating a personalized learning path. This takes about 15 seconds.</p>
            <div style={{ marginTop: "1.5rem" }}>
              <span style={{ display: "inline-block", width: "32px", height: "32px", border: "3px solid #E2E8F0", borderTopColor: "#028090", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          </div>
        )}

        {!regenerating && !roadmap && (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🗺</div>
            <p style={{ fontFamily: "Georgia, serif", fontSize: "1.25rem", fontWeight: 700, color: "#0C2340", marginBottom: "0.5rem" }}>
              No roadmap yet
            </p>
            <p style={{ color: "#64748B", marginBottom: "1.5rem" }}>Go back to the goals page and click &ldquo;Create Roadmap&rdquo;.</p>
            <Link href={`/dashboard/teacher/students/${studentId}/goals`} className="btn-primary" style={{ textDecoration: "none" }}>
              ← Back to Goals
            </Link>
          </div>
        )}

        {/* Action buttons */}
        {!regenerating && roadmap && (
          <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: "1.5rem" }}>
            {roadmap.status !== "approved" && (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="btn-primary"
                style={{ fontSize: "0.9375rem" }}
              >
                {approving ? "Approving…" : "✓ Approve Roadmap"}
              </button>
            )}
            {roadmap.status === "approved" && (
              <div
                style={{
                  background: "#ECFDF5",
                  color: "#059669",
                  borderRadius: "8px",
                  padding: "0.5rem 1rem",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                }}
              >
                ✓ Approved — student can now see their roadmap
              </div>
            )}
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="btn-secondary"
              style={{ fontSize: "0.9375rem" }}
            >
              🔄 Regenerate
            </button>
          </div>
        )}

        {/* Steps */}
        {!regenerating && steps.length > 0 && (
          <div className="flex flex-col gap-4">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className="card"
                style={{ borderLeft: `4px solid ${index === 0 ? "#02C39A" : "#7C3AED"}`, padding: "1.25rem" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div style={{ flex: 1 }}>
                    <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: "0.5rem" }}>
                      <span
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          background: "#0C2340",
                          color: "white",
                          fontSize: "0.8125rem",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {step.step_order}
                      </span>
                      <span
                        style={{
                          fontFamily: "Georgia, serif",
                          fontSize: "1.0625rem",
                          fontWeight: 700,
                          color: "#0C2340",
                        }}
                      >
                        {step.title}
                      </span>
                      {workoutBadge(step.workout_type)}
                      <span style={{ fontSize: "0.8125rem", color: "#D97706", fontWeight: 600 }}>
                        ⭐ {step.star_reward} stars
                      </span>
                    </div>

                    {step.description && (
                      <p style={{ fontSize: "0.9375rem", color: "#374151", lineHeight: 1.6, marginBottom: "0.5rem" }}>
                        {step.description}
                      </p>
                    )}

                    {step.standard_alignment && (
                      <span style={{ fontSize: "0.8125rem", color: "#64748B" }}>
                        📋 {step.standard_alignment}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                    style={{
                      background: "none",
                      border: "1.5px solid #E2E8F0",
                      borderRadius: "8px",
                      padding: "0.375rem 0.75rem",
                      fontSize: "0.8125rem",
                      color: "#028090",
                      fontWeight: 600,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    {expandedStep === step.id ? "Hide Questions ▲" : "Preview Questions ▼"}
                  </button>
                </div>

                {/* Expandable questions */}
                {expandedStep === step.id && step.activities?.questions && (
                  <div style={{ marginTop: "1rem", borderTop: "1px solid #E2E8F0", paddingTop: "1rem" }}>
                    <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#64748B", marginBottom: "0.75rem" }}>
                      {step.activities.questions.length} questions
                    </p>
                    <div className="flex flex-col gap-4">
                      {step.activities.questions.map((q, qi) => (
                        <div
                          key={qi}
                          style={{
                            background: "#F7F9FC",
                            borderRadius: "8px",
                            padding: "0.875rem 1rem",
                          }}
                        >
                          <div className="flex items-center gap-2" style={{ marginBottom: "0.5rem" }}>
                            <span
                              style={{
                                background:
                                  q.difficulty === "easy"
                                    ? "#ECFDF5"
                                    : q.difficulty === "medium"
                                    ? "#FFF7ED"
                                    : "#FEF2F2",
                                color:
                                  q.difficulty === "easy"
                                    ? "#059669"
                                    : q.difficulty === "medium"
                                    ? "#D97706"
                                    : "#DC2626",
                                borderRadius: "100px",
                                padding: "0.125rem 0.5rem",
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                                textTransform: "uppercase",
                              }}
                            >
                              {q.difficulty}
                            </span>
                            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#64748B" }}>
                              Q{qi + 1}
                            </span>
                          </div>
                          <p style={{ fontSize: "0.9375rem", color: "#0C2340", fontWeight: 500, marginBottom: "0.625rem" }}>
                            {q.question}
                          </p>
                          <div className="flex flex-col gap-1" style={{ marginBottom: "0.5rem" }}>
                            {q.options.map((opt: string, oi: number) => (
                              <div
                                key={oi}
                                style={{
                                  padding: "0.375rem 0.625rem",
                                  borderRadius: "6px",
                                  fontSize: "0.875rem",
                                  background: oi === q.correct_index ? "#ECFDF5" : "white",
                                  color: oi === q.correct_index ? "#059669" : "#374151",
                                  fontWeight: oi === q.correct_index ? 600 : 400,
                                  border: `1px solid ${oi === q.correct_index ? "#A7F3D0" : "#E2E8F0"}`,
                                }}
                              >
                                {String.fromCharCode(65 + oi)}. {opt}
                                {oi === q.correct_index && " ✓"}
                              </div>
                            ))}
                          </div>
                          {q.hint && (
                            <p style={{ fontSize: "0.8125rem", color: "#64748B", fontStyle: "italic" }}>
                              💡 {q.hint}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
