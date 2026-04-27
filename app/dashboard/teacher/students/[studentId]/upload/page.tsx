"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ExtractedReportCard, ExtractedSubject, Profile } from "@/types";

type PageState = "idle" | "selected" | "uploading" | "extracting" | "reviewing" | "confirming" | "error";

function SubjectCard({
  subject,
  index,
  onChange,
}: {
  subject: ExtractedSubject;
  index: number;
  onChange: (index: number, updated: ExtractedSubject) => void;
}) {
  function update(field: keyof ExtractedSubject, value: string) {
    onChange(index, { ...subject, [field]: value });
  }

  return (
    <div
      className="card"
      style={{
        padding: "1.25rem",
        border: "1.5px solid #E2E8F0",
        boxShadow: "none",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#64748B",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.25rem",
            }}
          >
            Subject
          </label>
          <input
            type="text"
            value={subject.name}
            onChange={(e) => update("name", e.target.value)}
            style={{ fontSize: "0.9375rem" }}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#64748B",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.25rem",
            }}
          >
            Score
          </label>
          <input
            type="text"
            value={String(subject.score)}
            onChange={(e) => update("score", e.target.value)}
            style={{ fontSize: "0.9375rem" }}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#64748B",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.25rem",
            }}
          >
            Scale
          </label>
          <input
            type="text"
            value={subject.scale}
            onChange={(e) => update("scale", e.target.value)}
            placeholder="e.g. A-F, 1-4, 0-100"
            style={{ fontSize: "0.9375rem" }}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#64748B",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.25rem",
            }}
          >
            Standard Code
            <span style={{ fontWeight: 400, color: "#94A3B8", marginLeft: "0.25rem" }}>
              (optional)
            </span>
          </label>
          <input
            type="text"
            value={subject.standard ?? ""}
            onChange={(e) => update("standard", e.target.value)}
            placeholder="e.g. CCSS.MATH.3.OA"
            style={{ fontSize: "0.9375rem" }}
          />
        </div>
      </div>
      {/* Notes row spans full width */}
      <div style={{ marginTop: "0.75rem" }}>
        <label
          style={{
            display: "block",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "#64748B",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "0.25rem",
          }}
        >
          Teacher Notes
          <span style={{ fontWeight: 400, color: "#94A3B8", marginLeft: "0.25rem" }}>
            (optional)
          </span>
        </label>
        <input
          type="text"
          value={subject.notes ?? ""}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Any notes about this subject"
          style={{ fontSize: "0.9375rem" }}
        />
      </div>
    </div>
  );
}

