"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { Profile, Pod } from "@/types";

export default function StudentDashboard() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [classroom, setClassroom] = useState<Pod | null>(null);
  const [starBalance, setStarBalance] = useState(0);
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
          if (
            tx.type === "earned" ||
            tx.type === "bonus" ||
            tx.type === "gift_received"
          ) {
            return sum + tx.amount;
          }
          if (tx.type === "gift_sent" || tx.type === "purchase") {
            return sum - tx.amount;
          }
          return sum;
        }, 0);
        setStarBalance(balance);
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
            { label: "My Goals", value: 0, icon: "🎯", color: "#028090" },
            { label: "Workouts Done", value: 0, icon: "🏋️", color: "#7C3AED" },
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
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "1rem",
            }}
          >
            My Goals 🎯
          </h2>
          <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#64748B" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎯</div>
            <p
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "#374151",
                marginBottom: "0.5rem",
              }}
            >
              No goals yet!
            </p>
            <p style={{ fontSize: "1rem", lineHeight: 1.6 }}>
              Your teacher will add goals for you soon, or you can set your own personal
              goals. Once you have goals, your learning journey begins here!
            </p>
          </div>
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
