"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile, StudentDataUpload } from "@/types";

export default function GoalsPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<Profile | null>(null);
  const [latestUpload, setLatestUpload] = useState<StudentDataUpload | null>(null);

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

      const { data: teacherProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!teacherProfile || teacherProfile.role !== "teacher") {
        router.push("/auth/login");
        return;
      }

      const { data: studentProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", studentId)
        .eq("role", "student")
        .single();

      if (!studentProfile) {
        router.push("/dashboard/teacher");
        return;
      }

      setStudent(studentProfile);

      const { data: upload } = await supabase
        .from("student_data_uploads")
        .select("*")
        .eq("student_id", studentId)
        .eq("teacher_id", user.id)
        .eq("status", "confirmed")
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .single();

      setLatestUpload(upload);
      setLoading(false);
    }
    load();
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const subjects = latestUpload?.extracted_data?.subjects ?? [];

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
            Goals — {student?.full_name}
          </span>
        </div>
      </header>

      <main style={{ maxWidth: "700px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.375rem",
            }}
          >
            {student?.full_name}&apos;s Goals
          </h1>
          {student?.grade && (
            <p style={{ color: "#64748B" }}>Grade {student.grade}</p>
          )}
        </div>

        {latestUpload ? (
          <div>
            {/* Confirmed data summary */}
            <div
              style={{
                background: "#ECFDF5",
                border: "1.5px solid #6EE7B7",
                borderRadius: "12px",
                padding: "1rem 1.25rem",
                marginBottom: "1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <span style={{ fontSize: "1.25rem" }}>✅</span>
              <p style={{ fontWeight: 600, color: "#065F46", fontSize: "0.9375rem" }}>
                Report card confirmed — {subjects.length} subject
                {subjects.length !== 1 ? "s" : ""} extracted
              </p>
            </div>

            {/* Phase 4 coming soon */}
            <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🚧</div>
              <h2
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1.375rem",
                  fontWeight: 700,
                  color: "#0C2340",
                  marginBottom: "0.5rem",
                }}
              >
                Goal Generation — Coming in Phase 4
              </h2>
              <p style={{ color: "#64748B", fontSize: "0.9375rem", marginBottom: "1.5rem" }}>
                The extracted report card data is saved. Phase 4 will automatically
                generate personalized learning goals and roadmaps from this data.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                <Link
                  href={`/dashboard/teacher/students/${studentId}/upload`}
                  className="btn-secondary"
                  style={{ textDecoration: "none" }}
                >
                  Re-upload Report Card
                </Link>
                <Link
                  href="/dashboard/teacher"
                  className="btn-primary"
                  style={{ textDecoration: "none" }}
                >
                  Back to Dashboard
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📋</div>
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "0.5rem",
              }}
            >
              No report card yet
            </h2>
            <p
              style={{
                color: "#64748B",
                fontSize: "0.9375rem",
                marginBottom: "1.5rem",
              }}
            >
              Upload and confirm a report card to generate goals for this student.
            </p>
            <Link
              href={`/dashboard/teacher/students/${studentId}/upload`}
              className="btn-primary"
              style={{ textDecoration: "none" }}
            >
              Upload Report Card
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
