-- Fix infinite recursion triggered when querying profiles.
--
-- Root cause: profiles_select_pod_members and profiles_select_children both
-- query pod_members directly. Evaluating pod_members RLS triggers
-- pod_members_select_teacher which queries pods, and pods_select_member
-- (even with the is_pod_member fix) can still re-enter pod_members evaluation
-- under certain query plans, causing the recursion error observed in prod.
--
-- Fix: wrap every cross-table lookup in SECURITY DEFINER functions that run
-- without RLS, breaking every possible cycle.

-- ── 1. SECURITY DEFINER helpers ──────────────────────────────────────────────

-- Returns true if the caller (auth.uid()) is a teacher for the given student
-- (i.e. the student is in a class pod created by auth.uid()).
CREATE OR REPLACE FUNCTION teacher_can_view_profile(student_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pod_members pm
    JOIN pods p ON p.id = pm.pod_id
    WHERE pm.user_id = student_uuid
      AND p.created_by = auth.uid()
  );
$$;

-- Returns true if auth.uid() is a parent/viewer who shares a pod with the
-- given child (the child is a member; auth.uid() has the 'viewer' role).
CREATE OR REPLACE FUNCTION parent_can_view_profile(child_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pod_members pm_child
    JOIN pod_members pm_parent
      ON pm_parent.pod_id = pm_child.pod_id
    WHERE pm_child.user_id = child_uuid
      AND pm_parent.user_id = auth.uid()
      AND pm_parent.role = 'viewer'
  );
$$;

-- ── 2. Recreate the problematic policies using the safe helpers ───────────────

DROP POLICY IF EXISTS "profiles_select_pod_members" ON profiles;
CREATE POLICY "profiles_select_pod_members" ON profiles FOR SELECT
  USING (teacher_can_view_profile(id));

DROP POLICY IF EXISTS "profiles_select_children" ON profiles;
CREATE POLICY "profiles_select_children" ON profiles FOR SELECT
  USING (parent_can_view_profile(id));

-- ── 3. Re-apply the pods_select_member fix in case migration 012 didn't land ─

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

DROP POLICY IF EXISTS "pods_select_member" ON pods;
CREATE POLICY "pods_select_member" ON pods FOR SELECT
  USING (is_pod_member(id));

-- ── 4. Re-apply the stars_select_teacher fix in case migration 012 didn't land

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
