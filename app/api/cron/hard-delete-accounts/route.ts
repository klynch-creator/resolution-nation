import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Recursively collect every object path under `${prefix}` in a bucket.
 * Supabase storage has no recursive delete, so we walk the folder tree.
 * Bounded by depth/entries to stay safe on a cron run.
 */
async function listAllPaths(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
  depth = 0
): Promise<string[]> {
  if (depth > 6) return [];
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];
  const paths: string[] = [];
  for (const entry of data) {
    const full = `${prefix}/${entry.name}`;
    // Folders come back with a null id; files have an id + metadata.
    if (entry.id === null) {
      paths.push(...(await listAllPaths(admin, bucket, full, depth + 1)));
    } else {
      paths.push(full);
    }
  }
  return paths;
}

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

  // Private buckets whose objects are stored under a `${userId}/...` prefix.
  // DB rows cascade via ON DELETE CASCADE, but storage objects do not, so we
  // purge them explicitly before deleting the auth user.
  const USER_PREFIXED_BUCKETS = ["fluency-audio", "report-cards", "curricula"];

  async function purgeUserStorage(userId: string): Promise<void> {
    for (const bucket of USER_PREFIXED_BUCKETS) {
      try {
        const paths = await listAllPaths(admin, bucket, userId);
        // Remove in batches to keep requests bounded.
        for (let i = 0; i < paths.length; i += 100) {
          await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        }
      } catch {
        // Best-effort: never block account deletion on storage cleanup.
      }
    }
  }

  for (const row of due ?? []) {
    try {
      await purgeUserStorage(row.user_id);
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

  // ── Retention purges (data-minimization audit A3/A4) ────────────────────
  // Best-effort: failures are reported but never block the deletion job.
  const retention: Record<string, string> = {};

  // A4: audit_log — privacy policy commits to a 2-year retention window.
  try {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 2);
    const { error } = await admin
      .from("audit_log")
      .delete()
      .lt("created_at", cutoff.toISOString());
    retention.audit_log = error ? error.message : "purged > 2 years";
  } catch (e) {
    retention.audit_log = e instanceof Error ? e.message : "unknown error";
  }

  // A3: parent_link_codes — used or expired codes serve no purpose after 90 days.
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const iso = cutoff.toISOString();
    const { error: usedErr } = await admin
      .from("parent_link_codes")
      .delete()
      .lt("used_at", iso);
    const { error: expiredErr } = await admin
      .from("parent_link_codes")
      .delete()
      .is("used_at", null)
      .lt("expires_at", iso);
    retention.parent_link_codes =
      usedErr?.message ?? expiredErr?.message ?? "purged used/expired > 90 days";
  } catch (e) {
    retention.parent_link_codes = e instanceof Error ? e.message : "unknown error";
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    retention,
  });
}
