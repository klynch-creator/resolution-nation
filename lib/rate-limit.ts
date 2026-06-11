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
 * Identifier hierarchy:
 *   1. Forwarded client IP from x-forwarded-for / x-real-ip.
 *   2. Falls back to a fixed bucket name (less protective but
 *      stops the simplest abuse).
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

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}
