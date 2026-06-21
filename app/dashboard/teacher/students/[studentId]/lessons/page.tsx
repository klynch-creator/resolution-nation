"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import LessonHistory from "@/app/dashboard/_components/LessonHistory";
import type { Lesson, StudentSkillTier } from "@/types";

export default function TeacherStudentLessonsPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params.studentId as string;

  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState<string>("");
  const [studentGrade, setStudentGrade] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [skillTiers, setSkillTiers] = useState<StudentSkillTier[]>([]);

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

      // RLS allows the teacher to read lessons of students they set goals for.
      const { data: lessonData } = await supabase
        .from("lessons")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      setLessons((lessonData as Lesson[]) ?? []);

      const { data: tierData } = await supabase
        .from("student_skill_tiers")
        .select("*")
        .eq("student_id", studentId);
      setSkillTiers((tierData as StudentSkillTier[]) ?? []);

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
          <span style={{ fontFamily: "Georgia, serif", color: "#F7F9FC", fontSize: "1.25rem", fontWeight: 700 }}>
            Resolution Nation
          </span>
        </div>
      </header>

      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <Link
          href="/dashboard/teacher/students"
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
          ← Back to Students
        </Link>

        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem", color: "#64748B" }}>Loading lessons…</div>
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
              <div>
                <h1
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "1.625rem",
                    fontWeight: 700,
                    color: "#0C2340",
                    marginBottom: "0.2rem",
                  }}
                >
                  {studentName} — Lessons
                </h1>
                {studentGrade && (
                  <span style={{ fontSize: "0.875rem", color: "#64748B" }}>Grade {studentGrade}</span>
                )}
              </div>
              <Link
                href={`/dashboard/teacher/students/${studentId}/analytics`}
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
                📊 View Analytics
              </Link>
            </div>

            <LessonHistory lessons={lessons} skillTiers={skillTiers} />
          </>
        )}
      </main>
    </div>
  );
}
