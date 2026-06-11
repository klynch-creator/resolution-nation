"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type DeletionStatus = {
  pending: boolean;
  request: {
    requested_at?: string;
    scheduled_for?: string;
    cancelled_at?: string | null;
    completed_at?: string | null;
  } | null;
};

export default function DeleteAccountPage() {
  const router = useRouter();

  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      const res = await fetch("/api/account/delete");
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data);
    } catch {
      // Non-fatal; user can still submit.
    }
  }

  async function requestDeletion() {
    setError(null);
    setInfo(null);

    if (confirmText.trim().toUpperCase() !== "DELETE") {
      setError('Type "DELETE" in the confirmation box to continue.');
      return;
    }

    setLoading(true);
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || null }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not submit the deletion request.");
      return;
    }
    setInfo(data.message ?? "Deletion scheduled.");
    setConfirmText("");
    setReason("");
    refresh();
  }

  async function cancelDeletion() {
    setError(null);
    setInfo(null);
    setLoading(true);
    const res = await fetch("/api/account/delete", { method: "DELETE" });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not cancel the deletion request.");
      return;
    }
    setInfo(
      data.cancelled
        ? "Your deletion request was cancelled. Your account will remain active."
        : "No active deletion request to cancel."
    );
    refresh();
  }

  return (
    <div
      className="min-h-screen flex justify-center px-4 py-10"
      style={{ background: "#F7F9FC" }}
    >
      <div style={{ width: "100%", maxWidth: "560px" }}>
        <Link
          href="/dashboard"
          style={{
            color: "#64748B",
            fontSize: "0.875rem",
            marginBottom: "1rem",
            display: "inline-block",
          }}
        >
          ← Back to dashboard
        </Link>

        <div className="card">
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.5rem",
            }}
          >
            Delete My Account
          </h1>
          <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            You can delete your Resolution Nation account at any time. Your data
            will be removed from our systems 30 days after you request deletion,
            giving you time to change your mind.
          </p>

          {status?.pending && status.request?.scheduled_for ? (
            <div
              style={{
                background: "#FEF3C7",
                border: "1px solid #FCD34D",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1.25rem",
                color: "#92400E",
                lineHeight: 1.6,
              }}
            >
              <strong>Deletion scheduled.</strong> Your account is scheduled to
              be deleted on{" "}
              <strong>
                {new Date(status.request.scheduled_for).toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "long", day: "numeric" }
                )}
              </strong>
              . You can cancel anytime before then.
            </div>
          ) : null}

          {error && (
            <div
              role="alert"
              style={{
                background: "#FEF2F2",
                border: "1px solid #FCA5A5",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
                color: "#B91C1C",
                fontSize: "0.9375rem",
                marginBottom: "1rem",
              }}
            >
              {error}
            </div>
          )}

          {info && (
            <div
              role="status"
              style={{
                background: "#ECFDF5",
                border: "1px solid #6EE7B7",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
                color: "#065F46",
                fontSize: "0.9375rem",
                marginBottom: "1rem",
              }}
            >
              {info}
            </div>
          )}

          {status?.pending ? (
            <button
              type="button"
              onClick={cancelDeletion}
              disabled={loading}
              className="btn-primary"
              style={{
                height: "3rem",
                width: "100%",
                fontSize: "1.0625rem",
              }}
            >
              {loading ? "Working…" : "Keep my account"}
            </button>
          ) : (
            <>
              <h2
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#0C2340",
                  marginBottom: "0.5rem",
                  marginTop: "0.5rem",
                }}
              >
                What gets deleted
              </h2>
              <ul
                style={{
                  paddingLeft: "1.25rem",
                  color: "#475569",
                  lineHeight: 1.7,
                  marginBottom: "1.25rem",
                }}
              >
                <li>Your profile, sign-in, and dashboard.</li>
                <li>Your goals, learning roadmaps, and workout history.</li>
                <li>Your star balance, inventory, and store activity.</li>
                <li>Your audit log entries.</li>
              </ul>
              <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: "1.5rem" }}>
                Data shared with classmates or teachers (such as a gift you
                sent) may remain visible to them, but your personal information
                will be removed from those records.
              </p>

              <label
                htmlFor="delete-reason"
                style={{
                  display: "block",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "0.375rem",
                }}
              >
                Reason (optional)
              </label>
              <textarea
                id="delete-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Help us understand why you're leaving."
                style={{
                  width: "100%",
                  border: "1px solid #CBD5E1",
                  borderRadius: "8px",
                  padding: "0.625rem 0.75rem",
                  fontSize: "0.9375rem",
                  marginBottom: "1rem",
                }}
              />

              <label
                htmlFor="delete-confirm"
                style={{
                  display: "block",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "0.375rem",
                }}
              >
                Type DELETE to confirm
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                  letterSpacing: "0.15em",
                  marginBottom: "1rem",
                }}
              />

              <button
                type="button"
                onClick={requestDeletion}
                disabled={loading || confirmText.trim().toUpperCase() !== "DELETE"}
                style={{
                  height: "3rem",
                  width: "100%",
                  fontSize: "1.0625rem",
                  fontWeight: 700,
                  background: "#B91C1C",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor:
                    loading || confirmText.trim().toUpperCase() !== "DELETE"
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    loading || confirmText.trim().toUpperCase() !== "DELETE"
                      ? 0.6
                      : 1,
                }}
              >
                {loading ? "Submitting…" : "Schedule deletion"}
              </button>

              <p
                style={{
                  color: "#64748B",
                  fontSize: "0.8125rem",
                  textAlign: "center",
                  marginTop: "0.75rem",
                  lineHeight: 1.5,
                }}
              >
                You have 30 days to change your mind. After that, your data is
                permanently removed.
              </p>
            </>
          )}

          <hr
            style={{
              border: "none",
              borderTop: "1px solid #E2E8F0",
              margin: "1.5rem 0 1rem",
            }}
          />
          <p style={{ color: "#64748B", fontSize: "0.8125rem", lineHeight: 1.55 }}>
            Parents and schools have additional deletion rights under FERPA,
            COPPA, and NY Education Law 2-d. See our{" "}
            <Link
              href="/legal/privacy"
              style={{ color: "#028090", fontWeight: 600 }}
            >
              Privacy Policy
            </Link>{" "}
            for details, or contact{" "}
            <a
              href="mailto:privacy@resolutionnation.app"
              style={{ color: "#028090", fontWeight: 600 }}
            >
              privacy@resolutionnation.app
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
