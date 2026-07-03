"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Star, Target, School, Layers, BookOpen, Sparkles, Mic, PenLine, Flame, Settings, Users, UserPlus } from "lucide-react";
import type { Profile, Pod, Goal, LearningRoadmap } from "@/types";
import Avatar from "@/app/dashboard/_components/Avatar";
import { getTheme } from "@/lib/themes";
import { skillLevel, subjectColor } from "@/lib/analytics/skills";

interface SkillGrowth {
  subject: string;
  level: "Learning" | "Practicing" | "Strong";
  color: string;
  fill: number; // 0-100, for the growth bar width only (number is never shown)
}

export default function StudentDashboard() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [classroom, setClassroom] = useState<Pod | null>(null);
  const [starBalance, setStarBalance] = useState(0);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [roadmaps, setRoadmaps] = useState<Record<string, LearningRoadmap>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lessonsDone, setLessonsDone] = useState(0);
  const [dayStreak, setDayStreak] = useState(0);
  const [skills, setSkills] = useState<SkillGrowth[]>([]);
  const [theme, setTheme] = useState("ocean");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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

        // Use /api/me (admin client) to bypass the RLS recursion bug on profiles.
        const meRes = await fetch("/api/me");
        if (!meRes.ok) {
          setLoadError("We couldn't load your profile. Please try again.");
        }
        const meJson = meRes.ok ? await meRes.json() : { profile: null };
        const profileData = meJson.profile;

        if (profileData && profileData.role !== "student") {
          window.location.href = "/dashboard";
          return;
        }

        setProfile(profileData);
        setTheme(profileData?.theme ?? "ocean");
        setAvatarUrl(profileData?.avatar_url ?? null);

        // Get their classroom
        const { data: memberData, error: memberError } = await supabase
          .from("pod_members")
          .select("pod_id, pods(*)")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (memberError) {
          setLoadError("Some of your data couldn't be loaded. Pull to refresh or try again shortly.");
        }

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

        // ── Progress: lessons done, day streak, and friendly skill growth ────
        const { data: lessonRows } = await supabase
          .from("lessons")
          .select("id, subject, status, completed_at")
          .eq("student_id", user.id);
        const lessons = lessonRows ?? [];
        const subjectById = new Map<string, string | null>(
          lessons.map((l) => [l.id as string, (l.subject as string | null) ?? null])
        );
        const completed = lessons.filter(
          (l) => l.status === "completed" || l.completed_at != null
        );
        setLessonsDone(completed.length);

        const { data: respRows } = await supabase
          .from("workout_responses")
          .select("is_correct, lesson_id, created_at")
          .eq("user_id", user.id);
        const responses = respRows ?? [];

        // Per-subject accuracy → encouraging growth level (no numbers shown).
        const bySubject: Record<string, { correct: number; total: number }> = {};
        responses.forEach((r) => {
          const subj = r.lesson_id ? subjectById.get(r.lesson_id) ?? null : null;
          if (!subj) return;
          if (!bySubject[subj]) bySubject[subj] = { correct: 0, total: 0 };
          bySubject[subj].total++;
          if (r.is_correct) bySubject[subj].correct++;
        });
        const growth: SkillGrowth[] = Object.entries(bySubject)
          .map(([subject, v]) => {
            const pct = v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0;
            const { level, color } = skillLevel(pct, v.total);
            return { subject, level, color, fill: Math.max(12, pct) };
          })
          .sort((a, b) => b.fill - a.fill);
        setSkills(growth);

        // Day streak: consecutive days (ending today or yesterday) with activity.
        const activeDays = new Set<string>();
        const keyOf = (d: string) => {
          const dt = new Date(d);
          return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
        };
        responses.forEach((r) => activeDays.add(keyOf(r.created_at as string)));
        completed.forEach((l) => {
          if (l.completed_at) activeDays.add(keyOf(l.completed_at as string));
        });
        let streak = 0;
        const cursor = new Date();
        // Allow the streak to start today or yesterday.
        if (!activeDays.has(keyOf(cursor.toISOString()))) {
          cursor.setDate(cursor.getDate() - 1);
        }
        while (activeDays.has(keyOf(cursor.toISOString()))) {
          streak++;
          cursor.setDate(cursor.getDate() - 1);
        }
        setDayStreak(streak);
      } finally {
        setLoading(false);
      }
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
      <div className="loading-screen">
        <div className="spinner" aria-hidden="true" />
        <div>Loading your dashboard…</div>
      </div>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const t = getTheme(theme);

  return (
    <div className="min-h-screen" style={{ background: t.pageBg }}>
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
        </div>
        <div className="flex items-center gap-4">
          <div
            id="header-star-pill"
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
            <Star size={15} color="white" fill="white" aria-hidden="true" />
            <span>{starBalance}</span>
          </div>
          <Link
            href="/dashboard/student/settings"
            aria-label="Settings"
            style={{ color: "#94A3B8", display: "flex", alignItems: "center" }}
          >
            <Settings size={20} aria-hidden="true" />
          </Link>
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
            { href: "/dashboard/student", label: "Dashboard", active: true, Icon: null },
            { href: "/dashboard/student/goals", label: "My Goals", active: false, Icon: null },
            { href: "/dashboard/student/lessons", label: "Lessons", active: false, Icon: BookOpen },
            { href: "/dashboard/student/writing", label: "Writing", active: false, Icon: PenLine },
            { href: "/dashboard/student/fluency", label: "Read Aloud", active: false, Icon: Mic },
            { href: "/dashboard/student/class", label: "My Class", active: false, Icon: Users },
            { href: "/dashboard/student/store", label: "Store", active: false, Icon: Star },
            { href: "/dashboard/student/collection", label: "Collection", active: false, Icon: Layers },
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
                gap: "0.375rem",
                borderBottom: link.active ? "2px solid #028090" : "2px solid transparent",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {link.Icon && <link.Icon size={15} aria-hidden="true" />}
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        {loadError && (
          <div className="error-banner" role="alert">
            {loadError}{" "}
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "none",
                border: "none",
                color: "#DC2626",
                fontWeight: 700,
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Welcome banner */}
        <div
          style={{
            background: `linear-gradient(135deg, ${t.from} 0%, ${t.to} 100%)`,
            borderRadius: "16px",
            padding: "2rem",
            marginBottom: "1.5rem",
            color: "white",
          }}
        >
          <div className="flex items-center gap-4" style={{ marginBottom: "0.5rem" }}>
            <Link href="/dashboard/student/settings" aria-label="Edit your picture and theme">
              <div style={{ border: "3px solid rgba(255,255,255,0.6)", borderRadius: "50%" }}>
                <Avatar
                  userId={profile?.id ?? ""}
                  name={profile?.full_name}
                  avatarUrl={avatarUrl}
                  size={56}
                />
              </div>
            </Link>
            <h1
              style={{
                fontFamily: "var(--font-nunito), sans-serif",
                fontSize: "2rem",
                fontWeight: 800,
              }}
            >
              Hey {firstName}!
            </h1>
          </div>
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
              <School size={18} aria-hidden="true" />
              <span>{classroom.name}</span>
            </div>
          )}
        </div>

        {/* Stats row — effort & progress, not ranking */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "My Stars", value: starBalance, Icon: Star, color: "#D97706" },
            { label: "Lessons Done", value: lessonsDone, Icon: BookOpen, color: "#0EA5E9" },
            {
              label: dayStreak === 1 ? "Day Streak" : "Day Streak",
              value: dayStreak,
              Icon: Flame,
              color: "#F97316",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="card text-center"
              style={{ padding: "1.25rem 0.75rem" }}
            >
              <div style={{ marginBottom: "0.375rem", display: "flex", justifyContent: "center" }}>
                <stat.Icon size={28} color={stat.color} aria-hidden="true" />
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

        {/* My Skills — encouraging growth, no scores or comparisons */}
        {skills.length > 0 && (
          <div className="card mb-6">
            <h2
              className="flex items-center gap-2"
              style={{
                fontFamily: "var(--font-nunito), sans-serif",
                fontSize: "1.25rem",
                fontWeight: 800,
                color: "#0C2340",
                marginBottom: "0.25rem",
              }}
            >
              My Skills
              <Sparkles size={20} color={t.accent} aria-hidden="true" />
            </h2>
            <p style={{ fontSize: "0.875rem", color: "#64748B", marginBottom: "1.25rem" }}>
              Every lesson helps you grow. Keep going to level up!
            </p>
            <div className="flex flex-col gap-4">
              {skills.map((s) => {
                const sc = subjectColor(s.subject);
                return (
                  <div key={s.subject}>
                    <div className="flex items-center justify-between" style={{ marginBottom: "0.35rem" }}>
                      <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#0C2340" }}>
                        {s.subject}
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          color: s.color,
                          background: `${s.color}18`,
                          padding: "0.15rem 0.6rem",
                          borderRadius: "100px",
                        }}
                      >
                        {s.level}
                      </span>
                    </div>
                    <div
                      style={{
                        height: "12px",
                        background: "#EEF2F7",
                        borderRadius: "6px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${s.fill}%`,
                          background: sc,
                          borderRadius: "6px",
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* My Goals */}
        <div className="card mb-6">
          <div className="flex items-center justify-between" style={{ marginBottom: "1rem" }}>
            <h2
              className="flex items-center gap-2"
              style={{
                fontFamily: "var(--font-nunito), sans-serif",
                fontSize: "1.25rem",
                fontWeight: 800,
                color: "#0C2340",
              }}
            >
              My Goals
              <Target size={20} color="#028090" aria-hidden="true" />
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
              <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "center" }}>
                <Target size={48} color="#CBD5E1" aria-hidden="true" />
              </div>
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
                    <p
                      className="flex items-center gap-2"
                      style={{ fontSize: "0.9375rem", color: "#0C2340", fontWeight: 500, lineHeight: 1.4, flex: 1 }}
                    >
                      <Target size={16} color="#028090" style={{ flexShrink: 0 }} aria-hidden="true" />
                      {goal.friendly_text}
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

        {/* Lesson Library — full-width spotlight */}
        <Link href="/dashboard/student/lessons" style={{ textDecoration: "none" }}>
          <div
            className="card card-hover mb-6"
            style={{
              background: "linear-gradient(135deg, #028090 0%, #02C39A 100%)",
              padding: "1.5rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div className="flex items-center gap-3">
              <BookOpen size={36} color="white" aria-hidden="true" />
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-nunito), sans-serif",
                    fontWeight: 800,
                    color: "white",
                    fontSize: "1.1875rem",
                    marginBottom: "0.125rem",
                  }}
                >
                  Lesson Library
                </div>
                <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.875rem" }}>
                  Pick a subject and learn something new — earn stars as you go
                </div>
              </div>
            </div>
            <Sparkles size={24} color="white" aria-hidden="true" style={{ flexShrink: 0 }} />
          </div>
        </Link>

        {/* Read Aloud — full-width spotlight */}
        <Link href="/dashboard/student/fluency" style={{ textDecoration: "none" }}>
          <div
            className="card card-hover mb-6"
            style={{
              background: "linear-gradient(135deg, #7C3AED 0%, #9F67FA 100%)",
              padding: "1.5rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div className="flex items-center gap-3">
              <Mic size={36} color="white" aria-hidden="true" />
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-nunito), sans-serif",
                    fontWeight: 800,
                    color: "white",
                    fontSize: "1.1875rem",
                    marginBottom: "0.125rem",
                  }}
                >
                  Read Aloud
                </div>
                <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "0.875rem" }}>
                  Read a passage out loud and get friendly tips to read even better
                </div>
              </div>
            </div>
            <Sparkles size={24} color="white" aria-hidden="true" style={{ flexShrink: 0 }} />
          </div>
        </Link>

        {/* Store quick actions */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Link
            href="/dashboard/student/store"
            style={{ textDecoration: "none" }}
          >
            <div
              className="card card-hover"
              style={{
                background: "linear-gradient(135deg, #D97706 0%, #F59E0B 100%)",
                padding: "1.25rem",
                cursor: "pointer",
              }}
            >
              <div style={{ marginBottom: "0.375rem" }}>
                <Star size={32} color="white" fill="white" aria-hidden="true" />
              </div>
              <div
                style={{
                  fontFamily: "var(--font-nunito), sans-serif",
                  fontWeight: 800,
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
              className="card card-hover"
              style={{
                background: "linear-gradient(135deg, #7C3AED 0%, #9F67FA 100%)",
                padding: "1.25rem",
                cursor: "pointer",
              }}
            >
              <div style={{ marginBottom: "0.375rem" }}>
                <Layers size={32} color="white" aria-hidden="true" />
              </div>
              <div
                style={{
                  fontFamily: "var(--font-nunito), sans-serif",
                  fontWeight: 800,
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
            <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "center" }}>
              <School size={40} color="#94A3B8" aria-hidden="true" />
            </div>
            <h3
              style={{
                fontFamily: "var(--font-nunito), sans-serif",
                fontSize: "1.125rem",
                fontWeight: 800,
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

        {/* Invite a parent */}
        <Link href="/dashboard/student/invite-parent" style={{ textDecoration: "none" }}>
          <div
            className="card card-hover"
            style={{
              marginTop: "1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              padding: "1.25rem 1.5rem",
              cursor: "pointer",
            }}
          >
            <div className="flex items-center gap-3">
              <UserPlus size={30} color="#028090" aria-hidden="true" />
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-nunito), sans-serif",
                    fontWeight: 800,
                    color: "#0C2340",
                    fontSize: "1.0625rem",
                  }}
                >
                  Invite a Parent
                </div>
                <div style={{ color: "#64748B", fontSize: "0.875rem" }}>
                  Get a code so your family can see your goals and progress
                </div>
              </div>
            </div>
            <span style={{ color: "#028090", fontWeight: 700, flexShrink: 0 }}>→</span>
          </div>
        </Link>
      </main>
    </div>
  );
}
