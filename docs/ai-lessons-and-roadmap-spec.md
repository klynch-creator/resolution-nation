# AI Lessons & AI Roadmap — Technical Specification

**Status:** Draft for approval · **Author:** Kaelan + Claude · **Date:** 2026-06-20
**Scope:** Two linked features — (1) personalized, adaptive, non-repeating AI lessons, and (2) an AI roadmap teachers set per goal with a teacher-only curriculum/assessment layer.

This spec is written to build *on top of* what already ships in the repo. It calls out exactly what is reused, what is altered, and what is new, so it can be handed straight to implementation in phases.

---

## 1. What already exists (reused, not rebuilt)

| Capability | Where it lives | How we reuse it |
|---|---|---|
| Goals per student (subject, standard, priority, status) | `goals` table, `generate-goals` route | Lessons + roadmaps hang off a goal. |
| Roadmaps + steps (teacher-created, student-approval flow) | `learning_roadmaps`, `roadmap_steps`, `generate-roadmap` route | Becomes the student-facing roadmap. `learning_roadmaps.curriculum_source` column already exists. |
| Per-question adaptive difficulty | student workout player (`sustainedAt`, `highestSustained`) | Promoted to a per-lesson tier signal. |
| "Below / At / Above" level | teacher analytics page (computed today) | Becomes the persisted 3-tier value. |
| Per-question response logging | `workout_responses` (difficulty, is_correct, response_time_ms) | Source of truth for tier movement + review screens. |
| Star economy via SECURITY DEFINER RPCs | `award_stars`, `spend_stars`, `gift_item` (migration 016) | Lesson completion calls `award_stars`; we extend rewards by tier. |
| Report-card extraction from uploads | `extract-report-card` route, `student_data_uploads` | The pattern we copy for curriculum-document ingestion. |
| Parent dashboard + teacher analytics + RLS model | `app/dashboard/parent`, `app/dashboard/teacher`, migrations 004–020 | Review screens extend these; new tables get parallel RLS. |

**Design rule:** all writes to stars and any cross-role data continue to go through SECURITY DEFINER RPCs. No new client-side INSERT policies on protected tables (consistent with migration 016).

---

## 2. Feature decisions (locked)

1. **Lesson model = both.** A free **Lesson Library** (student browses broad subjects and picks a topic) *and* **goal-targeted lessons** surfaced inside the roadmap. Both run through one shared lesson engine.
2. **Difficulty = 3 tiers, auto-adjusting.** `below` / `at` / `above`, relative to the student's goal/grade. Start `at`; sustained success promotes, repeated struggle demotes. Stars scale with tier.
3. **No repeats.** A student never sees the same lesson twice — *unless they failed it*, in which case it is eligible to be re-served (and only that one).
4. **Curriculum input = document upload.** Teachers upload a curriculum doc; AI extracts units/standards; the roadmap is generated against it.
5. **Teacher-only roadmap layer.** Curriculum-aligned assessment checkpoints visible to teachers only — hidden from students and parents.

---

## 3. Data model changes

### 3.1 New: `lessons` (generated lesson instances + library content)

Distinct from `roadmap_steps` so library lessons don't require a roadmap, and so we can track topic, tier, and dedup cleanly.

```sql
CREATE TABLE lessons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- origin: where the lesson came from
  source        TEXT NOT NULL CHECK (source IN ('library','roadmap')),
  goal_id       UUID REFERENCES goals(id) ON DELETE SET NULL,      -- set for roadmap + goal-targeted
  roadmap_step_id UUID REFERENCES roadmap_steps(id) ON DELETE SET NULL, -- set when launched from a step
  -- content / classification
  subject       TEXT NOT NULL,            -- broad subject (ELA, Math, Science, ...)
  topic         TEXT NOT NULL,            -- student-chosen or skill-derived topic
  title         TEXT NOT NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('below','at','above')),
  standard_alignment TEXT,
  activities    JSONB NOT NULL,           -- same question shape as roadmap_steps.activities
  star_reward   INT NOT NULL DEFAULT 10,
  -- dedup key: stable hash of (subject, topic, tier, normalized content signature)
  content_key   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','completed','failed')),
  score_pct     NUMERIC,                  -- last attempt
  stars_awarded INT DEFAULT 0,
  attempts      INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- No-repeat guarantee at the DB level:
-- a student cannot hold two lessons with the same content_key UNLESS the prior one failed.
CREATE UNIQUE INDEX lessons_no_repeat
  ON lessons (student_id, content_key)
  WHERE status <> 'failed';

CREATE INDEX lessons_student_subject ON lessons (student_id, subject, created_at DESC);
```

