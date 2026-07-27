# Security review — your follow-up list

Companion to `security-review-2026-07-26.md`. Everything here needs **you** —
a dashboard toggle, a decision, a document, or a purchase. Nothing on this list
can be closed by writing code.

Grouped by when it has to happen, not by severity.

---

## A. Before any real student data enters the system

### A1. Move the two PDFs out of the project folder
**Status:** guardrail in place, file still there.
`mercury-backup-codes-resolutionnation87gmailcom.pdf` and `RN-EIN.pdf` are in
the repo root. `.gitignore` now denies `*.pdf`, `*backup-code*`, `*-EIN*`, and
`git add -A` no longer stages them — but ignoring a file is not the same as
storing it safely.

- Move the Mercury backup codes into your password manager (1Password /
  Bitwarden secure note), then delete the local copy.
- Move `RN-EIN.pdf` to wherever you keep formation documents.
- If the Mercury codes have ever been emailed, synced to iCloud/Dropbox, or
  sat in a Downloads folder on a shared machine — regenerate them in Mercury.
  Costs ten minutes, removes all doubt.

### A2. Turn on leaked-password protection
**Where:** Supabase dashboard → Authentication → Policies → "Leaked password
protection."
It's an API-inaccessible toggle, so I can't do it. This checks new passwords
against HaveIBeenPwned. Pairs directly with the roster-password fix — together
they're what stands between a guessed password and a child's full education
record.

### A3. Verify `CRON_SECRET` in Vercel
Your local `.env.local` reads `CRON_SECRET KEY: <value>` — a space and a colon
where an `=` belongs, so dotenv skips the line and the variable is undefined
locally. Check whether Vercel's environment variable was copied from the same
source.

- Vercel → Project → Settings → Environment Variables → confirm the **key** is
  exactly `CRON_SECRET`.
- Fix the local file to `CRON_SECRET=<value>` so you can test the nightly job.
- **Note:** I changed this route to reject the `?token=` query-string fallback.
  If you have an external scheduler (cron-job.org, EasyCron, etc.) hitting it
  with `?token=`, it will start returning 403. Switch it to send
  `Authorization: Bearer <CRON_SECRET>`. If Vercel Cron is your only trigger,
  nothing to do — it already uses the header.

### A4. Decide the demo-account story
The review didn't cover this, but it's adjacent: your notes mention demo
accounts. Before a pilot, confirm they can't reach real student data and that
their passwords aren't shared publicly anywhere.

---

## B. Before a school pilot

### B1. Move rate limiting to shared storage
The limiter is an in-process `Map`. On Vercel each serverless instance keeps
its own, so the real limit is `configured_limit × instance_count`, and it
resets on every cold start. I fixed the spoofable-identity bug, but the
per-instance problem is architectural.

- Provision Upstash Redis or Vercel KV (both have free tiers).
- The `checkRateLimit(request, opts)` signature is designed to stay the same —
  only the bucket store changes. Ping me and it's a small job.

### B2. Get a signed DPA with Anthropic, and list subprocessors
Student writing, report-card text, fluency transcripts and IEP goal inputs all
go to Anthropic. That's a legitimate processing purpose, but districts will ask
you to name it.

- Confirm you're on terms that cover education data and no-training-on-inputs.
- List Anthropic (and your STT provider, once chosen) as subprocessors in the
  privacy policy.
- Same for Supabase and Vercel if they're not already listed.

### B3. NY Ed Law 2-d parents' bill of rights
NY-specific and required before a district signs. Usually a one-page appendix
to the contract. Worth raising with whichever firm you're talking to from
`docs/attorney-outreach.md`.

### B4. Penetration test or external review
I reviewed the backend as the person who also wrote the fixes. Before a
district security questionnaire, an independent set of eyes is worth the spend
— and "we commissioned an external review" is itself an answer on those
questionnaires.

---

## C. Before App Store submission

### C1. Data-safety / privacy nutrition labels
Apple's App Privacy questionnaire needs an exact inventory: what's collected,
linked to identity, and used for tracking. Your data-minimization audit covers
most of the raw material.

### C2. Kids Category decision
If you list under Kids, Apple bans third-party analytics and advertising SDKs
and applies stricter review. Decide deliberately — it changes what you can put
in the app.

### C3. Account deletion in-app
Apple requires apps with account creation to offer in-app deletion. You have
`/api/account/delete` and the nightly hard-delete cron, so this is likely
satisfied — worth confirming the UI path is reachable without contacting
support.

---

## D. Open engineering items (I can do these — just say when)

Not blocking anything today, listed so nothing gets lost.

| ID | Item | Notes |
|---|---|---|
| M4 | Consent-record integrity | Closed by migration 035b. Listed only because the privacy documentation should describe how consent is recorded now that it's server-controlled. |
| L2 | `anon` grants | Closed by 035b. |
| L4 | Report-card redaction | Comment corrected to stop overclaiming. Real decision is yours: do proper redaction, or document Anthropic as receiving report-card text (B2 covers it). |
| — | `grade` is self-writable | **Fixed** (migration 038 + `/api/teacher/student-grade`). One piece left for you: the route exists but no teacher UI calls it yet — see D1 below. |
| — | Roster per-row errors | Still surface Supabase Auth message text (e.g. "already registered"). Actionable for teachers, low risk, but tighten if you want zero vendor strings reaching the UI. |
| — | RLS recursion workaround | Several routes use the service-role client specifically to dodge the `profiles → pod_members → pods` recursion. Each one is a place where a future edit could become an IDOR. Fixing the recursion properly would let them go back to normal RLS. |

### D1. Grade-level editing needs a teacher UI
`POST /api/teacher/student-grade` is built, authorized, validated and
audit-logged — but nothing in the app calls it yet. The natural home is the
teacher's student detail page (`/dashboard/teacher/students/[studentId]`) as a
small dropdown next to the student's name.

Until that exists, grade can only be set at signup or by roster import. Four of
your six student accounts currently have `grade = null`, which means adaptive
tier and fluency norms are falling back to defaults for them. Say the word and
I'll wire up the dropdown.

### D2. Product decision: should students pick their own grade at signup?
Self-signup students still choose their grade on the signup form. For
school-track accounts it's moot — the teacher creates those via roster import.
If grade should be teacher-set from the very start, the field should come off
the student signup form entirely. That changes onboarding, so I left it alone.

---

## Quick reference: what changed in production today

Eight migrations applied to `grlmcnoojbedxjoschsk`:

| Migration | Fixes |
|---|---|
| 035 / 035b | C1, M4, L2 — profile column lockdown |
| 036 / 036b | H2 — storage upload scoping, bucket limits |
| 037 | M1 — audit log write lockdown |
| 038 | Grade level is teacher-controlled |

Code changes (not yet deployed — they ship on your next Vercel deploy):
H1 password generation, M2 `student-insight` lockdown, M3 rate-limit identity,
M5 cron auth, L3 relationship checks, L5 error messages, L4 comment honesty.

**The database changes are live now; the code changes are not.** They're
compatible in both directions — nothing in the current deployment breaks
against the new grants — but the app isn't fully protected until you deploy.
