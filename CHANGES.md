# Security Hardening — May 2026

Three issues were found during the production-roadmap audit and fixed in this changeset. Apply the new migration in Supabase, then deploy the new API routes.

## Files added

- `supabase/migrations/002_security_hardening.sql` — schema + SECURITY DEFINER functions.
- `app/api/parent/link/code/route.ts` — student mints an invite code.
- `app/api/account/delete/route.ts` — in-app account deletion (Apple / Google requirement).

## Files changed

- `app/api/parent/link/route.ts` — rewritten to redeem an invite code instead of enumerating users by email.

## 1. star_transactions could be self-minted

**Before:** the RLS policy `stars_insert_system` allowed any authenticated user to insert into `star_transactions` for themselves. A student could open the browser console and mint unlimited stars.

**After:**

- `stars_insert_system` policy dropped. With no INSERT policy in place, direct inserts via PostgREST are rejected.
- Two new `SECURITY DEFINER` functions handle the legitimate cases:
  - `award_stars(user_id, amount, type, item_id, step_id)` — used by server code to record earned/bonus stars. Validates that the step is completed, belongs to the recipient, and has not already been rewarded. Bonus grants require a teacher with the recipient in one of their pods.
  - `spend_stars(item_id)` — atomic balance check and purchase. Computes the balance from the transaction ledger so it cannot be spoofed by the client.
- Star issuance should now flow through these RPCs from server-side code (an Edge Function, a Next.js Server Action, or an API route — not the browser).

## 2. /api/parent/link enumerated all users

**Before:** the route called `auth.admin.listUsers()` and filtered in memory to find a child by email. This exposed the existence of every user account through a service-role boundary and would have collapsed past a few thousand accounts.

**After:**

- New table `parent_link_codes` stores 6-character one-time invite codes with a 7-day expiry.
- New RPC `generate_parent_link_code()` mints a code on behalf of the calling student. Invalidates any previously-unused code for that student.
- New RPC `redeem_parent_link_code(code)` looks up by the code, validates expiry and single-use, then adds the parent as a viewer in the child's family pod.
- `POST /api/parent/link` now takes a code instead of an email.
- `POST /api/parent/link/code` is the new student-side endpoint that returns the code.
- The flow: student generates code → shares with parent out of band → parent enters code in their app.

## 3. Account deletion was missing

**Before:** no in-app account deletion path. Both Apple (Guideline 5.1.1(v)) and Google Play require one, and parents have a right to deletion under FERPA / COPPA / NY Ed Law 2-d.

**After:**

- New table `account_deletion_requests` queues deletions with a 30-day reversal window.
- `request_account_deletion(reason)` schedules deletion and writes an audit log entry.
- `cancel_account_deletion()` reverses a pending request.
- `POST /api/account/delete` requests deletion; `DELETE /api/account/delete` cancels; `GET /api/account/delete` returns pending status.
- A scheduled job will need to be added (not in this change) to read `account_deletion_requests` past their `scheduled_for` timestamp and perform the hard delete. Recommended: Supabase scheduled function running nightly.

## Also in this migration

- `audit_log` table + `write_audit()` helper. Required posture for NY Ed Law 2-d and most district DPAs. Application code should call `write_audit` from every sensitive code path (login, role change attempts, data exports, parent linking, etc.).
- `profiles.role` is now immutable post-creation via a trigger. Closes the latent risk of a user promoting themselves to teacher if a future policy gap is introduced.

## What to do next

1. Run `002_security_hardening.sql` in the Supabase SQL editor against staging first.
2. Smoke-test: a student generates a code, a parent redeems it, the link appears in `pod_members`.
3. Smoke-test: try inserting into `star_transactions` directly from a browser session — it should fail. Try calling `award_stars` with a step the user does not own — it should fail.
4. Deploy the API route changes.
5. Add a UI for the new student-side code generator (replaces the parent's email-entry form).
6. Add a UI for the deletion flow under Settings → "Delete my account."
7. Build the nightly hard-delete job (Supabase scheduled function, Vercel cron, or a small worker).

---

# Supabase Repair + Flow Fixes — June 11, 2026

The Supabase project had auto-paused (free tier); restored and audited. Five live bugs found and fixed — all migrations (015–020) are already applied to production.

## Fixed

1. **Star self-mint exploit was still open.** Migration 002 dropped `stars_insert_system`, but the permissive `star_transactions_insert` policy (from 006) was still live — any student could mint stars from the console. `inventory_insert_own` likewise let anyone grab store items for free. All client INSERT policies dropped (016); writes now flow through `award_stars`, `spend_stars`, and the new `gift_item` RPC. App code updated: workout completion, purchase route, gift route.

2. **Classroom join was broken.** `/join` looked up `pods` by invite code, but no RLS policy lets a non-member see a pod — every code read as invalid. New `join_pod_by_invite_code` RPC (018, case-insensitive) and `/join` updated to use it.

3. **Parent invite-code flow was broken end-to-end.** `generate_parent_link_code` crashed (pgcrypto never enabled — fixed in 019), and `redeem_parent_link_code` never wrote `parent_student_links`, which everything parent-facing keys off. Redeem now creates a **pending** link routed to the student's teacher for approval (017) — keeps the school in the COPPA consent loop.

4. **Old user-enumeration endpoint removed.** The parent dashboard still used `/api/link-parent-student` (lists every auth user). Its POST now returns 410; the dashboard form takes the child's invite code instead.

5. **Advisor warnings cleared (015, 020).** `search_path` pinned on trigger functions; `anon`/`PUBLIC` EXECUTE revoked on all SECURITY DEFINER functions; default privileges changed so future functions don't leak to `anon`.

## UI

- Consistent spinner loading states across all dashboards (was bare "Loading…" text).
- Error banners with Retry on student/teacher/parent dashboards (failures used to render silently as zeros — this is what the paused project looked like).
- Replaced all `alert()` calls with inline error banners.
- globals.css: textarea styling, button disabled/focus-visible states, card hover, reduced-motion support.

## Still manual

- Enable **leaked password protection** (dashboard toggle — see docs/supabase-leaked-password-toggle.md).
- Upgrade Supabase to Pro before launch so the project never auto-pauses again.
- Pre-existing lint debt: ~226 eslint findings (unescaped entities, hook deps). Build and types are clean.