**No-repeat logic.** When generating a new lesson, the engine collects every `content_key` the student already has where `status IN ('active','completed')` and instructs the model to avoid them; the partial unique index is the backstop. A `failed` lesson is excluded from that exclusion set, so it (and only it) can be regenerated/re-served for a retry.

### 3.2 New: `lesson_responses` (or extend `workout_responses`)

Two options:

- **Preferred:** add a nullable `lesson_id UUID REFERENCES lessons(id)` to `workout_responses` and make `step_id` nullable, so one table holds both roadmap-step and library-lesson answers (one analytics pipeline).
- Alternative: a parallel `lesson_responses` table. More isolation, but duplicates the review queries.

This spec assumes the **preferred** path:

```sql
ALTER TABLE workout_responses
  ADD COLUMN lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE;
ALTER TABLE workout_responses
  ALTER COLUMN step_id DROP NOT NULL;
ALTER TABLE workout_responses
  ADD CONSTRAINT response_origin_chk
  CHECK (num_nonnulls(step_id, lesson_id) = 1);
```

### 3.3 New: `student_skill_tiers` (persisted tier per subject/goal)

The tier the engine starts the next lesson at. Updated by an RPC after each completion.

```sql
CREATE TABLE student_skill_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal_id     UUID REFERENCES goals(id) ON DELETE CASCADE, -- NULL = library/subject-level
  subject     TEXT NOT NULL,
  tier        TEXT NOT NULL DEFAULT 'at' CHECK (tier IN ('below','at','above')),
  win_streak  INT NOT NULL DEFAULT 0,
  loss_streak INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, goal_id, subject)
);
```

**Promotion / demotion rule (tunable constants):**

- Lesson "passed" = `score_pct >= PASS_THRESHOLD` (default 80%).
- 2 consecutive passes at the current tier → promote one tier (cap `above`), reset streaks.
- 2 consecutive fails (or scores < FAIL_THRESHOLD, default 50%) → demote one tier (floor `below`), reset streaks.
- A single mixed result nudges streak counters but doesn't move the tier.

### 3.4 New: curriculum ingestion tables

```sql
CREATE TABLE curricula (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  grade         TEXT,
  subject       TEXT,
  file_url      TEXT,                    -- storage path of uploaded doc
  extracted     JSONB,                   -- { units:[{name, standards:[], skills:[], sequence_order}], notes }
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','extracted','confirmed')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.5 New: roadmap subgoals + teacher-only assessment layer

The roadmap gets an explicit **subgoal** level between the goal and the steps/lessons, plus teacher-only assessment checkpoints.

```sql
CREATE TABLE roadmap_subgoals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id  UUID NOT NULL REFERENCES learning_roadmaps(id) ON DELETE CASCADE,
  sort_order  INT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  target_skill TEXT,                     -- the skill this subgoal builds toward the main goal
  standard_alignment TEXT,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active','completed')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Link existing roadmap_steps to a subgoal (nullable for back-compat)
ALTER TABLE roadmap_steps ADD COLUMN subgoal_id UUID REFERENCES roadmap_subgoals(id) ON DELETE SET NULL;

