"use client";

import { useEffect, useRef, useState } from "react";
import type { ParentMessage } from "@/types";

/**
 * Shared two-way teacher ↔ parent conversation thread.
 * Renders chat bubbles (own messages right, partner's left), supports the
 * legacy announcement fields (title, EN/ES body), and a composer.
 */
export default function MessageThread({
  messages,
  myRole,
  partnerName,
  studentName,
  onSend,
}: {
  messages: ParentMessage[];
  myRole: "teacher" | "parent";
  partnerName: string;
  studentName: string;
  onSend: (body: string) => Promise<string | null>; // returns error or null
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spanishFor, setSpanishFor] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const err = await onSend(body);
    if (err) {
      setError(err);
    } else {
      setDraft("");
    }
    setSending(false);
  }

  function toggleSpanish(id: string) {
    setSpanishFor((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          minHeight: "240px",
          maxHeight: "55vh",
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "#94A3B8", fontSize: "0.9375rem", padding: "2rem 1rem" }}>
            No messages yet. Say hello — this conversation is about {studentName}.
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_role === myRole;
          const showEs = spanishFor.has(m.id) && m.body_spanish;
          return (
            <div
              key={m.id}
              style={{
                alignSelf: mine ? "flex-end" : "flex-start",
                maxWidth: "82%",
              }}
            >
              <div
                style={{
                  background: mine ? "#028090" : "white",
                  color: mine ? "white" : "#0C2340",
                  border: mine ? "none" : "1px solid #E2E8F0",
                  borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  padding: "0.75rem 1rem",
                  fontSize: "0.9375rem",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.title && (
                  <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>{m.title}</div>
                )}
                {showEs ? m.body_spanish : m.body_english}
              </div>
              <div
                className="flex items-center gap-2"
                style={{
                  fontSize: "0.6875rem",
                  color: "#94A3B8",
                  marginTop: "0.25rem",
                  justifyContent: mine ? "flex-end" : "flex-start",
                }}
              >
                <span>
                  {mine ? "You" : partnerName} · {fmt(m.sent_at ?? m.created_at)}
                </span>
                {m.body_spanish && (
                  <button
                    onClick={() => toggleSpanish(m.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#028090",
                      fontWeight: 700,
                      fontSize: "0.6875rem",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {showEs ? "English" : "Español"}
                  </button>
                )}
                {mine && m.read_at && <span>· Read</span>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div style={{ borderTop: "1px solid #E2E8F0", padding: "0.75rem 1rem" }}>
        {error && (
          <div className="error-banner" role="alert" style={{ marginBottom: "0.5rem" }}>
            {error}
          </div>
        )}
        <div className="flex gap-2" style={{ alignItems: "flex-end" }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Message about ${studentName}…`}
            rows={2}
            maxLength={4000}
            disabled={sending}
            aria-label="Message"
            style={{
              flex: 1,
              resize: "none",
              padding: "0.625rem 0.875rem",
              borderRadius: "10px",
              border: "1px solid #CBD5E1",
              fontSize: "0.9375rem",
              lineHeight: 1.5,
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !draft.trim()}
            className="btn-primary"
            style={{
              height: "2.75rem",
              padding: "0 1.25rem",
              opacity: sending || !draft.trim() ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
