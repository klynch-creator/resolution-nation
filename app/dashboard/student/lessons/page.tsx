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
  SpellCheck,
  Landmark,
  Palette,
  Music,
  RotateCcw,
  Check,
} from "lucide-react";
import type { Lesson, LessonTier } from "@/types";
import { SUBJECT_META } from "@/lib/lesson-topics";

const SUBJECT_ICONS: Record<string, typeof BookOpen> = {
  Reading: BookOpen,
  Math: Calculator,
  Science: FlaskConical,
  Spelling: SpellCheck,
  History: Landmark,
  Art: Palette,
  Music: Music,
};

const TIER_BADGE: Record<LessonTier, { label: string; color: string; bg: string }> = {
  below: { label: "Building Up", color: "#0369A1", bg: "#E0F2FE" },
  at: { label: "On Level", color: "#047857", bg: "#D1FAE5" },
  above: { label: "Challenge", color: "#6D28D9", bg: "#EDE9FE" },
};

export default function LessonLibraryPage() {
  const router = useRouter();
  const [starBalance, setStarBalance] = useState(0);
  const [loading, setLoading] = useState(true);
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
            Pick a subject, then tap a topic that looks fun. Each lesson is brand new — they get
            harder as you ace them, and easier if you need a hand.
          </p>
        </div>

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

        {/* Subject picker — each subject links to its own topics page */}
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
          {SUBJECT_META.map((s) => {
            const Icon = SUBJECT_ICONS[s.name] ?? BookOpen;
            return (
              <Link
                key={s.name}
                href={`/dashboard/student/lessons/subject/${s.slug}`}
                className="card card-hover"
                style={{
                  background: s.gradient,
                  padding: "1.5rem 1.25rem",
                  border: "none",
                  textAlign: "left",
                  textDecoration: "none",
                  display: "block",
                }}
              >
                <Icon size={32} color="white" aria-hidden="true" />
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
              </Link>
            );
          })}
        </div>

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
