# Backend Security Review — 2026-07-26

> **Remediation status (updated 2026-07-26):** C1, all three Highs, M1, M2, M3,
> M5, L2, L3, L4, L5 are **fixed and verified**. Remaining: M4 and L1 need a
> config change from you, M6 is a dashboard toggle, and B-series items are
> process/legal. See the [Remediation log](#remediation-log) below, and
> `security-followups-kaelan.md` for everything that needs you rather than code.
>
> One correction to the original report: C1 claimed no server-side unfreeze
> path existed — that was wrong. Detail in the log.

Scope: all 33 `app/api` routes, `proxy.ts`, `lib/`, 35 migrations, and live
verification against the production Supabase project (`grlmcnoojbedxjoschsk`)
via read-only queries and the Supabase security advisors.

Every finding below was confirmed against actual code or live DB state, not
inferred from the migration files alone.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 3 |
| Medium | 6 |
| Low | 5 |

The baseline is genuinely good: RLS is enabled on all 27 public tables, every
API route calls `auth.getUser()` and rate-limits, all four storage buckets are
private, no secret has ever been committed to git, and the `SECURITY DEFINER`
functions all pin `search_path` and re-check `auth.uid()` internally. The issues
below are gaps in an otherwise solid model, not a broken foundation.

---

## CRITICAL

### C1 — A frozen student can unfreeze their own account

**Where:** `profiles` RLS + column grants (live DB), `lib/writing-moderation.ts:110-122`

The content-moderation system freezes an account by setting
`profiles.is_frozen = true`. But `profiles` has an unrestricted self-update
policy:

```sql
profiles_update_own  UPDATE  USING (auth.uid() = id)  WITH CHECK (auth.uid() = id)
```

The only column protected is `role`, via the `profiles_lock_role` trigger, which
checks *only* `OLD.role IS DISTINCT FROM NEW.role`. Confirmed column-level
`UPDATE` grants for `authenticated` include `is_frozen`, `frozen_at`, and
`frozen_reason`.

**Exploit:** a student whose account was locked for sexual content, self-harm
content, or threats sends one request with their own session token:

```
PATCH /rest/v1/profiles?id=eq.<their-own-uuid>
{"is_frozen": false, "frozen_at": null, "frozen_reason": null}
```

They are immediately unlocked. The `FrozenGate` component and the
`is_frozen` checks in `writing/grade`, `writing/generate`, and
`writing/creative/save` all read this same field, so every layer of the lockout
is bypassed at once. No teacher review occurs, and the `moderation_flags` row
stays unresolved, so nothing surfaces as "handled."

**Why it's Critical:** this is the child-safety containment control. Its whole
purpose is to hold an account until an adult looks at flagged writing. A student
can defeat it with a single API call, and the teacher will believe the account
is still paused.

**Fix:** revoke column-level `UPDATE` on the moderation and consent columns, and
extend the trigger to reject self-service changes to them.

```sql
REVOKE UPDATE (role, is_frozen, frozen_at, frozen_reason,
               is_under_13, consent_track, created_at, id)
  ON public.profiles FROM authenticated, anon;
```

Plus a hardened trigger that raises unless `auth.role() = 'service_role'`.
Teacher-initiated unfreeze then has to move to a `SECURITY DEFINER` RPC or a
service-role API route that verifies the teacher shares a pod with the student —
neither exists yet, so this needs a small amount of new code, not just a
migration.

---

## HIGH

### H1 — Roster-import passwords have ~9,000 possible values and use `Math.random()`

**Where:** `app/api/roster/import/route.ts:29-40`

```ts
function genPassword(): string {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]; // 10 options
  const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)]; // 10 options
  const n = Math.floor(Math.random() * 90) + 10;                 // 90 options
  return `${a}-${b}-${n}`;
}
```

Total keyspace: **9,000**. Two problems compound it:

1. `Math.random()` is not a CSPRNG. V8's xorshift128+ state is recoverable from
   a handful of observed outputs — a teacher who imports one roster and sees
   40 passwords can predict passwords minted for other classes on the same
   serverless instance.
2. Usernames are also generated, not secret: `{first-initial}{lastname}{2 digits}`
   at a fixed domain. A class list — which is not confidential — plus 9,000
   guesses gets you into a specific child's account.

Supabase Auth's leaked-password protection is currently **off** (advisor
confirmed), and the app's own rate limiter does not apply to Supabase's auth
endpoint at all, so nothing in the stack meaningfully slows this down.

