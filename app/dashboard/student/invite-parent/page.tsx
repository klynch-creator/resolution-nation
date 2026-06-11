"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";

export default function InviteParentPage() {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setCopied(false);

    const res = await fetch("/api/parent/link/code", { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Could not generate a code.");
      setLoading(false);
      return;
    }

    setCode(data.code);
    setLoading(false);
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked in some embedded webviews; silently fail.
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#F7F9FC" }}
    >
      <div style={{ width: "100%", maxWidth: "440px" }}>
        <div className="card">
          <div className="text-center mb-6">
            <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>👨‍👩‍👧</div>
            <h1
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "0.5rem",
              }}
            >
              Invite a Parent
            </h1>
            <p style={{ color: "#64748B", fontSize: "1rem", lineHeight: 1.6 }}>
              Generate a code and share it with your parent so they can see
              your goals and progress.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: "#FEF2F2",
                border: "1px solid #FCA5A5",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
                color: "#DC2626",
                fontSize: "0.9375rem",
                marginBottom: "1rem",
              }}
            >
              {error}
            </div>
          )}

          {!code ? (
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="btn-primary"
              style={{
                height: "3rem",
                fontSize: "1.0625rem",
                width: "100%",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Creating code…" : "Create a Parent Code"}
            </button>
          ) : (
            <>
              <div
                style={{
                  background: "#F0F9FF",
                  border: "2px dashed #028090",
                  borderRadius: "12px",
                  padding: "1.5rem",
                  textAlign: "center",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#028090",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Your Code
                </div>
                <div
                  aria-live="polite"
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                    fontSize: "2.25rem",
                    fontWeight: 700,
                    letterSpacing: "0.3em",
                    color: "#0C2340",
                  }}
                >
                  {code}
                </div>
              </div>

              <button
                type="button"
                onClick={copy}
                className="btn-primary"
                style={{
                  height: "2.75rem",
                  width: "100%",
                  marginBottom: "0.75rem",
                }}
              >
                {copied ? "✓ Copied" : "Copy Code"}
              </button>

              <button
                type="button"
                onClick={generate}
                disabled={loading}
                style={{
                  height: "2.5rem",
                  width: "100%",
                  border: "1px solid #CBD5E1",
                  borderRadius: "8px",
                  background: "white",
                  color: "#475569",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {loading ? "Working…" : "Generate a different code"}
              </button>

              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.875rem",
                  background: "#F8FAFC",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                  color: "#475569",
                  lineHeight: 1.55,
                }}
              >
                Share this code with your parent. They&apos;ll enter it on
                their Resolution Nation page. The code works once and expires
                in 7 days.
              </div>
            </>
          )}

          <div className="flex justify-center mt-4">
            <Link
              href="/dashboard/student"
              style={{ color: "#64748B", fontSize: "0.875rem" }}
            >
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
