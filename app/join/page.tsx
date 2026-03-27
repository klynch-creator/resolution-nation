"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function JoinPage() {
  const router = useRouter();

  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push(`/auth/login?redirect=/join`);
      return;
    }

    // Look up the pod by invite code
    const { data: pod, error: podError } = await supabase
      .from("pods")
      .select("*")
      .eq("invite_code", inviteCode.trim().toLowerCase())
      .single();

    if (podError || !pod) {
      setError("That invite code doesn't match any classroom. Double-check with your teacher.");
      setLoading(false);
      return;
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from("pod_members")
      .select("id")
      .eq("pod_id", pod.id)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      // Already joined — just redirect
      router.push("/dashboard/student");
      return;
    }

    // Join the pod
    const { error: joinError } = await supabase.from("pod_members").insert({
      pod_id: pod.id,
      user_id: user.id,
      role: "member",
    });

    if (joinError) {
      setError(joinError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard/student");
    router.refresh();
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
            <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🏫</div>
            <h1
              style={{
                fontFamily: "Georgia, serif",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#0C2340",
                marginBottom: "0.5rem",
              }}
            >
              Join a Classroom
            </h1>
            <p style={{ color: "#64748B", fontSize: "1rem", lineHeight: 1.6 }}>
              Enter the invite code your teacher shared with you.
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
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleJoin} className="flex flex-col gap-4">
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
                Invite Code
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. AB12CD34"
                required
                autoComplete="off"
                autoFocus
                style={{
                  textAlign: "center",
                  fontSize: "1.5rem",
                  fontFamily: "monospace",
                  letterSpacing: "0.2em",
                  fontWeight: 700,
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || inviteCode.length < 6}
              className="btn-primary"
              style={{ height: "3rem", fontSize: "1.0625rem", marginTop: "0.5rem" }}
            >
              {loading ? "Joining…" : "Join Classroom 🎉"}
            </button>
          </form>

          <p
            style={{
              textAlign: "center",
              marginTop: "1.25rem",
              color: "#64748B",
              fontSize: "0.9rem",
            }}
          >
            Don&apos;t have an account yet?{" "}
            <Link href="/auth/signup" style={{ color: "#028090", fontWeight: 600 }}>
              Sign up first
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
