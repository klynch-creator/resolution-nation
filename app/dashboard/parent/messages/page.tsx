"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ParentMessage, ParentStudentLink } from "@/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function ParentMessagesPage() {
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [messages, setMessages] = useState<ParentMessage[]>([]);
  const [selected, setSelected] = useState<ParentMessage | null>(null);
  const [showSpanish, setShowSpanish] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get approved link
      const { data: links } = await supabase
        .from("parent_student_links")
        .select("*")
        .eq("parent_id", user.id)
        .eq("status", "approved")
        .limit(1);

      const link = links?.[0] as ParentStudentLink | undefined;
      if (!link) {
        setNotLinked(true);
        setLoading(false);
        return;
      }

      // Fetch messages for this parent
      const { data: msgs } = await supabase
        .from("parent_messages")
        .select("*")
        .eq("parent_id", user.id)
        .order("sent_at", { ascending: false });

      setMessages((msgs ?? []) as ParentMessage[]);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function openMessage(msg: ParentMessage) {
    setSelected(msg);
    setShowSpanish(false);

    if (!msg.read_at) {
      const supabase = createClient();
      const { data: updated } = await supabase
        .from("parent_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", msg.id)
        .select()
        .single();

      if (updated) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? (updated as ParentMessage) : m))
        );
        setSelected(updated as ParentMessage);
      }
    }
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
            No approved child link found. Go to the Dashboard to request a
            connection.
          </p>
        </div>
      </main>
    );
  }

  const unreadCount = messages.filter((m) => !m.read_at).length;

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
          Messages from School 💬
        </h1>
        <p style={{ color: "#64748B", fontSize: "0.9375rem" }}>
          {messages.length} message{messages.length !== 1 ? "s" : ""}
          {unreadCount > 0 && (
            <span
              style={{
                marginLeft: "0.5rem",
                background: "#028090",
                color: "white",
                borderRadius: "100px",
                padding: "0.125rem 0.5rem",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              {unreadCount} new
            </span>
          )}
        </p>
      </div>

      {/* Message detail modal */}
      {selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12,35,64,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "1rem",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: "600px", maxHeight: "80vh", overflow: "auto" }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "1.25rem",
                    fontWeight: 700,
                    color: "#0C2340",
                    marginBottom: "0.25rem",
                  }}
                >
                  {selected.title}
                </h3>
                <p style={{ fontSize: "0.875rem", color: "#94A3B8" }}>
                  {formatDate(selected.sent_at)}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.5rem",
                  color: "#94A3B8",
                  cursor: "pointer",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            {selected.body_spanish && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setShowSpanish(false)}
                  style={{
                    padding: "0.375rem 0.75rem",
                    borderRadius: "6px",
                    border: "1.5px solid",
                    borderColor: !showSpanish ? "#028090" : "#E2E8F0",
                    background: !showSpanish ? "#F0FAFA" : "white",
                    color: !showSpanish ? "#028090" : "#64748B",
                    fontWeight: 600,
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                  }}
                >
                  English
                </button>
                <button
                  onClick={() => setShowSpanish(true)}
                  style={{
                    padding: "0.375rem 0.75rem",
                    borderRadius: "6px",
                    border: "1.5px solid",
                    borderColor: showSpanish ? "#028090" : "#E2E8F0",
                    background: showSpanish ? "#F0FAFA" : "white",
                    color: showSpanish ? "#028090" : "#64748B",
                    fontWeight: 600,
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                  }}
                >
                  Español
                </button>
              </div>
            )}

            <div
              style={{
                background: "#F8FAFC",
                borderRadius: "10px",
                padding: "1.25rem",
                fontSize: "1rem",
                color: "#374151",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}
            >
              {showSpanish && selected.body_spanish
                ? selected.body_spanish
                : selected.body_english}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setSelected(null)}
                className="btn-secondary"
                style={{ padding: "0.5rem 1.25rem" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {messages.length === 0 ? (
        <div
          className="card text-center"
          style={{ padding: "3rem", color: "#64748B" }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📭</div>
          <p style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "#374151" }}>
            No messages yet
          </p>
          <p style={{ fontSize: "0.9375rem" }}>
            Updates from your child&apos;s teacher will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {messages.map((msg) => {
            const isUnread = !msg.read_at;
            return (
              <button
                key={msg.id}
                onClick={() => openMessage(msg)}
                style={{
                  width: "100%",
                  background: isUnread ? "#F0FAFA" : "white",
                  border: isUnread ? "1.5px solid #028090" : "1.5px solid #E2E8F0",
                  borderRadius: "12px",
                  padding: "1rem 1.25rem",
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  transition: "box-shadow 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    "0 4px 12px rgba(2,128,144,0.1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: isUnread ? "#028090" : "transparent",
                    border: isUnread ? "none" : "1.5px solid #E2E8F0",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <p
                    style={{
                      fontWeight: isUnread ? 700 : 600,
                      color: "#0C2340",
                      fontSize: "0.9375rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {msg.title}
                  </p>
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "#64748B",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "480px",
                    }}
                  >
                    {msg.body_english}
                  </p>
                </div>
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <p style={{ fontSize: "0.8125rem", color: "#94A3B8" }}>
                    {formatDate(msg.sent_at)}
                  </p>
                  {msg.body_spanish && (
                    <p style={{ fontSize: "0.75rem", color: "#028090", marginTop: "0.25rem" }}>
                      EN / ES
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
