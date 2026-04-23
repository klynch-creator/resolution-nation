"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Pod } from "@/types";

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

interface PodWithCount extends Pod {
  memberCount: number;
}

export default function TeacherDashboard() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [pods, setPods] = useState<PodWithCount[]>([]);
  const [totalGoals, setTotalGoals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdPod, setCreatedPod] = useState<Pod | null>(null);
  const [copied, setCopied] = useState(false);

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
      await loadPodsFor(supabase, user.id);

      const { count } = await supabase
        .from("goals")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", user.id);
      setTotalGoals(count ?? 0);

      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPodsFor(
    supabase: ReturnType<typeof createClient>,
    teacherId: string
  ) {
    const { data: podsData } = await supabase
      .from("pods")
      .select("*")
      .eq("created_by", teacherId)
      .order("created_at", { ascending: false });

    if (!podsData) return;

    const podsWithCounts = await Promise.all(
      podsData.map(async (pod) => {
        const { count } = await supabase
          .from("pod_members")
          .select("*", { count: "exact", head: true })
          .eq("pod_id", pod.id);
        return { ...pod, memberCount: count ?? 0 };
      })
    );

    setPods(podsWithCounts);
  }

  async function handleCreateClassroom(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("pods")
      .insert({
        name: newClassName,
        type: "class",
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      setCreateError(error.message);
      setCreating(false);
      return;
    }

    await supabase.from("pod_members").insert({
      pod_id: data.id,
      user_id: user.id,
      role: "admin",
    });

    setCreatedPod(data);
    setNewClassName("");
    setCreating(false);
    await loadPodsFor(supabase, user.id);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  function copyInviteCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            maxWidth: "1000px",
            margin: "0 auto",
            display: "flex",
            height: "48px",
            alignItems: "stretch",
          }}
        >
          <Link href="/dashboard/teacher" style={navLinkStyle(true)}>
            Dashboard
          </Link>
          <Link href="/dashboard/teacher/students" style={navLinkStyle(false)}>
            My Students
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Welcome */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.875rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "0.375rem",
              }}
            >
              Welcome back, {profile?.full_name?.split(" ")[0]}! 👋
            </h1>
            <p style={{ color: "#64748B" }}>
              Manage your classrooms and track student progress.
            </p>
          </div>
          <button
            onClick={() => {
              setShowModal(true);
              setCreatedPod(null);
            }}
            className="btn-primary"
            style={{ padding: "0.75rem 1.5rem", fontSize: "1rem" }}
          >
            + Create Classroom
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          {[
            {
              label: "Classrooms",
              value: pods.length,
              icon: "🏫",
              color: "#028090",
            },
            {
              label: "Total Students",
              value: pods.reduce((sum, p) => sum + p.memberCount, 0),
              icon: "🎒",
              color: "#7C3AED",
            },
            {
              label: "Goals Created",
              value: totalGoals,
              icon: "🎯",
              color: "#D97706",
            },
          ].map((stat) => (
            <div key={stat.label} className="card" style={{ padding: "1.25rem" }}>
              <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>
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
              <div style={{ fontSize: "0.875rem", color: "#64748B" }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Classrooms list */}
        <h2
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "#0C2340",
            marginBottom: "1rem",
          }}
        >
          Your Classrooms
        </h2>

        {pods.length === 0 ? (
          <div className="card text-center" style={{ padding: "3rem", color: "#64748B" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏫</div>
            <p style={{ fontSize: "1.125rem", marginBottom: "0.5rem", color: "#374151" }}>
              No classrooms yet
            </p>
            <p style={{ fontSize: "0.9375rem" }}>
              Create your first classroom to get started and share the invite code with your students.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {pods.map((pod) => (
              <div
                key={pod.id}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div>
                  <h3
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: "1.125rem",
                      fontWeight: 700,
                      color: "#0C2340",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {pod.name}
                  </h3>
                  <div className="flex items-center gap-4">
                    <span style={{ fontSize: "0.875rem", color: "#64748B" }}>
                      🎒 {pod.memberCount} student{pod.memberCount !== 1 ? "s" : ""}
                    </span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#64748B",
                        textTransform: "capitalize",
                        background: "#E2E8F0",
                        borderRadius: "100px",
                        padding: "0.125rem 0.625rem",
                      }}
                    >
                      {pod.type}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div
                    style={{
                      background: "#F0FAFA",
                      border: "1.5px solid #028090",
                      borderRadius: "8px",
                      padding: "0.5rem 0.875rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#64748B",
                        display: "block",
                        marginBottom: "0.125rem",
                      }}
                    >
                      Invite code
                    </span>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: "1.125rem",
                        fontWeight: 700,
                        color: "#028090",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {pod.invite_code}
                    </span>
                  </div>
                  <button
                    onClick={() => copyInviteCode(pod.invite_code)}
                    className="btn-secondary"
                    style={{ padding: "0.5rem 0.875rem", fontSize: "0.875rem" }}
                  >
                    {copied ? "✓ Copied!" : "Copy"}
                  </button>
                  <Link
                    href={`/dashboard/teacher/students?podId=${pod.id}`}
                    className="btn-secondary"
                    style={{
                      padding: "0.5rem 0.875rem",
                      fontSize: "0.875rem",
                      textDecoration: "none",
                    }}
                  >
                    🎒 View Students
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Classroom Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12,35,64,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "1rem",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowModal(false);
              setCreatedPod(null);
            }
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "460px" }}>
            {createdPod ? (
              <div className="text-center">
                <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎉</div>
                <h3
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "1.375rem",
                    fontWeight: 700,
                    color: "#0C2340",
                    marginBottom: "0.5rem",
                  }}
                >
                  Classroom Created!
                </h3>
                <p style={{ color: "#64748B", marginBottom: "1.5rem" }}>
                  Share this invite code with your students so they can join{" "}
                  <strong>{createdPod.name}</strong>.
                </p>
                <div
                  style={{
                    background: "#F0FAFA",
                    border: "2px solid #028090",
                    borderRadius: "12px",
                    padding: "1.25rem",
                    marginBottom: "1rem",
                  }}
                >
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "#64748B",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Invite Code
                  </p>
                  <p
                    style={{
                      fontFamily: "monospace",
                      fontSize: "2rem",
                      fontWeight: 700,
                      color: "#028090",
                      letterSpacing: "0.2em",
                    }}
                  >
                    {createdPod.invite_code}
                  </p>
                </div>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "#64748B",
                    marginBottom: "1.5rem",
                  }}
                >
                  Students go to <strong>/join</strong> and enter this code.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => copyInviteCode(createdPod.invite_code)}
                    className="btn-secondary"
                    style={{ flex: 1 }}
                  >
                    {copied ? "✓ Copied!" : "Copy Code"}
                  </button>
                  <button
                    onClick={() => {
                      setShowModal(false);
                      setCreatedPod(null);
                    }}
                    className="btn-primary"
                    style={{ flex: 1 }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: "1.25rem",
                      fontWeight: 700,
                      color: "#0C2340",
                    }}
                  >
                    Create a Classroom
                  </h3>
                  <button
                    onClick={() => setShowModal(false)}
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: "1.5rem",
                      color: "#94A3B8",
                      cursor: "pointer",
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
                {createError && (
                  <div
                    style={{
                      background: "#FEF2F2",
                      border: "1px solid #FCA5A5",
                      borderRadius: "8px",
                      padding: "0.75rem 1rem",
                      color: "#DC2626",
                      fontSize: "0.875rem",
                      marginBottom: "1rem",
                    }}
                  >
                    {createError}
                  </div>
                )}
                <form onSubmit={handleCreateClassroom} className="flex flex-col gap-4">
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        color: "#374151",
                        marginBottom: "0.375rem",
                      }}
                    >
                      Classroom name
                    </label>
                    <input
                      type="text"
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                      placeholder="e.g. Mrs. Smith's 4th Grade"
                      required
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="btn-secondary"
                      style={{ flex: 1 }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creating}
                      className="btn-primary"
                      style={{ flex: 1 }}
                    >
                      {creating ? "Creating…" : "Create Classroom"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
