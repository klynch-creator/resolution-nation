"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Goal, LearningRoadmap } from "@/types";

function priorityColor(priority: string) {
  if (priority === "critical") return "#DC2626";
  if (priority === "high") return "#D97706";
  return "#2563EB";
}

export default function StudentGoalsPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [roadmaps, setRoadmaps] = useState<Record<string, LearningRoadmap>>({});
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

      const { data: goalsData } = await supabase
        .from("goals")
        .select("*")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false });

      const goalList = (goalsData as Goal[]) ?? [];
      setGoals(goalList);

      if (goalList.length > 0) {
        const { data: roadmapData } = await supabase
          .from("learning_roadmaps")
          .select("*")
          .in("goal_id", goalList.map((g) => g.id))
          .eq("status", "approved");

        if (roadmapData) {
          const map: Record<string, LearningRoadmap> = {};
          (roadmapData as LearningRoadmap[]).forEach((r) => {
            map[r.goal_id] = r;
          });
          setRoadmaps(map);
        }
      }

      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div style={{ maxWidth: "760px", margin: "0 auto", display: "flex", height: "48px", alignItems: "stretch" }}>
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
            My Goals
          </span>
        </div>
      </nav>

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#0C2340",
            marginBottom: "1.5rem",
          }}
        >
          My Goals 🎯
        </h1>

        {goals.length === 0 ? (
          <div
            className="card"
            style={{
              textAlign: "center",
              padding: "3rem",
              border: "2px dashed #E2E8F0",
              background: "transparent",
            }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎯</div>
            <p
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "0.5rem",
              }}
            >
              No goals yet
            </p>
            <p style={{ color: "#64748B", lineHeight: 1.6 }}>
              Your teacher will add goals for you soon. Once goals are added, you&apos;ll see your learning roadmaps here!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {goals.map((goal) => {
              const roadmap = roadmaps[goal.id];
              return (
                <div
                  key={goal.id}
                  className="card"
                  style={{
                    borderLeft: `4px solid ${priorityColor(goal.priority)}`,
                    padding: "1.25rem",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: "1rem",
                      color: "#0C2340",
                      fontWeight: 600,
                      marginBottom: "0.625rem",
                      lineHeight: 1.5,
                    }}
                  >
                    {goal.friendly_text}
                  </p>

                  <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: "0.875rem" }}>
                    {goal.subject && (
                      <span
                        style={{
                          background: "#028090",
                          color: "white",
                          borderRadius: "100px",
                          padding: "0.125rem 0.625rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                        }}
                      >
                        {goal.subject}
                      </span>
                    )}
                    {goal.standard_code && (
                      <span style={{ fontSize: "0.8125rem", color: "#64748B" }}>
                        📋 {goal.standard_code}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      {roadmap ? (
                        <span
                          style={{
                            background: "#ECFDF5",
                            color: "#059669",
                            borderRadius: "100px",
                            padding: "0.25rem 0.75rem",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                          }}
                        >
                          🗺 Roadmap ready!
                        </span>
                      ) : (
                        <span
                          style={{
                            background: "#F3F4F6",
                            color: "#9CA3AF",
                            borderRadius: "100px",
                            padding: "0.25rem 0.75rem",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                          }}
                        >
                          Roadmap coming soon
                        </span>
                      )}
                    </div>

                    {roadmap && (
                      <Link
                        href={`/dashboard/student/goals/${goal.id}/roadmap`}
                        className="btn-primary"
                        style={{ textDecoration: "none", fontSize: "0.875rem", padding: "0.5rem 1rem" }}
                      >
                        View Roadmap →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
