import { NextResponse } from "next/server";

/**
 * Simple in-memory token bucket rate limiter for API routes.
 *
 * Designed to be cheap and dependency-free for early stage. It
 * runs per-instance (no shared state across Vercel cold starts
 * or regions), which is fine for the current scale. When you
 * hit ~10 schools or start seeing legitimate traffic spread
 * across regions, swap the bucket store for Upstash Redis or
 * Vercel KV — keep the same checkRateLimit signature.
 *
 * Identifier hierarchy — see clientIp() for why the order matters.
 *
 * Buckets are keyed by `${routeKey}:${identifier}`.
 */

type Bucket = {
  tokens: number;
  refilledAt: number;
};

const buckets = new Map<string, Bucket>();

// Periodically prune buckets older than 1 hour to bound memory.
const PRUNE_AFTER_MS = 60 * 60 * 1000;
let lastPrune = Date.now();

function maybePrune() {
  const now = Date.now();
  if (now - lastPrune < 60_000) return;
  for (const [k, v] of buckets) {
    if (now - v.refilledAt > PRUNE_AFTER_MS) buckets.delete(k);
  }
  lastPrune = now;
}

export type RateLimitOpts = {
  /** A short string identifying the route, e.g. "parent-link". */
  routeKey: string;
  /** Maximum tokens (allowed requests) in the bucket. */
  limit: number;
  /** Bucket window in seconds — tokens fully refill over this period. */
  windowSec: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetSec: number;
};

export function checkRateLimit(
  request: Request,
  opts: RateLimitOpts
): RateLimitResult {
  maybePrune();

  const ip = clientIp(request);
  const key = `${opts.routeKey}:${ip}`;
  const now = Date.now();
  const refillPerMs = opts.limit / (opts.windowSec * 1000);

  const existing = buckets.get(key);
  let tokens: number;
  if (existing) {
    const elapsed = now - existing.refilledAt;
    tokens = Math.min(opts.limit, existing.tokens + elapsed * refillPerMs);
  } else {
    tokens = opts.limit;
  }

  if (tokens < 1) {
    const needed = 1 - tokens;
    const waitMs = needed / refillPerMs;
    buckets.set(key, { tokens, refilledAt: now });
    return {
      ok: false,
      remaining: 0,
      resetSec: Math.ceil(waitMs / 1000),
    };
  }

  tokens -= 1;
  buckets.set(key, { tokens, refilledAt: now });

  return {
    ok: true,
    remaining: Math.floor(tokens),
    resetSec: Math.ceil((opts.limit - tokens) / refillPerMs / 1000),
  };
}

export function rateLimitResponse(result: RateLimitResult) {
  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.resetSec),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    }
  );
}

/**
 * Resolve a rate-limit identity that the caller cannot forge.
 *
 * Security review 2026-07-26 (M3): this previously read
 * `x-forwarded-for.split(",")[0]`, i.e. the entry FURTHEST from our
 * infrastructure. A client can set that header themselves — Vercel appends to
 * it rather than replacing it — so rotating the value gave an attacker a fresh
 * bucket on every request and defeated every rate limit in the app, including
 * the ones guarding Anthropic spend and bulk PII egress via /api/parent/export.
 *
 * Order of preference:
 *   1. `x-vercel-forwarded-for` — set by Vercel's edge, not client-settable.
 *   2. `x-real-ip` — also set by the platform on Vercel.
 *   3. LAST entry of `x-forwarded-for` — the hop nearest our infrastructure,
 *      which is the one the platform appended. Never the first.
 *
 * If none are present (local dev, or an unexpected deployment target) we fall
 * back to a single shared "unknown" bucket. That is deliberately conservative:
 * it over-limits rather than under-limits.
 */
function clientIp(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",").pop()?.trim() || "unknown";

  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  return "unknown";
}
