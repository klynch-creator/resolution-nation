"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mic, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { FluencyAttempt, FluencyLevel } from "@/types";

const LEVEL_STYLE: Record<FluencyLevel, { label: string; color: string; bg: string }> = {
  below: { label: "Below grade level", color: "#B91C1C", bg: "#FEE2E2" },
  approaching: { label: "Approaching grade level", color: "#B45309", bg: "#FEF3C7" },
  on: { label: "On / above grade level", color: "#047857", bg: "#D1FAE5" },
};

/**
 * Compact reading-fluency summary for the teacher's per-student analytics page.
 * Self-contained: does its own fetch so it can't break the host page.
 */
export default function FluencyAnalyticsCard({ studentId }: { studentId: string }) {
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<FluencyAttempt[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("fluency_attempts")
          .select("*")
          .eq("student_id", studentId)
          .order("created_at", { ascending: true });
        setAttempts((data as FluencyAttempt[]) ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [studentId]);

  if (loading) return null;

  const href = `/dashboard/teacher/students/${studentId}/fluency`;

  if (attempts.length === 0) {
    return (
      <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mic size={18} color="#7C3AED" aria-hidden="true" />
            <span style={{ fontWeight: 700, color: "#0C2340" }}>Reading Fluency</span>
          </div>
          <Link href={href} style={{ color: "#7C3AED", fontWeight: 700, fontSize: "0.8125rem", textDecoration: "none" }}>
            Open →
          </Link>
        </div>
        <p style={{ color: "#94A3B8", fontSize: "0.875rem", marginTop: "0.5rem" }}>
          No read-aloud sessions yet.
        </p>
      </div>
    );
  }

  const latest = attempts[attempts.length - 1];
  const first = attempts[0];
  const best = Math.max(...attempts.map((a) => a.wcpm));
  const trend = attempts.length > 1 ? latest.wcpm - first.wcpm : null;
  const lvl = latest.level ? LEVEL_STYLE[latest.level] : null;

  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div className="card card-hover" style={{ padding: "1.25rem", marginBottom: "1.5rem", borderLeft: "4px solid #7C3AED" }}>
        <div className="flex items-center justify-between gap-2" style={{ marginBottom: "0.75rem" }}>
          <div className="flex items-center gap-2">
            <Mic size={18} color="#7C3AED" aria-hidden="true" />
            <span style={{ fontWeight: 700, color: "#0C2340" }}>Reading Fluency</span>
          </div>
          <span style={{ color: "#7C3AED", fontWeight: 700, fontSize: "0.8125rem" }}>
            View report →
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0C2340", lineHeight: 1 }}>
              {latest.wcpm}
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#64748B" }}> WCPM</span>
            </div>
            <div style={{ fontSize: "0.6875rem", color: "#94A3B8", fontWeight: 600 }}>most recent read</div>
          </div>

          <div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0C2340" }}>{best}</div>
            <div style={{ fontSize: "0.6875rem", color: "#94A3B8", fontWeight: 600 }}>best WCPM</div>
          </div>

          {trend != null && (
            <div className="flex items-center gap-1" style={{ color: trend >= 0 ? "#047857" : "#B45309", fontWeight: 700, fontSize: "0.875rem" }}>
              <TrendingUp size={15} aria-hidden="true" />
              {trend >= 0 ? `+${trend}` : trend} over {attempts.length} reads
            </div>
          )}

          {lvl && (
            <span
              style={{
                marginLeft: "auto",
                background: lvl.bg,
                color: lvl.color,
                fontSize: "0.75rem",
                fontWeight: 700,
                padding: "0.2rem 0.7rem",
                borderRadius: "100px",
              }}
            >
              {lvl.label}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
