-- ============================================================
-- Resolution Nation — Phase 11 Parent Dashboard
-- Run in Supabase SQL Editor AFTER 008_iep_phase10.sql
-- ============================================================

-- ─────────────────────────────────────────────
-- IEP_GOALS — add shared_with_parent column
-- ─────────────────────────────────────────────

ALTER TABLE iep_goals ADD COLUMN IF NOT EXISTS shared_with_parent BOOLEAN DEFAULT false;

-- ─────────────────────────────────────────────
-- PARENT_STUDENT_LINKS
-- ─────────────────────────────────────────────

CREATE TABLE parent_student_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parent_id, student_id)
);

ALTER TABLE parent_student_links ENABLE ROW LEVEL SECURITY;

-- Parent can insert and read own link requests
CREATE POLICY "psl_parent_insert" ON parent_student_links
  FOR INSERT WITH CHECK (parent_id = auth.uid());

CREATE POLICY "psl_parent_select" ON parent_student_links
  FOR SELECT USING (parent_id = auth.uid());

-- Teacher can select and update links where teacher_id matches
CREATE POLICY "psl_teacher_select" ON parent_student_links
  FOR SELECT USING (teacher_id = auth.uid());

CREATE POLICY "psl_teacher_update" ON parent_student_links
  FOR UPDATE USING (teacher_id = auth.uid());

-- Student can read links that reference them
CREATE POLICY "psl_student_select" ON parent_student_links
  FOR SELECT USING (student_id = auth.uid());

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_parent_student_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER parent_student_links_updated_at
  BEFORE UPDATE ON parent_student_links
  FOR EACH ROW EXECUTE FUNCTION update_parent_student_links_updated_at();

-- ─────────────────────────────────────────────
-- PARENT_MESSAGES
-- ─────────────────────────────────────────────

CREATE TABLE parent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body_english TEXT NOT NULL,
  body_spanish TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE parent_messages ENABLE ROW LEVEL SECURITY;

-- Teacher can insert and read own messages
CREATE POLICY "pm_teacher_insert" ON parent_messages
  FOR INSERT WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "pm_teacher_select" ON parent_messages
  FOR SELECT USING (teacher_id = auth.uid());

-- Parent can read messages sent to them
CREATE POLICY "pm_parent_select" ON parent_messages
  FOR SELECT USING (parent_id = auth.uid());

-- Parent can mark messages as read (UPDATE read_at)
CREATE POLICY "pm_parent_update" ON parent_messages
  FOR UPDATE USING (parent_id = auth.uid());

-- ─────────────────────────────────────────────
-- IEP_GOALS — parent read policy for shared goals
-- ─────────────────────────────────────────────

CREATE POLICY "iep_parent_read" ON iep_goals
  FOR SELECT USING (
    shared_with_parent = true
    AND EXISTS (
      SELECT 1 FROM parent_student_links psl
      WHERE psl.parent_id = auth.uid()
        AND psl.student_id = iep_goals.student_id
        AND psl.status = 'approved'
    )
  );

-- ─────────────────────────────────────────────
-- PROFILES — parent can read approved child's profile via link
-- ─────────────────────────────────────────────

CREATE POLICY "profiles_select_approved_child" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_student_links psl
      WHERE psl.parent_id = auth.uid()
        AND psl.student_id = profiles.id
        AND psl.status = 'approved'
    )
  );

-- ─────────────────────────────────────────────
-- GOALS — parent can read approved child's goals via link
-- ─────────────────────────────────────────────

CREATE POLICY "goals_select_parent_link" ON goals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_student_links psl
      WHERE psl.parent_id = auth.uid()
        AND psl.student_id = goals.student_id
        AND psl.status = 'approved'
    )
  );

-- ─────────────────────────────────────────────
-- LEARNING_ROADMAPS — parent read via approved link
-- ─────────────────────────────────────────────

CREATE POLICY "roadmaps_select_parent_link" ON learning_roadmaps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_student_links psl
      WHERE psl.parent_id = auth.uid()
        AND psl.student_id = learning_roadmaps.student_id
        AND psl.status = 'approved'
    )
  );

-- ─────────────────────────────────────────────
-- ROADMAP_STEPS — parent read via approved link (through roadmap)
-- ─────────────────────────────────────────────

CREATE POLICY "steps_select_parent_link" ON roadmap_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM learning_roadmaps lr
      JOIN parent_student_links psl ON psl.student_id = lr.student_id
      WHERE lr.id = roadmap_steps.roadmap_id
        AND psl.parent_id = auth.uid()
        AND psl.status = 'approved'
    )
  );

-- ─────────────────────────────────────────────
-- WORKOUT_RESPONSES — parent read via approved link
-- ─────────────────────────────────────────────

CREATE POLICY "responses_select_parent_link" ON workout_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_student_links psl
      WHERE psl.parent_id = auth.uid()
        AND psl.student_id = workout_responses.user_id
        AND psl.status = 'approved'
    )
  );

-- ─────────────────────────────────────────────
-- STAR_TRANSACTIONS — parent read via approved link
-- ─────────────────────────────────────────────

CREATE POLICY "stars_select_parent_link" ON star_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_student_links psl
      WHERE psl.parent_id = auth.uid()
        AND psl.student_id = star_transactions.user_id
        AND psl.status = 'approved'
    )
  );
