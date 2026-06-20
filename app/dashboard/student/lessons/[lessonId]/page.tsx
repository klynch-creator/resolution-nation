"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import confetti from "canvas-confetti";
import { createClient } from "@/lib/supabase/client";
import {
  Star,
  Lightbulb,
  Check,
  X,
  Rocket,
  BookOpen,
  Sprout,
  PartyPopper,
  BicepsFlexed,
  RotateCcw,
} from "lucide-react";
import type { Profile, Lesson, RoadmapQuestion, LessonTier, CompleteLessonResult } from "@/types";

type Difficulty = "easy" | "medium" | "hard";
type GamePhase = "loading" | "playing" | "submitting" | "results";

const DIFF_ORDER: Difficulty[] = ["easy", "medium", "hard"];
const raiseLevel = (d: Difficulty) => DIFF_ORDER[Math.min(DIFF_ORDER.indexOf(d) + 1, 2)];
const lowerLevel = (d: Difficulty) => DIFF_ORDER[Math.max(DIFF_ORDER.indexOf(d) - 1, 0)];
const diffStarCount = (d: Difficulty) => (d === "easy" ? 1 : d === "medium" ? 2 : 3);
const diffLabel = (d: Difficulty) =>
  d === "easy" ? "Beginner" : d === "medium" ? "Intermediate" : "Advanced";

function DiffIcon({ d, size = 16 }: { d: Difficulty; size?: number }) {
  if (d === "easy") return <Sprout size={size} color="#02C39A" aria-hidden="true" />;
  if (d === "medium") return <Star size={size} color="#D97706" fill="#D97706" aria-hidden="true" />;
  return <Rocket size={size} color="#7C3AED" aria-hidden="true" />;
}
function DiffStars({ d, size = 13 }: { d: Difficulty; size?: number }) {
  return (
    <span className="inline-flex items-center" style={{ gap: "1px" }}>
      {Array.from({ length: diffStarCount(d) }).map((_, i) => (
        <Star key={i} size={size} color="#D97706" fill="#D97706" aria-hidden="true" />
      ))}
    </span>
  );
}

const TIER_BADGE: Record<LessonTier, { label: string; color: string; bg: string }> = {
  below: { label: "Building Up", color: "#0369A1", bg: "#E0F2FE" },
  at: { label: "On Level", color: "#047857", bg: "#D1FAE5" },
  above: { label: "Challenge", color: "#6D28D9", bg: "#EDE9FE" },
};

interface LessonResp {
  questionIndex: number;
  difficulty: Difficulty;
  isCorrect: boolean;
  responseTimeMs: number;
}

