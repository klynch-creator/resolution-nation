-- ============================================================
-- Resolution Nation — Phase 5 Roadmap RLS
-- Run this in the Supabase SQL Editor.
-- Replaces the stub policies from 001_initial.sql with
-- comprehensive policies that cover all CRUD operations.
-- ============================================================

-- Drop existing stub policies for learning_roadmaps
DROP POLICY IF EXISTS "roadmaps_select_student"  ON learning_roadmaps;
DROP POLICY IF EXISTS "roadmaps_select_teacher"  ON learning_roadmaps;
DROP POLICY IF EXISTS "roadmaps_insert_teacher"  ON learning_roadmaps;
DROP POLICY IF EXISTS "roadmaps_update_teacher"  ON learning_roadmaps;

-- Drop existing stub policies for roadmap_steps
DROP POLICY IF EXISTS "steps_select_via_roadmap" ON roadmap_steps;
DROP POLICY IF EXISTS "steps_insert_teacher"     ON roadmap_steps;
DROP POLICY IF EXISTS "steps_update_teacher"     ON roadmap_steps;

-- ─────────────────────────────────────────────
-- LEARNING ROADMAPS
-- ─────────────────────────────────────────────

ALTER TABLE learning_roadmaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roadmaps_teacher_all" ON learning_roadmaps
  FOR ALL USING (teacher_id = auth.uid());

CREATE POLICY "roadmaps_student_read" ON learning_roadmaps
  FOR SELECT USING (student_id = auth.uid());

-- ─────────────────────────────────────────────
-- ROADMAP STEPS
-- ─────────────────────────────────────────────

ALTER TABLE roadmap_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "steps_teacher_all" ON roadmap_steps
  FOR ALL USING (
    roadmap_id IN (SELECT id FROM learning_roadmaps WHERE teacher_id = auth.uid())
  );

CREATE POLICY "steps_student_read" ON roadmap_steps
  FOR SELECT USING (
    roadmap_id IN (SELECT id FROM learning_roadmaps WHERE student_id = auth.uid())
  );
