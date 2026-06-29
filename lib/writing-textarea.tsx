"use client";

import type { CSSProperties } from "react";

/**
 * Writing input that BLOCKS copy-paste (and drag-drop) so students write their
 * own words. Each blocked paste is reported via onPasteAttempt(chars) so the
 * caller can log which section was pasted into (surfaced to the teacher + AI).
 * Native spellcheck is opt-in (used only in Creative Writing).
 */
export function WritingTextarea({
  value,
  onChange,
  onPasteAttempt,
  spellCheck = false,
  placeholder,
  minHeight = 200,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onPasteAttempt?: (chars: number) => void;
  spellCheck?: boolean;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
}) {
  const style: CSSProperties = {
    width: "100%",
    minHeight,
    border: "1.5px solid #CBD5E1",
    borderRadius: "10px",
    padding: "1rem",
    fontSize: "1rem",
    lineHeight: 1.7,
    color: "#0C2340",
    fontFamily: "inherit",
    resize: "vertical",
  };
  return (
    <textarea
      value={value}
      disabled={disabled}
      spellCheck={spellCheck}
      placeholder={placeholder}
      style={style}
      onChange={(e) => onChange(e.target.value)}
      onPaste={(e) => {
        e.preventDefault();
        const pasted = e.clipboardData?.getData("text") ?? "";
        onPasteAttempt?.(pasted.length);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const dropped = e.dataTransfer?.getData("text") ?? "";
        onPasteAttempt?.(dropped.length);
      }}
      onDragOver={(e) => e.preventDefault()}
    />
  );
}
