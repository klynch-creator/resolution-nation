-- ============================================================
-- Phase 13 fix: teachers see fluency data for their CLASSROOM students,
-- not only students they happen to have set a goal for.
--
-- The teacher<->student relationship in this app is via classroom pods
-- (pods.type='class', created_by = teacher; pod_members.role='member'). The
-- original fluency teacher_read policies only checked `goals`, so a classroom
-- student with no goal was invisible to the teacher.
--
-- We use a SECURITY DEFINER helper so the policy's lookup into pod_members /
-- pods / goals bypasses those tables' own RLS (avoids recursion and keeps the
-- policy simple). It returns true when the caller is the student's classroom
-- teacher OR has set a goal for them.
-- ============================================================

CREATE OR REPLACE FUNCTION is_classroom_teacher_of(p_student UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM pod_members pm
      JOIN pods po ON po.id = pm.pod_id
     WHERE pm.user_id = p_student
       AND pm.role = 'member'
       AND po.type = 'class'
       AND po.created_by = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM goals g
     WHERE g.student_id = p_student
       AND g.teacher_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION is_classroom_teacher_of(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_classroom_teacher_of(UUID) TO authenticated;

-- Replace the goals-only teacher read policies with pod-aware ones.
DROP POLICY IF EXISTS "fluency_assessments_teacher_read" ON fluency_assessments;
CREATE POLICY "fluency_assessments_teacher_read" ON fluency_assessments
  FOR SELECT USING (is_classroom_teacher_of(student_id));

DROP POLICY IF EXISTS "fluency_attempts_teacher_read" ON fluency_attempts;
CREATE POLICY "fluency_attempts_teacher_read" ON fluency_attempts
  FOR SELECT USING (is_classroom_teacher_of(student_id));