**FERPA impact:** each compromised account exposes that student's full education
record — IEP goals, writing submissions, fluency recordings, teacher messages.

**Fix:** use `crypto.randomInt` over a larger word list (3 words from a 200+ word
list ≈ 8M combinations, still readable off a printed login card), or add a
4th component. Also enable leaked-password protection in Supabase Auth.

### H2 — `report-cards` and `curricula` accept uploads into any user's folder

**Where:** live storage policies

```sql
curricula_upload      WITH CHECK (bucket_id = 'curricula'    AND auth.role() = 'authenticated')
report_cards_upload   WITH CHECK (bucket_id = 'report-cards' AND auth.role() = 'authenticated')
```

Compare to the correct pattern used by `fluency-audio`:

```sql
fluency_audio_upload  WITH CHECK (... AND (auth.uid())::text = (storage.foldername(name))[1])
```

The read policies on all three buckets *are* correctly scoped to
`(storage.foldername(name))[1] = auth.uid()`. So this is not a data-read leak —
it's a write/tamper problem. **Any authenticated user, including a student, can
write or overwrite objects under any other user's UUID prefix** in
`report-cards` and `curricula`.

Consequences: a student can plant a file that a teacher's
`/api/extract-report-card` or `/api/curriculum/extract` route will then download
and feed to Claude (a prompt-injection delivery channel into a teacher-facing
AI feature), or overwrite a teacher's uploaded curriculum.

Separately, `report-cards`, `curricula`, and `fluency-audio` all have
`file_size_limit = NULL` and `allowed_mime_types = NULL` — unbounded uploads of
arbitrary content type. Only `avatars` is constrained (5 MB, image types).

**Fix:** add the `foldername` check to both `WITH CHECK` clauses, and set size
and MIME limits on all three buckets.

### H3 — Bank 2FA backup codes are sitting in the project folder, not gitignored

**Where:** repo root

```
?? RN-EIN.pdf
?? mercury-backup-codes-resolutionnation87gmailcom.pdf
```

Both are untracked *today*, but `.gitignore` covers
`Resolution_Nation_*.docx` / `*.xlsx` and `.env*` — it does **not** cover
`*.pdf`. A single `git add -A` or `git add .` commits your Mercury business
banking backup codes to the repository. Once pushed, rotating them means
rotating the bank account's 2FA, and the codes remain in git history.

Nothing is currently exposed — git history is clean (verified: no `.env`, no
PDF, no key has ever been added in any commit on any branch). This is a
one-mistake-away situation, not an active breach.

**Fix:** move both PDFs out of the repo into a password manager or encrypted
storage today, and add `*.pdf` to `.gitignore` with an explicit allowlist for
any PDF you actually intend to track.

---

## MEDIUM

### M1 — Any signed-in user can forge audit log entries

**Where:** `write_audit` RPC (advisor-flagged, confirmed executable by `authenticated`)

```sql
INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_metadata);
```

`actor_id` is correctly forced to the caller, but `action`, `target_type`,
`target_id`, and `metadata` are entirely caller-controlled, with no allowlist
and no rate limit. Any student can write thousands of rows claiming arbitrary
actions against arbitrary targets.

The audit log is your NY Ed Law 2-d recordkeeping artifact and the thing you'd
hand a district during a data-incident review. Being able to pollute it — or
bury a real entry under noise — undermines its evidentiary value. The nightly
cron also purges it on a 2-year window, so flooding has a cost dimension too.

**Fix:** validate `p_action` against a fixed allowlist inside the function, or
revoke `EXECUTE` from `authenticated` and write audit rows only from
service-role API routes (which is already how `parent/export` and
`roster/import` do it).