export default function UploadPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId;
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>("idle");
  const [student, setStudent] = useState<Profile | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadRecordId, setUploadRecordId] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedReportCard | null>(null);

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

      setTeacherId(user.id);

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
      setAuthLoading(false);
    }
    load();
  }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  function validateFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "csv") {
      setErrorMsg("Only PDF and CSV files are supported.");
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("File must be under 10 MB.");
      return false;
    }
    return true;
  }

  function handleFileSelect(file: File) {
    if (!validateFile(file)) return;
    setErrorMsg(null);
    setSelectedFile(file);
    setPageState("selected");
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  async function handleUploadAndAnalyze() {
    if (!selectedFile || !teacherId || !studentId) return;

    setPageState("uploading");
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const ext = selectedFile.name.split(".").pop()?.toLowerCase() as "pdf" | "csv";
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const storagePath = `${teacherId}/${studentId}/${uniqueName}`;

      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("report-cards")
        .upload(storagePath, selectedFile, { contentType: selectedFile.type });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // 2. Insert DB record
      const { data: record, error: insertError } = await supabase
        .from("student_data_uploads")
        .insert({
          student_id: studentId,
          teacher_id: teacherId,
          file_type: ext,
          file_url: storagePath,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError || !record) {
        throw new Error("Could not save upload record.");
      }

      setUploadRecordId(record.id);
      setPageState("extracting");

      // 3. Call extraction API
      const response = await fetch("/api/extract-report-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: storagePath,
          fileType: ext,
          studentId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.extractedData) {
        throw new Error(result.error ?? "Extraction failed.");
      }

      // 4. Update DB record with extracted data
      await supabase
        .from("student_data_uploads")
        .update({ extracted_data: result.extractedData })
        .eq("id", record.id);

      setExtractedData(result.extractedData);
      setPageState("reviewing");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMsg(msg);
      setPageState("error");
    }
  }

  function handleSubjectChange(index: number, updated: ExtractedSubject) {
    if (!extractedData) return;
    const subjects = [...extractedData.subjects];
    subjects[index] = updated;
    setExtractedData({ ...extractedData, subjects });
  }

  async function handleConfirm() {
    if (!uploadRecordId || !extractedData) return;
    setPageState("confirming");

    const supabase = createClient();
    await supabase
      .from("student_data_uploads")
      .update({ extracted_data: extractedData, status: "confirmed" })
      .eq("id", uploadRecordId);

    router.push(
      `/dashboard/teacher/students/${studentId}/goals/review?uploadId=${uploadRecordId}`
    );
  }

  function handleStartOver() {
    setSelectedFile(null);
    setExtractedData(null);
    setUploadRecordId(null);
    setErrorMsg(null);
    setPageState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (authLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#F7F9FC" }}
      >
        <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading…</div>
      </div>
    );
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
            Upload Report Card
          </span>
        </div>
      </header>

      <main style={{ maxWidth: "700px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Student info */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.625rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.25rem",
            }}
          >
            {student?.full_name}
          </h1>
          {student?.grade && (
            <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
              Grade {student.grade}
            </p>
          )}
        </div>

        {/* ── UPLOAD STATE ── */}
        {(pageState === "idle" || pageState === "selected" || pageState === "error") && (
          <div className="card" style={{ padding: "2rem" }}>
            <h2
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "1.25rem",
              }}
            >
              Upload Report Card
            </h2>

            {/* Drag-and-drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? "#028090" : selectedFile ? "#02C39A" : "#CBD5E1"}`,
                borderRadius: "12px",
                padding: "2.5rem 1.5rem",
                textAlign: "center",
                cursor: "pointer",
                background: isDragging
                  ? "#F0FAFA"
                  : selectedFile
                  ? "#F0FFF8"
                  : "#FAFBFC",
                transition: "border-color 0.15s, background 0.15s",
                marginBottom: "1.25rem",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.csv"
                onChange={handleInputChange}
                style={{ display: "none" }}
              />
              {selectedFile ? (
                <>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
                    {selectedFile.name.endsWith(".pdf") ? "📄" : "📊"}
                  </div>
                  <p
                    style={{
                      fontWeight: 600,
                      color: "#028090",
                      fontSize: "0.9375rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {selectedFile.name}
                  </p>
                  <p style={{ color: "#94A3B8", fontSize: "0.8125rem" }}>
                    {(selectedFile.size / 1024).toFixed(1)} KB — click to change
                  </p>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📁</div>
                  <p
                    style={{
                      fontWeight: 600,
                      color: "#374151",
                      fontSize: "1rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Drag & drop or click to browse
                  </p>
                  <p style={{ color: "#94A3B8", fontSize: "0.875rem" }}>
                    Supports PDF and CSV — max 10 MB
                  </p>
                </>
              )}
            </div>

            {errorMsg && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FCA5A5",
                  borderRadius: "8px",
                  padding: "0.75rem 1rem",
                  color: "#DC2626",
                  fontSize: "0.875rem",
                  marginBottom: "1.25rem",
                }}
              >
                {errorMsg}
              </div>
            )}

            <button
              onClick={handleUploadAndAnalyze}
              disabled={!selectedFile}
              className="btn-primary"
              style={{
                width: "100%",
                padding: "0.875rem",
                fontSize: "1rem",
                opacity: !selectedFile ? 0.5 : 1,
                cursor: !selectedFile ? "not-allowed" : "pointer",
              }}
            >
              Upload & Analyze
            </button>
          </div>
        )}

        {/* ── UPLOADING STATE ── */}
        {pageState === "uploading" && (
          <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                border: "4px solid #E2E8F0",
                borderTopColor: "#028090",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 1.25rem",
              }}
            />
            <p style={{ fontSize: "1.125rem", fontWeight: 600, color: "#0C2340" }}>
              Uploading file…
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── EXTRACTING STATE ── */}
        {pageState === "extracting" && (
          <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🤖</div>
            <p
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "#0C2340",
                marginBottom: "0.5rem",
              }}
            >
              AI is reading the report card…
            </p>
            <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
              Extracting subjects, grades, and standards. This takes a few seconds.
            </p>
          </div>
        )}

        {/* ── REVIEW STATE ── */}
        {(pageState === "reviewing" || pageState === "confirming") && extractedData && (
          <div>
            {/* Review header */}
            <div
              style={{
                background: "#FFFBEB",
                border: "1.5px solid #FDE68A",
                borderRadius: "12px",
                padding: "1rem 1.25rem",
                marginBottom: "1.5rem",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
              }}
            >
              <span style={{ fontSize: "1.25rem", flexShrink: 0 }}>✏️</span>
              <div>
                <p
                  style={{
                    fontWeight: 700,
                    color: "#92400E",
                    fontSize: "0.9375rem",
                    marginBottom: "0.125rem",
                  }}
                >
                  AI extracted this data — please review and confirm
                </p>
                <p style={{ color: "#B45309", fontSize: "0.875rem" }}>
                  Edit any field that looks incorrect before generating goals.
                </p>
              </div>
            </div>

            {/* Grade level */}
            {extractedData.grade_level && (
              <div style={{ marginBottom: "1rem" }}>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    color: "#64748B",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Grade Level:&nbsp;
                </span>
                <span style={{ color: "#0C2340", fontWeight: 600 }}>
                  {extractedData.grade_level}
                </span>
              </div>
            )}

            {/* Subject cards */}
            <div className="flex flex-col gap-3" style={{ marginBottom: "1.5rem" }}>
              {extractedData.subjects.map((subject, i) => (
                <SubjectCard
                  key={i}
                  subject={subject}
                  index={i}
                  onChange={handleSubjectChange}
                />
              ))}
            </div>

            {/* Overall notes */}
            {extractedData.overall_notes && (
              <div className="card" style={{ padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
                <p
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "0.375rem",
                  }}
                >
                  Overall Notes
                </p>
                <p style={{ color: "#374151", fontSize: "0.9375rem" }}>
                  {extractedData.overall_notes}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleStartOver}
                disabled={pageState === "confirming"}
                className="btn-secondary"
                style={{ flex: 1, padding: "0.875rem" }}
              >
                Start Over
              </button>
              <button
                onClick={handleConfirm}
                disabled={pageState === "confirming"}
                className="btn-primary"
                style={{ flex: 2, padding: "0.875rem", fontSize: "1rem" }}
              >
                {pageState === "confirming"
                  ? "Saving…"
                  : "✨ Looks good — Generate Goals"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
