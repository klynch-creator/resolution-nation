"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FluencyReport from "@/app/dashboard/_components/FluencyReport";
import type { FluencyAssessment, FluencyAttempt } from "@/types";

export default function TeacherStudentFluencyPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params.studentId as string;

  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState("");
  const [studentGrade, setStudentGrade] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<FluencyAssessment[]>([]);
  const [attempts, setAttempts] = useState<FluencyAttempt[]>([]);

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
      const { data: teacherProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (!teacherProfile || teacherProfile.role !== "teacher") {
        router.push("/dashboard");
        return;
      }

      const { data: studentProfile } = await supabase
        .from("profiles")
        .select("id, full_name, grade")
        .eq("id", studentId)
        .single();
      if (!studentProfile) {
        router.push("/dashboard/teacher/students");
        return;
      }
      setStudentName(studentProfile.full_name);
      setStudentGrade(studentProfile.grade ?? null);

      const { data: asmtData } = await supabase
        .from("fluency_assessments")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      setAssessments((asmtData as FluencyAssessment[]) ?? []);

      const { data: attemptData } = await supabase
        .from("fluency_attempts")
        .select("*")
        .eq("student_id", studentId);
      setAttempts((attemptData as FluencyAttempt[]) ?? []);

      setLoading(false);
    }
    load();
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen" style={{ background: "#F7F9FC" }}>
      <header
        style={{
          background: "#0C2340",
          padding: "0 2rem",
          height: "64px",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "1.5rem" }}>🌟</span>
          <span
            style={{ fontFamily: "Georgia, serif", color: "#F7F9FC", fontSize: "1.25rem", fontWeight: 700 }}
          >
            Resolution Nation
          </span>
        </div>
      </header>

      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <Link
          href={`/dashboard/teacher/students/${studentId}/lessons`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            color: "#028090",
            fontSize: "0.9375rem",
            fontWeight: 500,
            textDecoration: "none",
            marginBottom: "1.5rem",
          }}
        >
          ← Back
        </Link>

        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "#64748B" }}>
            Loading fluency results…
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1.625rem",
                  fontWeight: 700,
                  color: "#0C2340",
                  marginBottom: "0.2rem",
                }}
              >
                {studentName} — Reading Fluency
              </h1>
              <p style={{ fontSize: "0.875rem", color: "#64748B" }}>
                {studentGrade ? `Grade ${studentGrade}. ` : ""}Words Correct Per Minute scored against
                Hasbrouck &amp; Tindal (2017) oral reading fluency norms. The student does not see these
                scores or levels.
              </p>
            </div>

            <FluencyReport assessments={assessments} attempts={attempts} />
          </>
        )}
      </main>
    </div>
  );
}
