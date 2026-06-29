"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BookOpen, Plus } from "lucide-react";
import type { CreativeStory } from "@/types";

export default function CreativeListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState<CreativeStory[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/dashboard"); return; }
      const { data } = await supabase
        .from("creative_stories")
        .select("*")
        .eq("student_id", user.id)
        .order("updated_at", { ascending: false });
      setStories((data as CreativeStory[]) ?? []);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight: "100vh", background: "#F7F9FC", fontFamily: "var(--font-nunito), sans-serif" }}>
      <header style={{ background: "#0C2340", padding: "0 1.5rem", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="flex items-center gap-2">
          <BookOpen size={20} color="#F59E0B" aria-hidden="true" />
          <span style={{ color: "#F7F9FC", fontSize: "1.125rem", fontWeight: 800 }}>Creative Writing</span>
        </div>
        <Link href="/dashboard/student/writing" style={{ color: "#94A3B8", fontSize: "0.875rem", textDecoration: "none" }}>← Writing</Link>
      </header>

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: "1.25rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0C2340" }}>My Stories</h1>
          <Link
            href="/dashboard/student/writing/creative/new"
            className="flex items-center gap-1"
            style={{ background: "linear-gradient(135deg, #D97706, #F59E0B)", color: "white", borderRadius: "8px", padding: "0.55rem 1rem", fontWeight: 700, fontSize: "0.9375rem", textDecoration: "none" }}
          >
            <Plus size={16} aria-hidden="true" /> New Story
          </Link>
        </div>

        {loading ? (
          <p style={{ color: "#94A3B8" }}>Loading…</p>
        ) : stories.length === 0 ? (
          <div className="card" style={{ padding: "2.5rem", textAlign: "center", border: "2px dashed #E2E8F0", background: "transparent" }}>
            <BookOpen size={36} color="#CBD5E1" aria-hidden="true" style={{ margin: "0 auto 0.75rem" }} />
            <p style={{ color: "#64748B" }}>No stories yet. Click <strong>New Story</strong> to start writing!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {stories.map((s) => (
              <Link key={s.id} href={`/dashboard/student/writing/creative/${s.id}`} style={{ textDecoration: "none" }}>
                <div className="card card-hover" style={{ padding: "1.125rem 1.25rem" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ fontWeight: 800, color: "#0C2340", fontSize: "1.0625rem" }}>📖 {s.title}</span>
                    <span style={{ color: "#94A3B8", fontSize: "0.8125rem" }}>{s.word_count} words</span>
                  </div>
                  {s.content && (
                    <p style={{ color: "#64748B", fontSize: "0.875rem", marginTop: "0.375rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.content.slice(0, 120)}
                    </p>
                  )}
                  <p style={{ color: "#94A3B8", fontSize: "0.75rem", marginTop: "0.375rem" }}>
                    Updated {new Date(s.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
