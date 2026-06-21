"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Curriculum, CurriculumExtract, CurriculumUnit } from "@/types";

type Phase = "list" | "form" | "uploading" | "extracting" | "review" | "saving";

const SUBJECTS = ["ELA", "Math", "Science", "Social Studies", "Writing", "Reading", "Other"];

function fileKind(file: File): "pdf" | "csv" | "txt" | null {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".csv")) return "csv";
  if (n.endsWith(".txt")) return "txt";
  return null;
}

export default function CurriculumPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("list");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);

  // form
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("ELA");
  const [file, setFile] = useState<File | null>(null);
  const [extracted, setExtracted] = useState<CurriculumExtract | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  // Returns the curricula list, or null if the user was redirected away.
  async function fetchList(): Promise<Curriculum[] | null> {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/dashboard");
      return null;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || profile.role !== "teacher") {
      router.push("/dashboard");
      return null;
    }
    const { data } = await supabase
      .from("curricula")
      .select("*")
      .order("created_at", { ascending: false });
    return (data as Curriculum[]) ?? [];
  }

  useEffect(() => {
    async function init() {
      const list = await fetchList();
      if (list === null) return;
      setCurricula(list);
      setLoading(false);
    }
    void init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm() {
    setTitle("");
    setGrade("");
    setSubject("ELA");
    setFile(null);
    setExtracted(null);
    setFileUrl(null);
    setError(null);
  }

  async function handleExtract() {
    if (!file || !title.trim()) {
      setError("Add a title and choose a file first.");
      return;
    }
    const kind = fileKind(file);
    if (!kind) {
      setError("Unsupported file type. Upload a PDF, CSV, or TXT file.");
      return;
    }
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/dashboard");
      return;
    }

    // 1. Upload to storage
    setPhase("uploading");
    const unique = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const path = `${user.id}/${unique}`;
    const { error: upErr } = await supabase.storage
      .from("curricula")
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (upErr) {
      setError("Upload failed. Please try again.");
      setPhase("form");
      return;
    }
    setFileUrl(path);

    // 2. Extract via AI
    setPhase("extracting");
    try {
      const res = await fetch("/api/curriculum/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: path, fileType: kind }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Extraction failed.");
        setPhase("form");
        return;
      }
      setExtracted(json.extracted as CurriculumExtract);
      setPhase("review");
    } catch {
      setError("Something went wrong during extraction.");
      setPhase("form");
    }
  }

  function updateUnit(idx: number, patch: Partial<CurriculumUnit>) {
    if (!extracted) return;
    const units = extracted.units.map((u, i) => (i === idx ? { ...u, ...patch } : u));
    setExtracted({ ...extracted, units });
  }

  function removeUnit(idx: number) {
    if (!extracted) return;
    setExtracted({ ...extracted, units: extracted.units.filter((_, i) => i !== idx) });
  }

  async function handleSave() {
    if (!extracted) return;
    setPhase("saving");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/dashboard");
      return;
    }
    const { error: insErr } = await supabase.from("curricula").insert({
      teacher_id: user.id,
      title: title.trim(),
      grade: grade.trim() || null,
      subject,
      file_url: fileUrl,
      extracted,
      status: "confirmed",
    });
    if (insErr) {
      setError("Could not save the curriculum.");
      setPhase("review");
      return;
    }
    resetForm();
    const list = await fetchList();
    if (list !== null) setCurricula(list);
    setPhase("list");
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    await supabase.from("curricula").delete().eq("id", id);
    setCurricula((c) => c.filter((x) => x.id !== id));
  }

  return (
    <div className="min-h-screen" style={{ background: "#F7F9FC" }}>
      <header style={{ background: "#0C2340", padding: "0 2rem", height: "64px", display: "flex", alignItems: "center" }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "1.5rem" }}>🌟</span>
          <span style={{ fontFamily: "Georgia, serif", color: "#F7F9FC", fontSize: "1.25rem", fontWeight: 700 }}>
            Resolution Nation
          </span>
        </div>
      </header>

      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <Link
          href="/dashboard/teacher"
          style={{ color: "#028090", fontSize: "0.9375rem", fontWeight: 500, textDecoration: "none" }}
        >
          ← Back to Dashboard
        </Link>

        <div className="flex items-center justify-between flex-wrap gap-3" style={{ margin: "0.75rem 0 1.5rem" }}>
          <div>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "#0C2340" }}>
              Curriculum
            </h1>
            <p style={{ color: "#64748B", fontSize: "0.9375rem", marginTop: "0.25rem" }}>
              Upload a curriculum document. We&apos;ll pull out the units, standards, and skills so you can base AI
              roadmaps on it.
            </p>
          </div>
          {phase === "list" && (
            <button
              onClick={() => {
                resetForm();
                setPhase("form");
              }}
              className="btn-primary"
              style={{ padding: "0.5rem 1.25rem", fontSize: "0.9375rem" }}
            >
              + Upload Curriculum
            </button>
          )}
        </div>

        {error && (
          <div className="error-banner" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {/* LIST */}
        {phase === "list" &&
          (loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#64748B" }}>Loading…</div>
          ) : curricula.length === 0 ? (
            <div className="card" style={{ padding: "2.5rem", textAlign: "center", color: "#64748B" }}>
              <p style={{ fontSize: "1.0625rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>
                No curricula yet
              </p>
              <p style={{ fontSize: "0.9375rem" }}>Upload your first curriculum document to get started.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {curricula.map((c) => (
                <div key={c.id} className="card" style={{ padding: "1.25rem" }}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#0C2340" }}>{c.title}</div>
                      <div style={{ fontSize: "0.8125rem", color: "#64748B", marginTop: "0.2rem" }}>
                        {[c.subject, c.grade ? `Grade ${c.grade}` : null, `${c.extracted?.units?.length ?? 0} units`]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(c.id)}
                      style={{
                        background: "none",
                        border: "1px solid #E2E8F0",
                        color: "#DC2626",
                        borderRadius: "8px",
                        padding: "0.3rem 0.75rem",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  {c.extracted?.units && c.extracted.units.length > 0 && (
                    <div className="flex flex-wrap gap-2" style={{ marginTop: "0.75rem" }}>
                      {c.extracted.units.slice(0, 6).map((u, i) => (
                        <span
                          key={i}
                          style={{
                            background: "#F0F9FF",
                            color: "#0369A1",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            padding: "0.2rem 0.6rem",
                            borderRadius: "100px",
                          }}
                        >
                          {u.name}
                        </span>
                      ))}
                      {c.extracted.units.length > 6 && (
                        <span style={{ fontSize: "0.75rem", color: "#94A3B8", alignSelf: "center" }}>
                          +{c.extracted.units.length - 6} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

        {/* FORM */}
        {phase === "form" && (
          <div className="card" style={{ padding: "1.5rem" }}>
            <label style={labelStyle}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Grade 3 ELA Scope & Sequence"
              style={inputStyle}
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>Subject</label>
                <select value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle}>
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Grade (optional)</label>
                <input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="e.g. 3"
                  style={inputStyle}
                />
              </div>
            </div>

            <label style={labelStyle}>Document (PDF, CSV, or TXT)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ marginBottom: "1.25rem" }}
            />

            <div className="flex gap-3">
              <button onClick={handleExtract} className="btn-primary" style={{ padding: "0.625rem 1.5rem" }}>
                Upload & Extract
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setPhase("list");
                }}
                style={{
                  background: "none",
                  border: "1px solid #CBD5E1",
                  borderRadius: "8px",
                  padding: "0.625rem 1.5rem",
                  fontWeight: 600,
                  color: "#64748B",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* UPLOADING / EXTRACTING */}
        {(phase === "uploading" || phase === "extracting") && (
          <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
            <div className="spinner" aria-hidden="true" style={{ margin: "0 auto 1rem" }} />
            <p style={{ color: "#028090", fontSize: "1.0625rem", fontWeight: 600 }}>
              {phase === "uploading" ? "Uploading document…" : "Reading the curriculum and pulling out units…"}
            </p>
          </div>
        )}

        {/* REVIEW */}
        {phase === "review" && extracted && (
          <div className="card" style={{ padding: "1.5rem" }}>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1875rem", fontWeight: 700, color: "#0C2340", marginBottom: "0.25rem" }}>
              Review extracted units
            </h2>
            <p style={{ color: "#64748B", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              Edit anything that needs fixing, then save. Roadmaps can be built from these units in the next step.
            </p>

            <div className="flex flex-col gap-3">
              {extracted.units.map((u, idx) => (
                <div key={idx} style={{ border: "1px solid #E2E8F0", borderRadius: "10px", padding: "1rem" }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: "0.5rem" }}>
                    <span
                      style={{
                        background: "#028090",
                        color: "white",
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={u.name}
                      onChange={(e) => updateUnit(idx, { name: e.target.value })}
                      style={{ ...inputStyle, marginBottom: 0, fontWeight: 600 }}
                    />
                    <button
                      onClick={() => removeUnit(idx)}
                      style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, flexShrink: 0 }}
                    >
                      Remove
                    </button>
                  </div>
                  <label style={miniLabel}>Standards (comma-separated)</label>
                  <input
                    type="text"
                    value={u.standards.join(", ")}
                    onChange={(e) =>
                      updateUnit(idx, { standards: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                    }
                    style={inputStyle}
                  />
                  <label style={miniLabel}>Skills (comma-separated)</label>
                  <input
                    type="text"
                    value={u.skills.join(", ")}
                    onChange={(e) =>
                      updateUnit(idx, { skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                    }
                    style={{ ...inputStyle, marginBottom: 0 }}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3" style={{ marginTop: "1.5rem" }}>
              <button onClick={handleSave} className="btn-primary" style={{ padding: "0.625rem 1.5rem" }}>
                Save Curriculum
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setPhase("list");
                }}
                style={{
                  background: "none",
                  border: "1px solid #CBD5E1",
                  borderRadius: "8px",
                  padding: "0.625rem 1.5rem",
                  fontWeight: 600,
                  color: "#64748B",
                  cursor: "pointer",
                }}
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {phase === "saving" && (
          <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
            <div className="spinner" aria-hidden="true" style={{ margin: "0 auto 1rem" }} />
            <p style={{ color: "#028090", fontSize: "1.0625rem", fontWeight: 600 }}>Saving…</p>
          </div>
        )}
      </main>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "0.35rem",
};
const miniLabel: React.CSSProperties = {
  display: "block",
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: "#94A3B8",
  marginBottom: "0.25rem",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.875rem",
  borderRadius: "8px",
  border: "1px solid #CBD5E1",
  fontSize: "0.9375rem",
  marginBottom: "1rem",
};
