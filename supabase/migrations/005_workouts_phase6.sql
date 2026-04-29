-- ============================================================
-- Resolution Nation — Phase 6 Workout RLS
-- Run in Supabase SQL Editor after 004_roadmaps_phase5.sql
-- ============================================================

-- ─────────────────────────────────────────────
-- WORKOUT RESPONSES
-- Replace stub policies from 001_initial.sql
-- ─────────────────────────────────────────────

DROP POLICY IF EXISTS "responses_select_own"    ON workout_responses;
DROP POLICY IF EXISTS "responses_select_teacher" ON workout_responses;
DROP POLICY IF EXISTS "responses_insert_own"    ON workout_responses;

ALTER TABLE workout_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workout_responses_student_insert" ON workout_responses
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "workout_responses_student_read" ON workout_responses
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "workout_responses_teacher_read" ON workout_responses
  FOR SELECT USING (
    step_id IN (
      SELECT rs.id FROM roadmap_steps rs
      JOIN learning_roadmaps lr ON rs.roadmap_id = lr.id
      WHERE lr.teacher_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- STAR TRANSACTIONS
-- Replace stub policies from 001_initial.sql
-- ─────────────────────────────────────────────

DROP POLICY IF EXISTS "stars_select_own"   ON star_transactions;
DROP POLICY IF EXISTS "stars_insert_system" ON star_transactions;

ALTER TABLE star_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "star_transactions_student_read" ON star_transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "star_transactions_insert" ON star_transactions
  FOR INSERT WITH CHECK (user_id = auth.uid() OR recipient_id = auth.uid());

-- ─────────────────────────────────────────────
-- ROADMAP STEPS — student update (complete step / unlock next)
-- 004 only allows teacher ALL and student SELECT.
-- Students need UPDATE to mark steps completed and unlock next.
-- ─────────────────────────────────────────────

CREATE POLICY "steps_student_complete" ON roadmap_steps
  FOR UPDATE
  USING (
    roadmap_id IN (
      SELECT id FROM learning_roadmaps WHERE student_id = auth.uid()
    )
  )
  WITH CHECK (
    roadmap_id IN (
      SELECT id FROM learning_roadmaps WHERE student_id = auth.uid()
    )
  );
