"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { Profile, Pod, Goal, LearningRoadmap } from "@/types";

export default function StudentDashboard() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [classroom, setClassroom] = useState<Pod | null>(null);
  const [starBalance, setStarBalance] = useState(0);
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

      // Get their classroom
      const { data: memberData } = await supabase
        .from("pod_members")
        .select("pod_id, pods(*)")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (memberData?.pods) {
        setClassroom(memberData.pods as unknown as Pod);
      }

      // Get star balance
      const { data: stars } = await supabase
        .from("star_transactions")
        .select("amount, type")
        .eq("user_id", user.id);

      if (stars) {
        const balance = stars.reduce((sum, tx) => {
          if (tx.type === "earned" || tx.type === "bonus" || tx.type === "gift_received") {
            return sum + tx.amount;
          }
          if (tx.type === "gift_sent" || tx.type === "purchase") {
            return sum - tx.amount;
          }
          return sum;
        }, 0);
        setStarBalance(balance);
      }

      // Get goals
      const { data: goalsData } = await supabase
        .from("goals")
        .select("*")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false });

      const goalList = (goalsData as Goal[]) ?? [];
      setGoals(goalList);

      // Get approved roadmaps
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

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#F7F9FC" }}
      >
        <div style={{ color: "#028090", fontSize: "1.25rem" }}>
          Loading your dashboard…
        </div>
      </div>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

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
          <div
            style={{
              background: "#D97706",
              color: "white",
              borderRadius: "100px",
              padding: "0.25rem 0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              fontWeight: 700,
              fontSize: "0.9375rem",
            }}
          >
            <span>⭐</span>
            <span>{starBalance}</span>
          </div>
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
      <nav style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "0 1.5rem" }}>
        <div
          style={{
            maxWidth: "760px",
            margin: "0 auto",
            display: "flex",
            height: "48px",
            alignItems: "stretch",
            gap: "0.25rem",
          }}
        >
          {[
            { href: "/dashboard/student", label: "Dashboard", active: true },
            { href: "/dashboard/student/goals", label: "My Goals", active: false },
            { href: "/dashboard/student/store", label: "⭐ Store", active: false },
            { href: "/dashboard/student/collection", label: "🃏 Collection", active: false },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                color: link.active ? "#028090" : "#64748B",
                fontWeight: link.active ? 600 : 400,
                fontSize: "0.9375rem",
                padding: "0 1rem",
                height: "100%",
                display: "flex",
                alignItems: "center",
                borderBottom: link.active ? "2px solid #028090" : "2px solid transparent",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        {/* Welcome banner */}
        <div
          style={{
            background: "linear-gradient(135deg, #028090 0%, #02C39A 100%)",
            borderRadius: "16px",
            padding: "2rem",
            marginBottom: "1.5rem",
            color: "white",
          }}
        >
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "2rem",
              fontWeight: 700,
              marginBottom: "0.5rem",
            }}
          >
            Hey {firstName}! 👋
          </h1>
          <p style={{ fontSize: "1.125rem", opacity: 0.9 }}>
            Ready to crush your goals today?
          </p>
          {classroom && (
            <div
              style={{
                marginTop: "1rem",
                background: "rgba(255,255,255,0.15)",
                borderRadius: "8px",
                padding: "0.625rem 1rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.9375rem",
              }}
            >
              <span>🏫</span>
              <span>{classroom.name}</span>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "My Stars", value: starBalance, icon: "⭐", color: "#D97706" },
            { label: "My Goals", value: goals.length, icon: "🎯", color: "#028090" },
            { label: "Roadmaps", value: Object.keys(roadmaps).length, icon: "🗺", color: "#7C3AED" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="card text-center"
              style={{ padding: "1.25rem 0.75rem" }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "0.375rem" }}>
                {stat.icon}
              </div>
              <div
                style={{
                  fontSize: "1.875rem",
                  fontWeight: 700,
                  color: stat.color,
                  lineHeight: 1,
                  marginBottom: "0.25rem",
                }}
              >
                {stat.value}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "#64748B", fontWeight: 500 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* My Goals */}
        <div className="card mb-6">
          <div className="flex items-center justify-between" style={{ marginBottom: "1rem" }}>
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "#0C2340",
              }}
            >
              My Goals 🎯
            </h2>
            {goals.length > 0 && (
              <Link
                href="/dashboard/student/goals"
                style={{ fontSize: "0.875rem", color: "#028090", fontWeight: 600, textDecoration: "none" }}
              >
                See all →
              </Link>
            )}
          </div>

          {goals.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#64748B" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎯</div>
              <p style={{ fontSize: "1.125rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>
                No goals yet!
              </p>
              <p style={{ fontSize: "1rem", lineHeight: 1.6 }}>
                Your teacher will add goals for you soon. Once you have goals, your learning journey begins here!
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {goals.slice(0, 3).map((goal) => {
                const roadmap = roadmaps[goal.id];
                return (
                  <div
                    key={goal.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "1rem",
                      padding: "0.875rem 1rem",
                      background: "#F7F9FC",
                      borderRadius: "10px",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    <p style={{ fontSize: "0.9375rem", color: "#0C2340", fontWeight: 500, lineHeight: 1.4, flex: 1 }}>
                      🎯 {goal.friendly_text}
                    </p>
                    {roadmap ? (
                      <Link
                        href={`/dashboard/student/goals/${goal.id}/roadmap`}
                        style={{
                          background: "#028090",
                          color: "white",
                          borderRadius: "8px",
                          padding: "0.375rem 0.875rem",
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          textDecoration: "none",
                          flexShrink: 0,
                        }}
                      >
                        View Roadmap
                      </Link>
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "#9CA3AF", flexShrink: 0 }}>
                        Coming soon
                      </span>
                    )}
                  </div>
                );
              })}
              {goals.length > 3 && (
                <Link
                  href="/dashboard/student/goals"
                  style={{ fontSize: "0.875rem", color: "#028090", fontWeight: 600, textDecoration: "none", textAlign: "center", padding: "0.5rem" }}
                >
                  +{goals.length - 3} more goals →
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Store quick actions */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Link
            href="/dashboard/student/store"
            style={{ textDecoration: "none" }}
          >
            <div
              className="card"
              style={{
                background: "linear-gradient(135deg, #D97706 0%, #F59E0B 100%)",
                padding: "1.25rem",
                cursor: "pointer",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "0.375rem" }}>⭐</div>
              <div
                style={{
                  fontFamily: "Georgia, serif",
                  fontWeight: 700,
                  color: "white",
                  fontSize: "1rem",
                  marginBottom: "0.25rem",
                }}
              >
                Star Store
              </div>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.8125rem" }}>
                {starBalance} stars to spend
              </div>
            </div>
          </Link>
          <Link
            href="/dashboard/student/collection"
            style={{ textDecoration: "none" }}
          >
            <div
              className="card"
              style={{
                background: "linear-gradient(135deg, #7C3AED 0%, #9F67FA 100%)",
                padding: "1.25rem",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "0.375rem" }}>🃏</div>
              <div
                style={{
                  fontFamily: "Georgia, serif",
                  fontWeight: 700,
                  color: "white",
                  fontSize: "1rem",
                  marginBottom: "0.25rem",
                }}
              >
                My Collection
              </div>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.8125rem" }}>
                View your cards
              </div>
            </div>
          </Link>
        </div>

        {/* Join classroom prompt */}
        {!classroom && (
          <div
            className="card"
            style={{
              border: "2px dashed #E2E8F0",
              background: "transparent",
              textAlign: "center",
              padding: "2rem",
            }}
          >
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🏫</div>
            <h3
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "0.5rem",
              }}
            >
              Join a Classroom
            </h3>
            <p style={{ color: "#64748B", fontSize: "0.9375rem", marginBottom: "1.25rem" }}>
              Ask your teacher for the classroom invite code to connect with your class.
            </p>
            <Link href="/join" className="btn-primary">
              Enter Invite Code
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