### M2 — `/api/student-insight` is an open Claude proxy

**Where:** `app/api/student-insight/route.ts:20-34`

```ts
const { studentStats } = await request.json();
// ...
content: `... Data: ${JSON.stringify(studentStats)}`
```

The route checks that you are signed in and nothing else. There is no role
check, no relationship check, and `studentStats` is unvalidated arbitrary JSON
interpolated straight into the prompt. There is no system prompt constraining
the model.

Any authenticated user — including a 3rd grader — can send arbitrary text and
get arbitrary Claude output back, at your API cost. Rate limit is 10/min per
claimed IP (see M3, which weakens that further).

Two distinct risks: unbounded Anthropic spend, and unfiltered model output
reaching a child through your app. The latter is exactly the kind of thing a
district's COPPA/child-safety review will ask about, and it sits awkwardly next
to the careful moderation you built for the writing features.

**Fix:** require `role = 'teacher'`, take a `studentId` and verify pod
membership, build the stats server-side from the DB rather than accepting them
from the client, and add a system prompt that scopes the response.

### M3 — Rate limiting keys on a client-controllable header, and is per-instance

**Where:** `lib/rate-limit.ts:113-119`

```ts
const xff = request.headers.get("x-forwarded-for");
if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
```

Taking the **first** element of `x-forwarded-for` takes the value furthest from
your infrastructure — the portion a client can set themselves. An attacker
rotating that header gets a fresh bucket per request, defeating every rate limit
in the app, including the ones protecting the AI routes (cost) and
`parent-export` (bulk PII egress).

Compounding it, the buckets are an in-process `Map`. On Vercel, each serverless
instance has its own, and instances scale out under load — so the effective
limit is `limit × instance_count`, and it resets on every cold start. The file's
own header comment acknowledges this as a scale concern; it's also a correctness
concern today.

**Fix:** prefer `x-vercel-forwarded-for` (set by Vercel, not spoofable by the
client) or the *last* entry of `x-forwarded-for`. Move buckets to Upstash Redis
or Vercel KV before school traffic starts; keep the `checkRateLimit` signature.

### M4 — Students can rewrite their own COPPA consent record

**Where:** `profiles` column grants (live DB)

`is_under_13`, `consent_track`, and `created_at` are all self-updatable by
`authenticated` (same root cause as C1, different blast radius). A student can
flip `is_under_13` to `false` or change `consent_track` from `school` to
`self_over_13`.

You deliberately don't store DOB (good — RN-24/25), which makes these three
columns the *entire* record of what consent basis each account operates under.
If a district or the FTC asks you to demonstrate consent coverage, a
user-writable field is not evidence. Fix is folded into C1's `REVOKE`.

### M5 — Cron secret accepted in the query string, compared non-constant-time

**Where:** `app/api/cron/hard-delete-accounts/route.ts:75-89`

```ts
const tokenParam = url.searchParams.get("token");
// ...
if (provided !== expected) { ... }
```

Query strings are written to Vercel access logs, browser history, and any
intermediate proxy log. This route hard-deletes user accounts and purges the
audit log — the secret should never travel somewhere that logs it. The `!==`
comparison is also not constant-time.

The route does fail closed when `CRON_SECRET` is unset (returns 500), which is
the right default.

**Fix:** drop the `?token=` path and require the `Authorization: Bearer` header
only; compare with `crypto.timingSafeEqual`.

### M6 — Leaked-password protection is disabled

Supabase advisor, `auth_leaked_password_protection`. You already have
`docs/supabase-leaked-password-toggle.md`, so this is a known open item — but it
interacts directly with H1, so it's worth doing in the same pass.

Remediation: <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>

---

## LOW

### L1 — `CRON_SECRET` is malformed in `.env.local`

The line reads `CRON_SECRET KEY: <value>` — a space and a colon, so dotenv skips
it and `process.env.CRON_SECRET` is `undefined` in local dev. The route fails
closed, so this is a config bug rather than a hole, but the nightly job cannot
be tested locally until it reads `CRON_SECRET=<value>`. Worth confirming the
Vercel environment variable is set correctly, since it was presumably copied
from the same source.

