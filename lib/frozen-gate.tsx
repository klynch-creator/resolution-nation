"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Lock } from "lucide-react";

/**
 * Wraps the student app. If the student's account has been paused by content
 * moderation, every student page is replaced with a calm lockout screen until a
 * teacher reviews and unfreezes. Checks the (admin-backed) /api/me profile.
 */
export function FrozenGate({ children }: { children: React.ReactNode }) {
  const [frozen, setFrozen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch("/api/me");
        const j = r.ok ? await r.json() : { profile: null };
        if (active) {
          setFrozen(!!j.profile?.is_frozen);
          setChecked(true);
        }
      } catch {
        if (active) setChecked(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (checked && frozen) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0C2340",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: "16px",
            maxWidth: "440px",
            width: "100%",
            padding: "2.5rem 2rem",
            textAlign: "center",
            fontFamily: "var(--font-nunito), sans-serif",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
            <Lock size={44} color="#7C3AED" aria-hidden="true" />
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0C2340", marginBottom: "0.75rem" }}>
            Your account is paused
          </h1>
          <p style={{ color: "#475569", fontSize: "1rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            A teacher needs to look at some of your recent writing before you keep going. Please talk to your
            teacher — they can turn your account back on.
          </p>
          <button
            onClick={signOut}
            style={{
              background: "linear-gradient(135deg, #028090, #02C39A)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "0.75rem 1.5rem",
              fontSize: "0.9375rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
