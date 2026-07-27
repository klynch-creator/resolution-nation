/**
 * Sanitizer for client-supplied data that gets interpolated into an LLM prompt
 * (security review 2026-07-26, M2).
 *
 * `/api/student-insight` took an arbitrary `studentStats` JSON blob from the
 * client and dropped `JSON.stringify(studentStats)` straight into a prompt with
 * no system prompt and no role check — an open Claude proxy for any signed-in
 * user, including a student. Two costs: unbounded Anthropic spend, and
 * unfiltered model output reaching a child through a school app.
 *
 * Rather than rebuild every analytics aggregate server-side (a large refactor
 * of a 800-line page), this narrows what can reach the model: numbers stay
 * numbers, strings are stripped to a benign charset and truncated so they
 * cannot carry instructions, and the structure is depth- and length-bounded so
 * a caller cannot smuggle a wall of text through a deeply nested array.
 *
 * This is a defense-in-depth layer, not the only one — callers must still
 * authenticate and authorize. It is deliberately conservative: anything it
 * cannot classify is dropped rather than passed through.
 */

const MAX_DEPTH = 4;
const MAX_ARRAY = 40;
const MAX_KEYS = 40;
const MAX_STRING = 48;
const MAX_KEY_LENGTH = 40;

/**
 * Strings are reduced to letters, digits, space, and a few punctuation marks
 * that appear in real subject/level labels ("Grade 3", "Math - Fractions").
 * Newlines, quotes, braces, backticks and colons are removed, which is what
 * an injected instruction block needs to be legible as one.
 */
function safeString(s: string, max = MAX_STRING): string {
  return s
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9 .,\-/%()+]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function safeKey(k: string): string | null {
  const cleaned = k.replace(/[^A-Za-z0-9_]/g, "").slice(0, MAX_KEY_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

export function sanitizeForPrompt(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth > MAX_DEPTH) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  }
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return safeString(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY)
      .map((v) => sanitizeForPrompt(v, depth + 1))
      .filter((v) => v !== null);
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (n >= MAX_KEYS) break;
      const key = safeKey(k);
      if (!key) continue;
      const clean = sanitizeForPrompt(v, depth + 1);
      if (clean === null) continue;
      out[key] = clean;
      n++;
    }
    return out;
  }

  // Functions, symbols, bigints — drop.
  return null;
}

/** Convenience: sanitize and serialize, with a hard cap on prompt length. */
export function sanitizedJson(value: unknown, maxChars = 6000): string {
  return JSON.stringify(sanitizeForPrompt(value)).slice(0, maxChars);
}
