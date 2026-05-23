-- Fix infinite recursion: pods_select_member ↔ pod_members_select_teacher cycle.
--
-- The cycle: evaluating pod_members RLS runs pod_members_select_teacher which
-- queries pods; evaluating pods RLS runs pods_select_member which queries
-- pod_members → infinite recursion.
--
-- Fix: wrap the pods membership check in a SECURITY DEFINER function so that
-- the inner pod_members query runs without RLS, breaking the cycle.

CREATE OR REPLACE FUNCTION is_pod_member(pod_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_members
    WHERE pod_id = pod_uuid AND user_id = auth.uid()
  );
$$;

-- Recreate pods_select_member using the safe function
DROP POLICY IF EXISTS "pods_select_member" ON pods;
CREATE POLICY "pods_select_member" ON pods FOR SELECT
  USING (is_pod_member(id));

-- Also fix stars_select_teacher (added in migration 011) which similarly
-- joins pod_members + pods and triggers the same cycle for non-teacher users.

CREATE OR REPLACE FUNCTION teacher_has_student_in_pod(student_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_members pm
    JOIN pods p ON p.id = pm.pod_id
    WHERE pm.user_id = student_uuid
      AND p.created_by = auth.uid()
      AND p.type = 'class'
  );
$$;

DROP POLICY IF EXISTS "stars_select_teacher" ON star_transactions;
CREATE POLICY "stars_select_teacher" ON star_transactions FOR SELECT
  USING (teacher_has_student_in_pod(user_id));
