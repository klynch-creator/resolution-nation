"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ParentMessage, ParentStudentLink } from "@/types";
import MessageThread from "@/app/dashboard/_components/MessageThread";

interface Thread {
  link: ParentStudentLink;
  teacherName: string;
  studentName: string;
  messages: ParentMessage[];
}

export default function ParentMessagesPage() {
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: links } = await supabase
        .from("parent_student_links")
        .select("*")
        .eq("parent_id", user.id)
        .eq("status", "approved");

      // Messaging needs a teacher on the link (family-only links have none).
      const approved = ((links ?? []) as ParentStudentLink[]).filter(
        (l) => l.teacher_id != null
      );
      if (approved.length === 0) {
        setNotLinked(true);
        setLoading(false);
        return;
      }

      // Names for teachers + students on the threads (readable via RLS).
      const ids = [
        ...new Set(
          approved.flatMap((l) => [l.teacher_id, l.student_id].filter(Boolean) as string[])
        ),
      ];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

      const { data: msgs } = await supabase
        .from("parent_messages")
        .select("*")
        .eq("parent_id", user.id)
        .order("created_at", { ascending: true });
      const all = (msgs ?? []) as ParentMessage[];

      // Mark teacher-sent messages as read.
      const unreadIds = all
        .filter((m) => m.sender_role === "teacher" && !m.read_at)
        .map((m) => m.id);
      if (unreadIds.length > 0) {
        await supabase
          .from("parent_messages")
          .update({ read_at: new Date().toISOString() })
          .in("id", unreadIds);
      }

      setThreads(
        approved.map((link) => ({
          link,
          teacherName: nameById.get(link.teacher_id ?? "") ?? "Teacher",
          studentName: nameById.get(link.student_id) ?? "your child",
          messages: all.filter(
            (m) => m.student_id === link.student_id && m.teacher_id === link.teacher_id
          ),
        }))
      );
      setLoading(false);
    }
    load();
  }, []);  

  async function send(thread: Thread, body: string): Promise<string | null> {
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherId: thread.link.teacher_id,
        studentId: thread.link.student_id,
        body,
      }),
    });
    const json = await res.json();
    if (!res.ok) return json.error ?? "Could not send message.";
    setThreads((prev) =>
      prev.map((t) =>
        t.link.id === thread.link.id
          ? { ...t, messages: [...t.messages, json.message as ParentMessage] }
          : t
      )
    );
    return null;
  }

  if (loading) {
    return (
      <main
        className="flex flex-col gap-3 items-center justify-center"
        style={{ minHeight: "calc(100vh - 112px)" }}
      >
        <div className="spinner" aria-hidden="true" />
        <div style={{ color: "#028090", fontSize: "1.125rem" }}>Loading…</div>
      </main>
    );
  }

  if (notLinked) {
    return (
      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "3rem 1.25rem" }}>
        <div className="card text-center" style={{ padding: "3rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
          <p style={{ color: "#64748B" }}>
            Messaging opens up once your child&apos;s teacher approves your account
            link. If you haven&apos;t linked yet, start from the Dashboard.
          </p>
        </div>
      </main>
    );
  }

  const active = threads[activeIdx];

  return (
    <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1.25rem" }}>
      <div className="mb-6">
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#0C2340",
            marginBottom: "0.25rem",
          }}
        >
          Messages 💬
        </h1>
        <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
          A direct line to {active?.teacherName ?? "your child's teacher"} about{" "}
          {active?.studentName ?? "your child"}.
        </p>
      </div>

      {threads.length > 1 && (
        <div className="flex gap-2 mb-4">
          {threads.map((t, i) => (
            <button
              key={t.link.id}
              onClick={() => setActiveIdx(i)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "100px",
                border: "1.5px solid",
                borderColor: i === activeIdx ? "#028090" : "#E2E8F0",
                background: i === activeIdx ? "#F0FAFA" : "white",
                color: i === activeIdx ? "#028090" : "#64748B",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              {t.studentName}
            </button>
          ))}
        </div>
      )}

      {active && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "0.875rem 1.25rem",
              borderBottom: "1px solid #E2E8F0",
              background: "#F8FAFC",
              fontWeight: 700,
              color: "#0C2340",
              fontSize: "0.9375rem",
            }}
          >
            {active.teacherName} · about {active.studentName}
          </div>
          <MessageThread
            messages={active.messages}
            myRole="parent"
            partnerName={active.teacherName}
            studentName={active.studentName}
            onSend={(body) => send(active, body)}
          />
        </div>
      )}
    </main>
  );
}
