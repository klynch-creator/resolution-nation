"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BookOpen, Ban, Check } from "lucide-react";
import { WritingTextarea } from "@/lib/writing-textarea";
import type { CreativeStory, PasteEvent } from "@/types";

export default function StoryEditorPage() {
  const router = useRouter();
  const params = useParams();
  const routeId = params.storyId as string;
  const isNew = routeId === "new";

  const [storyId, setStoryId] = useState<string | null>(isNew ? null : routeId);
  const [title, setTitle] = useState("Untitled Story");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pasteNote, setPasteNote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pastesRef = useRef<PasteEvent[]>([]);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isNew) return;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase.from("creative_stories").select("*").eq("id", routeId).single();
      if (data) {
        const s = data as CreativeStory;
        setTitle(s.title);
        setContent(s.content);
      } else {
        router.push("/dashboard/student/writing/creative");
        return;
      }
      setLoading(false);
    }
    load();
  }, [routeId, isNew, router]);

  const save = useCallback(async () => {
    if (!dirtyRef.current && storyId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/writing/creative/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId, title, content, pasteEvents: pastesRef.current }),
      });
      const json = await res.json();
      if (res.status === 423 || json.blocked) { window.location.reload(); return; }
      if (!res.ok) { setError(json.error ?? "Could not save."); setSaving(false); return; }
      dirtyRef.current = false;
      pastesRef.current = [];
      if (!storyId && json.storyId) {
        setStoryId(json.storyId);
        window.history.replaceState(null, "", `/dashboard/student/writing/creative/${json.storyId}`);
      }
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch {
      setError("Could not save.");
    }
    setSaving(false);
  }, [storyId, title, content]);

  // Debounced autosave whenever title/content change.
  useEffect(() => {
    if (loading) return;
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void save(); }, 2500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [title, content, loading, save]);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#F7F9FC", fontFamily: "var(--font-nunito), sans-serif" }}>
      <header style={{ background: "#0C2340", padding: "0 1.5rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="flex items-center gap-2">
          <BookOpen size={20} color="#F59E0B" aria-hidden="true" />
          <span style={{ color: "#F7F9FC", fontSize: "1.125rem", fontWeight: 800 }}>Story Editor</span>
        </div>
        <Link href="/dashboard/student/writing/creative" style={{ color: "#94A3B8", fontSize: "0.875rem", textDecoration: "none" }}>← My Stories</Link>
      </header>

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        {error && <div className="error-banner" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}
        {loading ? (
          <p style={{ color: "#94A3B8" }}>Loading story…</p>
        ) : (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Story title"
              style={{
                width: "100%",
                fontSize: "1.5rem",
                fontWeight: 800,
                color: "#0C2340",
                border: "none",
                borderBottom: "2px solid #E2E8F0",
                padding: "0.5rem 0",
                marginBottom: "1rem",
                background: "transparent",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <WritingTextarea
              value={content}
              onChange={setContent}
              onPasteAttempt={() => setPasteNote(true)}
              spellCheck={true}
              placeholder="Once upon a time…"
              minHeight={420}
            />
            {pasteNote && (
              <p className="flex items-center gap-1" style={{ color: "#B45309", fontSize: "0.8125rem", marginTop: "0.5rem" }}>
                <Ban size={14} aria-hidden="true" /> Pasting is turned off — write your story in your own words.
              </p>
            )}
            <div className="flex items-center justify-between" style={{ marginTop: "0.75rem" }}>
              <span style={{ color: "#94A3B8", fontSize: "0.8125rem" }}>
                {wordCount} words · spellcheck on
                {savedAt && !saving ? ` · saved ${savedAt}` : ""}
                {saving ? " · saving…" : ""}
              </span>
              <button onClick={() => save()} disabled={saving} className="btn-primary flex items-center gap-1">
                <Check size={15} aria-hidden="true" /> Save
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
