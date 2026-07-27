"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GRADES, gradeLabel } from "@/lib/grades";
import type { Role } from "@/types";

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [grade, setGrade] = useState("");
  const [dob, setDob] = useState(""); // used only in-browser; never sent or stored
  const [under13Blocked, setUnder13Blocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // COPPA age gate (RN-25). The date of birth is used ONLY here, in the
    // browser, to compute age — it is never sent to the server or stored.
    if (role === "student") {
      if (!dob) {
        setError("Please enter your date of birth.");
        setLoading(false);
        return;
      }
      const birth = new Date(dob);
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
      if (age < 13) {
        setUnder13Blocked(true);
        setLoading(false);
        return;
      }
    }

    const supabase = createClient();

    // 1. Create the auth user — pass role/name as metadata so the DB trigger
    //    can create the profile even when email confirmation is ON (no session).
    const profileGrade = role === "student" ? grade || null : null;
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: fullName,
          role,
          grade: profileGrade,
          ...(role === "student"
            ? { is_under_13: "false", consent_track: "self_over_13" }
            : {}),
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (!data.user) {
      setError("Sign up failed. Please try again.");
      setLoading(false);
      return;
    }

    // 2. If a session is active (email confirmation OFF), upsert the profile now.
    //    The DB trigger may have already created it from metadata, so use upsert.
    if (data.session) {
      const { error: profileError } = await supabase.from("profiles").upsert(
        { id: data.user.id, full_name: fullName, role, grade: profileGrade },
        { onConflict: "id", ignoreDuplicates: true }
      );
      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }
      router.push(`/dashboard/${role}`);
      router.refresh();
      return;
    }

    // 3. Email confirmation required — the DB trigger creates the profile once
    //    the user confirms and the callback fires.
    setSuccess(true);
    setLoading(false);
  }

  if (under13Blocked) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "#F7F9FC" }}
      >
        <div className="card text-center" style={{ maxWidth: "440px" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎒</div>
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.75rem",
            }}
          >
            Ask your teacher to add you!
          </h2>
          <p style={{ color: "#475569", lineHeight: 1.6 }}>
            Because you&apos;re under 13, a law called COPPA says a grown-up needs to
            set up your account. Your teacher can add you to their class — ask them
            to look for <strong>&ldquo;Import roster&rdquo;</strong> in Resolution Nation.
            Family accounts (without a school) are coming soon.
          </p>
          <p style={{ color: "#64748B", fontSize: "0.8125rem", marginTop: "0.75rem" }}>
            We didn&apos;t save anything you typed, including your birthday.
          </p>
          <Link
            href="/"
            className="btn-primary"
            style={{ marginTop: "1.5rem", width: "100%" }}
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "#F7F9FC" }}
      >
        <div className="card text-center" style={{ maxWidth: "420px" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📬</div>
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "0.75rem",
            }}
          >
            Check your email!
          </h2>
          <p style={{ color: "#475569", lineHeight: 1.6 }}>
            We sent a confirmation link to{" "}
            <strong>{email}</strong>. Click it to activate your account, then come back to sign in.
          </p>
          <Link
            href="/auth/login"
            className="btn-primary"
            style={{ marginTop: "1.5rem", width: "100%" }}
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: "#F7F9FC" }}
    >
      <div style={{ width: "100%", maxWidth: "460px" }}>
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
          <p style={{ color: "#64748B", marginTop: "0.5rem", fontSize: "0.9375rem" }}>
            Create your free account
          </p>
        </div>

        <div className="card">
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.375rem",
              fontWeight: 700,
              color: "#0C2340",
              marginBottom: "1.5rem",
            }}
          >
            Get Started
          </h2>

          {error && (
            <div
              style={{
                background: "#FEF2F2",
                border: "1px solid #FCA5A5",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
                color: "#DC2626",
                fontSize: "0.9rem",
                marginBottom: "1rem",
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Role selector */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                I am a…
              </label>
              <div className="flex gap-3">
                {(["teacher", "student", "parent"] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    style={{
                      flex: 1,
                      padding: "0.625rem 0.5rem",
                      borderRadius: "8px",
                      border: role === r ? "2px solid #028090" : "2px solid #E2E8F0",
                      background: role === r ? "#F0FAFA" : "white",
                      color: role === r ? "#028090" : "#64748B",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      textTransform: "capitalize",
                      transition: "all 0.15s",
                    }}
                  >
                    {r === "teacher" ? "🏫 Teacher" : r === "student" ? "🎒 Student" : "👪 Parent"}
                  </button>
                ))}
              </div>
            </div>

            {/* COPPA notice for students */}
            {role === "student" && (
              <div
                style={{
                  background: "#FFFBEB",
                  border: "1px solid #FCD34D",
                  borderRadius: "8px",
                  padding: "0.75rem 1rem",
                  fontSize: "0.8125rem",
                  color: "#92400E",
                  lineHeight: 1.5,
                }}
              >
                <strong>Note for students under 13:</strong> COPPA requires that students
                under 13 be added to Resolution Nation by a teacher or parent. If you&apos;re
                under 13, please ask your teacher or parent to set up your account.
              </div>
            )}

            {/* Age gate: DOB is used only in the browser to check age (RN-25) */}
            {role === "student" && (
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: "0.375rem",
                  }}
                >
                  Date of birth
                </label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  style={{
                    width: "100%",
                    border: "1.5px solid #E2E8F0",
                    borderRadius: "8px",
                    padding: "0.625rem 0.875rem",
                    fontSize: "1rem",
                    background: "white",
                  }}
                />
                <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: "0.25rem" }}>
                  Used only to check your age — we never save your birthday.
                </p>
              </div>
            )}

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "0.375rem",
                }}
              >
                Full name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                required
                autoComplete="name"
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "0.375rem",
                }}
              >
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            {role === "student" && (
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: "0.375rem",
                  }}
                >
                  Grade <span style={{ color: "#94A3B8", fontWeight: 400 }}>(optional)</span>
                </label>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                >
                  <option value="">Select your grade</option>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {gradeLabel(g)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "0.375rem",
                }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2"
              style={{ height: "2.75rem", fontSize: "1rem" }}
            >
              {loading ? "Creating account…" : "Create Account"}
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
            Already have an account?{" "}
            <Link href="/auth/login" style={{ color: "#028090", fontWeight: 600 }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
