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
} from "lucide-react";
import type { Profile, Goal, RoadmapStep, RoadmapQuestion } from "@/types";
import { ReadAloud, questionSpeech } from "@/lib/read-aloud";

// ─── Difficulty helpers ───────────────────────────────────────────────────────

type Difficulty = "easy" | "medium" | "hard";
type GamePhase = "loading" | "playing" | "results" | "saving" | "saved";

const DIFF_ORDER: Difficulty[] = ["easy", "medium", "hard"];

function raiseLevel(d: Difficulty): Difficulty {
  return DIFF_ORDER[Math.min(DIFF_ORDER.indexOf(d) + 1, 2)];
}
function lowerLevel(d: Difficulty): Difficulty {
  return DIFF_ORDER[Math.max(DIFF_ORDER.indexOf(d) - 1, 0)];
}
function diffStarCount(d: Difficulty): number {
  return d === "easy" ? 1 : d === "medium" ? 2 : 3;
}
function diffLabel(d: Difficulty): string {
  return d === "easy" ? "Beginner" : d === "medium" ? "Intermediate" : "Advanced";
}
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

interface WorkoutResponse {
  questionIndex: number;
  difficulty: Difficulty;
  isCorrect: boolean;
  responseTimeMs: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkoutPage() {
  const router = useRouter();
  const params = useParams();
  const goalId = params.goalId as string;
  const stepId = params.stepId as string;

  // ── Data state
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [step, setStep] = useState<RoadmapStep | null>(null);
  const [nextStepId, setNextStepId] = useState<string | null>(null);

  // ── Game state
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
  const [responses, setResponses] = useState<WorkoutResponse[]>([]);
  const [levelMsg, setLevelMsg] = useState<{ kind: "up" | "down"; text: string } | null>(null);
  const [sustainedAt, setSustainedAt] = useState<{ difficulty: Difficulty; count: number }>({
    difficulty: "easy",
    count: 0,
  });
  const [highestSustained, setHighestSustained] = useState<Difficulty>("easy");

  // ── Results state
  const [starsEarned, setStarsEarned] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  // ── Star balance + celebration state
  const [starBalance, setStarBalance] = useState(0);
  const [displayBalance, setDisplayBalance] = useState(0);
  const [displayStarsEarned, setDisplayStarsEarned] = useState(0);
  const [pillPulse, setPillPulse] = useState(false);

  const questionStartRef = useRef<number>(Date.now());

  // ── Load data ──────────────────────────────────────────────────────────────

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

      // Use /api/me (admin client) to bypass the RLS recursion bug on profiles.
      const meRes = await fetch("/api/me");
      const meJson = meRes.ok ? await meRes.json() : { profile: null };
      const profileData = meJson.profile;

      if (profileData && profileData.role !== "student") {
        window.location.href = "/dashboard";
        return;
      }
      setProfile(profileData);

      // Get current star balance (pre-workout), so the celebration can
      // animate from this starting point once the workout is finished.
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
        setDisplayBalance(balance);
      }

      const { data: stepData } = await supabase
        .from("roadmap_steps")
        .select("*")
        .eq("id", stepId)
        .single();
      if (!stepData) {
        router.push(`/dashboard/student/goals/${goalId}/roadmap`);
        return;
      }
      const typedStep = stepData as RoadmapStep;
      setStep(typedStep);

      const { data: goalData } = await supabase
        .from("goals")
        .select("*")
        .eq("id", goalId)
        .eq("student_id", user.id)
        .single();
      if (goalData) setGoal(goalData as Goal);

      // Find next step
      const { data: allSteps } = await supabase
        .from("roadmap_steps")
        .select("id, step_order")
        .eq("roadmap_id", typedStep.roadmap_id)
        .order("step_order", { ascending: true });
      if (allSteps) {
        const idx = (allSteps as { id: string; step_order: number }[]).findIndex(
          (s) => s.id === stepId
        );
        if (idx !== -1 && idx + 1 < allSteps.length) {
          setNextStepId((allSteps as { id: string }[])[idx + 1].id);
        }
      }

      const qs: RoadmapQuestion[] = typedStep.activities?.questions ?? [];
      if (qs.length === 0) {
        router.push(`/dashboard/student/goals/${goalId}/roadmap`);
        return;
      }
      setQuestions(qs);
      setGamePhase("playing");
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Show first question once questions load ────────────────────────────────

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

  // ── Celebration: count-up + confetti + header pill pulse on completion ────

