"use client";

/* eslint-disable @next/next/no-img-element -- avatars are signed URLs from a
   private Supabase bucket; next/image can't optimize short-lived signed URLs. */

import { useEffect, useState } from "react";
import { resolveAvatar, initialColor } from "@/lib/avatars";

interface AvatarProps {
  userId: string;
  name: string | null | undefined;
  avatarUrl: string | null | undefined;
  size?: number;
  // When the avatar_url is an upload, a signed URL is fetched from
  // /api/avatar/[userId]. Set false to skip the fetch (e.g. lists where the
  // initial fallback is fine).
  resolveUploads?: boolean;
}

// Renders a student's avatar: preset emoji, uploaded photo (via signed URL),
// or a colored initial fallback. Safe to drop in anywhere.
export default function Avatar({
  userId,
  name,
  avatarUrl,
  size = 56,
  resolveUploads = true,
}: AvatarProps) {
  const resolved = resolveAvatar(avatarUrl);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (resolved.kind === "upload" && resolveUploads) {
      fetch(`/api/avatar/${userId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (active && d?.url) setSignedUrl(d.url);
          else if (active) setFailed(true);
        })
        .catch(() => active && setFailed(true));
    }
    return () => {
      active = false;
    };
  }, [userId, resolved.kind, resolveUploads]);

  const initial = (name?.trim()?.charAt(0) || "?").toUpperCase();
  const box: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    fontWeight: 700,
  };

  if (resolved.kind === "preset") {
    return (
      <div
        style={{
          ...box,
          background: resolved.preset.bg,
          fontSize: size * 0.55,
          lineHeight: 1,
        }}
        aria-label={`${resolved.preset.label} avatar`}
      >
        <span>{resolved.preset.emoji}</span>
      </div>
    );
  }

  if (resolved.kind === "upload" && signedUrl && !failed) {
    return (
      <img
        src={signedUrl}
        alt={`${name ?? "Student"} avatar`}
        style={{ ...box, objectFit: "cover" }}
        onError={() => setFailed(true)}
      />
    );
  }

  // Initial fallback (also shown while an upload's signed URL loads).
  return (
    <div
      style={{
        ...box,
        background: initialColor(name),
        color: "white",
        fontSize: size * 0.42,
      }}
      aria-label={`${name ?? "Student"} avatar`}
    >
      {initial}
    </div>
  );
}