### L2 — `anon` holds column `UPDATE` grants on `profiles`

Confirmed for all 16 columns. RLS blocks it in practice (`profiles_update_own`
requires `auth.uid() = id`, and `anon` has no uid), so this is not exploitable.
Migration 020 revoked anon *function* grants but not table grants. Include
`anon` in C1's `REVOKE` for defense in depth.

### L3 — AI routes accept `studentId` without verifying the relationship

`draft-parent-update`, `generate-progress-note`, and `extract-report-card` all
take a caller-supplied `studentId` and never check that the caller teaches that
student. They are *not* leaking data — each one queries through the caller's own
RLS context, so an unrelated caller gets zero rows and the AI writes a note
about nothing. But the check should be explicit rather than incidental to RLS;
if any of these is ever refactored to use the admin client (as several routes
already were, to work around the RLS recursion issue), it becomes a live IDOR
with no code review signal that anything changed.

### L4 — Report-card "anonymization" is cosmetic

**Where:** `app/api/extract-report-card/route.ts:98-103`

```ts
const anonymizedText = rawText.replace(/student(?:\s+name)?:\s*\S+/gi, "student: [REDACTED]");
```

This matches one literal label format and one whitespace-delimited token — it
won't catch "Name:", a name in a header, a first-and-last name, a student ID, or
a name anywhere else on the page. The full report-card text goes to Anthropic
regardless, and the system prompt explicitly asks the model to return
`student_name`.

Sending it isn't the problem — it's a legitimate processing purpose under a
vendor DPA. The problem is that the code comment claims PII avoidance that isn't
happening, which is the kind of thing that becomes a misstatement in a district
questionnaire. Either drop the regex and document Anthropic as a subprocessor
receiving report-card content, or do real redaction.

### L5 — Internal error messages returned to clients

`parent/export` and `roster/import` both return `e.message` in the response
body. Supabase and Postgres errors can carry table names, column names, and
constraint names. Log the detail server-side (Sentry is already wired) and
return a generic message.

---

## Verified as sound

Worth recording what held up, so it doesn't get re-litigated:

- **RLS coverage** — enabled on all 27 public tables, all with policies.
- **`SECURITY DEFINER` functions** — all 23 advisor warnings are by design.
  Every function pins `SET search_path TO 'public'` and re-derives the caller
  from `auth.uid()` internally rather than trusting a parameter. `award_stars`
  in particular is well-defended: amount bounds, step ownership, completion
  state, double-award check, and a teacher+pod check for bonuses.
- **Role escalation** — blocked by the `profiles_lock_role` trigger. A student
  cannot become a teacher.
- **`/api/avatar/[userId]`** — textbook authorization: explicit self / teacher-shares-pod /
  approved-parent branches before minting a 600s signed URL.
- **`/api/fluency/audio/[attemptId]`** — uses the caller's RLS context as the
  authorization probe, then service-role only to sign. Correct pattern.
- **`/api/parent/export`** — verifies the approved link through the parent's own
  RLS context before switching to service role, honors `shared_with_parent` on
  IEP goals, caps rows, and audit-logs every export.
- **Avatar upload** — fails closed if vision moderation errors (503, nothing
  stored), validates MIME against an allowlist, enforces 5 MB, stores under a
  UUID path in a private bucket.
- **Secrets** — no `.env`, key, or credential has ever been committed on any
  branch. `.env.local` is correctly ignored.
- **Auth session handling** — `proxy.ts` uses `getUser()` (server-validated) not
  `getSession()` (cookie-trusting), which is the distinction that matters.

---

## Suggested order of work

1. **C1 + M4 + L2** — one migration (`REVOKE` + hardened trigger) plus a
   teacher-unfreeze RPC. This is the child-safety fix; do it first.
