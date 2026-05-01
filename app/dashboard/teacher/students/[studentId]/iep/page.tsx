"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, IepGoal, IepArea, IepProgressLevel } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const IEP_AREAS: IepArea[] = [
  "ELA", "Math", "Writing", "Behavior", "Social-Emotional", "Other",
];

const TIME_PERIODS = ["Weekly", "Monthly", "Quarterly"];

const PROGRESS_LEVELS: { value: IepProgressLevel; color: string; bg: string }[] = [
  { value: "Emerging", color: "#DC2626", bg: "#FEF2F2" },
  { value: "Developing", color: "#D97706", bg: "#FFF7ED" },
  { value: "Approaching", color: "#2563EB", bg: "#EFF6FF" },
  { value: "Meeting", color: "#059669", bg: "#ECFDF5" },
  { value: "Exceeding", color: "#7C3AED", bg: "#F5F3FF" },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const label: React.CSSProperties = {
  display: "block",
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "0.375rem",
};

function navLink(active: boolean): React.CSSProperties {
  return {
    color: active ? "#2563EB" : "#64748B",
    fontWeight: active ? 600 : 400,
    fontSize: "0.9375rem",
    padding: "0 1rem",
    height: "100%",
    display: "flex",
    alignItems: "center",
    borderBottom: active ? "2px solid #2563EB" : "2px solid transparent",
    textDecoration: "none",
    whiteSpace: "nowrap",
  };
}

function progressBadge(level: IepProgressLevel) {
  const s = PROGRESS_LEVELS.find((p) => p.value === level) ?? PROGRESS_LEVELS[0];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: "100px",
        padding: "0.25rem 0.75rem",
        fontSize: "0.8125rem",
        fontWeight: 700,
      }}
    >
      {level}
    </span>
  );
}

// ─── Generated IEP goal (pre-save) ───────────────────────────────────────────

interface DraftIepGoal {
  goal_text: string;
  area: IepArea;
  baseline: string;
  target: string;
  measurement: string;
  standard: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function IepPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params.studentId as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [student, setStudent] = useState<Profile | null>(null);
  const [iepGoals, setIepGoals] = useState<IepGoal[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Tab state
  const [activeTab, setActiveTab] = useState<"generate" | "notes" | "parent">("generate");

  // ── Goal Generator form
  const [genNeeds, setGenNeeds] = useState("");
  const [genSubject, setGenSubject] = useState<IepArea>("ELA");
  const [genPerformance, setGenPerformance] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [draftGoals, setDraftGoals] = useState<DraftIepGoal[]>([]);
  const [savingGoalIdx, setSavingGoalIdx] = useState<number | null>(null);

  // ── Progress Note form
  const [noteGoalId, setNoteGoalId] = useState<string>("");
  const [notePeriod, setNotePeriod] = useState("Monthly");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteResult, setNoteResult] = useState<{
    progress_note: string;
    progress_level: IepProgressLevel;
    data_points: string[];
  } | null>(null);
  const [noteApproved, setNoteApproved] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [copiedNote, setCopiedNote] = useState(false);

