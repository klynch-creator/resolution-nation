"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

function navLinkStyle(active: boolean): React.CSSProperties {
  return {
    color: active ? "#028090" : "#64748B",
    fontWeight: active ? 600 : 400,
    fontSize: "0.875rem",
    padding: "0 0.875rem",
    height: "100%",
    display: "flex",
    alignItems: "center",
    borderBottom: active ? "2px solid #028090" : "2px solid transparent",
    textDecoration: "none",
    whiteSpace: "nowrap",
  };
}

const NAV_LINKS = [
  { href: "/dashboard/parent", label: "🏠 Dashboard" },
  { href: "/dashboard/parent/goals", label: "🎯 Goals" },
  { href: "/dashboard/parent/lessons", label: "📚 Lessons" },
  { href: "/dashboard/parent/fluency", label: "🎙️ Fluency" },
  { href: "/dashboard/parent/iep", label: "📋 IEP Updates" },
  { href: "/dashboard/parent/messages", label: "💬 Messages" },
];

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function check() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/dashboard");
        return;
      }

      // Use /api/me (admin client) to bypass the RLS recursion bug on profiles.
      const meRes = await fetch("/api/me");
      const p = meRes.ok ? (await meRes.json()).profile : null;

      if (!p || p.role !== "parent") {
        router.push("/dashboard");
        return;
      }

      setProfile(p);
      setChecking(false);
    }
    check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  if (checking) {
    return (
      <div
        className="min-h-screen flex flex-col gap-3 items-center justify-center"
        style={{ background: "#F7F9FC" }}
      >
        <div className="spinner" aria-hidden="true" />
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
          padding: "0 1.5rem",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "1.5rem" }}>🌟</span>
          <span
            style={{
              fontFamily: "Georgia, serif",
              color: "#F7F9FC",
              fontSize: "1.25rem",
              fontWeight: 700,
            }}
          >
            Resolution Nation
          </span>
          <span
            style={{
              marginLeft: "0.5rem",
              background: "#028090",
              color: "white",
              fontSize: "0.6875rem",
              fontWeight: 700,
              padding: "0.125rem 0.5rem",
              borderRadius: "100px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Parent
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span style={{ color: "#94A3B8", fontSize: "0.875rem" }}>
            {profile?.full_name}
          </span>
          <button
            onClick={handleSignOut}
            style={{
              color: "#94A3B8",
              fontSize: "0.875rem",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Nav */}
      <nav
        style={{
          background: "white",
          borderBottom: "1px solid #E2E8F0",
          padding: "0 1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "900px",
            margin: "0 auto",
            display: "flex",
            height: "48px",
            alignItems: "stretch",
          }}
        >
          {NAV_LINKS.map((link) => {
            const active =
              link.href === "/dashboard/parent"
                ? pathname === link.href
                : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} style={navLinkStyle(active)}>
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {children}
    </div>
  );
}