-- Teacher-only assessment checkpoints aligned to curriculum
CREATE TABLE roadmap_assessments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id    UUID NOT NULL REFERENCES learning_roadmaps(id) ON DELETE CASCADE,
  subgoal_id    UUID REFERENCES roadmap_subgoals(id) ON DELETE SET NULL,
  curriculum_id UUID REFERENCES curricula(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  curriculum_unit TEXT,
  standard_alignment TEXT,
  teacher_notes TEXT,
  -- rolled-up evidence the teacher uses to assess progress
  progress_signal JSONB,                 -- { accuracy, lessons_completed, tier, last_active }
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

`roadmap_assessments` is **never** exposed to students or parents (see §6 RLS).

---

## 4. The lesson engine

### 4.1 Entry points

- **Library:** student picks a broad subject → optionally a topic (free text or suggested chips) → engine generates an `at`-tier (or persisted-tier) lesson with `source='library'`, `goal_id=NULL`.
- **Roadmap / goal-targeted:** from a subgoal, student picks "next lesson"; engine generates `source='roadmap'`, `goal_id` set, `roadmap_step_id` optionally set, topic derived from the subgoal's `target_skill`.

### 4.2 Generation flow (server route, see §5)

1. Resolve the starting tier from `student_skill_tiers` (default `at`).
2. Pull the student's existing `content_key`s (active/completed) for the subject → exclusion set.
3. Call Claude with: grade, subject, topic, tier, goal text/standard (if any), curriculum unit (roadmap case), and the exclusion list ("do not reproduce these topics/items").
4. Compute `content_key` = hash(subject + topic + tier + normalized question stems).
5. Insert into `lessons`; the partial unique index rejects an accidental repeat (regenerate on conflict, max N retries).

### 4.3 Completion flow (RPC, SECURITY DEFINER)

`complete_lesson(p_lesson_id, p_score_pct, p_responses jsonb)`:

1. Verify the lesson belongs to `auth.uid()` and isn't already completed.
2. Insert `workout_responses` rows (lesson_id set).
3. Set `lessons.status` = `completed` if `score_pct >= PASS_THRESHOLD` else `failed`; bump `attempts`, set `score_pct`, `completed_at`.
4. Update `student_skill_tiers` streaks → promote/demote per §3.3.
5. If passed, call `award_stars` with the tier-scaled reward (validated server-side, ≤ the lesson's `star_reward`, idempotent per lesson). Failed lessons award no stars but remain retryable.

### 4.4 Stars by tier (tunable)

| Tier | Base reward |
|---|---|
| below | 5 |
| at | 10 |
| above | 15–20 |

Stars are only granted once per lesson `id`; a failed→retry→pass awards stars on the pass.

---

## 5. API routes (Next.js, `app/api/...`)

All routes auth via `supabase.auth.getUser()` and enforce ownership; mutations that touch stars/tiers call RPCs.

| Route | Method | Purpose |
|---|---|---|
| `api/lessons/generate` | POST | Body `{ subject, topic?, goalId?, subgoalId? }` → generates + stores a lesson, returns it. Handles tier resolution + dedup. |
| `api/lessons/[id]/complete` | POST | Body `{ score_pct, responses[] }` → calls `complete_lesson` RPC. Returns new tier, stars awarded. |
| `api/lessons/history` | GET | Query `?studentId=` → lessons + counts (teacher/parent review; RLS-gated). |
| `api/curriculum/upload` | POST | Multipart → store doc, call extraction (mirrors `extract-report-card`). |
| `api/curriculum/[id]/extract` | POST | Re-run extraction; returns `extracted` JSON for teacher confirmation. |
| `api/roadmap/generate` | POST | **Extend existing `generate-roadmap`**: now also emits `roadmap_subgoals` + teacher-only `roadmap_assessments` when a `curriculumId` is supplied. |

Reuse the existing Anthropic client setup and JSON-only system-prompt pattern from `generate-roadmap/route.ts`.

---

## 6. Security, RLS, FERPA/COPPA

**RLS per new table (mirroring migrations 004–006 patterns):**

- `lessons`: student `ALL` where `student_id = auth.uid()`; teacher `SELECT` where the student is in the teacher's pod / linked via existing teacher↔student relation; parent `SELECT` for approved-linked students (reuse `parent_student_links` + approved status).
- `lesson` writes (status/stars/tier) only via `complete_lesson` / `award_stars` RPCs — no direct client UPDATE of stars (consistent with migration 016).
- `student_skill_tiers`: student `SELECT` own; teacher/parent `SELECT` linked; writes via RPC only.
- `curricula`: teacher `ALL` where `teacher_id = auth.uid()`. No student/parent access.
- `roadmap_subgoals`: student/parent `SELECT` via roadmap ownership (same join used in 004); teacher `ALL`.
- `roadmap_assessments`: **teacher only.** `FOR ALL USING (roadmap_id IN (SELECT id FROM learning_roadmaps WHERE teacher_id = auth.uid()))`. No student/parent policy at all → invisible by default.

**FERPA/COPPA notes:**

- Curriculum docs and assessment notes are education records; restrict to the owning teacher (and school admins later). Don't expose in any student/parent query.
- Parent visibility stays gated behind the existing **teacher-approved** parent link (the COPPA decision already in place). New parent review screens reuse that gate — no new path to child data.
- AI lesson content is generated per-student but contains no PII in prompts beyond grade/goal text; keep it that way (don't send names to the model). Document the model + data flow for the privacy policy in `legal/`.
- Log generation + completion events for auditability (who, what lesson, when).

---

## 7. UI / screens

### Student
- **Lesson Library** (`app/dashboard/student/lessons`): subject grid → topic picker → launch. Shows tier badge and "new" lessons only.
- **Roadmap view** (extend existing `goals/[goalId]/roadmap`): now grouped by **subgoal**; each subgoal lists selectable lessons targeting its skill. Stars + tier shown. Teacher-only assessments are *not* rendered.
- **Lesson player:** reuse the existing workout player UI; point it at `lessons` + `complete_lesson`. Star celebration already exists.

### Teacher
- **Set/Generate roadmap** per goal: upload curriculum → confirm extracted units → generate roadmap with subgoals + assessments.
- **Student profile → Lessons review:** list of lessons taken, count, accuracy, current tier per subject (extends existing analytics page; data from `api/lessons/history`).
- **Curriculum-assessment layer:** the teacher-only checkpoints with rolled-up progress signal.

### Parent
- **Child profile → Lessons:** lessons completed, count, stars, tier (read-only). Same data as teacher review minus the curriculum/assessment layer. Gated by approved link.

---

## 8. Phased build order

1. **Phase A — Lesson engine core.** Migrations for `lessons`, `workout_responses` alter, `student_skill_tiers`; `complete_lesson` RPC; `api/lessons/generate` + `complete`; wire the existing player to lessons. *Outcome: library lessons work end-to-end with tiering, no-repeat, stars.*
2. **Phase B — Lesson Library UI** (student subject/topic browse) + student lesson history.
3. **Phase C — Review screens** for teacher and parent (`api/lessons/history` + UI).
4. **Phase D — Curriculum ingestion** (`curricula`, upload + extract routes, teacher confirm UI).
5. **Phase E — Roadmap subgoals + teacher-only assessments** (migrations, extend `generate-roadmap`, roadmap UI regroup, teacher assessment layer).
6. **Phase F — Hardening:** RLS tests via `execute_sql` + jwt-claim simulation (the project's existing DB-test method), `get_advisors` clean, audit logging, privacy-policy update.

Each phase is independently shippable and testable.

---

## 9. Open questions / tunables to confirm before Phase A

- **Pass/fail thresholds:** PASS=80%, FAIL=50% — OK as defaults?
- **Streak length for tier movement:** 2 in a row — or 3 for promotion / 2 for demotion (gentler up, faster down)?
- **Lesson size:** keep the current 6-question format (2 easy / 2 medium / 2 hard), or vary count by tier?
- **Library topic freedom:** fully free-text topics, a curated suggestion list per subject, or both? (Free text needs a light safety filter for K-12.)
- **Retry policy on a failed lesson:** regenerate fresh questions on the same skill, or re-serve the identical lesson? (Spec assumes a same-skill regeneration is acceptable since the `content_key` only blocks non-failed repeats.)
- **Cost:** every library lesson is a Claude call. Want a generation cap per student/day, or a small pre-generated pool per subject/tier to cut latency + cost?

---

## 10. Risks

- **Generation latency/cost** on the free library — mitigate with a pre-generated pool or caching (see §9).
- **Dedup drift:** `content_key` must be stable; if the model paraphrases, near-duplicates could slip past. Mitigate by hashing on normalized topic+skill, not raw text, and by passing the exclusion list explicitly.
- **Tier thrash:** a student oscillating tiers feels random — the streak requirement (not single results) dampens this.
- **Migration ordering:** new tables reference `goals`/`learning_roadmaps`; land them after confirming current head is migration 020.
