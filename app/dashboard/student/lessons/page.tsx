"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Star,
  BookOpen,
  Calculator,
  FlaskConical,
  Globe,
  PenLine,
  Landmark,
  Palette,
  Music,
  Sparkles,
  RotateCcw,
  Check,
} from "lucide-react";
import type { Lesson, LessonTier } from "@/types";

interface SubjectDef {
  name: string;
  Icon: typeof BookOpen;
  gradient: string;
}

const SUBJECTS: SubjectDef[] = [
  { name: "Reading", Icon: BookOpen, gradient: "linear-gradient(135deg, #028090, #02C39A)" },
  { name: "Math", Icon: Calculator, gradient: "linear-gradient(135deg, #7C3AED, #9F67FA)" },
  { name: "Science", Icon: FlaskConical, gradient: "linear-gradient(135deg, #0891B2, #06B6D4)" },
  { name: "Writing", Icon: PenLine, gradient: "linear-gradient(135deg, #D97706, #F59E0B)" },
  { name: "Social Studies", Icon: Globe, gradient: "linear-gradient(135deg, #059669, #34D399)" },
  { name: "History", Icon: Landmark, gradient: "linear-gradient(135deg, #B45309, #D97706)" },
  { name: "Art", Icon: Palette, gradient: "linear-gradient(135deg, #DB2777, #F472B6)" },
  { name: "Music", Icon: Music, gradient: "linear-gradient(135deg, #4F46E5, #818CF8)" },
];

const TIER_BADGE: Record<LessonTier, { label: string; color: string; bg: string }> = {
  below: { label: "Building Up", color: "#0369A1", bg: "#E0F2FE" },
  at: { label: "On Level", color: "#047857", bg: "#D1FAE5" },
  above: { label: "Challenge", color: "#6D28D9", bg: "#EDE9FE" },
};