  useEffect(() => {
    if (gamePhase !== "results") return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setDisplayStarsEarned(starsEarned);
      setDisplayBalance(starBalance + starsEarned);
      return;
    }

    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#D97706", "#028090", "#02C39A", "#7C3AED"],
    });

    setPillPulse(true);
    const pulseTimeout = setTimeout(() => setPillPulse(false), 1200);

    const duration = 1200;
    const startTime = performance.now();
    const startBalance = starBalance;
    const targetBalance = starBalance + starsEarned;
    let frame: number;

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayStarsEarned(Math.round(starsEarned * eased));
      setDisplayBalance(Math.round(startBalance + (targetBalance - startBalance) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(pulseTimeout);
    };
  }, [gamePhase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Question selection ─────────────────────────────────────────────────────

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

  // ── Answer handler ─────────────────────────────────────────────────────────

  function handleAnswer(choiceIndex: number) {
    if (selectedAnswer !== null || !currentQ || gamePhase !== "playing") return;

    setSelectedAnswer(choiceIndex);

    const isCorrect = choiceIndex === currentQ.correct_index;
    const responseTimeMs = Date.now() - questionStartRef.current;

    const newResponse: WorkoutResponse = {
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

    // ── Adaptive difficulty
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

    // ── Track highest sustained difficulty
    const newSustain = {
      difficulty: newDiff,
      count: newDiff === sustainedAt.difficulty ? sustainedAt.count + 1 : 1,
    };
    setSustainedAt(newSustain);
    if (newSustain.count >= 3) {
      const dIdx = DIFF_ORDER.indexOf(newSustain.difficulty);
      const hsIdx = DIFF_ORDER.indexOf(highestSustained);
      if (dIdx > hsIdx) setHighestSustained(newSustain.difficulty);
    }

    // ── Advance after 1.5 s — capture mutable values in local vars
    const capturedQuestions = questions;
    const capturedStep = step;

    setTimeout(() => {
      const hasMore = capturedQuestions.some((_, i) => !newAnswered.has(i));
      if (!hasMore) {
        finaliseResults(newResponses, capturedStep);
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
          finaliseResults(newResponses, capturedStep);
        }
      }
    }, 1500);
  }

  function finaliseResults(allResponses: WorkoutResponse[], capturedStep: RoadmapStep | null) {
    const correct = allResponses.filter((r) => r.isCorrect).length;
    const total = allResponses.length;
    const pct = total > 0 ? (correct / total) * 100 : 0;
    const reward = capturedStep?.star_reward ?? 5;
    const earned =
      pct >= 80 ? reward : pct >= 60 ? Math.ceil(reward * 0.6) : Math.max(1, Math.ceil(reward * 0.3));
    setScore({ correct, total });
    setStarsEarned(earned);
    setGamePhase("results");
  }

  // ── Save results ───────────────────────────────────────────────────────────

  async function saveResults() {
    if (gamePhase !== "results") return;
    setGamePhase("saving");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/dashboard");
      return;
    }

    // 1. Insert all workout responses
    if (responses.length > 0) {
      await supabase.from("workout_responses").insert(
        responses.map((r) => ({
          step_id: stepId,
          user_id: user.id,
          question_index: r.questionIndex,
          difficulty: r.difficulty,
          is_correct: r.isCorrect,
          response_time_ms: r.responseTimeMs,
        }))
      );
    }

    // 2. Mark this step completed
    await supabase
      .from("roadmap_steps")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", stepId);

    // 3. Unlock next step
    if (nextStepId) {
      await supabase
        .from("roadmap_steps")
        .update({ status: "active" })
        .eq("id", nextStepId);
    }

    // 4. Credit stars via the award_stars RPC (SECURITY DEFINER).
    // Direct inserts into star_transactions are blocked by RLS; the RPC
    // validates that the step is completed, belongs to this student, the
    // amount doesn't exceed the step's star_reward, and the step hasn't
    // already been rewarded.
    const { error: awardError } = await supabase.rpc("award_stars", {
      p_user_id: user.id,
      p_amount: starsEarned,
      p_type: "earned",
      p_item_id: null,
      p_step_id: stepId,
    });
    if (awardError) {
      console.error("award_stars failed:", awardError.message);
    }

    setGamePhase("saved");
    setTimeout(() => {
      router.push(`/dashboard/student/goals/${goalId}/roadmap`);
    }, 1500);
  }

  // ── Render: Loading ────────────────────────────────────────────────────────

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
        <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading workout…</div>
      </div>
    );
  }

  const totalQuestions = questions.length;
  const LABELS = ["A", "B", "C", "D"];

  // ── Render: Results ────────────────────────────────────────────────────────

  if (gamePhase === "results" || gamePhase === "saving" || gamePhase === "saved") {
    const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
    const headline = pct >= 80 ? "Excellent Work!" : pct >= 60 ? "Good Job!" : "Keep Practicing!";

    return (
      <div style={{ minHeight: "100vh", background: "#F7F9FC" }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
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

        <main
          style={{
            maxWidth: "560px",
            margin: "0 auto",
            padding: "3rem 1.25rem",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "center" }}>
            {pct >= 80 ? (
              <PartyPopper size={72} color="#D97706" aria-hidden="true" />
            ) : pct >= 60 ? (
              <Star size={72} color="#D97706" fill="#D97706" aria-hidden="true" />
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
          <p style={{ fontSize: "1.1875rem", color: "#374151", marginBottom: "2rem" }}>
            You got <strong>{score.correct}</strong> out of <strong>{score.total}</strong> correct
            ({pct}%)
          </p>

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
              style={{
                fontSize: "3.25rem",
                fontWeight: 700,
                color: "#D97706",
                lineHeight: 1,
                marginBottom: "0.375rem",
              }}
            >
              <Star size={36} color="#D97706" fill="#D97706" aria-hidden="true" />
              {displayStarsEarned}
            </div>
            <div style={{ fontSize: "0.875rem", color: "#94A3B8" }}>
              {pct >= 80 ? "Full reward — amazing!" : pct >= 60 ? "Nice effort!" : "Try again to earn more stars!"}
            </div>
          </div>

          {/* Difficulty card */}
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
            <div className="flex items-center justify-center gap-2" style={{ fontSize: "1.375rem", fontWeight: 700, color: "#028090" }}>
              {diffLabel(highestSustained)}
              <DiffIcon d={highestSustained} size={20} />
              <DiffStars d={highestSustained} size={16} />
            </div>
          </div>

          {/* Action buttons */}
          {gamePhase === "saving" || gamePhase === "saved" ? (
            <div
              className="flex items-center justify-center gap-2"
              style={{
                color: "#028090",
                fontSize: "1.0625rem",
                fontWeight: 600,
              }}
            >
              {gamePhase === "saved" ? (
                <>
                  <Check size={18} aria-hidden="true" />
                  Saved! Returning to roadmap…
                </>
              ) : (
                "Saving results…"
              )}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                alignItems: "center",
              }}
            >
              <button
                onClick={saveResults}
                style={{
                  background: "linear-gradient(135deg, #028090, #02C39A)",
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
                {nextStepId ? "Finish & Unlock Next Step →" : "Finish Workout"}
              </button>
              <Link
                href={`/dashboard/student/goals/${goalId}/roadmap`}
                style={{
                  color: "#028090",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                ← Back to Roadmap
              </Link>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── Render: Playing ────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F7F9FC",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
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
            {step?.title ?? "Workout"}
          </div>
          <div style={{ color: "#94A3B8", fontSize: "0.6875rem", marginTop: "1px" }}>
            {goal?.friendly_text?.slice(0, 55)}
            {(goal?.friendly_text?.length ?? 0) > 55 ? "…" : ""}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          {/* Star balance */}
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

          {/* Difficulty indicator */}
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

          {/* Question progress */}
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

      {/* Progress bar */}
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

      {/* Level-up toast */}
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

      {/* Main content */}
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
            {/* Reading passage (if present) */}
            {step?.activities?.passage?.text && (
              <div
                style={{
                  background: "white",
                  borderRadius: "16px",
                  padding: "1.25rem 1.5rem",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  marginBottom: "1rem",
                  width: "100%",
                  borderLeft: "4px solid #028090",
                }}
              >
                <div className="flex items-center justify-between gap-2" style={{ marginBottom: "0.5rem" }}>
                  <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                    <BookOpen size={16} color="#028090" aria-hidden="true" />
                    <span
                      style={{
                        fontFamily: "var(--font-nunito), sans-serif",
                        fontWeight: 800,
                        color: "#0C2340",
                        fontSize: "1rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {step.activities.passage.title || "Reading Passage"}
                    </span>
                  </div>
                  <ReadAloud
                    text={`${step.activities.passage.title}. ${step.activities.passage.text}`}
                    label="Read passage"
                  />
                </div>
                <div
                  style={{
                    maxHeight: "220px",
                    overflowY: "auto",
                    fontSize: "1rem",
                    color: "#374151",
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {step.activities.passage.text}
                </div>
              </div>
            )}
            {/* Question card */}
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
              <div className="flex items-start justify-between gap-3">
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
                <ReadAloud
                  text={questionSpeech(currentQ.question, currentQ.options)}
                  label=""
                />
              </div>

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
                  <span style={{ flex: 1 }}>{currentQ.hint}</span>
                  <ReadAloud text={currentQ.hint} label="" color="#92400E" />
                </div>
              )}
            </div>

            {/* Hint trigger */}
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

            {/* Answer choices */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.625rem",
                width: "100%",
              }}
            >
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

            {/* Inline feedback */}
            {selectedAnswer !== null && (
              <div
                className="flex items-center gap-1"
                style={{
                  marginTop: "1rem",
                  fontSize: "1rem",
                  fontWeight: 700,
                  color:
                    selectedAnswer === currentQ.correct_index ? "#059669" : "#DC2626",
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