  // ── Parent Update
  const [parentLoading, setParentLoading] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);
  const [parentUpdate, setParentUpdate] = useState<{ english: string; spanish: string } | null>(null);
  const [parentLang, setParentLang] = useState<"english" | "spanish">("english");
  const [copiedParent, setCopiedParent] = useState(false);

  const loadIepGoals = useCallback(async (supabase: ReturnType<typeof createClient>, teacherId: string) => {
    const { data } = await supabase
      .from("iep_goals")
      .select("*")
      .eq("student_id", studentId)
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });
    setIepGoals((data as IepGoal[]) ?? []);
    if (data && data.length > 0 && !noteGoalId) {
      setNoteGoalId(data[0].id);
    }
  }, [studentId, noteGoalId]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }

      const { data: profileData } = await supabase
        .from("profiles").select("*").eq("id", user.id).single();
      if (!profileData || profileData.role !== "teacher") {
        router.push("/auth/login"); return;
      }
      setProfile(profileData);

      const { data: studentData } = await supabase
        .from("profiles").select("*").eq("id", studentId).single();
      if (studentData) setStudent(studentData);

      await loadIepGoals(supabase, user.id);
      setLoading(false);
    }
    load();
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generate IEP Goals ──────────────────────────────────────────────────────

  async function handleGenerateGoals(e: React.FormEvent) {
    e.preventDefault();
    setGenLoading(true);
    setGenError(null);
    setDraftGoals([]);
    try {
      const res = await fetch("/api/generate-iep-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: student?.grade ?? "Unknown",
          subject: genSubject,
          needs: genNeeds,
          currentPerformance: genPerformance || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error ?? "Generation failed."); return; }
      setDraftGoals(data.goals);
    } catch {
      setGenError("Network error — please try again.");
    } finally {
      setGenLoading(false);
    }
  }

  async function saveGoal(idx: number) {
    const goal = draftGoals[idx];
    setSavingGoalIdx(idx);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("iep_goals").insert({
      student_id: studentId,
      teacher_id: user.id,
      goal_text: goal.goal_text,
      area: goal.area,
      baseline: goal.baseline || null,
      target: goal.target || null,
      measurement: goal.measurement || null,
      standard: goal.standard || null,
    });

    if (!error) {
      await loadIepGoals(supabase, user.id);
      setDraftGoals((prev) => prev.filter((_, i) => i !== idx));
    }
    setSavingGoalIdx(null);
  }

  function updateDraft(idx: number, field: keyof DraftIepGoal, value: string) {
    setDraftGoals((prev) =>
      prev.map((g, i) => (i === idx ? { ...g, [field]: value } : g))
    );
  }

  async function copyGoalText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  // ── Generate Progress Note ──────────────────────────────────────────────────

  async function handleGenerateNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteGoalId) { setNoteError("Select an IEP goal first."); return; }
    setNoteLoading(true);
    setNoteError(null);
    setNoteResult(null);
    setNoteApproved(false);
    const selectedGoal = iepGoals.find((g) => g.id === noteGoalId);
    try {
      const res = await fetch("/api/generate-progress-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalText: selectedGoal?.goal_text ?? "",
          timePeriod: notePeriod,
          studentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setNoteError(data.error ?? "Generation failed."); return; }
      setNoteResult(data);
    } catch {
      setNoteError("Network error — please try again.");
    } finally {
      setNoteLoading(false);
    }
  }

  async function approveAndSaveNote() {
    if (!noteResult || !noteGoalId) return;
    setNoteSaving(true);
    const supabase = createClient();
    const selectedGoal = iepGoals.find((g) => g.id === noteGoalId);
    if (!selectedGoal) { setNoteSaving(false); return; }

    const newNote = {
      id: crypto.randomUUID(),
      progress_note: noteResult.progress_note,
      progress_level: noteResult.progress_level,
      data_points: noteResult.data_points,
      created_at: new Date().toISOString(),
    };

    const updatedNotes = [...(selectedGoal.progress_notes ?? []), newNote];
    await supabase
      .from("iep_goals")
      .update({ progress_notes: updatedNotes })
      .eq("id", noteGoalId);

    const { data: { user } } = await (createClient()).auth.getUser();
    if (user) await loadIepGoals(createClient(), user.id);

    setNoteApproved(true);
    setNoteSaving(false);
  }

  async function copyNote() {
    if (!noteResult) return;
    await navigator.clipboard.writeText(noteResult.progress_note);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2000);
  }

  function printNote() {
    window.print();
  }

  // ── Parent Update ───────────────────────────────────────────────────────────

  async function handleDraftParentUpdate() {
    setParentLoading(true);
    setParentError(null);
    setParentUpdate(null);
    try {
      const res = await fetch("/api/draft-parent-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, studentName: student?.full_name }),
      });
      const data = await res.json();
      if (!res.ok) { setParentError(data.error ?? "Generation failed."); return; }
      setParentUpdate(data);
    } catch {
      setParentError("Network error — please try again.");
    } finally {
      setParentLoading(false);
    }
  }

  async function copyParentUpdate() {
    if (!parentUpdate) return;
    await navigator.clipboard.writeText(parentUpdate[parentLang]);
    setCopiedParent(true);
    setTimeout(() => setCopiedParent(false), 2000);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F7F9FC" }}>
        <div style={{ color: "#2563EB", fontSize: "1.125rem" }}>Loading…</div>
      </div>
    );
  }

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-doc {
            font-family: Georgia, serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #000;
            margin: 1in;
          }
        }
      `}</style>

      <div className="min-h-screen" style={{ background: "#F7F9FC" }}>
        {/* Header */}
        <header
          className="no-print"
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
            <span style={{ fontFamily: "Georgia, serif", color: "#F7F9FC", fontSize: "1.25rem", fontWeight: 700 }}>
              Resolution Nation
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span style={{ color: "#94A3B8", fontSize: "0.875rem" }}>{profile?.full_name}</span>
            <button
              onClick={handleSignOut}
              style={{ color: "#94A3B8", fontSize: "0.875rem", background: "none", border: "none", cursor: "pointer" }}
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Sub-nav */}
        <nav
          className="no-print"
          style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "0 2rem" }}
        >
          <div style={{ maxWidth: "1000px", margin: "0 auto", display: "flex", height: "48px", alignItems: "stretch", overflowX: "auto" }}>
            <Link href="/dashboard/teacher" style={navLink(false)}>Dashboard</Link>
            <Link href="/dashboard/teacher/students" style={navLink(false)}>My Students</Link>
            <Link href={`/dashboard/teacher/students/${studentId}/goals`} style={navLink(false)}>Goals</Link>
            <Link href={`/dashboard/teacher/students/${studentId}/upload`} style={navLink(false)}>Upload</Link>
            <Link href={`/dashboard/teacher/students/${studentId}/analytics`} style={navLink(false)}>Analytics</Link>
            <Link href={`/dashboard/teacher/students/${studentId}/iep`} style={navLink(true)}>📋 IEP Tools</Link>
          </div>
        </nav>

        <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem 1.5rem" }}>
          {/* Student header */}
          <div className="flex items-center gap-4 mb-6 flex-wrap justify-between no-print">
            <div className="flex items-center gap-4">
              <div
                style={{
                  width: "52px", height: "52px", borderRadius: "50%",
                  background: "linear-gradient(135deg, #2563EB, #7C3AED)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white", fontWeight: 700, fontSize: "1.25rem", flexShrink: 0,
                }}
              >
                {student?.full_name?.charAt(0) ?? "?"}
              </div>
              <div>
                <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.625rem", fontWeight: 700, color: "#0C2340", marginBottom: "0.125rem" }}>
                  {student?.full_name ?? "Student"} — IEP Tools
                </h1>
                <p style={{ fontSize: "0.9375rem", color: "#64748B" }}>
                  {iepGoals.length} IEP goal{iepGoals.length !== 1 ? "s" : ""} saved
                  {student?.grade ? ` · Grade ${student.grade}` : ""}
                </p>
              </div>
            </div>
          </div>

          {/* Tab navigation */}
          <div
            className="no-print"
            style={{
              display: "flex", gap: "0.25rem", marginBottom: "1.5rem",
              background: "#E2E8F0", borderRadius: "10px", padding: "0.25rem",
            }}
          >
            {(["generate", "notes", "parent"] as const).map((tab) => {
              const labels: Record<string, string> = {
                generate: "🎯 Generate Goals",
                notes: "📝 Progress Notes",
                parent: "💬 Parent Update",
              };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    padding: "0.5rem 1rem",
                    borderRadius: "8px",
                    border: "none",
                    background: activeTab === tab ? "white" : "transparent",
                    color: activeTab === tab ? "#0C2340" : "#64748B",
                    fontWeight: activeTab === tab ? 600 : 400,
                    fontSize: "0.9375rem",
                    cursor: "pointer",
                    boxShadow: activeTab === tab ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    transition: "all 0.15s",
                  }}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* ── Tab: Generate Goals ─────────────────────────────────────────────── */}
          {activeTab === "generate" && (
            <div>
              <div className="flex gap-6" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                {/* Input form */}
                <div
                  className="card"
                  style={{ borderTop: "4px solid #2563EB" }}
                >
                  <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.125rem", fontWeight: 700, color: "#0C2340", marginBottom: "1.25rem" }}>
                    Generate IEP Goals
                  </h2>

                  <form onSubmit={handleGenerateGoals} className="flex flex-col gap-4">
                    <div>
                      <label style={label}>Student</label>
                      <div
                        style={{
                          padding: "0.5rem 0.75rem", background: "#F8FAFC",
                          border: "1.5px solid #E2E8F0", borderRadius: "8px",
                          fontSize: "0.9375rem", color: "#64748B",
                        }}
                      >
                        {student?.full_name ?? "—"} {student?.grade ? `· Grade ${student.grade}` : ""}
                      </div>
                    </div>

                    <div>
                      <label style={label}>Subject Area *</label>
                      <select
                        value={genSubject}
                        onChange={(e) => setGenSubject(e.target.value as IepArea)}
                      >
                        {IEP_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={label}>Describe the student&apos;s needs *</label>
                      <textarea
                        value={genNeeds}
                        onChange={(e) => setGenNeeds(e.target.value)}
                        placeholder="e.g. struggles with reading comprehension, can't identify main idea, reads at 1st grade level but is in 3rd grade"
                        required
                        rows={4}
                      />
                    </div>

                    <div>
                      <label style={label}>Current performance level (optional)</label>
                      <textarea
                        value={genPerformance}
                        onChange={(e) => setGenPerformance(e.target.value)}
                        placeholder="e.g. scored 1/4 on district benchmark, reading Lexile 400L"
                        rows={2}
                      />
                    </div>

                    {genError && (
                      <div
                        style={{
                          background: "#FEF2F2", border: "1px solid #FCA5A5",
                          borderRadius: "8px", padding: "0.75rem 1rem",
                          color: "#DC2626", fontSize: "0.875rem",
                        }}
                      >
                        {genError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={genLoading}
                      className="btn-primary"
                      style={{ width: "100%", background: genLoading ? "#E2E8F0" : "linear-gradient(135deg, #2563EB, #7C3AED)", border: "none" }}
                    >
                      {genLoading ? "✨ Generating…" : "✨ Generate IEP Goals"}
                    </button>
                  </form>
                </div>

                {/* Right: draft goals or saved goals */}
                <div>
                  {draftGoals.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "1rem", fontWeight: 700, color: "#0C2340" }}>
                          Generated Goals — Review & Edit
                        </h3>
                        <button
                          onClick={handleGenerateGoals as unknown as React.MouseEventHandler}
                          style={{
                            background: "none", border: "1.5px solid #2563EB",
                            color: "#2563EB", borderRadius: "8px", padding: "0.375rem 0.75rem",
                            fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          ↻ Regenerate
                        </button>
                      </div>
                      {draftGoals.map((goal, idx) => (
                        <DraftGoalCard
                          key={idx}
                          goal={goal}
                          idx={idx}
                          saving={savingGoalIdx === idx}
                          onUpdate={updateDraft}
                          onSave={() => saveGoal(idx)}
                          onCopy={() => copyGoalText(goal.goal_text)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div>
                      <h3 style={{ fontFamily: "Georgia, serif", fontSize: "1rem", fontWeight: 700, color: "#0C2340", marginBottom: "1rem" }}>
                        Saved IEP Goals ({iepGoals.length})
                      </h3>
                      {iepGoals.length === 0 ? (
                        <div
                          className="card"
                          style={{ textAlign: "center", padding: "2rem", color: "#64748B", border: "2px dashed #E2E8F0", background: "transparent" }}
                        >
                          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📋</div>
                          <p style={{ fontSize: "0.9375rem" }}>
                            No IEP goals yet. Use the form to generate your first goals.
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {iepGoals.map((goal) => (
                            <SavedGoalCard key={goal.id} goal={goal} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Progress Notes ─────────────────────────────────────────────── */}
          {activeTab === "notes" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "1.5rem" }}>
              <div className="card" style={{ borderTop: "4px solid #2563EB" }}>
                <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.125rem", fontWeight: 700, color: "#0C2340", marginBottom: "1.25rem" }}>
                  Progress Note Generator
                </h2>

                {iepGoals.length === 0 ? (
                  <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
                    No saved IEP goals yet.{" "}
                    <button
                      onClick={() => setActiveTab("generate")}
                      style={{ color: "#2563EB", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.9375rem" }}
                    >
                      Generate goals first →
                    </button>
                  </p>
                ) : (
                  <form onSubmit={handleGenerateNote} className="flex flex-col gap-4">
                    <div>
                      <label style={label}>IEP Goal *</label>
                      <select
                        value={noteGoalId}
                        onChange={(e) => setNoteGoalId(e.target.value)}
                        required
                      >
                        {iepGoals.map((g) => (
                          <option key={g.id} value={g.id}>
                            [{g.area}] {g.goal_text.slice(0, 60)}…
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={label}>Time Period *</label>
                      <select value={notePeriod} onChange={(e) => setNotePeriod(e.target.value)}>
                        {TIME_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>

                    {noteError && (
                      <div
                        style={{
                          background: "#FEF2F2", border: "1px solid #FCA5A5",
                          borderRadius: "8px", padding: "0.75rem 1rem",
                          color: "#DC2626", fontSize: "0.875rem",
                        }}
                      >
                        {noteError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={noteLoading}
                      className="btn-primary"
                      style={{ width: "100%", background: noteLoading ? "#E2E8F0" : "linear-gradient(135deg, #2563EB, #7C3AED)", border: "none" }}
                    >
                      {noteLoading ? "✨ Generating…" : "✨ Generate Progress Note"}
                    </button>
                  </form>
                )}
              </div>

              {/* Note result */}
              <div>
                {noteResult ? (
                  <div className="flex flex-col gap-4">
                    <div className="card" style={{ borderTop: "4px solid #2563EB" }}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "1rem", fontWeight: 700, color: "#0C2340" }}>
                          Progress Note — {notePeriod} Review
                        </h3>
                        {progressBadge(noteResult.progress_level)}
                      </div>

                      <div
                        className="print-doc"
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) =>
                          setNoteResult((prev) =>
                            prev ? { ...prev, progress_note: e.currentTarget.textContent ?? "" } : prev
                          )
                        }
                        style={{
                          background: "#F8FAFC",
                          border: "1.5px solid #E2E8F0",
                          borderRadius: "8px",
                          padding: "1rem",
                          fontFamily: "'Courier New', monospace",
                          fontSize: "0.9375rem",
                          lineHeight: 1.7,
                          color: "#1E293B",
                          minHeight: "120px",
                          outline: "none",
                          marginBottom: "1rem",
                        }}
                      >
                        {noteResult.progress_note}
                      </div>

                      {noteResult.data_points.length > 0 && (
                        <div style={{ marginBottom: "1rem" }}>
                          <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#64748B", marginBottom: "0.5rem" }}>
                            DATA POINTS
                          </p>
                          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                            {noteResult.data_points.map((dp, i) => (
                              <li key={i} style={{ fontSize: "0.875rem", color: "#374151", display: "flex", gap: "0.5rem" }}>
                                <span style={{ color: "#2563EB", flexShrink: 0 }}>•</span>
                                {dp}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex gap-2 flex-wrap no-print">
                        <button
                          onClick={copyNote}
                          style={{
                            background: copiedNote ? "#ECFDF5" : "white",
                            border: "1.5px solid #E2E8F0",
                            borderRadius: "8px", padding: "0.5rem 1rem",
                            fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
                            color: copiedNote ? "#059669" : "#374151",
                          }}
                        >
                          {copiedNote ? "✓ Copied!" : "📋 Copy"}
                        </button>
                        <button
                          onClick={printNote}
                          style={{
                            background: "white", border: "1.5px solid #E2E8F0",
                            borderRadius: "8px", padding: "0.5rem 1rem",
                            fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", color: "#374151",
                          }}
                        >
                          🖨 Export PDF
                        </button>
                        {!noteApproved ? (
                          <button
                            onClick={approveAndSaveNote}
                            disabled={noteSaving}
                            style={{
                              background: noteSaving ? "#E2E8F0" : "linear-gradient(135deg, #2563EB, #7C3AED)",
                              border: "none", color: "white", borderRadius: "8px",
                              padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
                            }}
                          >
                            {noteSaving ? "Saving…" : "✓ Approve & Save"}
                          </button>
                        ) : (
                          <span
                            style={{
                              background: "#ECFDF5", color: "#059669",
                              borderRadius: "8px", padding: "0.5rem 1rem",
                              fontSize: "0.875rem", fontWeight: 600,
                            }}
                          >
                            ✓ Saved to student record
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Past notes */}
                    {noteGoalId && (() => {
                      const goal = iepGoals.find((g) => g.id === noteGoalId);
                      const pastNotes = goal?.progress_notes ?? [];
                      return pastNotes.length > 0 ? (
                        <div className="card">
                          <h4 style={{ fontFamily: "Georgia, serif", fontSize: "0.9375rem", fontWeight: 700, color: "#0C2340", marginBottom: "1rem" }}>
                            Past Progress Notes ({pastNotes.length})
                          </h4>
                          <div className="flex flex-col gap-3">
                            {[...pastNotes].reverse().map((note) => (
                              <div
                                key={note.id}
                                style={{
                                  background: "#F8FAFC", borderRadius: "8px",
                                  padding: "0.875rem 1rem", border: "1px solid #E2E8F0",
                                }}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  {progressBadge(note.progress_level)}
                                  <span style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
                                    {new Date(note.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                <p style={{ fontSize: "0.875rem", color: "#374151", lineHeight: 1.6 }}>
                                  {note.progress_note}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  <div
                    className="card"
                    style={{ textAlign: "center", padding: "3rem 2rem", color: "#64748B", border: "2px dashed #E2E8F0", background: "transparent" }}
                  >
                    <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📝</div>
                    <p style={{ fontSize: "0.9375rem" }}>
                      Select a goal and generate a progress note to get started.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Parent Update ──────────────────────────────────────────────── */}
          {activeTab === "parent" && (
            <div style={{ maxWidth: "640px" }}>
              <div className="card" style={{ borderTop: "4px solid #2563EB", marginBottom: "1.5rem" }}>
                <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.125rem", fontWeight: 700, color: "#0C2340", marginBottom: "0.5rem" }}>
                  Draft Parent Communication
                </h2>
                <p style={{ fontSize: "0.9375rem", color: "#64748B", marginBottom: "1.25rem" }}>
                  AI drafts a jargon-free, encouraging update about {student?.full_name ?? "the student"}&apos;s recent progress.
                </p>

                {parentError && (
                  <div
                    style={{
                      background: "#FEF2F2", border: "1px solid #FCA5A5",
                      borderRadius: "8px", padding: "0.75rem 1rem",
                      color: "#DC2626", fontSize: "0.875rem", marginBottom: "1rem",
                    }}
                  >
                    {parentError}
                  </div>
                )}

                <button
                  onClick={handleDraftParentUpdate}
                  disabled={parentLoading}
                  className="btn-primary"
                  style={{ background: parentLoading ? "#E2E8F0" : "linear-gradient(135deg, #2563EB, #7C3AED)", border: "none" }}
                >
                  {parentLoading ? "✨ Drafting…" : "✨ Draft Parent Update"}
                </button>
              </div>

              {parentUpdate && (
                <div className="card">
                  {/* Language toggle */}
                  <div
                    style={{
                      display: "flex", gap: "0.25rem", marginBottom: "1.25rem",
                      background: "#E2E8F0", borderRadius: "8px", padding: "0.25rem",
                      width: "fit-content",
                    }}
                  >
                    {(["english", "spanish"] as const).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setParentLang(lang)}
                        style={{
                          padding: "0.375rem 1rem", borderRadius: "6px", border: "none",
                          background: parentLang === lang ? "white" : "transparent",
                          color: parentLang === lang ? "#0C2340" : "#64748B",
                          fontWeight: parentLang === lang ? 600 : 400,
                          fontSize: "0.875rem", cursor: "pointer",
                          boxShadow: parentLang === lang ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                        }}
                      >
                        {lang === "english" ? "🇺🇸 English" : "🇲🇽 Español"}
                      </button>
                    ))}
                  </div>

                  <div
                    style={{
                      background: "#F8FAFC", borderRadius: "8px",
                      padding: "1.25rem", border: "1.5px solid #E2E8F0",
                      fontSize: "1rem", lineHeight: 1.8, color: "#1E293B",
                      marginBottom: "1rem",
                    }}
                  >
                    {parentUpdate[parentLang]}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={copyParentUpdate}
                      style={{
                        background: copiedParent ? "#ECFDF5" : "white",
                        border: "1.5px solid #E2E8F0",
                        borderRadius: "8px", padding: "0.5rem 1rem",
                        fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
                        color: copiedParent ? "#059669" : "#374151",
                      }}
                    >
                      {copiedParent ? "✓ Copied!" : "📋 Copy"}
                    </button>
                    <button
                      onClick={handleDraftParentUpdate}
                      style={{
                        background: "none", border: "1.5px solid #2563EB",
                        color: "#2563EB", borderRadius: "8px", padding: "0.5rem 1rem",
                        fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      ↻ Regenerate
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DraftGoalCard({
  goal,
  idx,
  saving,
  onUpdate,
  onSave,
  onCopy,
}: {
  goal: { goal_text: string; area: IepArea; baseline: string; target: string; measurement: string; standard: string | null };
  idx: number;
  saving: boolean;
  onUpdate: (idx: number, field: keyof DraftIepGoal, value: string) => void;
  onSave: () => void;
  onCopy: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="card"
      style={{ borderLeft: "4px solid #2563EB", padding: "1.25rem" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          style={{
            background: "#EFF6FF", color: "#2563EB", borderRadius: "100px",
            padding: "0.125rem 0.625rem", fontSize: "0.75rem", fontWeight: 700,
          }}
        >
          {goal.area}
        </span>
        <span style={{ fontSize: "0.75rem", color: "#94A3B8" }}>Goal {idx + 1}</span>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <label style={{ ...fieldLabel, marginBottom: "0.25rem" }}>Goal Text</label>
          <textarea
            value={goal.goal_text}
            onChange={(e) => onUpdate(idx, "goal_text", e.target.value)}
            rows={3}
            style={{ fontSize: "0.875rem" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label style={fieldLabel}>Baseline</label>
            <input
              type="text"
              value={goal.baseline}
              onChange={(e) => onUpdate(idx, "baseline", e.target.value)}
              style={{ fontSize: "0.8125rem" }}
            />
          </div>
          <div>
            <label style={fieldLabel}>Target</label>
            <input
              type="text"
              value={goal.target}
              onChange={(e) => onUpdate(idx, "target", e.target.value)}
              style={{ fontSize: "0.8125rem" }}
            />
          </div>
        </div>

        <div>
          <label style={fieldLabel}>Measurement Method</label>
          <input
            type="text"
            value={goal.measurement}
            onChange={(e) => onUpdate(idx, "measurement", e.target.value)}
            style={{ fontSize: "0.8125rem" }}
          />
        </div>

        {goal.standard && (
          <div>
            <label style={fieldLabel}>Standard</label>
            <input
              type="text"
              value={goal.standard}
              onChange={(e) => onUpdate(idx, "standard", e.target.value)}
              style={{ fontSize: "0.8125rem" }}
            />
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleCopy}
          style={{
            background: copied ? "#ECFDF5" : "white",
            border: "1.5px solid #E2E8F0", borderRadius: "8px",
            padding: "0.375rem 0.75rem", fontSize: "0.8125rem",
            fontWeight: 600, cursor: "pointer",
            color: copied ? "#059669" : "#374151",
          }}
        >
          {copied ? "✓ Copied!" : "📋 Copy Goal"}
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            background: saving ? "#E2E8F0" : "linear-gradient(135deg, #2563EB, #7C3AED)",
            border: "none", color: "white", borderRadius: "8px",
            padding: "0.375rem 0.75rem", fontSize: "0.8125rem",
            fontWeight: 600, cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save to Record"}
        </button>
      </div>
    </div>
  );
}

function SavedGoalCard({ goal }: { goal: IepGoal }) {
  return (
    <div
      className="card"
      style={{ borderLeft: "4px solid #2563EB", padding: "1rem 1.25rem" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          style={{
            background: "#EFF6FF", color: "#2563EB", borderRadius: "100px",
            padding: "0.125rem 0.625rem", fontSize: "0.75rem", fontWeight: 700,
          }}
        >
          {goal.area}
        </span>
        {goal.standard && (
          <span style={{ fontSize: "0.75rem", color: "#94A3B8" }}>{goal.standard}</span>
        )}
        {goal.progress_notes.length > 0 && (
          <span
            style={{
              background: "#ECFDF5", color: "#059669", borderRadius: "100px",
              padding: "0.125rem 0.625rem", fontSize: "0.75rem", fontWeight: 600,
            }}
          >
            {goal.progress_notes.length} note{goal.progress_notes.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <p style={{ fontSize: "0.875rem", color: "#1E293B", lineHeight: 1.6, marginBottom: "0.5rem" }}>
        {goal.goal_text}
      </p>
      {goal.baseline && (
        <p style={{ fontSize: "0.8125rem", color: "#64748B" }}>
          <strong>Baseline:</strong> {goal.baseline}
        </p>
      )}
      <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "0.375rem" }}>
        Added {new Date(goal.created_at).toLocaleDateString()}
      </p>
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#64748B",
  marginBottom: "0.25rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};
