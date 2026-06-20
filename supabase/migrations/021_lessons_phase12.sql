-- ============================================================
-- Resolution Nation — Phase 12: AI Lesson Engine (core)
-- Adds the personalized, adaptive, non-repeating lesson system.
--   - lessons               : generated lesson instances (library + roadmap)
--   - workout_responses     : extended to also hold lesson answers
--   - student_skill_tiers   : persisted 3-tier difficulty per student/goal/subject
--   - complete_lesson()     : SECURITY DEFINER RPC — grades, dedups stars,
--                             logs responses, moves the tier.
--
-- Security model matches migration 016: all star writes go through a
-- SECURITY DEFINER RPC. complete_lesson() computes the star award from the
-- lesson TIER (capped), never from client-supplied amounts, so a forged
-- lessons.star_reward cannot inflate the payout.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. LESSONS
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lessons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source          TEXT NOT NULL CHECK (source IN ('library','roadmap')),
  goal_id         UUID REFERENCES goals(id) ON DELETE SET NULL,
  roadmap_step_id UUID REFERENCES roadmap_steps(id) ON DELETE SET NULL,
  subject         TEXT NOT NULL,
  topic           TEXT NOT NULL,
  title           TEXT NOT NULL,
  tier            TEXT NOT NULL DEFAULT 'at' CHECK (tier IN ('below','at','above')),
  standard_alignment TEXT,
  activities      JSONB NOT NULL,
  star_reward     INT NOT NULL DEFAULT 10,      -- display only; payout is tier-based
  content_key     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','failed')),
  score_pct       NUMERIC,
  stars_awarded   INT NOT NULL DEFAULT 0,
  attempts        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- No-repeat guarantee: a student cannot hold two lessons with the same
-- content_key UNLESS the prior attempt failed (failed lessons stay eligible
-- for a retry).
CREATE UNIQUE INDEX IF NOT EXISTS lessons_no_repeat
  ON lessons (student_id, content_key)
  WHERE status <> 'failed';

CREATE INDEX IF NOT EXISTS lessons_student_subject
  ON lessons (student_id, subject, created_at DESC);

CREATE INDEX IF NOT EXISTS lessons_goal ON lessons (goal_id);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

-- Student: full access to own lessons. (status/stars are only mutated by the
-- SECURITY DEFINER RPC, which runs regardless of these policies.)
CREATE POLICY "lessons_student_all" ON lessons
  FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Teacher: read lessons for any student they set a goal for.
CREATE POLICY "lessons_teacher_read" ON lessons
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM goals g
     WHERE g.student_id = lessons.student_id
       AND g.teacher_id = auth.uid()
  ));

-- Parent: read lessons for an approved-linked child.
CREATE POLICY "lessons_parent_read" ON lessons
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM parent_student_links psl
     WHERE psl.student_id = lessons.student_id
       AND psl.parent_id  = auth.uid()
       AND psl.status     = 'approved'
  ));

-- ─────────────────────────────────────────────
-- 2. WORKOUT_RESPONSES — also hold lesson answers
-- ─────────────────────────────────────────────

ALTER TABLE workout_responses
  ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE;

ALTER TABLE workout_responses
  ALTER COLUMN step_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'response_origin_chk'
  ) THEN
    ALTER TABLE workout_responses
      ADD CONSTRAINT response_origin_chk
      CHECK (num_nonnulls(step_id, lesson_id) = 1);
  END IF;
END $$;

-- Student can read own lesson responses (mirrors existing step policy).
CREATE POLICY "workout_responses_lesson_student_read" ON workout_responses
  FOR SELECT
  USING (lesson_id IS NOT NULL AND user_id = auth.uid());

-- Teacher can read responses for lessons of students they teach.
CREATE POLICY "workout_responses_lesson_teacher_read" ON workout_responses
  FOR SELECT
  USING (
    lesson_id IS NOT NULL AND lesson_id IN (
      SELECT l.id FROM lessons l
      JOIN goals g ON g.student_id = l.student_id
      WHERE g.teacher_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 3. STUDENT_SKILL_TIERS
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS student_skill_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal_id     UUID REFERENCES goals(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  tier        TEXT NOT NULL DEFAULT 'at' CHECK (tier IN ('below','at','above')),
  win_streak  INT NOT NULL DEFAULT 0,
  loss_streak INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- One tier row per (student, goal, subject). goal_id NULL = library/subject level.
-- A partial unique index pair handles the NULL case (NULLs aren't equal in a
-- normal UNIQUE constraint).
CREATE UNIQUE INDEX IF NOT EXISTS skill_tiers_unique_goal
  ON student_skill_tiers (student_id, goal_id, subject)
  WHERE goal_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS skill_tiers_unique_nogoal
  ON student_skill_tiers (student_id, subject)
  WHERE goal_id IS NULL;

ALTER TABLE student_skill_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skill_tiers_student_read" ON student_skill_tiers
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "skill_tiers_teacher_read" ON student_skill_tiers
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM goals g
     WHERE g.student_id = student_skill_tiers.student_id
       AND g.teacher_id = auth.uid()
  ));

CREATE POLICY "skill_tiers_parent_read" ON student_skill_tiers
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM parent_student_links psl
     WHERE psl.student_id = student_skill_tiers.student_id
       AND psl.parent_id  = auth.uid()
       AND psl.status     = 'approved'
  ));
-- No client write policy: writes happen only inside complete_lesson() (DEFINER).

