# Data Minimization Audit

**Audit date: 2026-07-06**
**Auditor: Claude (automated walk of supabase/migrations 001–031) — Kaelan to confirm findings**
**Status: DRAFT — covers every table and column in the production schema as of migration 031**

Standard applied: collect only what is necessary to provide the educational service (COPPA §312.7, FERPA school-official scope, NY Ed Law 2-d data minimization). Every column below is classified and justified, or flagged.

## Summary verdict

The schema is lean. There is **no** DOB, home address, geolocation, advertising ID, social media handle, free-form demographic data, or payment data anywhere. The most sensitive holdings are: (1) student voice recordings (fluency), (2) student writing + moderation excerpts, (3) uploaded report cards, (4) parent contact info, and (5) IP addresses in the audit log. All five are justified; four carry action items below.

## Table-by-table

### profiles
`id, full_name, role, grade, avatar_url, created_at, is_frozen, frozen_at, frozen_reason, contact_email, phone, preferred_contact, preferred_language`
- **PII:** full_name (direct), contact_email/phone (direct — parents/teachers).
- **Justified:** name is needed for teacher/parent-facing displays; grade drives content difficulty; freeze fields drive the safety gate; contact fields enable parent communication; preferred_language supports EN/ES messaging.
- ⚠️ **Action A1:** confirm `contact_email`/`phone` are only collected for parent/teacher roles, never students. If a student profile can hold a phone number, gate it off in the UI and RLS.

### pods / pod_members
Classroom/family/team groupings + membership. Organizational only. **No concerns.**

### student_data_uploads
`file_url, extracted_data (JSONB), file_type, status`
- Report cards and assessments uploaded by teachers — sensitive academic records.
- ⚠️ **Action A2 (recommendation):** once extraction succeeds and the teacher confirms the data, the raw uploaded file is arguably no longer necessary. Consider a retention rule (e.g., auto-delete raw file 90 days after successful extraction). Hard-delete worker already covers the `report-cards` bucket on account deletion.

### goals / learning_roadmaps / roadmap_steps / roadmap_subgoals / roadmap_assessments / iep_goals
Core educational records: goal text, roadmap structure, teacher notes, IEP baselines/targets/progress notes.
- IEP data is the most sensitive academic category here (disability-adjacent). Access limited by RLS to the teacher, student where appropriate, and (if `shared_with_parent`) the linked parent. **Justified; no excess columns.**

### workout_responses / lessons / student_skill_tiers
Correctness, difficulty tier, response-time, streaks, AI lesson content + scores.
- `response_time_ms` is fine-grained but directly serves difficulty adaptation. **Justified.**
- No keystroke, cursor, or attention tracking anywhere. **Good.**

### star_transactions / star_store_items / user_inventory
Reward economy. Stars are earned, never purchased (no payment data by design). **No concerns.**

### parent_link_codes
Invite codes with expiry.
- ⚠️ **Action A3 (hygiene):** expired/used codes accumulate. Add a periodic purge (e.g., delete rows 90 days after expiry/use) — they serve no purpose once consumed.

### audit_log
`actor_id, action, target_type, target_id, ip (INET), user_agent, metadata (JSONB)`
- IP + user agent are PII but justified for security and district recordkeeping (Ed Law 2-d).
- ⚠️ **Action A4:** privacy policy commits to 2-year retention, but **no purge job exists**. Add a scheduled purge of audit_log rows older than 2 years (can piggyback on the nightly cron).
- ⚠️ **Action A5:** spot-check that `metadata` JSONB never captures request bodies containing student content — it should hold identifiers and outcomes only.

### account_deletion_requests
Soft-delete queue. Minimal. `reason` is optional free text. **No concerns.**

### parent_student_links / parent_messages
Link status + message content (EN/ES bodies, read receipts).
- Message bodies are communications content — necessary for the feature. Covered by educational-record retention. **Justified.**

### curricula
Teacher-uploaded curriculum docs + extracted JSON. Teacher (not student) data. Hard-delete worker covers the `curricula` bucket. **No concerns.**

### fluency_assessments / fluency_attempts
Passage text, audio_path (voice recording), transcript, WCPM/accuracy metrics, miscues, AI feedback.
- Voice recordings of minors = highest-sensitivity holding. Purpose (teacher/parent listen-back + progress measurement) is documented in the privacy policy; no voiceprints/biometrics derived.
- ✅ Hard-delete worker walks and removes the `fluency-audio` bucket on account deletion — verified in code (app/api/cron/hard-delete-accounts/route.ts).
- ⚠️ **Action A6 (recommendation):** consider a standing retention cap on raw audio (e.g., keep audio N months or most-recent-K attempts, retain transcript + metrics indefinitely as the educational record). Reduces the blast radius of any storage incident. Requires product decision.

### writing_submissions / creative_stories
Prompts, student writing, AI rubric scores/feedback, paste_flagged + paste_events.
- `paste_events` (anti-paste academic integrity): confirm it stores only event metadata (timestamps/lengths), **not** the pasted text itself. ⚠️ **Action A7:** verify and document.

### moderation_flags
`excerpt` (capped at 4,000 chars in code), reason, categories, severity, resolution trail.
- Storing the excerpt is justified: the teacher must see what was flagged even if the student edits the original. Cap verified in lib/writing-moderation.ts. **Justified.**

## Action items (owner: Kaelan unless noted)

| # | Action | Effort | Priority |
|---|---|---|---|
| A1 | Confirm contact_email/phone never collected for student role | Small | High |
| A2 | Retention rule for raw report-card files post-extraction | Product decision + small code | Medium |
| A3 | ~~Purge job for expired/used parent_link_codes~~ **DONE 2026-07-06** — added to nightly cron | — | Done |
| A4 | ~~Purge job for audit_log > 2 years~~ **DONE 2026-07-06** — added to nightly cron | — | Done |
| A5 | Spot-check audit_log.metadata for content leakage | Small | Medium |
| A6 | Decide retention cap for fluency audio | Product decision | Medium |
| A7 | ~~Verify paste_events stores metadata only~~ **VERIFIED 2026-07-06** — PasteEvent = {at, chars} only; pasting itself is blocked | — | Done |

## What we verifiably do NOT collect

No date of birth, no home address, no precise geolocation, no advertising identifiers, no device contacts, no social accounts, no payment instruments, no behavioral profiles, no biometrics/voiceprints, no third-party analytics or ad SDKs.
