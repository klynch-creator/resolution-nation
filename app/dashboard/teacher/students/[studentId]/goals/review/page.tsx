"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, GoalPriority, GoalSubject } from "@/types";

const SUBJECTS: GoalSubject[] = [
  "ELA",
  "Math",
  "Science",
  "Social Studies",
  "Writing",
  "Other",
];

const PRIORITIES: { value: GoalPriority; label: string; color: string; bg: string }[] = [
  { value: "critical", label: "Critical", color: "#DC2626", bg: "#FEF2F2" },
  { value: "high", label: "High", color: "#D97706", bg: "#FFF7ED" },
  { value: "medium", label: "Medium", color: "#2563EB", bg: "#EFF6FF" },
];

interface ReviewGoal {
  id: string;
  friendly_text: string;
  standard_code: string;
  subject: GoalSubject;
  priority: GoalPriority;
  source: string;
  approved: boolean;
}

type PageState = "generating" | "review" | "saving" | "error";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "0.25rem",
};

function GoalReviewCard({
  goal,
  index,
  onChange,
  onRemove,
}: {
  goal: ReviewGoal;
  index: number;
  onChange: (index: number, updated: ReviewGoal) => void;
  onRemove: (index: number) => void;
}) {
  function update(field: keyof ReviewGoal, value: string | boolean) {
    onChange(index, { ...goal, [field]: value });
  }

  const priorityInfo = PRIORITIES.find((p) => p.value === goal.priority)!;

  return (
    <div
      className="card"
      style={{
        padding: "1.5rem",
        borderLeft: `4px solid ${priorityInfo.color}`,
        opacity: goal.approved ? 1 : 0.5,
        transition: "opacity 0.15s",
      }}
    >
      {/* Approve / Remove row */}
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: "1rem" }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => update("approved", !goal.approved)}
            style={{
              background: goal.approved ? "#02C39A" : "#E2E8F0",
              color: goal.approved ? "white" : "#64748B",
              border: "none",
              borderRadius: "100px",
              padding: "0.25rem 0.875rem",
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              transition: "background 0.15s",
            }}
          >
            {goal.approved ? "✅ Approved" : "Approve"}
          </button>
        </div>
        <button
          onClick={() => onRemove(index)}
          style={{
            background: "none",
            border: "none",
            color: "#DC2626",
            fontSize: "0.8125rem",
            fontWeight: 600,
            cursor: "pointer",
            padding: "0.25rem 0.5rem",
          }}
        >
          🗑️ Remove
        </button>
      </div>

      {/* "I can" text */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>"I can" statement</label>
        <textarea
          value={goal.friendly_text}
          onChange={(e) => update("friendly_text", e.target.value)}
          rows={2}
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "1rem",
            lineHeight: 1.5,
            color: "#0C2340",
            padding: "0.625rem 0.75rem",
            borderRadius: "8px",
            border: "1.5px solid #E2E8F0",
            width: "100%",
            background: "white",
            resize: "vertical",
          }}
        />
      </div>

      {/* Subject + Priority row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
          marginBottom: "0.75rem",
        }}
      >
        <div>
          <label style={labelStyle}>Subject</label>
          <select
            value={goal.subject}
            onChange={(e) => update("subject", e.target.value)}
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Priority</label>
          <select
            value={goal.priority}
            onChange={(e) => update("priority", e.target.value)}
            style={{
              color: priorityInfo.color,
              fontWeight: 600,
            }}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Standard code + Source row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
        }}
      >
        <div>
          <label style={labelStyle}>Standard Code (optional)</label>
          <input
            type="text"
            value={goal.standard_code}
            onChange={(e) => update("standard_code", e.target.value)}
            placeholder="e.g. RI.3.2"
          />
        </div>
        <div>
          <label style={labelStyle}>
            Source{" "}
            <span style={{ fontWeight: 400, color: "#94A3B8" }}>(read-only)</span>
          </label>
          <div
            style={{
              padding: "0.5625rem 0.75rem",
              background: "#F8FAFC",
              border: "1.5px solid #E2E8F0",
              borderRadius: "8px",
              fontSize: "0.875rem",
              color: "#64748B",
            }}
          >
            {goal.source || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoalsReviewContent() {
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const uploadId = searchParams.get("uploadId");

  const [pageState, setPageState] = useState<PageState>("generating");
  const [student, setStudent] = useState<Profile | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [existingGoalCount, setExistingGoalCount] = useState(0);
  const [showExistingWarning, setShowExistingWarning] = useState(false);
  const [goals, setGoals] = useState<ReviewGoal[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: teacherProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!teacherProfile || teacherProfile.role !== "teacher") {
        router.push("/auth/login");
        return;
      }

      setTeacherId(user.id);

      const { data: studentProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", studentId)
        .single();

      if (!studentProfile) {
        router.push("/dashboard/teacher");
        return;
      }

      setStudent(studentProfile);

      // Check existing goals
      const { data: existingGoals } = await supabase
        .from("goals")
        .select("id")
        .eq("student_id", studentId)
        .eq("teacher_id", user.id);

      const count = existingGoals?.length ?? 0;
      setExistingGoalCount(count);

      if (!uploadId) {
        setErrorMsg("No upload selected. Please confirm a report card first.");
        setPageState("error");
        return;
      }

      if (count > 0) {
        setShowExistingWarning(true);
      } else {
        await generateGoals(user.id, studentProfile.grade ?? null);
      }
    }
    init();
  }, [studentId, uploadId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generateGoals(tid: string, grade: string | null) {
    setShowExistingWarning(false);
    setPageState("generating");
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const { data: profileData } = await supabase
        .from("profiles")
        .select("grade")
        .eq("id", studentId)
        .single();

      const response = await fetch("/api/generate-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          studentId,
          studentGrade: grade ?? profileData?.grade ?? null,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.goals) {
        throw new Error(result.error ?? "Goal generation failed — try again.");
      }

      const reviewGoals: ReviewGoal[] = result.goals.map(
        (
          g: {
            friendly_text: string;
            standard_code?: string | null;
            subject: GoalSubject;
            priority: GoalPriority;
            source?: string;
          },
          i: number
        ) => ({
          id: `ai-${i}`,
          friendly_text: g.friendly_text,
          standard_code: g.standard_code ?? "",
          subject: g.subject,
          priority: g.priority,
          source: g.source ?? "",
          approved: true,
        })
      );

      setGoals(reviewGoals);
      setPageState("review");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMsg(msg);
      setPageState("error");
    }
  }

  function handleGoalChange(index: number, updated: ReviewGoal) {
    setGoals((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }

  function handleGoalRemove(index: number) {
    setGoals((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddCustomGoal() {
    const newGoal: ReviewGoal = {
      id: `custom-${Date.now()}`,
      friendly_text: "",
      standard_code: "",
      subject: "ELA",
      priority: "medium",
      source: "Teacher-created",
      approved: true,
    };
    setGoals((prev) => [...prev, newGoal]);
  }

  async function handleSave() {
    const approved = goals.filter((g) => g.approved && g.friendly_text.trim());
    if (approved.length === 0) {
      setErrorMsg("Please approve at least one goal before saving.");
      return;
    }

    setPageState("saving");
    setErrorMsg(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const inserts = approved.map((g) => ({
      student_id: studentId,
      teacher_id: user.id,
      friendly_text: g.friendly_text.trim(),
      subject: g.subject,
      priority: g.priority,
      standard_code: g.standard_code.trim() || null,
      source: g.source.trim() || null,
      is_personal: false,
    }));

    const { error } = await supabase.from("goals").insert(inserts);

    if (error) {
      setErrorMsg(error.message);
      setPageState("review");
      return;
    }

    const studentName = student?.full_name ?? "student";
    setToast(`${approved.length} goal${approved.length !== 1 ? "s" : ""} saved for ${studentName}!`);

    setTimeout(() => {
      router.push(`/dashboard/teacher/students/${studentId}/goals`);
    }, 1500);
  }

  const approvedCount = goals.filter((g) => g.approved && g.friendly_text.trim()).length;

  // Loading state
  if (pageState === "generating") {
    return (
      <PageShell student={student} studentId={studentId}>
        <div className="card" style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✨</div>
          <p
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.5rem",
            }}
          >
            Generating personalized goals…
          </p>
          <p style={{ color: "#64748B", fontSize: "0.9375rem", marginBottom: "1.5rem" }}>
            This usually takes 10–15 seconds
          </p>
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "4px solid #E2E8F0",
              borderTopColor: "#028090",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </PageShell>
    );
  }

  // Existing goals warning
  if (showExistingWarning) {
    return (
      <PageShell student={student} studentId={studentId}>
        <div className="card" style={{ padding: "2rem", maxWidth: "520px", margin: "0 auto" }}>
          <div style={{ fontSize: "2rem", marginBottom: "1rem", textAlign: "center" }}>⚠️</div>
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.75rem",
              textAlign: "center",
            }}
          >
            Student already has {existingGoalCount} goal{existingGoalCount !== 1 ? "s" : ""}
          </h2>
          <p
            style={{
              color: "#64748B",
              fontSize: "0.9375rem",
              marginBottom: "1.5rem",
              textAlign: "center",
            }}
          >
            Generating more goals will add to the existing ones. Do you want to continue?
          </p>
          <div className="flex gap-3">
            <Link
              href={`/dashboard/teacher/students/${studentId}/goals`}
              className="btn-secondary"
              style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
            >
              Cancel
            </Link>
            <button
              onClick={async () => {
                const supabase = createClient();
                const { data: p } = await supabase
                  .from("profiles")
                  .select("grade")
                  .eq("id", studentId)
                  .single();
                await generateGoals(teacherId ?? "", p?.grade ?? null);
              }}
              className="btn-primary"
              style={{ flex: 2 }}
            >
              ✨ Generate More Goals
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  // Error state
  if (pageState === "error") {
    return (
      <PageShell student={student} studentId={studentId}>
        <div
          style={{
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: "12px",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>❌</div>
          <p style={{ fontWeight: 600, color: "#DC2626", marginBottom: "0.5rem" }}>
            {errorMsg ?? "Something went wrong."}
          </p>
          <div className="flex gap-3 justify-center" style={{ marginTop: "1.25rem" }}>
            <Link
              href={`/dashboard/teacher/students/${studentId}/goals`}
              className="btn-secondary"
              style={{ textDecoration: "none" }}
            >
              Back to Goals
            </Link>
            <Link
              href={`/dashboard/teacher/students/${studentId}/upload`}
              className="btn-primary"
              style={{ textDecoration: "none" }}
            >
              Upload Report Card
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  // Review state
  return (
    <PageShell student={student} studentId={studentId}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "2rem",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#02C39A",
            color: "white",
            padding: "0.875rem 1.5rem",
            borderRadius: "100px",
            fontWeight: 600,
            fontSize: "0.9375rem",
            zIndex: 100,
            boxShadow: "0 4px 20px rgba(2, 195, 154, 0.4)",
          }}
        >
          ✅ {toast}
        </div>
      )}

      {/* Header banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #028090, #02C39A)",
          borderRadius: "12px",
          padding: "1.25rem 1.5rem",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div style={{ fontSize: "2rem" }}>✨</div>
        <div>
          <p
            style={{
              fontWeight: 700,
              color: "white",
              fontSize: "1rem",
              marginBottom: "0.125rem",
            }}
          >
            AI generated these goals — review and approve each one
          </p>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.875rem" }}>
            Edit the text, subject, or priority before saving. Remove any that don't apply.
          </p>
        </div>
      </div>

      {/* Counter + error */}
      <div
        className="flex items-center justify-between flex-wrap gap-3"
        style={{ marginBottom: "1.25rem" }}
      >
        <p style={{ fontWeight: 600, color: "#374151", fontSize: "0.9375rem" }}>
          {approvedCount} of {goals.length} goal{goals.length !== 1 ? "s" : ""} approved
        </p>
        {errorMsg && (
          <p style={{ color: "#DC2626", fontSize: "0.875rem" }}>{errorMsg}</p>
        )}
      </div>

      {/* Goal cards */}
      <div className="flex flex-col gap-4" style={{ marginBottom: "1.5rem" }}>
        {goals.map((goal, i) => (
          <GoalReviewCard
            key={goal.id}
            goal={goal}
            index={i}
            onChange={handleGoalChange}
            onRemove={handleGoalRemove}
          />
        ))}
      </div>

      {/* Add custom goal button */}
      <button
        onClick={handleAddCustomGoal}
        style={{
          display: "block",
          width: "100%",
          padding: "0.875rem",
          border: "2px dashed #CBD5E1",
          borderRadius: "12px",
          background: "transparent",
          color: "#64748B",
          fontSize: "0.9375rem",
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: "1.5rem",
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "#028090";
          (e.currentTarget as HTMLButtonElement).style.color = "#028090";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "#CBD5E1";
          (e.currentTarget as HTMLButtonElement).style.color = "#64748B";
        }}
      >
        + Add Custom Goal
      </button>

      {/* Save button */}
      <div className="flex gap-3">
        <Link
          href={`/dashboard/teacher/students/${studentId}/goals`}
          className="btn-secondary"
          style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
        >
          Cancel
        </Link>
        <button
          onClick={handleSave}
          disabled={pageState === "saving" || approvedCount === 0}
          className="btn-primary"
          style={{
            flex: 2,
            padding: "0.875rem",
            fontSize: "1rem",
            opacity: approvedCount === 0 ? 0.5 : 1,
            cursor: approvedCount === 0 ? "not-allowed" : "pointer",
          }}
        >
          {pageState === "saving"
            ? "Saving…"
            : `Save ${approvedCount} Approved Goal${approvedCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    </PageShell>
  );
}

function PageShell({
  student,
  studentId,
  children,
}: {
  student: Profile | null;
  studentId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: "#F7F9FC" }}>
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
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/teacher"
            style={{ color: "#94A3B8", fontSize: "0.875rem", textDecoration: "none" }}
          >
            ← Dashboard
          </Link>
          <span style={{ color: "#475569" }}>/</span>
          <Link
            href={`/dashboard/teacher/students/${studentId}/goals`}
            style={{ color: "#94A3B8", fontSize: "0.875rem", textDecoration: "none" }}
          >
            {student?.full_name ?? "Student"}
          </Link>
          <span style={{ color: "#475569" }}>/</span>
          <span
            style={{
              fontFamily: "Georgia, serif",
              color: "#F7F9FC",
              fontSize: "1rem",
              fontWeight: 700,
            }}
          >
            Review Generated Goals
          </span>
        </div>
      </header>

      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.25rem",
            }}
          >
            {student?.full_name}
          </h1>
          {student?.grade && (
            <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>Grade {student.grade}</p>
          )}
        </div>
        {children}
      </main>
    </div>
  );
}

export default function GoalsReviewPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: "#F7F9FC" }}
        >
          <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading…</div>
        </div>
      }
    >
      <GoalsReviewContent />
    </Suspense>
  );
}
