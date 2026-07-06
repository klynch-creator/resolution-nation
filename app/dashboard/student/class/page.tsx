"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Star, Users, BookOpen, Trophy } from "lucide-react";

interface LeaderboardRow {
  pod_id: string;
  pod_name: string;
  student_id: string;
  full_name: string;
  avatar_url: string | null;
  stars_all: number;
  stars_week: number;
  lessons_all: number;
  lessons_week: number;
}

type Window = "week" | "all";
type Metric = "stars" | "lessons";

const MEDAL = ["🥇", "🥈", "🥉"];

function firstName(name: string): string {
  return name.split(" ")[0];
}

function Avatar({ row, size }: { row: LeaderboardRow; size: number }) {
  if (row.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={row.avatar_url}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #028090, #02C39A)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: size * 0.42,
        fontFamily: "var(--font-nunito), sans-serif",
        flexShrink: 0,
      }}
    >
      {row.full_name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ClassPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [win, setWin] = useState<Window>("week");
  const [metric, setMetric] = useState<Metric>("stars");

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/dashboard");
          return;
        }
        setMyId(user.id);

        const meRes = await fetch("/api/me");
        const meJson = meRes.ok ? await meRes.json() : { profile: null };
        if (meJson.profile && meJson.profile.role !== "student") {
          window.location.href = "/dashboard";
          return;
        }

        const { data } = await supabase.rpc("get_class_leaderboard");
        setRows((data as LeaderboardRow[]) ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" aria-hidden="true" />
        <div>Loading your class…</div>
      </div>
    );
  }

  const value = (r: LeaderboardRow) =>
    metric === "stars"
      ? win === "week"
        ? r.stars_week
        : r.stars_all
      : win === "week"
      ? r.lessons_week
      : r.lessons_all;

  // Group rows by pod (most students are in one class pod).
  const pods = new Map<string, { name: string; rows: LeaderboardRow[] }>();
  rows.forEach((r) => {
    if (!pods.has(r.pod_id)) pods.set(r.pod_id, { name: r.pod_name, rows: [] });
    pods.get(r.pod_id)!.rows.push(r);
  });

  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    border: "none",
    fontWeight: 700,
    fontSize: "0.875rem",
    cursor: "pointer",
    background: active ? "white" : "transparent",
    color: active ? "#0C2340" : "#64748B",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
  });

  return (
    <div className="min-h-screen" style={{ background: "#F7F9FC" }}>
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
        <Link href="/dashboard/student" className="flex items-center gap-2" style={{ textDecoration: "none" }}>
          <Star size={22} color="#D97706" fill="#D97706" aria-hidden="true" />
          <span
            style={{
              fontFamily: "var(--font-nunito), sans-serif",
              color: "#F7F9FC",
              fontSize: "1.25rem",
              fontWeight: 800,
            }}
          >
            Resolution Nation
          </span>
        </Link>
      </header>

      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <Link
          href="/dashboard/student"
          style={{ color: "#028090", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}
        >
          ← Dashboard
        </Link>
        <h1
          className="flex items-center gap-2"
          style={{
            fontFamily: "var(--font-nunito), sans-serif",
            fontSize: "1.875rem",
            fontWeight: 800,
            color: "#0C2340",
            marginTop: "0.5rem",
          }}
        >
          <Users size={28} color="#028090" aria-hidden="true" />
          My Class
        </h1>
        <p style={{ color: "#64748B", fontSize: "1rem", marginTop: "0.25rem", marginBottom: "1.5rem" }}>
          See how your class is doing — every lesson counts!
        </p>

        {pods.size === 0 ? (
          <div className="card" style={{ padding: "2.5rem", textAlign: "center", color: "#64748B" }}>
            <p style={{ fontSize: "1.0625rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>
              You&apos;re not in a class yet
            </p>
            <p style={{ fontSize: "0.9375rem" }}>
              Ask your teacher for an invite code to join your class!
            </p>
          </div>
        ) : (
          <>
            {/* Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <div style={{ background: "#E2E8F0", borderRadius: "10px", padding: "4px", display: "flex", gap: "4px" }}>
                <button style={tabBtn(win === "week")} onClick={() => setWin("week")}>
                  This Week
                </button>
                <button style={tabBtn(win === "all")} onClick={() => setWin("all")}>
                  All Time
                </button>
              </div>
              <div style={{ background: "#E2E8F0", borderRadius: "10px", padding: "4px", display: "flex", gap: "4px" }}>
                <button style={tabBtn(metric === "stars")} onClick={() => setMetric("stars")}>
                  ⭐ Stars
                </button>
                <button style={tabBtn(metric === "lessons")} onClick={() => setMetric("lessons")}>
                  📚 Lessons
                </button>
              </div>
            </div>

            {[...pods.entries()].map(([podId, pod]) => {
              const ranked = [...pod.rows].sort((a, b) => value(b) - value(a));
              const podium = ranked.slice(0, 3);
              return (
                <section key={podId} style={{ marginBottom: "2rem" }}>
                  <h2
                    className="flex items-center gap-2"
                    style={{
                      fontFamily: "var(--font-nunito), sans-serif",
                      fontSize: "1.125rem",
                      fontWeight: 800,
                      color: "#0C2340",
                      marginBottom: "1rem",
                    }}
                  >
                    <Trophy size={18} color="#D97706" aria-hidden="true" />
                    {pod.name}
                  </h2>

                  {/* Podium */}
                  <div
                    className="flex items-end justify-center gap-3"
                    style={{ marginBottom: "1.25rem" }}
                  >
                    {[1, 0, 2].map((rankIdx) => {
                      const r = podium[rankIdx];
                      if (!r) return null;
                      const isFirst = rankIdx === 0;
                      return (
                        <div
                          key={r.student_id}
                          className="card"
                          style={{
                            textAlign: "center",
                            padding: isFirst ? "1.25rem 1rem" : "0.875rem 0.875rem",
                            width: isFirst ? "150px" : "125px",
                            border:
                              r.student_id === myId ? "2px solid #028090" : "1px solid #E2E8F0",
                            background: isFirst ? "linear-gradient(180deg, #FFFBEB, white)" : "white",
                          }}
                        >
                          <div style={{ fontSize: isFirst ? "1.75rem" : "1.375rem" }} aria-hidden="true">
                            {MEDAL[rankIdx]}
                          </div>
                          <div className="flex justify-center" style={{ margin: "0.375rem 0" }}>
                            <Avatar row={r} size={isFirst ? 52 : 42} />
                          </div>
                          <div
                            style={{
                              fontFamily: "var(--font-nunito), sans-serif",
                              fontWeight: 800,
                              fontSize: "0.9375rem",
                              color: "#0C2340",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {firstName(r.full_name)}
                            {r.student_id === myId ? " (you)" : ""}
                          </div>
                          <div
                            className="flex items-center justify-center gap-1"
                            style={{ color: "#D97706", fontWeight: 800, fontSize: "1rem" }}
                          >
                            {metric === "stars" ? (
                              <Star size={14} color="#D97706" fill="#D97706" aria-hidden="true" />
                            ) : (
                              <BookOpen size={14} color="#D97706" aria-hidden="true" />
                            )}
                            {value(r)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Full list */}
                  <div className="card" style={{ padding: "0.5rem 0" }}>
                    {ranked.map((r, i) => {
                      const mine = r.student_id === myId;
                      return (
                        <div
                          key={r.student_id}
                          className="flex items-center gap-3"
                          style={{
                            padding: "0.625rem 1.25rem",
                            background: mine ? "#F0FDFA" : "transparent",
                            borderLeft: mine ? "3px solid #028090" : "3px solid transparent",
                          }}
                        >
                          <span
                            style={{
                              width: "28px",
                              fontWeight: 800,
                              color: i < 3 ? "#D97706" : "#94A3B8",
                              fontSize: "0.9375rem",
                              flexShrink: 0,
                            }}
                          >
                            {i + 1}
                          </span>
                          <Avatar row={r} size={32} />
                          <span
                            style={{
                              flex: 1,
                              fontWeight: mine ? 700 : 500,
                              color: "#0C2340",
                              fontSize: "0.9375rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {r.full_name}
                            {mine ? " (you)" : ""}
                          </span>
                          <span
                            className="flex items-center gap-1"
                            style={{ color: "#D97706", fontWeight: 700, fontSize: "0.9375rem", flexShrink: 0 }}
                          >
                            {metric === "stars" ? (
                              <Star size={13} color="#D97706" fill="#D97706" aria-hidden="true" />
                            ) : (
                              <BookOpen size={13} color="#D97706" aria-hidden="true" />
                            )}
                            {value(r)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            <p style={{ color: "#94A3B8", fontSize: "0.8125rem", textAlign: "center" }}>
              Weekly counts reset every Monday. Stars here are stars earned — spending stars in the
              Star Store never changes your rank!
            </p>
          </>
        )}
      </main>
    </div>
  );
}
