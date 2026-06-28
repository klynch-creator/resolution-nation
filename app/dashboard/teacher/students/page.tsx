"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Pod, ParentStudentLink } from "@/types";

interface PendingLink extends ParentStudentLink {
  parent: { id: string; full_name: string } | null;
  student: { id: string; full_name: string; grade: string | null } | null;
}

interface StudentRow {
  profile: Profile;
  classroomName: string;
  podId: string;
  uploadStatus: "pending" | "reviewed" | "confirmed" | null;
}

function StudentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const podId = searchParams.get("podId");

  const [loading, setLoading] = useState(true);
  const [teacherProfile, setTeacherProfile] = useState<Profile | null>(null);
  const [classroom, setClassroom] = useState<Pod | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);
  const [approvingLinkId, setApprovingLinkId] = useState<string | null>(null);

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

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "teacher") {
        router.push("/dashboard");
        return;
      }

      setTeacherProfile(profile);

      // Load pods: either a specific one or all teacher's pods
      let pods: Pod[] = [];
      if (podId) {
        const { data } = await supabase
          .from("pods")
          .select("*")
          .eq("id", podId)
          .eq("created_by", user.id)
          .single();
        if (data) {
          pods = [data];
          setClassroom(data);
        }
      } else {
        const { data } = await supabase
          .from("pods")
          .select("*")
          .eq("created_by", user.id)
          .eq("type", "class")
          .order("created_at", { ascending: false });
        pods = data ?? [];
      }

      if (pods.length === 0) {
        setLoading(false);
        return;
      }

      // Get all student members from those pods
      const podIds = pods.map((p) => p.id);
      const { data: members } = await supabase
        .from("pod_members")
        .select("user_id, pod_id")
        .in("pod_id", podIds)
        .eq("role", "member");

      if (!members || members.length === 0) {
        setLoading(false);
        return;
      }

      const studentIds = [...new Set(members.map((m) => m.user_id))];

      // Get profiles for those students
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", studentIds)
        .eq("role", "student");

      if (!profiles) {
        setLoading(false);
        return;
      }

      // Get latest upload per student
      const { data: uploads } = await supabase
        .from("student_data_uploads")
        .select("student_id, status")
        .eq("teacher_id", user.id)
        .in("student_id", studentIds)
        .order("uploaded_at", { ascending: false });

      // Build a map: studentId → latest upload status
      const uploadStatusMap = new Map<string, string>();
      for (const upload of uploads ?? []) {
        if (!uploadStatusMap.has(upload.student_id)) {
          uploadStatusMap.set(upload.student_id, upload.status);
        }
      }

      // Build pod name map
      const podNameMap = new Map(pods.map((p) => [p.id, p.name]));

      const rows: StudentRow[] = profiles.map((profile) => {
        const membership = members.find((m) => m.user_id === profile.id);
        const podName = membership
          ? (podNameMap.get(membership.pod_id) ?? "Unknown")
          : "Unknown";
        const status = uploadStatusMap.get(profile.id);
        return {
          profile,
          classroomName: podName,
          podId: membership?.pod_id ?? "",
          uploadStatus: (status as StudentRow["uploadStatus"]) ?? null,
        };
      });

      // Sort: no upload first, then by name
      rows.sort((a, b) => {
        if (!a.uploadStatus && b.uploadStatus) return -1;
        if (a.uploadStatus && !b.uploadStatus) return 1;
        return a.profile.full_name.localeCompare(b.profile.full_name);
      });

      setStudents(rows);

      // Load pending parent links for this teacher (Phase 11)
      const { data: linksData } = await supabase
        .from("parent_student_links")
        .select("*")
        .eq("teacher_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (linksData && linksData.length > 0) {
        const pParentIds = [...new Set(linksData.map((l: { parent_id: string }) => l.parent_id))];
        const pStudentIds = [...new Set(linksData.map((l: { student_id: string }) => l.student_id))];

        const [{ data: parentProfs }, { data: studentProfs }] = await Promise.all([
          supabase.from("profiles").select("id, full_name").in("id", pParentIds),
          supabase.from("profiles").select("id, full_name, grade").in("id", pStudentIds),
        ]);

        const parentMap = new Map((parentProfs ?? []).map((p: { id: string; full_name: string }) => [p.id, p]));
        const studentMap = new Map(
          (studentProfs ?? []).map((p: { id: string; full_name: string; grade: string | null }) => [p.id, p])
        );

        setPendingLinks(
          linksData.map((link: ParentStudentLink) => ({
            ...link,
            parent: parentMap.get(link.parent_id) ?? null,
            student: studentMap.get(link.student_id) ?? null,
          }))
        );
      }

      setLoading(false);
    }
    load();
  }, [podId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col gap-3 items-center justify-center"
        style={{ background: "#F7F9FC" }}
      >
        <div className="spinner" aria-hidden="true" />
        <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading…</div>
      </div>
    );
  }

  const uploadBadge = (status: StudentRow["uploadStatus"]) => {
    if (!status)
      return (
        <span
          style={{
            fontSize: "0.75rem",
            color: "#94A3B8",
            background: "#F1F5F9",
            borderRadius: "100px",
            padding: "0.125rem 0.625rem",
          }}
        >
          No upload
        </span>
      );
    if (status === "confirmed")
      return (
        <span
          style={{
            fontSize: "0.75rem",
            color: "#059669",
            background: "#ECFDF5",
            borderRadius: "100px",
            padding: "0.125rem 0.625rem",
          }}
        >
          ✓ Confirmed
        </span>
      );
    if (status === "reviewed")
      return (
        <span
          style={{
            fontSize: "0.75rem",
            color: "#7C3AED",
            background: "#F5F3FF",
            borderRadius: "100px",
            padding: "0.125rem 0.625rem",
          }}
        >
          Reviewed
        </span>
      );
    return (
      <span
        style={{
          fontSize: "0.75rem",
          color: "#D97706",
          background: "#FFFBEB",
          borderRadius: "100px",
          padding: "0.125rem 0.625rem",
        }}
      >
        Pending
      </span>
    );
  };

  async function handleApproveLink(linkId: string, action: "approve" | "deny") {
    setApprovingLinkId(linkId);
    const res = await fetch("/api/approve-parent-link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId, action }),
    });
    if (res.ok) {
      setPendingLinks((prev) => prev.filter((l) => l.id !== linkId));
    }
    setApprovingLinkId(null);
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
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/teacher"
            style={{ color: "#94A3B8", fontSize: "0.875rem", textDecoration: "none" }}
          >
            ← Dashboard
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
            {classroom ? classroom.name : "All Students"}
          </span>
        </div>
        <span style={{ color: "#94A3B8", fontSize: "0.875rem" }}>
          {teacherProfile?.full_name}
        </span>
      </header>

      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "0.25rem",
              }}
            >
              {classroom ? classroom.name : "All Students"}
            </h1>
            <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
              {students.length} student{students.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Pending parent link requests (Phase 11) */}
        {pendingLinks.length > 0 && (
          <div className="card mb-6" style={{ borderLeft: "4px solid #D97706" }}>
            <div className="flex items-center gap-2 mb-3">
              <span style={{ fontSize: "1.25rem" }}>👪</span>
              <h2
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  color: "#0C2340",
                }}
              >
                Pending Parent Link Requests
              </h2>
              <span
                style={{
                  background: "#FEF3C7",
                  color: "#92400E",
                  borderRadius: "100px",
                  padding: "0.125rem 0.625rem",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                {pendingLinks.length}
              </span>
            </div>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#64748B",
                marginBottom: "1rem",
              }}
            >
              Parents requesting access to view their child&apos;s progress.
              Approve to grant read-only access, or deny.
            </p>
            <div className="flex flex-col gap-3">
              {pendingLinks.map((link) => (
                <div
                  key={link.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.875rem 1rem",
                    background: "#FFFBEB",
                    borderRadius: "8px",
                    border: "1px solid #FCD34D",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <p style={{ fontWeight: 600, color: "#0C2340", fontSize: "0.9375rem" }}>
                      <span style={{ color: "#64748B", fontWeight: 400 }}>Parent: </span>
                      {link.parent?.full_name ?? "Unknown"}
                    </p>
                    <p style={{ fontSize: "0.875rem", color: "#64748B" }}>
                      <span style={{ fontWeight: 600 }}>Child: </span>
                      {link.student?.full_name ?? "Unknown"}
                      {link.student?.grade ? ` · Grade ${link.student.grade}` : ""}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "0.25rem" }}>
                      Requested{" "}
                      {new Date(link.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveLink(link.id, "approve")}
                      disabled={approvingLinkId === link.id}
                      className="btn-primary"
                      style={{
                        padding: "0.5rem 1rem",
                        fontSize: "0.875rem",
                        background:
                          approvingLinkId === link.id ? "#E2E8F0" : "#028090",
                      }}
                    >
                      {approvingLinkId === link.id ? "…" : "✓ Approve"}
                    </button>
                    <button
                      onClick={() => handleApproveLink(link.id, "deny")}
                      disabled={approvingLinkId === link.id}
                      style={{
                        padding: "0.5rem 1rem",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        background: "white",
                        border: "1.5px solid #FCA5A5",
                        color: "#DC2626",
                        borderRadius: "8px",
                        cursor:
                          approvingLinkId === link.id ? "default" : "pointer",
                      }}
                    >
                      {approvingLinkId === link.id ? "…" : "✕ Deny"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {students.length === 0 ? (
          <div
            className="card text-center"
            style={{ padding: "3rem", color: "#64748B" }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎒</div>
            <p
              style={{ fontSize: "1.125rem", marginBottom: "0.5rem", color: "#374151" }}
            >
              No students yet
            </p>
            <p style={{ fontSize: "0.9375rem" }}>
              Students join your classroom using the invite code.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {students.map((row) => (
              <div
                key={row.profile.id}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "1rem",
                  padding: "1rem 1.25rem",
                }}
              >
                {/* Student info */}
                <div style={{ minWidth: "180px" }}>
                  <Link
                    href={`/dashboard/teacher/students/${row.profile.id}/goals`}
                    style={{
                      fontWeight: 700,
                      color: "#0C2340",
                      fontSize: "1rem",
                      textDecoration: "none",
                    }}
                  >
                    {row.profile.full_name}
                  </Link>
                  <div className="flex items-center gap-2" style={{ marginTop: "0.25rem" }}>
                    {row.profile.grade && (
                      <span style={{ fontSize: "0.8125rem", color: "#64748B" }}>
                        Grade {row.profile.grade}
                      </span>
                    )}
                    <span style={{ fontSize: "0.8125rem", color: "#94A3B8" }}>
                      {row.classroomName}
                    </span>
                    <span style={{ fontSize: "0.8125rem" }}>
                      {uploadBadge(row.uploadStatus)}
                    </span>
                  </div>
                </div>

                {/* Action links */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/dashboard/teacher/students/${row.profile.id}/goals`}
                    style={{
                      background: "#028090",
                      color: "white",
                      borderRadius: "8px",
                      padding: "0.4375rem 0.875rem",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🎯 Goals
                  </Link>
                  <Link
                    href={`/dashboard/teacher/students/${row.profile.id}/iep`}
                    style={{
                      background: "#7C3AED",
                      color: "white",
                      borderRadius: "8px",
                      padding: "0.4375rem 0.875rem",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    📋 IEP
                  </Link>
                  <Link
                    href={`/dashboard/teacher/students/${row.profile.id}/analytics`}
                    style={{
                      background: "#D97706",
                      color: "white",
                      borderRadius: "8px",
                      padding: "0.4375rem 0.875rem",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    📊 Analytics
                  </Link>
                  <Link
                    href={`/dashboard/teacher/students/${row.profile.id}/lessons`}
                    style={{
                      background: "#02C39A",
                      color: "white",
                      borderRadius: "8px",
                      padding: "0.4375rem 0.875rem",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    📚 Lessons
                  </Link>
                  <Link
                    href={`/dashboard/teacher/students/${row.profile.id}/fluency`}
                    style={{
                      background: "#7C3AED",
                      color: "white",
                      borderRadius: "8px",
                      padding: "0.4375rem 0.875rem",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🎙️ Fluency
                  </Link>
                  <Link
                    href={`/dashboard/teacher/students/${row.profile.id}/upload`}
                    style={{
                      background: "white",
                      color: "#028090",
                      border: "1.5px solid #028090",
                      borderRadius: "8px",
                      padding: "0.375rem 0.875rem",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    📄 Upload
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function StudentsPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex flex-col gap-3 items-center justify-center"
          style={{ background: "#F7F9FC" }}
        >
          <div className="spinner" aria-hidden="true" />
          <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading…</div>
        </div>
      }
    >
      <StudentsContent />
    </Suspense>
  );
}