-- ─────────────────────────────────────────────
-- 4. complete_lesson() RPC
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION complete_lesson(
  p_lesson_id UUID,
  p_score_pct NUMERIC,
  p_responses JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_lesson   lessons%ROWTYPE;
  v_passed   BOOLEAN;
  v_clearwin BOOLEAN;
  v_clearloss BOOLEAN;
  v_reward   INT := 0;
  v_tier     TEXT;
  v_win      INT;
  v_loss     INT;
  r          JSONB;
  PASS_THRESHOLD CONSTANT NUMERIC := 80;
  FAIL_THRESHOLD CONSTANT NUMERIC := 50;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_score_pct IS NULL OR p_score_pct < 0 OR p_score_pct > 100 THEN
    RAISE EXCEPTION 'invalid_score';
  END IF;

  SELECT * INTO v_lesson FROM lessons WHERE id = p_lesson_id;
  IF v_lesson.id IS NULL THEN
    RAISE EXCEPTION 'lesson_not_found';
  END IF;
  IF v_lesson.student_id <> v_caller THEN
    RAISE EXCEPTION 'lesson_not_owned';
  END IF;
  IF v_lesson.status = 'completed' THEN
    RAISE EXCEPTION 'lesson_already_completed';
  END IF;

  v_passed    := p_score_pct >= PASS_THRESHOLD;
  v_clearwin  := p_score_pct >= PASS_THRESHOLD;
  v_clearloss := p_score_pct <  FAIL_THRESHOLD;

  -- Log per-question responses (DEFINER bypasses RLS).
  IF p_responses IS NOT NULL AND jsonb_typeof(p_responses) = 'array' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(p_responses) LOOP
      INSERT INTO workout_responses
        (lesson_id, user_id, question_index, difficulty, is_correct, response_time_ms)
      VALUES (
        p_lesson_id,
        v_caller,
        NULLIF(r->>'question_index','')::INT,
        NULLIF(r->>'difficulty',''),
        NULLIF(r->>'is_correct','')::BOOLEAN,
        NULLIF(r->>'response_time_ms','')::INT
      );
    END LOOP;
  END IF;

  -- Tier-based star payout (capped; ignores client star_reward).
  IF v_passed THEN
    v_reward := CASE v_lesson.tier
                  WHEN 'below' THEN 5
                  WHEN 'at'    THEN 10
                  WHEN 'above' THEN 15
                  ELSE 5 END;

    -- One 'earned' transaction per lesson (idempotent).
    IF NOT EXISTS (
      SELECT 1 FROM star_transactions
       WHERE type = 'earned' AND item_id = p_lesson_id
    ) THEN
      INSERT INTO star_transactions (user_id, amount, type, item_id)
      VALUES (v_caller, v_reward, 'earned', p_lesson_id);
    ELSE
      v_reward := 0;  -- already rewarded on a prior pass
    END IF;
  END IF;

  -- Update the lesson row.
  UPDATE lessons
     SET status        = CASE WHEN v_passed THEN 'completed' ELSE 'failed' END,
         score_pct     = p_score_pct,
         attempts      = attempts + 1,
         stars_awarded = stars_awarded + v_reward,
         completed_at  = CASE WHEN v_passed THEN NOW() ELSE completed_at END
   WHERE id = p_lesson_id;

  -- Move the skill tier. Streaks live per (student, goal, subject).
  SELECT tier, win_streak, loss_streak
    INTO v_tier, v_win, v_loss
    FROM student_skill_tiers
   WHERE student_id = v_caller
     AND subject = v_lesson.subject
     AND goal_id IS NOT DISTINCT FROM v_lesson.goal_id;

  IF v_tier IS NULL THEN
    v_tier := v_lesson.tier; v_win := 0; v_loss := 0;
  END IF;

  IF v_clearwin THEN
    v_win := v_win + 1; v_loss := 0;
    IF v_win >= 2 AND v_tier <> 'above' THEN
      v_tier := CASE v_tier WHEN 'below' THEN 'at' ELSE 'above' END;
      v_win := 0;
    END IF;
  ELSIF v_clearloss THEN
    v_loss := v_loss + 1; v_win := 0;
    IF v_loss >= 2 AND v_tier <> 'below' THEN
      v_tier := CASE v_tier WHEN 'above' THEN 'at' ELSE 'below' END;
      v_loss := 0;
    END IF;
  ELSE
    -- 50–79%: neutral, reset both streaks, no tier movement.
    v_win := 0; v_loss := 0;
  END IF;

  INSERT INTO student_skill_tiers (student_id, goal_id, subject, tier, win_streak, loss_streak, updated_at)
  VALUES (v_caller, v_lesson.goal_id, v_lesson.subject, v_tier, v_win, v_loss, NOW())
  ON CONFLICT DO NOTHING;

  UPDATE student_skill_tiers
     SET tier = v_tier, win_streak = v_win, loss_streak = v_loss, updated_at = NOW()
   WHERE student_id = v_caller
     AND subject = v_lesson.subject
     AND goal_id IS NOT DISTINCT FROM v_lesson.goal_id;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_passed THEN 'completed' ELSE 'failed' END,
    'stars_awarded', v_reward,
    'tier', v_tier
  );
END;
$$;

REVOKE ALL ON FUNCTION complete_lesson(UUID, NUMERIC, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_lesson(UUID, NUMERIC, JSONB) TO authenticated;
