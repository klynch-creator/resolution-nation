"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ParentLinkPage() {
  const router = useRouter();

  const [childEmail, setChildEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [childName, setChildName] = useState("");

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Find student by email via a server-side lookup
    const response = await fetch("/api/parent/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childEmail: childEmail.trim().toLowerCase() }),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error ?? "Could not find a student with that email.");
      setLoading(false);
      return;
    }

    setChildName(result.childName);
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
            You&apos;re now connected to <strong>{childName}</strong>&apos;s account. You can
            see their goals and progress from your dashboard.
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
      <div style={{ width: "100%", maxWidth: "420px" }}>
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
              Enter your child&apos;s email address to connect their account to yours.
            </p>
          </div>

          {error && (
            <div
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
                style={{
                  display: "block",
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Child&apos;s Email Address
              </label>
              <input
                type="email"
                value={childEmail}
                onChange={(e) => setChildEmail(e.target.value)}
                placeholder="child@example.com"
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ height: "3rem", fontSize: "1.0625rem", marginTop: "0.5rem" }}
            >
              {loading ? "Linking…" : "Link Child's Account"}
            </button>
          </form>

          <p
            style={{
              textAlign: "center",
              marginTop: "1.25rem",
              color: "#64748B",
              fontSize: "0.875rem",
              lineHeight: 1.6,
            }}
          >
            Your child must already have a Resolution Nation account. If they don&apos;t,{" "}
            <Link href="/auth/signup" style={{ color: "#028090", fontWeight: 600 }}>
              create one here
            </Link>
            .
          </p>

          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              background: "#F8FAFC",
              borderRadius: "8px",
              fontSize: "0.8125rem",
              color: "#64748B",
              lineHeight: 1.5,
            }}
          >
            <strong>Note:</strong> For students under 13, you can also ask their teacher
            to send you a parent-link code from the classroom settings.
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