export default function LessonLibraryPage() {
  const router = useRouter();
  const [starBalance, setStarBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SubjectDef | null>(null);
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedLessons, setFailedLessons] = useState<Lesson[]>([]);
  const [recent, setRecent] = useState<Lesson[]>([]);

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

        const meRes = await fetch("/api/me");
        const meJson = meRes.ok ? await meRes.json() : { profile: null };
        const profileData = meJson.profile;
        if (profileData && profileData.role !== "student") {
          window.location.href = "/dashboard";
          return;
        }

        const { data: stars } = await supabase
          .from("star_transactions")
          .select("amount, type")
          .eq("user_id", user.id);
        if (stars) {
          setStarBalance(
            stars.reduce((sum, tx) => {
              if (tx.type === "earned" || tx.type === "bonus" || tx.type === "gift_received")
                return sum + tx.amount;
              if (tx.type === "gift_sent" || tx.type === "purchase") return sum - tx.amount;
              return sum;
            }, 0)
          );
        }

        const { data: lessons } = await supabase
          .from("lessons")
          .select("*")
          .eq("student_id", user.id)
          .order("created_at", { ascending: false })
          .limit(40);
        const all = (lessons as Lesson[]) ?? [];
        setFailedLessons(all.filter((l) => l.status === "failed"));
        setRecent(all.filter((l) => l.status === "completed").slice(0, 6));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startLesson(subject: string, topicText: string) {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, topic: topicText.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not start the lesson. Please try again.");
        setGenerating(false);
        return;
      }
      router.push(`/dashboard/student/lessons/${json.lesson.id}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" aria-hidden="true" />
        <div>Loading the library…</div>
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
      </header>

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
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
            <BookOpen size={28} color="#028090" aria-hidden="true" />
            Lesson Library
          </h1>
          <p style={{ color: "#64748B", fontSize: "1rem", marginTop: "0.25rem" }}>
            Pick a subject and choose what you&apos;d like to learn about. Each lesson is brand new — they get
            harder as you ace them, and easier if you need a hand.
          </p>
        </div>

        {error && (
          <div className="error-banner" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {/* Retry failed lessons */}
        {failedLessons.length > 0 && (
          <div className="card mb-6" style={{ borderLeft: "4px solid #D97706" }}>
            <h2
              className="flex items-center gap-2"
              style={{
                fontFamily: "var(--font-nunito), sans-serif",
                fontSize: "1.0625rem",
                fontWeight: 800,
                color: "#0C2340",
                marginBottom: "0.75rem",
              }}
            >
              <RotateCcw size={18} color="#D97706" aria-hidden="true" />
              Give these another try
            </h2>
            <div className="flex flex-col gap-2">
              {failedLessons.map((l) => (
                <Link
                  key={l.id}
                  href={`/dashboard/student/lessons/${l.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                    padding: "0.75rem 1rem",
                    background: "#FFF7ED",
                    borderRadius: "10px",
                    border: "1px solid #FED7AA",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ fontSize: "0.9375rem", color: "#0C2340", fontWeight: 500 }}>
                    {l.title}{" "}
                    <span style={{ color: "#94A3B8", fontWeight: 400 }}>· {l.subject}</span>
                  </span>
                  <span style={{ color: "#D97706", fontWeight: 700, fontSize: "0.8125rem", flexShrink: 0 }}>
                    Retry →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Subject picker / topic step */}
        {!selected ? (
          <>
            <h2
              style={{
                fontFamily: "var(--font-nunito), sans-serif",
                fontSize: "1.125rem",
                fontWeight: 800,
                color: "#0C2340",
                marginBottom: "0.75rem",
              }}
            >
              Choose a subject
            </h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {SUBJECTS.map((s) => (
                <button
                  key={s.name}
                  onClick={() => {
                    setSelected(s);
                    setTopic("");
                    setError(null);
                  }}
                  className="card card-hover"
                  style={{
                    background: s.gradient,
                    padding: "1.5rem 1.25rem",
                    cursor: "pointer",
                    border: "none",
                    textAlign: "left",
                  }}
                >
                  <s.Icon size={32} color="white" aria-hidden="true" />
                  <div
                    style={{
                      fontFamily: "var(--font-nunito), sans-serif",
                      fontWeight: 800,
                      color: "white",
                      fontSize: "1.125rem",
                      marginTop: "0.5rem",
                    }}
                  >
                    {s.name}
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="card mb-6">
            <div className="flex items-center gap-3" style={{ marginBottom: "1rem" }}>
              <div
                style={{
                  background: selected.gradient,
                  borderRadius: "12px",
                  width: "48px",
                  height: "48px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <selected.Icon size={26} color="white" aria-hidden="true" />
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-nunito), sans-serif",
                    fontWeight: 800,
                    fontSize: "1.25rem",
                    color: "#0C2340",
                  }}
                >
                  {selected.name}
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#028090",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  ← Change subject
                </button>
              </div>
            </div>

            <label
              htmlFor="topic"
              style={{ display: "block", fontSize: "0.9375rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}
            >
              What would you like to learn about? (optional)
            </label>
            <input
              id="topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={`e.g. ${selected.name === "Math" ? "fractions, dinosaurs' sizes…" : "volcanoes, ancient Egypt…"}`}
              maxLength={80}
              disabled={generating}
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: "10px",
                border: "1px solid #CBD5E1",
                fontSize: "1rem",
                marginBottom: "1rem",
              }}
            />

            <div className="flex flex-col gap-2">
              <button
                onClick={() => startLesson(selected.name, topic)}
                disabled={generating}
                className="flex items-center justify-center gap-2"
                style={{
                  background: generating ? "#94A3B8" : "linear-gradient(135deg, #028090, #02C39A)",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  padding: "0.9375rem",
                  fontSize: "1.0625rem",
                  fontWeight: 700,
                  cursor: generating ? "default" : "pointer",
                }}
              >
                {generating ? (
                  "Building your lesson…"
                ) : (
                  <>
                    <Sparkles size={18} aria-hidden="true" />
                    Start Lesson
                  </>
                )}
              </button>
              {!generating && (
                <button
                  onClick={() => startLesson(selected.name, "")}
                  className="flex items-center justify-center gap-2"
                  style={{
                    background: "white",
                    color: "#028090",
                    border: "1px solid #028090",
                    borderRadius: "10px",
                    padding: "0.75rem",
                    fontSize: "0.9375rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <Sparkles size={16} aria-hidden="true" />
                  Surprise me
                </button>
              )}
            </div>
          </div>
        )}

        {/* Recent completed lessons */}
        {recent.length > 0 && (
          <div className="card">
            <h2
              className="flex items-center gap-2"
              style={{
                fontFamily: "var(--font-nunito), sans-serif",
                fontSize: "1.0625rem",
                fontWeight: 800,
                color: "#0C2340",
                marginBottom: "0.75rem",
              }}
            >
              <Check size={18} color="#02C39A" aria-hidden="true" />
              Recently completed
            </h2>
            <div className="flex flex-col gap-2">
              {recent.map((l) => {
                const badge = TIER_BADGE[l.tier];
                return (
                  <div
                    key={l.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      padding: "0.75rem 1rem",
                      background: "#F7F9FC",
                      borderRadius: "10px",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    <span style={{ fontSize: "0.9375rem", color: "#0C2340", fontWeight: 500, flex: 1 }}>
                      {l.title}{" "}
                      <span style={{ color: "#94A3B8", fontWeight: 400 }}>· {l.subject}</span>
                    </span>
                    <span
                      style={{
                        background: badge.bg,
                        color: badge.color,
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        padding: "0.125rem 0.5rem",
                        borderRadius: "100px",
                        flexShrink: 0,
                      }}
                    >
                      {badge.label}
                    </span>
                    <span
                      className="flex items-center gap-1"
                      style={{ color: "#D97706", fontWeight: 700, fontSize: "0.8125rem", flexShrink: 0 }}
                    >
                      <Star size={13} color="#D97706" fill="#D97706" aria-hidden="true" />
                      {l.stars_awarded}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
