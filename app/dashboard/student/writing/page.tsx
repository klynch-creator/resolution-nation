"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PenLine, FileText, BookOpen, Sparkles, ChevronRight, Star } from "lucide-react";
import type { WritingSubmission, CreativeStory } from "@/types";

const MODES = [
  {
    href: "/dashboard/student/writing/short-response",
    title: "Short Response",
    desc: "Read a passage and answer with text evidence (RACE/RADD). Get a score and feedback.",
    Icon: FileText,
    grad: "linear-gradient(135deg, #028090, #02C39A)",
  },
  {
    href: "/dashboard/student/writing/essay",
    title: "Essay Practice",
    desc: "Read a passage, plan, and write a full essay. Get rubric feedback and editing help.",
    Icon: PenLine,
    grad: "linear-gradient(135deg, #7C3AED, #9F67FA)",
  },
  {
    href: "/dashboard/student/writing/creative",
    title: "Creative Writing",
    desc: "Write your own story. Save it and add more over time. Spellcheck is on here!",
    Icon: BookOpen,
    grad: "linear-gradient(135deg, #D97706, #F59E0B)",
  },
];

export default function WritingWorkshopPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<WritingSubmission[]>([]);
  const [stories, setStories] = useState<CreativeStory[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/dashboard"); return; }

      const [{ data: s }, { data: st }] = await Promise.all([
        supabase
          .from("writing_submissions")
          .select("*")
          .eq("student_id", user.id)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("creative_stories")
          .select("*")
          .eq("student_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(6),
      ]);
      setSubs((s as WritingSubmission[]) ?? []);
      setStories((st as CreativeStory[]) ?? []);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight: "100vh", background: "#F7F9FC", fontFamily: "var(--font-nunito), sans-serif" }}>
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
          <PenLine size={22} color="#02C39A" aria-hidden="true" />
          <span style={{ color: "#F7F9FC", fontSize: "1.25rem", fontWeight: 800 }}>Writing Workshop</span>
        </div>
        <Link href="/dashboard/student" style={{ color: "#94A3B8", fontSize: "0.875rem", textDecoration: "none" }}>
          ← Dashboard
        </Link>
      </header>

      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0C2340", marginBottom: "0.25rem" }}>
          Writing Workshop
        </h1>
        <p style={{ color: "#64748B", marginBottom: "1.5rem" }}>
          Practice the writing that matters on state tests — and tell your own stories.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ marginBottom: "2rem" }}>
          {MODES.map((m) => (
            <Link key={m.href} href={m.href} style={{ textDecoration: "none" }}>
              <div
                className="card card-hover"
                style={{ padding: "1.5rem", height: "100%", display: "flex", flexDirection: "column", gap: "0.75rem" }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: m.grad,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <m.Icon size={22} color="white" aria-hidden="true" />
                </div>
                <div style={{ fontWeight: 800, color: "#0C2340", fontSize: "1.0625rem" }}>{m.title}</div>
                <div style={{ color: "#64748B", fontSize: "0.875rem", lineHeight: 1.5, flex: 1 }}>{m.desc}</div>
                <div className="flex items-center gap-1" style={{ color: "#028090", fontWeight: 700, fontSize: "0.875rem" }}>
                  Start <ChevronRight size={15} aria-hidden="true" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Recent writing */}
        <h2 style={{ fontSize: "1.125rem", fontWeight: 800, color: "#0C2340", marginBottom: "0.75rem" }}>
          Your recent writing
        </h2>
        {loading ? (
          <p style={{ color: "#94A3B8" }}>Loading…</p>
        ) : subs.length === 0 && stories.length === 0 ? (
          <div className="card" style={{ padding: "2rem", textAlign: "center", border: "2px dashed #E2E8F0", background: "transparent" }}>
            <Sparkles size={32} color="#CBD5E1" aria-hidden="true" style={{ margin: "0 auto 0.5rem" }} />
            <p style={{ color: "#64748B" }}>Nothing yet — pick a mode above to start writing!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {subs.map((s) => (
              <div key={s.id} className="card" style={{ padding: "0.875rem 1.125rem" }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 700, color: "#0C2340", fontSize: "0.9375rem" }}>
                      {s.mode === "essay" ? "Essay" : "Short Response"}
                    </span>
                    <span style={{ color: "#94A3B8", fontSize: "0.8125rem" }}> · {new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                  {s.score != null && s.rubric_max != null && (
                    <span
                      className="flex items-center gap-1"
                      style={{ background: "#ECFDF5", color: "#059669", borderRadius: "100px", padding: "0.15rem 0.6rem", fontSize: "0.8125rem", fontWeight: 700 }}
                    >
                      <Star size={12} color="#059669" fill="#059669" aria-hidden="true" /> {s.score}/{s.rubric_max}
                    </span>
                  )}
                </div>
                {s.prompt && (
                  <p style={{ color: "#475569", fontSize: "0.8125rem", marginTop: "0.25rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.prompt}
                  </p>
                )}
              </div>
            ))}
            {stories.map((s) => (
              <Link key={s.id} href={`/dashboard/student/writing/creative/${s.id}`} style={{ textDecoration: "none" }}>
                <div className="card card-hover" style={{ padding: "0.875rem 1.125rem" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ fontWeight: 700, color: "#0C2340", fontSize: "0.9375rem" }}>📖 {s.title}</span>
                    <span style={{ color: "#94A3B8", fontSize: "0.8125rem" }}>{s.word_count} words</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
