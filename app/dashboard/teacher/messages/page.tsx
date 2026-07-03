"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ParentMessage, ParentStudentLink } from "@/types";
import MessageThread from "@/app/dashboard/_components/MessageThread";
import { MessageSquare, Mail, Phone } from "lucide-react";

interface Conversation {
  link: ParentStudentLink;
  parentName: string;
  studentName: string;
  parentContact: {
    contact_email: string | null;
    phone: string | null;
    preferred_language: string | null;
    preferred_contact: string | null;
  } | null;
  messages: ParentMessage[];
  unread: number;
}

export default function TeacherMessagesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/dashboard");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role !== "teacher") {
        router.push("/dashboard");
        return;
      }

      const { data: links } = await supabase
        .from("parent_student_links")
        .select("*")
        .eq("teacher_id", user.id)
        .eq("status", "approved");
      const approved = (links ?? []) as ParentStudentLink[];

      const ids = [
        ...new Set(approved.flatMap((l) => [l.parent_id, l.student_id])),
      ];
      const { data: profiles } = ids.length
        ? await supabase
            .from("profiles")
            .select("id, full_name, contact_email, phone, preferred_language, preferred_contact")
            .in("id", ids)
        : { data: [] };
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

      const { data: msgs } = await supabase
        .from("parent_messages")
        .select("*")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: true });
      const all = (msgs ?? []) as ParentMessage[];

      const list: Conversation[] = approved.map((link) => {
        const messages = all.filter(
          (m) => m.parent_id === link.parent_id && m.student_id === link.student_id
        );
        const parent = byId.get(link.parent_id);
        return {
          link,
          parentName: parent?.full_name ?? "Parent",
          studentName: byId.get(link.student_id)?.full_name ?? "Student",
          parentContact: parent
            ? {
                contact_email: parent.contact_email ?? null,
                phone: parent.phone ?? null,
                preferred_language: parent.preferred_language ?? null,
                preferred_contact: parent.preferred_contact ?? null,
              }
            : null,
          messages,
          unread: messages.filter((m) => m.sender_role === "parent" && !m.read_at).length,
        };
      });
      // Most recent activity first.
      list.sort((a, b) => {
        const at = a.messages[a.messages.length - 1]?.created_at ?? a.link.created_at;
        const bt = b.messages[b.messages.length - 1]?.created_at ?? b.link.created_at;
        return bt.localeCompare(at);
      });

      setConvos(list);
      setActiveId(list[0]?.link.id ?? null);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark parent-sent messages read when a conversation is opened.
  useEffect(() => {
    if (!activeId) return;
    const convo = convos.find((c) => c.link.id === activeId);
    if (!convo || convo.unread === 0) return;
    const unreadIds = convo.messages
      .filter((m) => m.sender_role === "parent" && !m.read_at)
      .map((m) => m.id);
    const supabase = createClient();
    supabase
      .from("parent_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds)
      .then(() => {
        setConvos((prev) =>
          prev.map((c) =>
            c.link.id === activeId
              ? {
                  ...c,
                  unread: 0,
                  messages: c.messages.map((m) =>
                    unreadIds.includes(m.id)
                      ? { ...m, read_at: new Date().toISOString() }
                      : m
                  ),
                }
              : c
          )
        );
      });
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(convo: Conversation, body: string): Promise<string | null> {
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentId: convo.link.parent_id,
        studentId: convo.link.student_id,
        body,
      }),
    });
    const json = await res.json();
    if (!res.ok) return json.error ?? "Could not send message.";
    setConvos((prev) =>
      prev.map((c) =>
        c.link.id === convo.link.id
          ? { ...c, messages: [...c.messages, json.message as ParentMessage] }
          : c
      )
    );
    return null;
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" aria-hidden="true" />
        <div>Loading messages…</div>
      </div>
    );
  }

  const active = convos.find((c) => c.link.id === activeId) ?? null;

  return (
    <div className="min-h-screen" style={{ background: "#F7F9FC" }}>
      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem 1.25rem" }}>
        <Link
          href="/dashboard/teacher"
          style={{ color: "#028090", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}
        >
          ← Dashboard
        </Link>
        <h1
          className="flex items-center gap-2"
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "#0C2340",
            margin: "0.5rem 0 0.25rem",
          }}
        >
          <MessageSquare size={26} color="#028090" aria-hidden="true" />
          Parent Messages
        </h1>
        <p style={{ color: "#64748B", fontSize: "0.9375rem", marginBottom: "1.5rem" }}>
          Conversations with the approved parent of each student.
        </p>

        {convos.length === 0 ? (
          <div className="card text-center" style={{ padding: "3rem", color: "#64748B" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📭</div>
            <p style={{ fontSize: "1rem", color: "#374151", marginBottom: "0.5rem" }}>
              No linked parents yet
            </p>
            <p style={{ fontSize: "0.9375rem" }}>
              When you approve a parent link (Students page), a conversation appears here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]" style={{ alignItems: "start" }}>
            {/* Conversation list */}
            <div className="card" style={{ padding: "0.5rem 0" }}>
              {convos.map((c) => {
                const isActive = c.link.id === activeId;
                const last = c.messages[c.messages.length - 1];
                return (
                  <button
                    key={c.link.id}
                    onClick={() => setActiveId(c.link.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "0.75rem 1.25rem",
                      background: isActive ? "#F0FAFA" : "transparent",
                      border: "none",
                      borderLeft: isActive ? "3px solid #028090" : "3px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ fontWeight: 700, color: "#0C2340", fontSize: "0.9375rem" }}>
                        {c.parentName}
                      </span>
                      {c.unread > 0 && (
                        <span
                          style={{
                            background: "#028090",
                            color: "white",
                            borderRadius: "100px",
                            padding: "0.0625rem 0.5rem",
                            fontSize: "0.6875rem",
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {c.unread}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "#64748B" }}>
                      re: {c.studentName}
                    </div>
                    {last && (
                      <div
                        style={{
                          fontSize: "0.8125rem",
                          color: "#94A3B8",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginTop: "0.125rem",
                        }}
                      >
                        {last.sender_role === "teacher" ? "You: " : ""}
                        {last.body_english}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active thread */}
            {active && (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div
                  style={{
                    padding: "0.875rem 1.25rem",
                    borderBottom: "1px solid #E2E8F0",
                    background: "#F8FAFC",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#0C2340", fontSize: "0.9375rem" }}>
                    {active.parentName} · about {active.studentName}
                  </div>
                  {active.parentContact && (
                    <div
                      className="flex flex-wrap items-center gap-3"
                      style={{ fontSize: "0.8125rem", color: "#64748B", marginTop: "0.25rem" }}
                    >
                      {active.parentContact.contact_email && (
                        <span className="flex items-center gap-1">
                          <Mail size={13} aria-hidden="true" />
                          {active.parentContact.contact_email}
                        </span>
                      )}
                      {active.parentContact.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={13} aria-hidden="true" />
                          {active.parentContact.phone}
                        </span>
                      )}
                      {active.parentContact.preferred_language === "es" && (
                        <span style={{ color: "#B45309", fontWeight: 600 }}>
                          Prefers Spanish
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <MessageThread
                  messages={active.messages}
                  myRole="teacher"
                  partnerName={active.parentName}
                  studentName={active.studentName}
                  onSend={(body) => send(active, body)}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
