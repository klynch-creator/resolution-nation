"use client";

import { useCallback, useEffect, useState } from "react";
import { Volume2, Square } from "lucide-react";

/**
 * ReadAloud — an accessible "listen" button for MLL students and struggling
 * readers. Uses the browser's built-in Web Speech API (speechSynthesis), so it
 * runs on-device, costs nothing, and sends no student data anywhere — important
 * for COPPA/FERPA. Renders nothing if the browser has no speech support.
 */
export function ReadAloud({
  text,
  label = "Listen",
  size = 14,
  color = "#028090",
}: {
  text: string;
  label?: string;
  size?: number;
  color?: string;
}) {
  const [speaking, setSpeaking] = useState(false);

  // Cancel any in-flight speech if this button unmounts (e.g. on next question).
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggle = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
    const synth = window.speechSynthesis;

    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }

    synth.cancel(); // stop anything else mid-read
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.95; // slightly slower aids comprehension
    utterance.pitch = 1;

    const voices = synth.getVoices();
    const preferred =
      voices.find((v) => v.lang?.startsWith("en") && /google|samantha|zira|natural/i.test(v.name)) ||
      voices.find((v) => v.lang?.startsWith("en"));
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    setSpeaking(true);
    synth.speak(utterance);
  }, [text, speaking]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      aria-label={speaking ? "Stop reading aloud" : `${label} — read aloud`}
      className="flex items-center gap-1"
      style={{
        background: speaking ? color : "transparent",
        color: speaking ? "white" : color,
        border: `1.5px solid ${color}`,
        borderRadius: "100px",
        padding: "0.25rem 0.625rem",
        fontSize: "0.8125rem",
        fontWeight: 600,
        cursor: "pointer",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {speaking ? (
        <Square size={size} fill="white" aria-hidden="true" />
      ) : (
        <Volume2 size={size} aria-hidden="true" />
      )}
      {speaking ? "Stop" : label}
    </button>
  );
}
