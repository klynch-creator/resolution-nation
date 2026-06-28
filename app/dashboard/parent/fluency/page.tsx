"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import FluencyReport from "@/app/dashboard/_components/FluencyReport";
import type { FluencyAssessment, FluencyAttempt, ParentStudentLink } from "@/types";

export default function ParentFluencyPage() {
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [childName, setChildName] = useState("");
  const [assessments, setAssessments] = useState<FluencyAssessment[]>([]);
  const [attempts, setAttempts] = useState<FluencyAttempt[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: links } = await supabase
        .from("parent_student_links")
        .select("*")
        .eq("parent_id", user.id)
        .eq("status", "approved")
        .limit(1);
      const link = links?.[0] as ParentStudentLink | undefined;
      if (!link) {
        setNotLinked(true);
        setLoading(false);
        return;
      }

      const childId = link.student_id;
      const { data: child } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", childId)
        .single();
      setChildName(child?.full_name ?? "");

      const { data: asmtData } = await supabase
        .from("fluency_assessments")
        .select("*")
        .eq("student_id", childId)
        .order("created_at", { ascending: false });
      setAssessments((asmtData as FluencyAssessment[]) ?? []);

      const { data: attemptData } = await supabase
        .from("fluency_attempts")
        .select("*")
        .eq("student_id", childId);
      setAttempts((attemptData as FluencyAttempt[]) ?? []);

      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <main
        className="flex flex-col gap-3 items-center justify-center"
        style={{ minHeight: "calc(100vh - 112px)" }}
      >
        <div className="spinner" aria-hidden="true" />
        <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading…</div>
      </main>
    );
  }

  if (notLinked) {
    return (
      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "3rem 1.25rem" }}>
        <div className="card text-center" style={{ padding: "3rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
          <p style={{ color: "#64748B" }}>
            No approved child link found. Go to the Dashboard to request a connection.
          </p>
        </div>
      </main>
    );
  }

  const firstName = childName.split(" ")[0] ?? "your child";

  return (
    <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.25rem" }}>
      <div className="mb-6">
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#0C2340",
            marginBottom: "0.25rem",
          }}
        >
          {firstName}&apos;s Reading Fluency
        </h1>
        <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
          How {firstName} is reading aloud — words correct per minute and accuracy, compared to
          national grade-level reading norms. You can listen back to each recording.
        </p>
      </div>

      <FluencyReport assessments={assessments} attempts={attempts} />
    </main>
  );
}
