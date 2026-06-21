-- ============================================================
-- Resolution Nation — Phase 12E: Roadmap subgoals + teacher-only assessments
--   - roadmap_subgoals    : grouping layer between a goal and its steps
--   - roadmap_steps.subgoal_id : link steps to a subgoal (nullable, back-compat)
--   - roadmap_assessments : teacher-only curriculum-aligned checkpoints
--                            (NO student/parent policy => invisible to them)
-- ============================================================

CREATE TABLE IF NOT EXISTS roadmap_subgoals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id  UUID NOT NULL REFERENCES learning_roadmaps(id) ON DELETE CASCADE,
  sort_order  INT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  target_skill TEXT,
  standard_alignment TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subgoals_roadmap ON roadmap_subgoals (roadmap_id, sort_order);

ALTER TABLE roadmap_steps
  ADD COLUMN IF NOT EXISTS subgoal_id UUID REFERENCES roadmap_subgoals(id) ON DELETE SET NULL;

ALTER TABLE roadmap_subgoals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subgoals_teacher_all" ON roadmap_subgoals
  FOR ALL USING (
    roadmap_id IN (SELECT id FROM learning_roadmaps WHERE teacher_id = auth.uid())
  );

CREATE POLICY "subgoals_student_read" ON roadmap_subgoals
  FOR SELECT USING (
    roadmap_id IN (SELECT id FROM learning_roadmaps WHERE student_id = auth.uid())
  );

CREATE POLICY "subgoals_parent_read" ON roadmap_subgoals
  FOR SELECT USING (
    roadmap_id IN (
      SELECT lr.id FROM learning_roadmaps lr
      JOIN parent_student_links psl ON psl.student_id = lr.student_id
      WHERE psl.parent_id = auth.uid() AND psl.status = 'approved'
    )
  );

-- ── Teacher-only assessment checkpoints ────────────────────────────────────
CREATE TABLE IF NOT EXISTS roadmap_assessments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id    UUID NOT NULL REFERENCES learning_roadmaps(id) ON DELETE CASCADE,
  subgoal_id    UUID REFERENCES roadmap_subgoals(id) ON DELETE SET NULL,
  curriculum_id UUID REFERENCES curricula(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  curriculum_unit TEXT,
  standard_alignment TEXT,
  teacher_notes TEXT,
  progress_signal JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assessments_roadmap ON roadmap_assessments (roadmap_id);

ALTER TABLE roadmap_assessments ENABLE ROW LEVEL SECURITY;

-- Teacher-only. No student/parent policy at all => invisible by default.
CREATE POLICY "assessments_teacher_all" ON roadmap_assessments
  FOR ALL USING (
    roadmap_id IN (SELECT id FROM learning_roadmaps WHERE teacher_id = auth.uid())
  );
