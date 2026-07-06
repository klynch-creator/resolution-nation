"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Parent settings: "Download my child's data" (RN-26).
 * Lists approved children and downloads a JSON export per child.
 */

type Child = { id: string; full_name: string };

export default function DataExportSection() {
  const [children, setChildren] = useState<Child[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: links } = await supabase
        .from("parent_student_links")
        .select("student_id")
        .eq("parent_id", user.id)
        .eq("status", "approved");
      const ids = (links ?? []).map((l) => l.student_id);
      if (ids.length === 0) return;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      setChildren((profiles ?? []) as Child[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function download(child: Child) {
    setBusyId(child.id);
    setError(null);
    try {
      const res = await fetch("/api/parent/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: child.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Export failed. Please try again.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resolution-nation-${child.full_name.replace(/\s+/g, "-").toLowerCase()}-data.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (children.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: "1.5rem" }}>
      <h2
        style={{
          fontFamily: "Georgia, serif",
          fontSize: "1.125rem",
          fontWeight: 700,
          color: "#0C2340",
          marginBottom: "0.5rem",
        }}
      >
        Download my child&apos;s data
      </h2>
      <p style={{ color: "#64748B", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Download a complete copy of your child&apos;s educational record (goals,
        lessons, reading, writing, and progress) as a JSON file. You can request
        this at any time.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        {children.map((c) => (
          <button
            key={c.id}
            className="btn-secondary"
            disabled={busyId !== null}
            onClick={() => download(c)}
          >
            {busyId === c.id ? "Preparing…" : `Download ${c.full_name}'s data`}
          </button>
        ))}
      </div>
    </div>
  );
}
