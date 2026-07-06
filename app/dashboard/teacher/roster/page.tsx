"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * CSV roster import (RN-37).
 *
 * Paste or upload a CSV with columns: First Name, Last Name, Grade (optional).
 * Accounts are created with synthetic usernames + kid-friendly passwords;
 * credentials are shown ONCE with print + download options.
 */

type Pod = { id: string; name: string };
type Row = { firstName: string; lastName: string; grade: string };
type Result = {
  fullName: string;
  grade: string | null;
  username: string;
  password: string;
  ok: boolean;
  error?: string;
};

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const rows: Row[] = [];
  let start = 0;
  // Skip a header row if it looks like one.
  if (/first|last|name|grade/i.test(lines[0])) start = 1;
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length === 1 && cols[0].includes(" ")) {
      // Single "Full Name" column fallback.
      const parts = cols[0].split(/\s+/);
      rows.push({ firstName: parts[0], lastName: parts.slice(1).join(" "), grade: "" });
    } else {
      rows.push({ firstName: cols[0] ?? "", lastName: cols[1] ?? "", grade: cols[2] ?? "" });
    }
  }
  return rows.filter((r) => r.firstName || r.lastName);
}

export default function RosterImportPage() {
  const [pods, setPods] = useState<Pod[]>([]);
  const [podId, setPodId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [podName, setPodName] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("pods")
        .select("id, name")
        .eq("created_by", user.id)
        .eq("type", "class");
      setPods((data ?? []) as Pod[]);
      const params = new URLSearchParams(window.location.search);
      const preset = params.get("podId");
      if (preset) setPodId(preset);
    })();
  }, []);

  function handleCsv(text: string) {
    setCsvText(text);
    setRows(parseCsv(text));
  }

  async function handleFile(f: File | null) {
    if (!f) return;
    handleCsv(await f.text());
  }

  async function runImport() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/roster/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ podId, students: rows }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Import failed.");
      setResults(j.results as Result[]);
      setPodName(j.podName ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  function downloadCredentials() {
    if (!results) return;
    const ok = results.filter((r) => r.ok);
    const csv = ["Name,Grade,Username,Password"]
      .concat(ok.map((r) => `"${r.fullName}","${r.grade ?? ""}","${r.username}","${r.password}"`))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `login-cards-${podName.replace(/\s+/g, "-").toLowerCase() || "class"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const label: React.CSSProperties = {
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "0.375rem",
  };

  // ── Results view: credentials shown once, printable ──────────────────────
  if (results) {
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    return (
      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.5rem", fontWeight: 700, color: "#0C2340", marginBottom: "0.5rem" }}>
          {ok.length} student account{ok.length === 1 ? "" : "s"} created 🎉
        </h1>
        <p style={{ color: "#B45309", fontSize: "0.875rem", marginBottom: "1rem", fontWeight: 600 }}>
          ⚠️ Passwords are shown only once. Print or download the login cards now.
        </p>
        <div className="flex gap-3 mb-6 flex-wrap" style={{ display: "flex" }}>
          <button className="btn-primary" onClick={() => window.print()}>🖨 Print login cards</button>
          <button className="btn-secondary" onClick={downloadCredentials}>⬇ Download CSV</button>
          <Link href="/dashboard/teacher" className="btn-secondary" style={{ textDecoration: "none" }}>Done</Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ok.map((r) => (
            <div key={r.username} className="card" style={{ pageBreakInside: "avoid" }}>
              <div style={{ fontWeight: 700, color: "#0C2340", marginBottom: "0.25rem" }}>🌟 {r.fullName}</div>
              {r.grade && <div style={{ fontSize: "0.8125rem", color: "#64748B" }}>Grade {r.grade}</div>}
              <div style={{ fontFamily: "monospace", fontSize: "0.875rem", marginTop: "0.5rem" }}>
                <div><strong>Username:</strong> {r.username}</div>
                <div><strong>Password:</strong> {r.password}</div>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "0.5rem" }}>
                Sign in at resolutionnation.app
              </div>
            </div>
          ))}
        </div>

        {failed.length > 0 && (
          <div className="card" style={{ marginTop: "1.5rem", borderTop: "4px solid #DC2626" }}>
            <h2 style={{ fontWeight: 700, color: "#DC2626", marginBottom: "0.5rem" }}>
              {failed.length} row{failed.length === 1 ? "" : "s"} failed
            </h2>
            {failed.map((r, i) => (
              <div key={i} style={{ fontSize: "0.875rem", color: "#475569" }}>
                {r.fullName}: {r.error}
              </div>
            ))}
          </div>
        )}
      </main>
    );
  }

  // ── Import form ───────────────────────────────────────────────────────────
  return (
    <main style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1.25rem" }}>
      <div className="mb-6">
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "#0C2340", marginBottom: "0.25rem" }}>
          Import roster 📋
        </h1>
        <p style={{ color: "#64748B", fontSize: "0.9375rem", lineHeight: 1.6 }}>
          Upload or paste a CSV with columns <strong>First Name, Last Name, Grade</strong> (grade
          optional). Student accounts are created instantly with usernames and passwords — no
          student email needed. As their school, you provide COPPA consent for educational use.
        </p>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <label style={label}>Class</label>
          <select value={podId} onChange={(e) => setPodId(e.target.value)}>
            <option value="">Choose a class…</option>
            {pods.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={label}>CSV file</label>
          <input type="file" accept=".csv,text/csv" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </div>

        <div>
          <label style={label}>…or paste roster</label>
          <textarea
            rows={6}
            placeholder={"First Name,Last Name,Grade\nJordan,Smith,4\nMaria,Lopez,4"}
            value={csvText}
            onChange={(e) => handleCsv(e.target.value)}
          />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 style={{ fontWeight: 700, color: "#0C2340", marginBottom: "0.75rem" }}>
            Preview — {rows.length} student{rows.length === 1 ? "" : "s"}
          </h2>
          <div className="table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#64748B", borderBottom: "1px solid #E2E8F0" }}>
                  <th style={{ padding: "0.5rem" }}>First</th>
                  <th style={{ padding: "0.5rem" }}>Last</th>
                  <th style={{ padding: "0.5rem" }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 40).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "0.5rem" }}>{r.firstName}</td>
                    <td style={{ padding: "0.5rem" }}>{r.lastName}</td>
                    <td style={{ padding: "0.5rem" }}>{r.grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 40 && (
            <p style={{ color: "#B45309", fontSize: "0.8125rem", marginTop: "0.5rem" }}>
              Only the first 40 will be imported — run a second batch for the rest.
            </p>
          )}
        </div>
      )}

      <button
        className="btn-primary"
        disabled={!podId || rows.length === 0 || importing}
        onClick={runImport}
        style={{ width: "100%" }}
      >
        {importing ? "Creating accounts…" : `Create ${Math.min(rows.length, 40)} student account${rows.length === 1 ? "" : "s"}`}
      </button>
    </main>
  );
}
