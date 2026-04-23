"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  Goal,
  GoalPriority,
  GoalStatus,
  GoalSubject,
} from "@/types";

const SUBJECTS: GoalSubject[] = [
  "ELA",
  "Math",
  "Science",
  "Social Studies",
  "Writing",
  "Other",
];

const PRIORITIES: { value: GoalPriority; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
];

const STATUSES: { value: GoalStatus; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

function priorityBadge(priority: GoalPriority) {
  const map: Record<GoalPriority, { bg: string; color: string; label: string }> = {
    critical: { bg: "#FEF2F2", color: "#DC2626", label: "Critical" },
    high: { bg: "#FFF7ED", color: "#D97706", label: "High" },
    medium: { bg: "#EFF6FF", color: "#2563EB", label: "Medium" },
  };
  const s = map[priority];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: "100px",
        padding: "0.125rem 0.625rem",
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      {s.label}
    </span>
  );
}

function subjectBadge(subject: string | null) {
  if (!subject) return null;
  return (
    <span
      style={{
        background: "#028090",
        color: "white",
        borderRadius: "100px",
        padding: "0.125rem 0.625rem",
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      {subject}
    </span>
  );
}

function statusBadge(status: GoalStatus) {
  const map: Record<GoalStatus, { bg: string; color: string; label: string }> = {
    not_started: { bg: "#E2E8F0", color: "#64748B", label: "Not Started" },
    in_progress: { bg: "#7C3AED", color: "white", label: "In Progress" },
    completed: { bg: "#02C39A", color: "white", label: "Completed" },
  };
  const s = map[status];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: "100px",
        padding: "0.125rem 0.625rem",
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      {s.label}
    </span>
  );
}

function navLinkStyle(active: boolean): React.CSSProperties {
  return {
    color: active ? "#028090" : "#64748B",
    fontWeight: active ? 600 : 400,
    fontSize: "0.9375rem",
    padding: "0 1rem",
    height: "100%",
    display: "flex",
    alignItems: "center",
    borderBottom: active ? "2px solid #028090" : "2px solid transparent",
    textDecoration: "none",
  };
}

interface GoalFormState {
  friendly_text: string;
  subject: GoalSubject;
  priority: GoalPriority;
  standard_code: string;
  source: string;
  is_personal: boolean;
}

const defaultForm: GoalFormState = {
  friendly_text: "",
  subject: "ELA",
  priority: "medium",
  standard_code: "",
  source: "",
  is_personal: false,
};

export default function TeacherStudentGoalsPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params.studentId as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [student, setStudent] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<GoalFormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editForm, setEditForm] = useState<GoalFormState>(defaultForm);
  const [editSaving, setEditSaving] = useState(false);

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

      if (!profileData || profileData.role !== "teacher") {
        router.push("/auth/login");
        return;
      }
      setProfile(profileData);

      const { data: studentData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", studentId)
        .single();

      if (studentData) setStudent(studentData);

      await loadGoals(supabase, user.id);
      setLoading(false);
    }
    load();
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadGoals(
    supabase: ReturnType<typeof createClient>,
    teacherId: string
  ) {
    const { data } = await supabase
      .from("goals")
      .select("*")
      .eq("student_id", studentId)
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });
    setGoals((data as Goal[]) ?? []);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("goals").insert({
      student_id: studentId,
      teacher_id: user.id,
      friendly_text: form.friendly_text.trim(),
      subject: form.subject,
      priority: form.priority,
      standard_code: form.standard_code.trim() || null,
      source: form.source.trim() || null,
      is_personal: form.is_personal,
    });

    if (error) {
      setFormError(error.message);
      setSaving(false);
      return;
    }

    setForm(defaultForm);
    setSaving(false);
    await loadGoals(supabase, user.id);
  }

  async function handleDelete(goalId: string) {
    if (!confirm("Delete this goal? This cannot be undone.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("goals").delete().eq("id", goalId);
    if (!error) setGoals((prev) => prev.filter((g) => g.id !== goalId));
  }

  async function handleStatusChange(goalId: string, newStatus: GoalStatus) {
    const supabase = createClient();
    const { error } = await supabase
      .from("goals")
      .update({ status: newStatus })
      .eq("id", goalId);
    if (!error) {
      setGoals((prev) =>
        prev.map((g) => (g.id === goalId ? { ...g, status: newStatus } : g))
      );
    }
  }

  function openEdit(goal: Goal) {
    setEditingGoal(goal);
    setEditForm({
      friendly_text: goal.friendly_text,
      subject: (goal.subject as GoalSubject) ?? "ELA",
      priority: goal.priority,
      standard_code: goal.standard_code ?? "",
      source: goal.source ?? "",
      is_personal: goal.is_personal,
    });
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingGoal) return;
    setEditSaving(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("goals")
      .update({
        friendly_text: editForm.friendly_text.trim(),
        subject: editForm.subject,
        priority: editForm.priority,
        standard_code: editForm.standard_code.trim() || null,
        source: editForm.source.trim() || null,
        is_personal: editForm.is_personal,
      })
      .eq("id", editingGoal.id);

    setEditSaving(false);
    setEditingGoal(null);
    await loadGoals(supabase, user.id);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#F7F9FC" }}
      >
        <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#F7F9FC" }}>
      {/* Header */}
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
        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-4">
          <span style={{ color: "#94A3B8", fontSize: "0.875rem" }}>
            {profile?.full_name}
          </span>
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
      <nav
        style={{
          background: "white",
          borderBottom: "1px solid #E2E8F0",
          padding: "0 2rem",
        }}
      >
        <div
          style={{
            maxWidth: "1000px",
            margin: "0 auto",
            display: "flex",
            height: "48px",
            alignItems: "stretch",
          }}
        >
          <Link href="/dashboard/teacher" style={navLinkStyle(false)}>
            Dashboard
          </Link>
          <Link href="/dashboard/teacher/students" style={navLinkStyle(false)}>
            My Students
          </Link>
          <span style={{ ...navLinkStyle(true), cursor: "default" }}>
            {student?.full_name ?? "Student"}&apos;s Goals
          </span>
        </div>
      </nav>

      <main
        style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem 1.5rem" }}
      >
        {/* Student header */}
        <div className="flex items-center gap-4 mb-8 flex-wrap justify-between">
          <div className="flex items-center gap-4">
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #028090, #02C39A)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontWeight: 700,
                fontSize: "1.25rem",
                flexShrink: 0,
              }}
            >
              {student?.full_name?.charAt(0) ?? "?"}
            </div>
            <div>
              <h1
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1.625rem",
                  fontWeight: 700,
                  color: "#0C2340",
                  marginBottom: "0.125rem",
                }}
              >
                {student?.full_name ?? "Student"}
              </h1>
              <p style={{ fontSize: "0.9375rem", color: "#64748B" }}>
                {goals.length} goal{goals.length !== 1 ? "s" : ""} created
                {student?.grade ? ` · Grade ${student.grade}` : ""}
              </p>
            </div>
          </div>
          <Link
            href={`/dashboard/teacher/students/${studentId}/upload`}
            className="btn-secondary"
            style={{ textDecoration: "none", fontSize: "0.875rem" }}
          >
            📄 Upload Report Card
          </Link>
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: "1fr 1fr", gap: "2rem", display: "grid" }}
        >
          {/* Left: Create goal form */}
          <div>
            <div className="card">
              <h2
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  color: "#0C2340",
                  marginBottom: "1.25rem",
                }}
              >
                + Add a Goal
              </h2>

              {formError && (
                <div
                  style={{
                    background: "#FEF2F2",
                    border: "1px solid #FCA5A5",
                    borderRadius: "8px",
                    padding: "0.75rem 1rem",
                    color: "#DC2626",
                    fontSize: "0.875rem",
                    marginBottom: "1rem",
                  }}
                >
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <div>
                  <label style={labelStyle}>
                    &ldquo;I can&rdquo; statement *
                  </label>
                  <textarea
                    value={form.friendly_text}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, friendly_text: e.target.value }))
                    }
                    placeholder="I can identify the main idea and supporting details in a nonfiction text."
                    required
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={labelStyle}>Subject *</label>
                    <select
                      value={form.subject}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          subject: e.target.value as GoalSubject,
                        }))
                      }
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Priority *</label>
                    <select
                      value={form.priority}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          priority: e.target.value as GoalPriority,
                        }))
                      }
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Standard Code</label>
                  <input
                    type="text"
                    value={form.standard_code}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        standard_code: e.target.value,
                      }))
                    }
                    placeholder="e.g. RI.3.2"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Source / Evidence</label>
                  <input
                    type="text"
                    value={form.source}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, source: e.target.value }))
                    }
                    placeholder="e.g. Reading score 2/4"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_personal"
                    checked={form.is_personal}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, is_personal: e.target.checked }))
                    }
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <label
                    htmlFor="is_personal"
                    style={{ fontSize: "0.875rem", color: "#374151", cursor: "pointer" }}
                  >
                    Personal goal
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary"
                  style={{ width: "100%", marginTop: "0.25rem" }}
                >
                  {saving ? "Saving…" : "Add Goal"}
                </button>
              </form>
            </div>
          </div>

          {/* Right: Goals list */}
          <div>
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "1rem",
              }}
            >
              Goals ({goals.length})
            </h2>

            {goals.length === 0 ? (
              <div
                className="card"
                style={{
                  textAlign: "center",
                  padding: "2rem",
                  color: "#64748B",
                  border: "2px dashed #E2E8F0",
                  background: "transparent",
                }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🎯</div>
                <p style={{ fontSize: "0.9375rem" }}>
                  No goals yet. Add the first goal using the form.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {goals.map((goal) => (
                  <div
                    key={goal.id}
                    className="card"
                    style={{
                      borderLeft: "4px solid #028090",
                      padding: "1rem 1.25rem",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: "Georgia, serif",
                        fontSize: "0.9375rem",
                        color: "#0C2340",
                        marginBottom: "0.625rem",
                        lineHeight: 1.5,
                      }}
                    >
                      {goal.friendly_text}
                    </p>

                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      {subjectBadge(goal.subject)}
                      {priorityBadge(goal.priority)}
                      {statusBadge(goal.status)}
                      {goal.is_personal && (
                        <span
                          style={{
                            background: "#F3F4F6",
                            color: "#6B7280",
                            borderRadius: "100px",
                            padding: "0.125rem 0.625rem",
                            fontSize: "0.75rem",
                          }}
                        >
                          Personal
                        </span>
                      )}
                    </div>

                    {(goal.standard_code || goal.source) && (
                      <div
                        className="flex gap-3 flex-wrap"
                        style={{ marginBottom: "0.75rem" }}
                      >
                        {goal.standard_code && (
                          <span style={{ fontSize: "0.8125rem", color: "#64748B" }}>
                            📋 {goal.standard_code}
                          </span>
                        )}
                        {goal.source && (
                          <span style={{ fontSize: "0.8125rem", color: "#64748B" }}>
                            📊 {goal.source}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <select
                          value={goal.status}
                          onChange={(e) =>
                            handleStatusChange(goal.id, e.target.value as GoalStatus)
                          }
                          style={{
                            fontSize: "0.8125rem",
                            padding: "0.25rem 0.5rem",
                            borderRadius: "6px",
                            border: "1.5px solid #E2E8F0",
                            background: "white",
                            color: "#374151",
                            cursor: "pointer",
                            width: "auto",
                          }}
                        >
                          {STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(goal)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#028090",
                            fontSize: "0.8125rem",
                            cursor: "pointer",
                            padding: "0.25rem 0.5rem",
                            fontWeight: 600,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(goal.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#DC2626",
                            fontSize: "0.8125rem",
                            cursor: "pointer",
                            padding: "0.25rem 0.5rem",
                            fontWeight: 600,
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#94A3B8",
                        marginTop: "0.5rem",
                      }}
                    >
                      Added {new Date(goal.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit Modal */}
      {editingGoal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12,35,64,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "1rem",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingGoal(null);
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "520px" }}>
            <div className="flex items-center justify-between mb-4">
              <h3
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  color: "#0C2340",
                }}
              >
                Edit Goal
              </h3>
              <button
                onClick={() => setEditingGoal(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.5rem",
                  color: "#94A3B8",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleEditSave} className="flex flex-col gap-4">
              <div>
                <label style={labelStyle}>&ldquo;I can&rdquo; statement *</label>
                <textarea
                  value={editForm.friendly_text}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, friendly_text: e.target.value }))
                  }
                  required
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Subject *</label>
                  <select
                    value={editForm.subject}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        subject: e.target.value as GoalSubject,
                      }))
                    }
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Priority *</label>
                  <select
                    value={editForm.priority}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        priority: e.target.value as GoalPriority,
                      }))
                    }
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Standard Code</label>
                <input
                  type="text"
                  value={editForm.standard_code}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, standard_code: e.target.value }))
                  }
                  placeholder="e.g. RI.3.2"
                />
              </div>

              <div>
                <label style={labelStyle}>Source / Evidence</label>
                <input
                  type="text"
                  value={editForm.source}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, source: e.target.value }))
                  }
                  placeholder="e.g. Reading score 2/4"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit_is_personal"
                  checked={editForm.is_personal}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, is_personal: e.target.checked }))
                  }
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                <label
                  htmlFor="edit_is_personal"
                  style={{ fontSize: "0.875rem", color: "#374151", cursor: "pointer" }}
                >
                  Personal goal
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingGoal(null)}
                  className="btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="btn-primary"
                  style={{ flex: 1 }}
                >
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "0.375rem",
};
