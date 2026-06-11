import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Nightly hard-delete worker.
 *
 * Purges accounts whose 30-day soft-delete window has elapsed.
 * Designed to be triggered by Vercel Cron (vercel.json) or any
 * external scheduler hitting GET on this URL with the
 * CRON_SECRET shared secret.
 *
 * Safe to run on demand: it only acts on rows whose
 *   scheduled_for < NOW()
 *   AND cancelled_at IS NULL
 *   AND completed_at IS NULL
 *
 * Hard-delete steps for each due account:
 *   1. auth.admin.deleteUser(user.id) — Supabase Auth removes
 *      the user record, which cascades through every table that
 *      references profiles(id) ON DELETE CASCADE (set in 001).
 *   2. Mark the account_deletion_requests row completed_at = NOW().
 *
 * Backups: rows in PITR snapshots will age out per the published
 * retention schedule. Document that in the privacy policy.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  // Vercel Cron sends a bearer token equal to process.env.CRON_SECRET.
  // External schedulers should pass ?token=<CRON_SECRET>.
  const authHeader = request.headers.get("authorization");
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get("token");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 }
    );
  }

  const provided =
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null) ??
    tokenParam;

  if (provided !== expected) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Pull due requests. LIMIT keeps the job bounded per run.
  const { data: due, error: fetchErr } = await admin
    .from("account_deletion_requests")
    .select("id, user_id, scheduled_for")
    .is("cancelled_at", null)
    .is("completed_at", null)
    .lt("scheduled_for", new Date().toISOString())
    .limit(100);

  if (fetchErr) {
    return NextResponse.json(
      { error: fetchErr.message },
      { status: 500 }
    );
  }

  const results: Array<{
    userId: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const row of due ?? []) {
    try {
      const { error: delErr } = await admin.auth.admin.deleteUser(row.user_id);

      if (delErr) {
        results.push({ userId: row.user_id, ok: false, error: delErr.message });
        continue;
      }

      // Mark the deletion request complete. The user_id row in
      // account_deletion_requests will have cascaded with profiles
      // if profiles is deleted, but if profiles uses ON DELETE
      // CASCADE from auth.users (set in 001), the cascade chain
      // takes care of it. Still, do a safety update for any row
      // that survives (e.g., orphans).
      await admin
        .from("account_deletion_requests")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", row.id);

      results.push({ userId: row.user_id, ok: true });
    } catch (e) {
      results.push({
        userId: row.user_id,
        ok: false,
        error: e instanceof Error ? e.message : "unknown error",
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
