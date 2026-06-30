"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/app/dashboard/_components/Avatar";
import { PRESET_AVATARS, presetValue } from "@/lib/avatars";
import { THEMES, getTheme } from "@/lib/themes";

interface MeProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  theme: string | null;
}

export default function StudentSettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState("ocean");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarKey, setAvatarKey] = useState(0); // bump to force Avatar refetch
  const [tab, setTab] = useState<"gallery" | "upload">("gallery");
  const [saved, setSaved] = useState(false);
  const [uploadState, setUploadState] = useState<
    { status: "idle" | "checking" | "ok" | "error"; message?: string }
  >({ status: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/me");
      if (!res.ok) {
        router.push("/dashboard");
        return;
      }
      const { profile: p } = await res.json();
      if (p && p.role !== "student") {
        router.push("/dashboard");
        return;
      }
      setProfile(p);
      setTheme(p?.theme ?? "ocean");
      setAvatarUrl(p?.avatar_url ?? null);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  }

  async function chooseTheme(id: string) {
    setTheme(id);
    await fetch("/api/account/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: id }),
    });
    flashSaved();
  }

  async function choosePreset(id: string) {
    setAvatarUrl(presetValue(id));
    setAvatarKey((k) => k + 1);
    await fetch("/api/account/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar: id }),
    });
    flashSaved();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setUploadState({ status: "error", message: "That image is too big. Please use one under 5 MB." });
      return;
    }
    setUploadState({ status: "checking", message: "Checking your picture…" });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    try {
      const res = await fetch("/api/avatar/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setAvatarUrl(data.path);
        setAvatarKey((k) => k + 1);
        setUploadState({ status: "ok", message: "Looks great! Your new picture is set." });
        flashSaved();
      } else {
        setUploadState({
          status: "error",
          message: data.error ?? "That picture can't be used. Try another one.",
        });
      }
    } catch {
      setUploadState({ status: "error", message: "Something went wrong. Please try again." });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const t = getTheme(theme);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" aria-hidden="true" />
        <div>Loading your settings…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: t.pageBg }}>
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
        <span
          style={{
            fontFamily: "var(--font-nunito), sans-serif",
            color: "#F7F9FC",
            fontSize: "1.25rem",
            fontWeight: 800,
          }}
        >
          My Settings
        </span>
        <span
          style={{
            color: saved ? "#34D399" : "transparent",
            fontWeight: 700,
            fontSize: "0.875rem",
            transition: "color 0.2s",
          }}
        >
          ✓ Saved
        </span>
      </header>

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "1.5rem 1.25rem 3rem" }}>
        <Link
          href="/dashboard/student"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            color: t.accent,
            fontWeight: 700,
            fontSize: "0.9375rem",
            textDecoration: "none",
            marginBottom: "1.25rem",
          }}
        >
          ← Back to Dashboard
        </Link>

        {/* Preview banner */}
        <div
          style={{
            background: `linear-gradient(135deg, ${t.from} 0%, ${t.to} 100%)`,
            borderRadius: "16px",
            padding: "1.5rem",
            marginBottom: "1.5rem",
            color: "white",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div style={{ border: "3px solid rgba(255,255,255,0.6)", borderRadius: "50%" }}>
            <Avatar
              key={avatarKey}
              userId={profile?.id ?? ""}
              name={profile?.full_name}
              avatarUrl={avatarUrl}
              size={64}
            />
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-nunito), sans-serif", fontSize: "1.375rem", fontWeight: 800 }}>
              {profile?.full_name?.split(" ")[0] ?? "You"}
            </div>
            <div style={{ opacity: 0.9, fontSize: "0.9375rem" }}>
              This is how your dashboard looks!
            </div>
          </div>
        </div>

        {/* Theme picker */}
        <section className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2
            style={{
              fontFamily: "var(--font-nunito), sans-serif",
              fontSize: "1.125rem",
              fontWeight: 800,
              color: "#0C2340",
              marginBottom: "1rem",
            }}
          >
            🎨 Pick a Theme
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {THEMES.map((th) => {
              const active = th.id === theme;
              return (
                <button
                  key={th.id}
                  onClick={() => chooseTheme(th.id)}
                  style={{
                    border: active ? "3px solid #0C2340" : "3px solid transparent",
                    borderRadius: "14px",
                    padding: "0.25rem",
                    cursor: "pointer",
                    background: "none",
                  }}
                  aria-pressed={active}
                >
                  <div
                    style={{
                      height: "60px",
                      borderRadius: "10px",
                      background: `linear-gradient(135deg, ${th.from} 0%, ${th.to} 100%)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.5rem",
                    }}
                  >
                    {th.emoji}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 700,
                      color: active ? "#0C2340" : "#64748B",
                      marginTop: "0.375rem",
                    }}
                  >
                    {th.label}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Avatar picker */}
        <section className="card" style={{ padding: "1.5rem" }}>
          <h2
            style={{
              fontFamily: "var(--font-nunito), sans-serif",
              fontSize: "1.125rem",
              fontWeight: 800,
              color: "#0C2340",
              marginBottom: "1rem",
            }}
          >
            😀 Choose Your Picture
          </h2>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
            {(["gallery", "upload"] as const).map((tabId) => (
              <button
                key={tabId}
                onClick={() => setTab(tabId)}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "100px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                  background: tab === tabId ? t.accent : "#F1F5F9",
                  color: tab === tabId ? "white" : "#64748B",
                }}
              >
                {tabId === "gallery" ? "Avatar Gallery" : "Upload a Photo"}
              </button>
            ))}
          </div>

          {tab === "gallery" ? (
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
              {PRESET_AVATARS.map((a) => {
                const active = avatarUrl === presetValue(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => choosePreset(a.id)}
                    title={a.label}
                    style={{
                      border: active ? "3px solid #0C2340" : "3px solid transparent",
                      borderRadius: "50%",
                      padding: 0,
                      cursor: "pointer",
                      background: "none",
                      aspectRatio: "1 / 1",
                    }}
                    aria-pressed={active}
                  >
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        borderRadius: "50%",
                        background: a.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.5rem",
                      }}
                    >
                      {a.emoji}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              <p style={{ color: "#64748B", fontSize: "0.9375rem", marginBottom: "1rem", lineHeight: 1.6 }}>
                Pick a photo from your device. Every photo is checked automatically to keep things
                safe and school-friendly before it&apos;s saved.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={onFile}
                disabled={uploadState.status === "checking"}
                style={{ display: "none" }}
                id="avatar-file"
              />
              <label
                htmlFor="avatar-file"
                style={{
                  display: "inline-block",
                  background: t.accent,
                  color: "white",
                  fontWeight: 700,
                  fontSize: "0.9375rem",
                  padding: "0.625rem 1.25rem",
                  borderRadius: "10px",
                  cursor: uploadState.status === "checking" ? "default" : "pointer",
                  opacity: uploadState.status === "checking" ? 0.6 : 1,
                }}
              >
                {uploadState.status === "checking" ? "Checking…" : "Choose a Photo"}
              </label>

              {uploadState.message && (
                <p
                  style={{
                    marginTop: "1rem",
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    color:
                      uploadState.status === "error"
                        ? "#DC2626"
                        : uploadState.status === "ok"
                        ? "#16A34A"
                        : "#64748B",
                  }}
                >
                  {uploadState.message}
                </p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
