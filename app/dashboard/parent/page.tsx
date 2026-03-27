"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { Profile, Pod } from "@/types";

interface LinkedChild {
  profile: Profile;
  classroom: Pod | null;
}

export default function ParentDashboard() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [children, setChildren] = useState<LinkedChild[]>([]);
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

      if (!profileData || profileData.role !== "parent") {
        router.push("/auth/login");
        return;
      }

      setProfile(profileData);

      // Get pods where this parent is a viewer
      const { data: memberships } = await supabase
        .from("pod_members")
        .select("pod_id, pods(*, pod_members(user_id, profiles(*)))")
        .eq("user_id", user.id)
        .eq("role", "viewer");

      const linkedChildren: LinkedChild[] = [];

      if (memberships) {
        for (const m of memberships) {
          const pod = m.pods as unknown as Pod & {
            pod_members: { user_id: string; profiles: Profile }[];
          };
          if (pod?.pod_members) {
            for (const pm of pod.pod_members) {
              if (pm.profiles?.role === "student") {
                linkedChildren.push({
                  profile: pm.profiles,
                  classroom: pod,
                });
              }
            }
          }
        }
      }

      setChildren(linkedChildren);
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
        <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading…</div>
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
          <span style={{ color: "#94A3B8", fontSize: "0.875rem" }}>
            {profile?.full_name}
          </span>
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
        <div className="mb-8">
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.875rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.375rem",
            }}
          >
            Welcome, {firstName}! 👪
          </h1>
          <p style={{ color: "#64748B" }}>
            Track your child&apos;s learning journey and celebrate their wins together.
          </p>
        </div>

        {/* Linked children */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "#0C2340",
              }}
            >
              My Children 👧🧒
            </h2>
            <Link
              href="/parent/link"
              className="btn-secondary"
              style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
            >
              + Link a Child
            </Link>
          </div>

          {children.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#64748B" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>👧</div>
              <p
                style={{
                  fontSize: "1.0625rem",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                No children linked yet
              </p>
              <p
                style={{ fontSize: "0.9375rem", lineHeight: 1.6, marginBottom: "1.25rem" }}
              >
                Link your child&apos;s account to see their goals, progress, and star
                balance. You&apos;ll need their email or a parent-link code from their teacher.
              </p>
              <Link href="/parent/link" className="btn-primary">
                Link a Child
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {children.map((child) => (
                <div
                  key={child.profile.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "1rem",
                    background: "#F8FAFC",
                    borderRadius: "10px",
                    border: "1px solid #E2E8F0",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      background: "#028090",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontFamily: "Georgia, serif",
                      fontSize: "1.25rem",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {child.profile.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p style={{ fontWeight: 700, color: "#0C2340", marginBottom: "0.2rem" }}>
                      {child.profile.full_name}
                    </p>
                    {child.profile.grade && (
                      <p style={{ fontSize: "0.875rem", color: "#64748B" }}>
                        Grade {child.profile.grade}
                      </p>
                    )}
                    {child.classroom && (
                      <p style={{ fontSize: "0.875rem", color: "#64748B" }}>
                        🏫 {child.classroom.name}
                      </p>
                    )}
                  </div>
                  <div
                    style={{
                      background: "#FFFBEB",
                      border: "1px solid #FCD34D",
                      borderRadius: "8px",
                      padding: "0.375rem 0.75rem",
                      fontSize: "0.875rem",
                      color: "#92400E",
                      fontWeight: 600,
                    }}
                  >
                    ⭐ 0 stars
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card">
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "1rem",
            }}
          >
            Recent Activity
          </h2>
          <div style={{ textAlign: "center", padding: "2rem 1rem", color: "#64748B" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📋</div>
            <p style={{ fontSize: "0.9375rem" }}>
              Activity will appear here once your child starts working on goals.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
