"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Goal, RoadmapStep, RoadmapQuestion } from "@/types";

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
function diffStars(d: Difficulty): string {
  return d === "easy" ? "⭐" : d === "medium" ? "⭐⭐" : "⭐⭐⭐";
}
function diffLabel(d: Difficulty): string {
  return d === "easy" ? "Beginner" : d === "medium" ? "Intermediate" : "Advanced";
}
function diffEmoji(d: Difficulty): string {
  return d === "easy" ? "🌱" : d === "medium" ? "🌟" : "🚀";
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
  const [levelMsg, setLevelMsg] = useState<string | null>(null);
  const [sustainedAt, setSustainedAt] = useState<{ difficulty: Difficulty; count: number }>({
    difficulty: "easy",
    count: 0,
  });
  const [highestSustained, setHighestSustained] = useState<Difficulty>("easy");

  // ── Results state
  const [starsEarned, setStarsEarned] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  const questionStartRef = useRef<number>(Date.now());

  // ── Load data ──────────────────────────────────────────────────────────────

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
        setLevelMsg("🚀 Level Up!");
        setTimeout(() => setLevelMsg(null), 2000);
      }
    } else if (incorrectCount >= 2) {
      const down = lowerLevel(currentDifficulty);
      if (down !== currentDifficulty) {
        newDiff = down;
        setLevelMsg("Let's slow down a bit 📚");
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
      router.push("/auth/login");
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

    // 4. Credit stars
    await supabase.from("star_transactions").insert({
      user_id: user.id,
      amount: starsEarned,
      type: "earned",
    });

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
    const celebration = pct >= 80 ? "🎉" : pct >= 60 ? "⭐" : "💪";
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
          <span style={{ color: "#94A3B8", fontSize: "0.875rem" }}>{profile?.full_name}</span>
        </header>

        <main
          style={{
            maxWidth: "560px",
            margin: "0 auto",
            padding: "3rem 1.25rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "5rem", marginBottom: "1rem", lineHeight: 1 }}>
            {celebration}
          </div>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "2rem",
              fontWeight: 700,
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
              style={{
                fontSize: "3.25rem",
                fontWeight: 700,
                color: "#D97706",
                lineHeight: 1,
                marginBottom: "0.375rem",
              }}
            >
              ⭐ {starsEarned}
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
            <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "#028090" }}>
              {diffLabel(highestSustained)} {diffEmoji(highestSustained)} {diffStars(highestSustained)}
            </div>
          </div>

          {/* Action buttons */}
          {gamePhase === "saving" || gamePhase === "saved" ? (
            <div
              style={{
                color: "#028090",
                fontSize: "1.0625rem",
                fontWeight: 600,
              }}
            >
              {gamePhase === "saved" ? "✓ Saved! Returning to roadmap…" : "Saving results…"}
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
              fontFamily: "Georgia, serif",
              color: "#F7F9FC",
              fontSize: "1rem",
              fontWeight: 700,
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
          {/* Difficulty indicator */}
          <div
            style={{
              background: "rgba(255,255,255,0.12)",
              borderRadius: "6px",
              padding: "0.25rem 0.625rem",
              fontSize: "0.8125rem",
              color: "white",
              fontWeight: 600,
            }}
          >
            Level: {diffStars(currentDifficulty)}
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
          {levelMsg}
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
              <p
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#0C2340",
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                {currentQ.question}
              </p>

              {showHint && (
                <div
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
                  💡 {currentQ.hint}
                </div>
              )}
            </div>

            {/* Hint trigger */}
            {!showHint && selectedAnswer === null && (
              <button
                onClick={() => setShowHint(true)}
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
                Need a hint? 💡
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
                      <span style={{ fontSize: "1.125rem", flexShrink: 0 }}>✓</span>
                    )}
                    {showingFeedback && isSelected && !isCorrectAnswer && (
                      <span style={{ fontSize: "1.125rem", flexShrink: 0 }}>✗</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Inline feedback */}
            {selectedAnswer !== null && (
              <div
                style={{
                  marginTop: "1rem",
                  fontSize: "1rem",
                  fontWeight: 700,
                  color:
                    selectedAnswer === currentQ.correct_index ? "#059669" : "#DC2626",
                }}
              >
                {selectedAnswer === currentQ.correct_index
                  ? "✓ Correct!"
                  : "✗ Incorrect — see the correct answer above"}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
