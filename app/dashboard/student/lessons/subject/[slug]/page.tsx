"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Star, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import {
  TOPIC_CATALOG,
  BAND_INFO,
  BAND_ORDER,
  bandForLevel,
  subjectBySlug,
  type Band,
} from "@/lib/lesson-topics";
import { gradeToLevel } from "@/lib/adaptive";

export default function SubjectTopicsPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const subject = useMemo(() => subjectBySlug(params.slug ?? ""), [params.slug]);

  const [starBalance, setStarBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generatingTopic, setGeneratingTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState("");
  const [studentBand, setStudentBand] = useState<Band>("elementary");
  const [openBands, setOpenBands] = useState<Record<Band, boolean>>({
    elementary: true,
    middle: false,
    high: false,
  });

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

        // Default-open the band matching the student's enrolled grade.
        const band = bandForLevel(gradeToLevel(profileData?.grade));
        setStudentBand(band);
        setOpenBands({ elementary: band === "elementary", middle: band === "middle", high: band === "high" });

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
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startLesson(topicText: string | null) {
    if (!subject || generatingTopic) return;
    setGeneratingTopic(topicText ?? "__surprise__");
    setError(null);
    try {
      const res = await fetch("/api/lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.name,
          topic: topicText?.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not start the lesson. Please try again.");
        setGeneratingTopic(null);
        return;
      }
      router.push(`/dashboard/student/lessons/${json.lesson.id}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setGeneratingTopic(null);
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" aria-hidden="true" />
        <div>Loading topics…</div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="loading-screen">
        <div>We couldn&apos;t find that subject.</div>
        <Link href="/dashboard/student/lessons" style={{ color: "#028090", fontWeight: 600 }}>
          ← Back to the Lesson Library
        </Link>
      </div>
    );
  }

  const bands = TOPIC_CATALOG[subject.name];
  const busy = generatingTopic !== null;

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
            href="/dashboard/student/lessons"
            style={{ color: "#028090", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}
          >
            ← Lesson Library
          </Link>
          <div
            className="flex items-center gap-3"
            style={{ marginTop: "0.625rem" }}
          >
            <div
              style={{
                background: subject.gradient,
                borderRadius: "14px",
                width: "52px",
                height: "52px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: "white",
                fontFamily: "var(--font-nunito), sans-serif",
                fontWeight: 800,
                fontSize: "1.5rem",
              }}
              aria-hidden="true"
            >
              {subject.name[0]}
            </div>
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-nunito), sans-serif",
                  fontSize: "1.875rem",
                  fontWeight: 800,
                  color: "#0C2340",
                  lineHeight: 1.15,
                }}
              >
                {subject.name}
              </h1>
              <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>{subject.tagline}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="error-banner" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {/* Band sections */}
        {BAND_ORDER.map((band) => {
          const categories = bands?.[band] ?? [];
          if (categories.length === 0) return null;
          const info = BAND_INFO[band];
          const open = openBands[band];
          const isYours = band === studentBand;
          return (
            <section key={band} style={{ marginBottom: "1.25rem" }}>
              <button
                onClick={() => setOpenBands((p) => ({ ...p, [band]: !p[band] }))}
                aria-expanded={open}
                className="flex items-center justify-between"
                style={{
                  width: "100%",
                  background: "white",
                  border: "1px solid #E2E8F0",
                  borderRadius: open ? "12px 12px 0 0" : "12px",
                  padding: "0.875rem 1rem",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>
                  <span
                    style={{
                      fontFamily: "var(--font-nunito), sans-serif",
                      fontWeight: 800,
                      fontSize: "1.0625rem",
                      color: "#0C2340",
                    }}
                  >
                    {info.label}
                  </span>
                  {isYours && (
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        background: "#D1FAE5",
                        color: "#047857",
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        padding: "0.125rem 0.5rem",
                        borderRadius: "100px",
                        verticalAlign: "middle",
                      }}
                    >
                      For you
                    </span>
                  )}
                  <span style={{ display: "block", color: "#94A3B8", fontSize: "0.8125rem", fontWeight: 400 }}>
                    {info.blurb}
                  </span>
                </span>
                {open ? (
                  <ChevronUp size={20} color="#64748B" aria-hidden="true" />
                ) : (
                  <ChevronDown size={20} color="#64748B" aria-hidden="true" />
                )}
              </button>
              {open && (
                <div
                  className="grid grid-cols-2 gap-3"
                  style={{
                    background: "white",
                    border: "1px solid #E2E8F0",
                    borderTop: "none",
                    borderRadius: "0 0 12px 12px",
                    padding: "1rem",
                  }}
                >
                  {categories.map((cat) => {
                    const isGenerating = generatingTopic === cat.name;
                    return (
                      <button
                        key={cat.name}
                        onClick={() => startLesson(cat.name)}
                        disabled={busy}
                        className="card-hover"
                        style={{
                          background: isGenerating ? subject.gradient : "#F7F9FC",
                          border: "1px solid #E2E8F0",
                          borderRadius: "12px",
                          padding: "0.875rem",
                          cursor: busy ? "default" : "pointer",
                          textAlign: "left",
                          opacity: busy && !isGenerating ? 0.5 : 1,
                        }}
                      >
                        <div style={{ fontSize: "1.5rem", lineHeight: 1 }} aria-hidden="true">
                          {cat.emoji}
                        </div>
                        <div
                          style={{
                            fontFamily: "var(--font-nunito), sans-serif",
                            fontWeight: 800,
                            fontSize: "0.9375rem",
                            color: isGenerating ? "white" : "#0C2340",
                            marginTop: "0.375rem",
                          }}
                        >
                          {isGenerating ? "Building your lesson…" : cat.name}
                        </div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: isGenerating ? "rgba(255,255,255,0.9)" : "#64748B",
                            marginTop: "0.125rem",
                          }}
                        >
                          {cat.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {/* Custom topic + surprise me */}
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <label
            htmlFor="custom-topic"
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#374151",
              marginBottom: "0.5rem",
            }}
          >
            Have your own idea? Type it here (optional)
          </label>
          <div className="flex gap-2">
            <input
              id="custom-topic"
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="e.g. volcanoes, chess, ancient Egypt…"
              maxLength={80}
              disabled={busy}
              style={{
                flex: 1,
                padding: "0.625rem 0.875rem",
                borderRadius: "10px",
                border: "1px solid #CBD5E1",
                fontSize: "0.9375rem",
              }}
            />
            <button
              onClick={() => customTopic.trim() && startLesson(customTopic)}
              disabled={busy || !customTopic.trim()}
              style={{
                background:
                  busy || !customTopic.trim() ? "#94A3B8" : "linear-gradient(135deg, #028090, #02C39A)",
                color: "white",
                border: "none",
                borderRadius: "10px",
                padding: "0.625rem 1rem",
                fontSize: "0.9375rem",
                fontWeight: 700,
                cursor: busy || !customTopic.trim() ? "default" : "pointer",
                flexShrink: 0,
              }}
            >
              {generatingTopic === customTopic && customTopic ? "Building…" : "Go"}
            </button>
          </div>
          <button
            onClick={() => startLesson(null)}
            disabled={busy}
            className="flex items-center justify-center gap-2"
            style={{
              width: "100%",
              marginTop: "0.75rem",
              background: "white",
              color: "#028090",
              border: "1px solid #028090",
              borderRadius: "10px",
              padding: "0.625rem",
              fontSize: "0.9375rem",
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Sparkles size={16} aria-hidden="true" />
            {generatingTopic === "__surprise__" ? "Building your lesson…" : "Surprise me!"}
          </button>
        </div>
      </main>
    </div>
  );
}
