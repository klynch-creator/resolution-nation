"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Pod } from "@/types";

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

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "teacher") {
        router.push("/auth/login");
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
      setLoading(false);
    }
    load();
  }, [podId]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid #E2E8F0" }}>
                  {[
                    { label: "Student", width: "35%" },
                    { label: "Grade", width: "15%" },
                    { label: "Classroom", width: "25%" },
                    { label: "Report Card", width: "15%" },
                    { label: "", width: "10%" },
                  ].map((col) => (
                    <th
                      key={col.label}
                      style={{
                        width: col.width,
                        padding: "0.875rem 1.25rem",
                        textAlign: "left",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#64748B",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((row, i) => (
                  <tr
                    key={row.profile.id}
                    style={{
                      borderBottom:
                        i < students.length - 1 ? "1px solid #F1F5F9" : "none",
                    }}
                  >
                    <td style={{ padding: "0.875rem 1.25rem" }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "#0C2340",
                          fontSize: "0.9375rem",
                        }}
                      >
                        {row.profile.full_name}
                      </div>
                    </td>
                    <td style={{ padding: "0.875rem 1.25rem" }}>
                      <span style={{ color: "#64748B", fontSize: "0.875rem" }}>
                        {row.profile.grade ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "0.875rem 1.25rem" }}>
                      <span style={{ color: "#64748B", fontSize: "0.875rem" }}>
                        {row.classroomName}
                      </span>
                    </td>
                    <td style={{ padding: "0.875rem 1.25rem" }}>
                      {uploadBadge(row.uploadStatus)}
                    </td>
                    <td style={{ padding: "0.875rem 1.25rem" }}>
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/dashboard/teacher/students/${row.profile.id}/goals`}
                          style={{
                            color: "#028090",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Goals →
                        </Link>
                        <Link
                          href={`/dashboard/teacher/students/${row.profile.id}/iep`}
                          style={{
                            color: "#2563EB",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          📋 IEP
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          className="min-h-screen flex items-center justify-center"
          style={{ background: "#F7F9FC" }}
        >
          <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading…</div>
        </div>
      }
    >
      <StudentsContent />
    </Suspense>
  );
}