2. **H2** — two storage policy updates and three bucket limit settings. Pure SQL/config.
3. **H3** — move two PDFs, one `.gitignore` line. Five minutes.
4. **H1 + M6** — CSPRNG password generation, plus flip on leaked-password protection.
5. **M3** — header fix now, Redis-backed buckets before first school deployment.
6. **M1, M2, M5** — audit allowlist, lock down `student-insight`, header-only cron auth.
7. **L1, L3, L4, L5** — cleanup pass.

Items 1–4 are what I'd want closed before any real student data enters the
system. Items 5–6 before a school pilot. The rest before an App Store
submission or a district security questionnaire.

---

## Remediation log

### Correction to the original report

C1 stated that revoking the grants would break teacher unfreeze "which
currently has no server-side path." **That was wrong.**
`resolve_moderation_flag(uuid)` has existed since migration 027, is
`SECURITY DEFINER`, and is owned by `postgres` — the same role that owns
`public.profiles`. It therefore runs with owner privileges and is unaffected by
column grants revoked from `authenticated`. C1 was a pure migration; no new
route was needed.

### Applied to production

| Migration | What it does |
|---|---|
| `035_profile_column_lockdown` | Trigger hardening + broadened unfreeze RPC (column REVOKEs in it are a no-op — see below) |
| `035b_profile_column_grant_fix` | The REVOKE that actually bites |
| `036_storage_upload_scoping` | Folder-scoped storage policies + size limits |
| `036b_storage_mime_compat` | MIME allowlist correction |

**A trap worth remembering:** the column-level `REVOKE UPDATE (col, …)` in 035
silently did nothing. `authenticated` held a *table-level* UPDATE grant
(`authenticated=arwdDxtm/postgres`), and Postgres will not let a column-level
revoke carve an exception out of a table-level grant — it succeeds and changes
nothing. Post-035 verification showed every protected column still reporting
`has_column_privilege(...,'UPDATE') = true`. 035b does it correctly: drop the
table-level grant, then re-grant only the eight user-owned columns
(`full_name`, `grade`, `avatar_url`, `theme`, `contact_email`, `phone`,
`preferred_language`, `preferred_contact`).

### Verification

Privilege matrix after 035b — protected columns all `false`, user-owned columns
all `true`, `service_role` retains write on `is_frozen`, and the signup
`INSERT` path is intact.

Live behavioural test, run as role `authenticated` with a real student's JWT
claims inside a transaction that was rolled back:

```
self-unfreeze   -> BLOCKED (permission denied for table profiles)
role escalation -> BLOCKED (permission denied for table profiles)
consent rewrite -> BLOCKED (permission denied for table profiles)
legit self-edit -> OK
```

Storage: all 14 policies across the four buckets are folder-scoped; every
bucket now has a size limit and MIME allowlist.

`npx tsc --noEmit` exits 0. Password generator sampled 200,000 times: keyspace
36,864,000 (4,096× the previous 9,000), zero format violations, max length 20
characters.

Supabase security advisors re-run post-change: no new findings. The remaining
warnings are the same by-design `SECURITY DEFINER` set plus M6.

### Also fixed while in the area

- **`resolve_moderation_flag` lockout bug** (functional, not security).
  It authorized the teacher via "has a `goals` row for this student." A
  roster-imported student has no goals on day one, so a moderation freeze was
  unrecoverable by anyone — a permanent lockout for the exact population the
  CSV importer creates. Now accepts a goal **or** shared pod membership.
- **Unfreeze is now audit-logged** (`moderation_flag_resolved`), which the
  Ed Law 2-d recordkeeping story wanted anyway.
- **`report-cards` had no DELETE policy**, so teachers could not remove their
  own uploads. Added, folder-scoped.
- **Roster importer edge case:** after 20 username collisions `local` stayed
  `""`, producing an `@domain` email and a cryptic Supabase error. Now returns
  an actionable per-row message.

### Still open — needs you, not code

- **M6 / leaked-password protection** is a dashboard toggle
  (Authentication → Policies) and cannot be set through the API. Worth doing in
  the same sitting as H1, since together they're what stands between a guessed
  password and a student's record.