export default function LessonPlayerPage() {
  const router = useRouter();
  const params = useParams();
  const lessonId = params.lessonId as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  const [gamePhase, setGamePhase] = useState<GamePhase>("loading");
  const [questions, setQuestions] = useState<RoadmapQuestion[]>([]);
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>("easy");
  const [recentHistory, setRecentHistory] = useState<boolean[]>([]);
  const [answeredIndices, setAnsweredIndices] = useState<Set<number>>(new Set());
  const [currentQ, setCurrentQ] = useState<RoadmapQuestion | null>(null);
  const [currentQIdx, setCurrentQIdx] = useState<number>(-1);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [responses, setResponses] = useState<LessonResp[]>([]);
  const [levelMsg, setLevelMsg] = useState<{ kind: "up" | "down"; text: string } | null>(null);
  const [sustainedAt, setSustainedAt] = useState<{ difficulty: Difficulty; count: number }>({
    difficulty: "easy",
    count: 0,
  });
  const [highestSustained, setHighestSustained] = useState<Difficulty>("easy");

  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [result, setResult] = useState<CompleteLessonResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [starBalance, setStarBalance] = useState(0);
  const [displayBalance, setDisplayBalance] = useState(0);
  const [displayStarsEarned, setDisplayStarsEarned] = useState(0);
  const [pillPulse, setPillPulse] = useState(false);

  const questionStartRef = useRef<number>(Date.now());

  // ── Load lesson ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
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
      if (meJson.profile && meJson.profile.role !== "student") {
        window.location.href = "/dashboard";
        return;
      }
      setProfile(meJson.profile);

      const { data: stars } = await supabase
        .from("star_transactions")
        .select("amount, type")
        .eq("user_id", user.id);
      if (stars) {
        const balance = stars.reduce((sum, tx) => {
          if (tx.type === "earned" || tx.type === "bonus" || tx.type === "gift_received")
            return sum + tx.amount;
          if (tx.type === "gift_sent" || tx.type === "purchase") return sum - tx.amount;
          return sum;
        }, 0);
        setStarBalance(balance);
        setDisplayBalance(balance);
      }

      const { data: lessonData } = await supabase
        .from("lessons")
        .select("*")
        .eq("id", lessonId)
        .single();
      if (!lessonData) {
        router.push("/dashboard/student/lessons");
        return;
      }
      const typed = lessonData as Lesson;
      if (typed.status === "completed") {
        router.push("/dashboard/student/lessons");
        return;
      }
      setLesson(typed);

      const qs = typed.activities?.questions ?? [];
      if (qs.length === 0) {
        router.push("/dashboard/student/lessons");
        return;
      }
      setQuestions(qs);
      setGamePhase("playing");
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── First question ──────────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase === "playing" && questions.length > 0 && currentQIdx === -1) {
      const first = pickFrom(questions, "easy", new Set());
      if (first) {
        setCurrentQ(first.q);
        setCurrentQIdx(first.i);
        setQuestionNumber(1);
        questionStartRef.current = Date.now();
      }
    }
  }, [gamePhase, questions]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Celebration on results ──────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== "results" || !result) return;
    const earned = result.stars_awarded;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setDisplayStarsEarned(earned);
      setDisplayBalance(starBalance + earned);
      return;
    }

    if (earned > 0) {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#D97706", "#028090", "#02C39A", "#7C3AED"],
      });
    }
    setPillPulse(true);
    const pulseTimeout = setTimeout(() => setPillPulse(false), 1200);

    const duration = 1200;
    const startTime = performance.now();
    const startBalance = starBalance;
    const targetBalance = starBalance + earned;
    let frame: number;
    function tick(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayStarsEarned(Math.round(earned * eased));
      setDisplayBalance(Math.round(startBalance + (targetBalance - startBalance) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(pulseTimeout);
    };
  }, [gamePhase, result]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickFrom(
    qs: RoadmapQuestion[],
    preferred: Difficulty,
    answered: Set<number>
  ): { q: RoadmapQuestion; i: number } | null {
    const order = [preferred, ...DIFF_ORDER.filter((d) => d !== preferred)];
    const seen = new Set<Difficulty>();
    for (const d of order) {
      if (seen.has(d)) continue;
      seen.add(d);
      const avail = qs
        .map((q, i) => ({ q, i }))
        .filter(({ q, i }) => q.difficulty === d && !answered.has(i));
      if (avail.length > 0) return avail[0];
    }
    return null;
  }

  function handleAnswer(choiceIndex: number) {
    if (selectedAnswer !== null || !currentQ || gamePhase !== "playing") return;
    setSelectedAnswer(choiceIndex);

    const isCorrect = choiceIndex === currentQ.correct_index;
    const responseTimeMs = Date.now() - questionStartRef.current;

    const newResponse: LessonResp = {
      questionIndex: currentQIdx,
      difficulty: currentDifficulty,
      isCorrect,
      responseTimeMs,
    };
    const newResponses = [...responses, newResponse];
    setResponses(newResponses);

    const newHistory = [...recentHistory, isCorrect].slice(-3);
    setRecentHistory(newHistory);

    const newAnswered = new Set(answeredIndices);
    newAnswered.add(currentQIdx);
    setAnsweredIndices(newAnswered);

    let newDiff = currentDifficulty;
    const incorrectCount = newHistory.filter((b) => !b).length;
    if (newHistory.length === 3 && newHistory.every(Boolean)) {
      const up = raiseLevel(currentDifficulty);
      if (up !== currentDifficulty) {
        newDiff = up;
        setLevelMsg({ kind: "up", text: "Level Up!" });
        setTimeout(() => setLevelMsg(null), 2000);
      }
    } else if (incorrectCount >= 2) {
      const down = lowerLevel(currentDifficulty);
      if (down !== currentDifficulty) {
        newDiff = down;
        setLevelMsg({ kind: "down", text: "Let's slow down a bit" });
        setTimeout(() => setLevelMsg(null), 2000);
      }
    }
    setCurrentDifficulty(newDiff);

    const newSustain = {
      difficulty: newDiff,
      count: newDiff === sustainedAt.difficulty ? sustainedAt.count + 1 : 1,
    };
    setSustainedAt(newSustain);
    if (newSustain.count >= 3) {
      if (DIFF_ORDER.indexOf(newSustain.difficulty) > DIFF_ORDER.indexOf(highestSustained)) {
        setHighestSustained(newSustain.difficulty);
      }
    }

    const capturedQuestions = questions;
    setTimeout(() => {
      const hasMore = capturedQuestions.some((_, i) => !newAnswered.has(i));
      if (!hasMore) {
        void finalise(newResponses);
      } else {
        const next = pickFrom(capturedQuestions, newDiff, newAnswered);
        if (next) {
          setCurrentQ(next.q);
          setCurrentQIdx(next.i);
          setSelectedAnswer(null);
          setShowHint(false);
          questionStartRef.current = Date.now();
          setQuestionNumber((n) => n + 1);
        } else {
          void finalise(newResponses);
        }
      }
    }, 1500);
  }

  async function finalise(allResponses: LessonResp[]) {
    const correct = allResponses.filter((r) => r.isCorrect).length;
    const total = allResponses.length;
    const pct = total > 0 ? (correct / total) * 100 : 0;
    setScore({ correct, total });
    setGamePhase("submitting");
    setSubmitError(null);

    try {
      const res = await fetch(`/api/lessons/${lessonId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score_pct: pct,
          responses: allResponses.map((r) => ({
            question_index: r.questionIndex,
            difficulty: r.difficulty,
            is_correct: r.isCorrect,
            response_time_ms: r.responseTimeMs,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error ?? "Could not save your results.");
        setResult({ status: pct >= 80 ? "completed" : "failed", stars_awarded: 0, tier: lesson?.tier ?? "at" });
      } else {
        setResult(json.result as CompleteLessonResult);
      }
    } catch {
      setSubmitError("Could not save your results. Check your connection.");
      setResult({ status: pct >= 80 ? "completed" : "failed", stars_awarded: 0, tier: lesson?.tier ?? "at" });
    } finally {
      setGamePhase("results");
    }
  }

  async function tryAgain() {
    if (!lesson) return;
    setGamePhase("submitting");
    try {
      const res = await fetch("/api/lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: lesson.subject, topic: lesson.topic }),
      });
      const json = await res.json();
      if (res.ok) {
        window.location.href = `/dashboard/student/lessons/${json.lesson.id}`;
        return;
      }
    } catch {
      /* fall through */
    }
    router.push("/dashboard/student/lessons");
  }

  // ── Render: loading ──────────────────────────────────────────────────────
  if (gamePhase === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F7F9FC",
        }}
      >
        <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading lesson…</div>
      </div>
    );
  }

  const totalQuestions = questions.length;
  const LABELS = ["A", "B", "C", "D"];

  // ── Render: results / submitting ─────────────────────────────────────────
  if (gamePhase === "results" || gamePhase === "submitting") {
    const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
    const passed = result?.status === "completed";
    const headline = passed ? "Lesson Complete!" : "Good effort — keep going!";
    const badge = result ? TIER_BADGE[result.tier] : null;

    return (
      <div style={{ minHeight: "100vh", background: "#F7F9FC" }}>
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
          <div className="flex items-center gap-3">
            <div
              id="header-star-pill"
              className={pillPulse ? "star-pill-pulse" : undefined}
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
              <span>{displayBalance}</span>
            </div>
            <span style={{ color: "#94A3B8", fontSize: "0.875rem" }}>{profile?.full_name}</span>
          </div>
        </header>

        <main style={{ maxWidth: "560px", margin: "0 auto", padding: "3rem 1.25rem", textAlign: "center" }}>
          {gamePhase === "submitting" ? (
            <div style={{ color: "#028090", fontSize: "1.125rem", padding: "3rem 0" }}>
              Saving your results…
            </div>
          ) : (
            <>
              <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "center" }}>
                {passed ? (
                  <PartyPopper size={72} color="#D97706" aria-hidden="true" />
                ) : (
                  <BicepsFlexed size={72} color="#028090" aria-hidden="true" />
                )}
              </div>
              <h1
                style={{
                  fontFamily: "var(--font-nunito), sans-serif",
                  fontSize: "2rem",
                  fontWeight: 800,
                  color: "#0C2340",
                  marginBottom: "0.5rem",
                }}
              >
                {headline}
              </h1>
              <p style={{ fontSize: "1.1875rem", color: "#374151", marginBottom: "1.5rem" }}>
                You got <strong>{score.correct}</strong> out of <strong>{score.total}</strong> correct ({pct}%)
              </p>

              {submitError && (
                <div className="error-banner" role="alert" style={{ marginBottom: "1rem" }}>
                  {submitError}
                </div>
              )}

              {/* Stars card */}
              <div
                style={{
                  background: "white",
                  borderRadius: "16px",
                  padding: "1.75rem",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ fontSize: "0.9375rem", color: "#64748B", marginBottom: "0.5rem" }}>
                  Stars Earned
                </div>
                <div
                  className="flex items-center justify-center gap-2"
                  style={{ fontSize: "3.25rem", fontWeight: 700, color: "#D97706", lineHeight: 1, marginBottom: "0.375rem" }}
                >
                  <Star size={36} color="#D97706" fill="#D97706" aria-hidden="true" />
                  {displayStarsEarned}
                </div>
                <div style={{ fontSize: "0.875rem", color: "#94A3B8" }}>
                  {passed ? "Great work — lesson mastered!" : "Score 80% or more to earn stars. Try again!"}
                </div>
              </div>

              {/* Tier card */}
              {badge && (
                <div
                  style={{
                    background: "white",
                    borderRadius: "16px",
                    padding: "1.25rem",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    marginBottom: "1rem",
                  }}
                >
                  <div style={{ fontSize: "0.9375rem", color: "#64748B", marginBottom: "0.5rem" }}>
                    Your level in {lesson?.subject}
                  </div>
                  <span
                    style={{
                      background: badge.bg,
                      color: badge.color,
                      fontSize: "0.9375rem",
                      fontWeight: 700,
                      padding: "0.375rem 1rem",
                      borderRadius: "100px",
                    }}
                  >
                    {badge.label}
                  </span>
                </div>
              )}

              {/* Difficulty reached */}
              <div
                style={{
                  background: "white",
                  borderRadius: "16px",
                  padding: "1.25rem",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  marginBottom: "2rem",
                }}
              >
                <div style={{ fontSize: "0.9375rem", color: "#64748B", marginBottom: "0.375rem" }}>
                  Highest Level Reached
                </div>
                <div
                  className="flex items-center justify-center gap-2"
                  style={{ fontSize: "1.375rem", fontWeight: 700, color: "#028090" }}
                >
                  {diffLabel(highestSustained)}
                  <DiffIcon d={highestSustained} size={20} />
                  <DiffStars d={highestSustained} size={16} />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "center" }}>
                {!passed && (
                  <button
                    onClick={tryAgain}
                    className="flex items-center justify-center gap-2"
                    style={{
                      background: "linear-gradient(135deg, #D97706, #F59E0B)",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      padding: "0.9375rem 2.25rem",
                      fontSize: "1.0625rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      width: "100%",
                      maxWidth: "360px",
                    }}
                  >
                    <RotateCcw size={18} aria-hidden="true" />
                    Try Again
                  </button>
                )}
                <Link
                  href="/dashboard/student/lessons"
                  style={{
                    background: passed ? "linear-gradient(135deg, #028090, #02C39A)" : "none",
                    color: passed ? "white" : "#028090",
                    borderRadius: "8px",
                    padding: passed ? "0.9375rem 2.25rem" : "0.5rem",
                    fontSize: "1.0625rem",
                    fontWeight: 700,
                    textDecoration: "none",
                    width: passed ? "100%" : undefined,
                    maxWidth: "360px",
                    textAlign: "center",
                  }}
                >
                  {passed ? "Pick Another Lesson →" : "← Back to Library"}
                </Link>
              </div>
            </>
          )}
        </main>
      </div>
    );
  }

  // ── Render: playing ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F7F9FC", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "#0C2340",
          padding: "0 1.5rem",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-nunito), sans-serif",
              color: "#F7F9FC",
              fontSize: "1rem",
              fontWeight: 800,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "260px",
            }}
          >
            {lesson?.title ?? "Lesson"}
          </div>
          <div style={{ color: "#94A3B8", fontSize: "0.6875rem", marginTop: "1px" }}>
            {lesson?.subject}
            {lesson?.topic ? ` · ${lesson.topic}` : ""}
          </div>
        </div>

        <div className="flex items-center" style={{ gap: "0.625rem" }}>
          <div
            id="header-star-pill"
            className={pillPulse ? "star-pill-pulse" : undefined}
            style={{
              background: "#D97706",
              color: "white",
              borderRadius: "100px",
              padding: "0.25rem 0.75rem",
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              fontWeight: 700,
              fontSize: "0.8125rem",
            }}
          >
            <Star size={13} color="white" fill="white" aria-hidden="true" />
            <span>{displayBalance}</span>
          </div>
          <div
            className="flex items-center gap-1"
            style={{
              background: "rgba(255,255,255,0.12)",
              borderRadius: "6px",
              padding: "0.25rem 0.625rem",
              fontSize: "0.8125rem",
              color: "white",
              fontWeight: 600,
            }}
          >
            Level: <DiffStars d={currentDifficulty} size={12} />
          </div>
          <div
            style={{
              background: "#D97706",
              color: "white",
              borderRadius: "100px",
              padding: "0.25rem 0.75rem",
              fontWeight: 700,
              fontSize: "0.875rem",
            }}
          >
            {questionNumber} / {totalQuestions}
          </div>
        </div>
      </header>

      <div style={{ height: "5px", background: "#E2E8F0", flexShrink: 0 }}>
        <div
          style={{
            height: "100%",
            width: `${Math.round((answeredIndices.size / Math.max(totalQuestions, 1)) * 100)}%`,
            background: "linear-gradient(90deg, #028090, #02C39A)",
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {levelMsg && (
        <div
          className="flex items-center gap-2"
          style={{
            position: "fixed",
            top: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0C2340",
            color: "white",
            borderRadius: "100px",
            padding: "0.5rem 1.5rem",
            fontWeight: 700,
            fontSize: "1rem",
            zIndex: 100,
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            whiteSpace: "nowrap",
          }}
        >
          {levelMsg.kind === "up" ? (
            <Rocket size={18} aria-hidden="true" />
          ) : (
            <BookOpen size={18} aria-hidden="true" />
          )}
          {levelMsg.text}
        </div>
      )}

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem 1.25rem 2.5rem",
          maxWidth: "680px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {currentQ && (
          <>
            <div
              style={{
                background: "white",
                borderRadius: "16px",
                padding: "2rem",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                marginBottom: "1rem",
                width: "100%",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-nunito), sans-serif",
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: "#0C2340",
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                {currentQ.question}
              </p>
              {showHint && (
                <div
                  className="flex items-start gap-2"
                  style={{
                    background: "#FEF3C7",
                    borderRadius: "8px",
                    padding: "0.75rem 1rem",
                    fontSize: "0.9375rem",
                    color: "#92400E",
                    lineHeight: 1.5,
                    marginTop: "1.25rem",
                  }}
                >
                  <Lightbulb size={18} style={{ flexShrink: 0, marginTop: "1px" }} aria-hidden="true" />
                  {currentQ.hint}
                </div>
              )}
            </div>

            {!showHint && selectedAnswer === null && (
              <button
                onClick={() => setShowHint(true)}
                className="flex items-center gap-1"
                style={{
                  background: "none",
                  border: "none",
                  color: "#028090",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  marginBottom: "0.75rem",
                  padding: "0.25rem 0",
                }}
              >
                Need a hint? <Lightbulb size={16} aria-hidden="true" />
              </button>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", width: "100%" }}>
              {currentQ.options.map((option, idx) => {
                const isSelected = selectedAnswer === idx;
                const isCorrectAnswer = idx === currentQ.correct_index;
                const showingFeedback = selectedAnswer !== null;

                let bg = "white";
                let borderColor = "#028090";
                let textColor = "#0C2340";
                let labelBg = "#F0F9FF";
                let labelColor = "#028090";
                if (showingFeedback) {
                  if (isCorrectAnswer) {
                    bg = "#02C39A";
                    borderColor = "#02C39A";
                    textColor = "white";
                    labelBg = "rgba(255,255,255,0.25)";
                    labelColor = "white";
                  } else if (isSelected) {
                    bg = "#DC2626";
                    borderColor = "#DC2626";
                    textColor = "white";
                    labelBg = "rgba(255,255,255,0.25)";
                    labelColor = "white";
                  } else {
                    bg = "#F7F9FC";
                    borderColor = "#E2E8F0";
                    textColor = "#94A3B8";
                    labelBg = "#E2E8F0";
                    labelColor = "#94A3B8";
                  }
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(idx)}
                    disabled={selectedAnswer !== null}
                    style={{
                      background: bg,
                      border: `2px solid ${borderColor}`,
                      borderRadius: "8px",
                      padding: "0.875rem 1.125rem",
                      fontSize: "1rem",
                      fontWeight: 500,
                      color: textColor,
                      cursor: selectedAnswer !== null ? "default" : "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      minHeight: "60px",
                      transition: "background 0.2s, border-color 0.2s, color 0.2s",
                      width: "100%",
                    }}
                  >
                    <span
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "50%",
                        background: labelBg,
                        color: labelColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.875rem",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {LABELS[idx]}
                    </span>
                    <span style={{ flex: 1, lineHeight: 1.4 }}>{option}</span>
                    {showingFeedback && isCorrectAnswer && (
                      <Check size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
                    )}
                    {showingFeedback && isSelected && !isCorrectAnswer && (
                      <X size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>

            {selectedAnswer !== null && (
              <div
                className="flex items-center gap-1"
                style={{
                  marginTop: "1rem",
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: selectedAnswer === currentQ.correct_index ? "#059669" : "#DC2626",
                }}
              >
                {selectedAnswer === currentQ.correct_index ? (
                  <>
                    <Check size={18} aria-hidden="true" />
                    Correct!
                  </>
                ) : (
                  <>
                    <X size={18} aria-hidden="true" />
                    Incorrect — see the correct answer above
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
