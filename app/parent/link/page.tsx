"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ParentLinkPage() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/parent/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error ?? "Could not link account.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "#F7F9FC" }}
      >
        <div className="card text-center" style={{ maxWidth: "420px" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.75rem",
            }}
          >
            Linked Successfully!
          </h2>
          <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            You&apos;re now connected to your child&apos;s account. You can see their
            goals and progress from your dashboard.
          </p>
          <button
            onClick={() => router.push("/dashboard/parent")}
            className="btn-primary"
            style={{ width: "100%" }}
          >
            Go to My Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#F7F9FC" }}
    >
      <div style={{ width: "100%", maxWidth: "440px" }}>
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <span style={{ fontSize: "1.75rem" }}>🌟</span>
            <span
              style={{
                fontFamily: "Georgia, serif",
                color: "#0C2340",
                fontSize: "1.5rem",
                fontWeight: 700,
              }}
            >
              Resolution Nation
            </span>
          </Link>
        </div>

        <div className="card">
          <div className="text-center mb-6">
            <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>👪</div>
            <h1
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "0.5rem",
              }}
            >
              Link Your Child
            </h1>
            <p style={{ color: "#64748B", fontSize: "1rem", lineHeight: 1.6 }}>
              Enter the 6-character code your child shared with you.
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

          <form onSubmit={handleLink} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="parent-link-code"
                style={{
                  display: "block",
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Invite Code
              </label>
              <input
                id="parent-link-code"
                type="text"
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 6)
                  )
                }
                placeholder="ABC123"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="one-time-code"
                spellCheck={false}
                required
                autoFocus
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                  fontSize: "1.5rem",
                  textAlign: "center",
                  letterSpacing: "0.3em",
                  textTransform: "uppercase",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="btn-primary"
              style={{
                height: "3rem",
                fontSize: "1.0625rem",
                marginTop: "0.5rem",
                opacity: loading || code.length !== 6 ? 0.6 : 1,
              }}
            >
              {loading ? "Linking…" : "Link Child's Account"}
            </button>
          </form>

          <div
            style={{
              marginTop: "1.25rem",
              padding: "0.875rem",
              background: "#F8FAFC",
              borderRadius: "8px",
              fontSize: "0.875rem",
              color: "#475569",
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: "#0C2340" }}>How do I get a code?</strong>
            <br />
            Your child can generate one from the &ldquo;Invite a parent&rdquo;
            screen in their student dashboard. Codes expire after 7 days and can
            be used once.
          </div>

          <div className="flex justify-center mt-4">
            <Link
              href="/dashboard/parent"
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