- **H3:** `.gitignore` now denies `*.pdf`, `*backup-code*`, `*-EIN*` and
  friends, and `git add -A` no longer stages either file — but
  `mercury-backup-codes-…pdf` and `RN-EIN.pdf` are still sitting in the project
  root. Move them to a password manager or encrypted storage; ignoring them is
  a guardrail, not a resting place.
- **L1:** `.env.local` reads `CRON_SECRET KEY: <value>` instead of
  `CRON_SECRET=<value>`, so it's undefined locally. Check whether the Vercel
  environment variable was copied from the same source.

---

## Remediation log — second pass (mediums and lows)

### Applied to production

| Migration | Fixes |
|---|---|
| `037_audit_log_write_lockdown` | M1 |

**M1 was simpler than the report proposed.** The report suggested validating
`p_action` against an allowlist. On inspection, `write_audit` has *zero* client
callers — it is only invoked via `PERFORM` from inside other `SECURITY DEFINER`
functions (`request_account_deletion`, `cancel_account_deletion`, both owned by
`postgres`), and the two API routes that audit insert directly with the
service-role client. So `REVOKE EXECUTE ... FROM authenticated` closes the hole
completely with no legitimate impact, and needs no ongoing maintenance. Table
`INSERT`/`UPDATE`/`DELETE` on `audit_log` was revoked too — RLS already denied
it, but the grant was one accidental policy away from mattering.

Verified: `write_audit` EXECUTE = false, `audit_log` INSERT = false for both
`authenticated` and `anon`, SELECT still true, `service_role` writes still
true, and both DEFINER callers confirmed `postgres`-owned so the account
deletion flow is unaffected.

### Code changes

- **M2 — `/api/student-insight`.** Was an open Claude proxy: signed-in check
  only, no system prompt, `JSON.stringify(clientBlob)` straight into the
  prompt. Now requires teacher role, verifies the teacher-student relationship,
  runs the payload through a new sanitizer, and uses a system prompt that
  scopes output and marks the payload as data.

  New `lib/prompt-safety.ts` bounds depth (4), array length (40), key count
  (40) and string length (48 chars), and strips strings to
  `[A-Za-z0-9 .,\-/%()+]` — removing newlines, quotes, braces, backticks and
  colons. Tested against an injection payload: a 130-character "IGNORE ALL
  PREVIOUS INSTRUCTIONS…" string truncates to 48 characters with newlines
  gone, a 500-element array caps at 40, a 5-deep object truncates at 4,
  functions and `NaN` drop, and legitimate data (`"Math - Fractions"`, numbers)
  passes through intact.

- **M3 — rate-limit identity.** `x-forwarded-for.split(",")[0]` took the entry
  *furthest* from our infrastructure, which the client sets. Now prefers
  `x-vercel-forwarded-for`, then `x-real-ip`, then the *last* `x-forwarded-for`
  hop. Falls back to a single shared bucket, which over-limits rather than
  under-limits.

- **M5 — cron auth.** Removed the `?token=` query-string path (query strings
  land in access logs) and switched to constant-time comparison via
  `timingSafeEqual`. **Behaviour change:** any external scheduler using
  `?token=` will now get a 403 and must send `Authorization: Bearer`.

- **L3 — relationship checks.** New `lib/authz.ts` exposes
  `requireTeacherOfStudent()`, mirroring `resolve_moderation_flag`'s logic
  (owns a pod containing the student, or has a goal for them). Wired into
  `student-insight`, `draft-parent-update`, `generate-progress-note`, and
  `extract-report-card`. None of these were leaking — RLS returned zero rows —
  but the check is now explicit rather than incidental.

- **L4 — honest labelling.** The report-card regex was described as PII
  stripping. It isn't. Renamed `anonymizedText` to `bestEffortRedacted` and
  documented what actually reaches Anthropic, so the comment can't become a
  misstatement on a district questionnaire.

- **L5 — error leakage.** `parent/export` and `roster/import` no longer return
  raw `e.message`; detail goes to the server log.

`npx tsc --noEmit` exits 0 after all changes.
