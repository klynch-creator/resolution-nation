# Phase 13 — Read-Aloud Fluency

A real oral-reading-fluency workflow: a student reads a grade-level passage aloud,
the app listens, measures Words Correct Per Minute (WCPM) and accuracy, classifies the
result against national norms, and reports it to the **teacher and parent only**. The
student sees warm, level-free feedback and is invited to read again to improve.

This replaces the old behavior where "fluency" was just another multiple-choice quiz.

## Decisions (locked with Kaelan, 2026-06-28)

- **Speech capture/transcription:** cloud speech-to-text, abstracted behind one
  interface (`lib/fluency/stt.ts`) so the vendor can be swapped or an on-device option
  added later. Word-level timestamps are required.
- **Metric:** WCPM classified against **Hasbrouck & Tindal (2017) ORF norms**
  (25th / 50th percentile by grade and season). This is what schools use.
- **Audio:** the recording is **stored** (private bucket) so teachers/parents can listen
  back.
- **Passages:** **AI-generated, leveled by grade**, schema allows a curated bank later.

## Levels

For the student's grade and the current season (fall/winter/spring):

- `on` — WCPM ≥ 50th percentile (at or above benchmark)
- `approaching` — 25th ≤ WCPM < 50th
- `below` — WCPM < 25th

Norms are published for grades 1–6. Grades 7–12 benchmark against grade 6
(`normSource = "proxy"`). Kindergarten and the grade-1 fall window have no norm
(`level = null`, shown as "Not normed"). Source values verified against the published
table at readingrockets.org (2017_ORF_NORMS.pdf).

## Data model (migration `024_fluency_phase13.sql`)

- `fluency_assessments` — one passage instance per (student, content_key): passage text,
  word count, grade snapshot, rolled-up `best_wcpm` / `best_level`, `attempts`, status.
- `fluency_attempts` — one row per read (read 1, read 2, …): `audio_path`, transcript,
  duration, `wcpm`, `accuracy_pct`, `errors`, `level`, the norm benchmarks used,
  `miscues` (jsonb), supportive `feedback`, `stars_awarded`. Unique on
  (assessment_id, attempt_number).
- `fluency-audio` — **private** storage bucket; objects keyed `${studentId}/${assessmentId}/${n}.<ext>`.
- `record_fluency_attempt()` — `SECURITY DEFINER` RPC. Inserts the attempt, awards
  **capped** stars (5 for the first read; later read +10 if WCPM improved else +3; max 15
  per assessment), and rolls up the best score/level. Star payout is computed in the RPC,
  never trusted from the client — same model as `complete_lesson` / migration 016.

### RLS (verified live on demo data)

Student: full access to own assessments; read own attempts (no client INSERT — attempts
are written only by the RPC). Teacher: read where they set a goal for the student.
Parent: read for an approved-linked child. Verified: teacher 1/1, parent 1/1, owner 1/1,
unrelated student 0/0.

## Code map

- `lib/fluency/norms.ts` — H&T table, grade/season parsing, `classifyWcpm()`.
- `lib/fluency/score.ts` — Needleman-Wunsch word alignment → WCPM, accuracy, completion,
  miscues. Pure/testable (26 assertions). Conventions: errors = substitutions + omissions;
  insertions/repetitions surfaced but not penalized; reference words past the furthest
  point reached are "not reached," not omissions.
- `lib/fluency/stt.ts` — `transcribeAudio(buffer, mime)` → `{transcript, words[], durationSeconds}`.
  Providers: Deepgram (default) and OpenAI Whisper, chosen by `FLUENCY_STT_PROVIDER`.
- `app/api/fluency/passage` — generate + persist a leveled passage (student only).
- `app/api/fluency/score` — store audio → transcribe → score → classify → AI feedback
  (best-effort, level-free) → `record_fluency_attempt`. Returns a **student-safe** payload
  (feedback, focus words, stars, can_retry) with **no** score/level.
- `app/api/fluency/audio/[attemptId]` — mints a 5-min signed URL **after** an RLS read
  proves the caller may access the attempt (service role used only post-authorization).
- Student UI: `app/dashboard/student/fluency/page.tsx` (+ dashboard card and nav).
- Teacher: `app/dashboard/teacher/students/[studentId]/fluency/page.tsx`; Parent:
  `app/dashboard/parent/fluency/page.tsx`; shared `app/dashboard/_components/FluencyReport.tsx`.

## Configuration required before launch

- `FLUENCY_STT_PROVIDER` (`deepgram` | `openai`) and the matching key
  (`DEEPGRAM_API_KEY` or `OPENAI_API_KEY`). Without a key the feature returns a friendly
  503 and records nothing. (`SUPABASE_SERVICE_ROLE_KEY` already exists.)

## Compliance

- `legal/privacy-policy.md` updated: voice recordings added to the educational-records
  inventory; the "we don't collect microphone audio" claim corrected to "only on explicit,
  student-initiated reads"; new use disclosed (STT sub-processor under DPA, no model
  training); retention/deletion covered; "no voiceprint / not a biometric identifier"
  characterization added.
- Account-deletion worker (`app/api/cron/hard-delete-accounts`) now purges the user's
  private storage (`fluency-audio`, plus `report-cards`, `curricula`) before deleting the
  auth user, since storage objects do not cascade.
- **Open attorney items** (also in the policy's review notes): add the STT vendor to
  `/legal/subprocessors` with a no-training (ideally zero-retention) DPA; confirm BIPA/CUBI
  /WA biometric posture; confirm whether a minor's voice recording needs separate consent
  beyond school FERPA consent; add voice recordings/transcripts/metrics to the NY Parent
  Bill of Rights data inventory.

## Possible follow-ups

- Curated/leveled passage bank (schema already supports it).
- Teacher-assigned fluency passages from the roadmap (source already supports `roadmap`).
- Trend chart of WCPM over time in the teacher/parent report.
- On-device STT option for stricter data-minimization.
