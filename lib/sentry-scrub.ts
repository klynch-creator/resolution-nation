/**
 * PII scrubbing for Sentry events (RN-6).
 *
 * Student-data safety rules, applied to EVERY event before it leaves
 * our infrastructure:
 *   1. Request bodies are never sent (may contain student writing,
 *      transcripts, goals, messages).
 *   2. Cookies and auth headers are never sent.
 *   3. The user object is reduced to an opaque id — no name/email/ip.
 *   4. Any string that looks like an email address is redacted.
 *   5. Values under sensitive keys (name, email, phone, token, code,
 *      transcript, content, body, ...) are redacted wherever they
 *      appear in extra/contexts/breadcrumbs.
 *   6. Query strings are stripped from URLs (invite codes, tokens).
 *
 * Works with any Sentry event shape, so it is shared by the client,
 * server, and edge configs.
 */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;

const SENSITIVE_KEYS = new Set([
  "full_name", "fullname", "name", "first_name", "last_name",
  "email", "contact_email", "phone", "address",
  "password", "token", "secret", "authorization", "cookie", "cookies",
  "code", "invite_code", "access_token", "refresh_token", "api_key",
  "body", "data", "response_text", "content", "transcript", "excerpt",
  "prompt", "feedback", "friendly_text", "goal_text", "passage_text",
]);

const REDACTED = "[redacted]";

function scrubString(s: string): string {
  return s.replace(EMAIL_RE, REDACTED);
}

function scrubValue(value: unknown, keyHint?: string): unknown {
  if (keyHint && SENSITIVE_KEYS.has(keyHint.toLowerCase())) return REDACTED;
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(v, k);
    }
    return out;
  }
  return value;
}

function stripQuery(url: unknown): unknown {
  if (typeof url !== "string") return url;
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

// Loosely typed so the same function satisfies the beforeSend signature
// of the browser, node, and edge SDKs without importing any of them.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function scrubEvent<T>(rawEvent: T): T {
  const event = rawEvent as any;
  // 3. User → id only.
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }

  // 1 + 2 + 6. Request: drop body/cookies/headers, strip query string.
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: stripQuery(event.request.url),
    };
  }

  // 4 + 5. Walk the free-form sections.
  if (event.extra) event.extra = scrubValue(event.extra) as any;
  if (event.contexts) event.contexts = scrubValue(event.contexts) as any;
  if (event.tags) event.tags = scrubValue(event.tags) as any;

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b: any) => ({
      ...b,
      message: typeof b.message === "string" ? scrubString(b.message) : b.message,
      data: b.data ? (scrubValue(b.data) as any) : b.data,
    }));
  }

  // Exception messages can embed emails (e.g. "duplicate key ...@...").
  const values = event.exception?.values;
  if (Array.isArray(values)) {
    for (const ex of values) {
      if (typeof ex.value === "string") ex.value = scrubString(ex.value);
    }
  }
  if (typeof event.message === "string") event.message = scrubString(event.message);

  return rawEvent;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
