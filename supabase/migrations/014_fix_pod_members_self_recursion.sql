-- Fix all RLS infinite recursion issues.
--
-- ROOT CAUSE: pod_members_select_same_pod (added in migration 006) contains
-- a subquery that reads pod_members from within pod_members' own RLS policy,
-- causing immediate self-recursion for any direct pod_members query.
--
-- This cascades to break every table whose policies read pod_members with RLS:
-- profiles, goals, star_transactions, etc.
--
-- FIX STRATEGY: Replace every policy that accesses pod_members (or pods) inside
-- a non-SECURITY DEFINER context with a SECURITY DEFINER helper function that
-- runs those joins without RLS, breaking every cycle.

-- ── 1. Root cause: pod_members self-reference ─────────────────────────────────

-- Replace the direct self-referencing subquery with is_pod_member() which
-- queries pod_members WITHOUT RLS (SECURITY DEFINER from migration 012).
DROP POLICY IF EXISTS "pod_members_select_same_pod" ON pod_members;
CREATE POLICY "pod_members_select_same_pod" ON pod_members FOR SELECT
  USING (is_pod_member(pod_id));

-- ── 2. pod_members_select_teacher → pods → is_pod_member cycle ───────────────

-- Even with fix 1, pod_members_select_teacher queries pods directly (with RLS),
-- which triggers pods_select_member → is_pod_member() → pod_members without RLS.
-- Wrap the pods check in its own SECURITY DEFINER function to be safe.
CREATE OR REPLACE FUNCTION is_teacher_pod(pod_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pods WHERE id = pod_uuid AND created_by = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "pod_members_select_teacher" ON pod_members;
CREATE POLICY "pod_members_select_teacher" ON pod_members FOR SELECT
  USING (is_teacher_pod(pod_id));

-- ── 3. profiles policies (also in migration 013 — idempotent here) ────────────

CREATE OR REPLACE FUNCTION teacher_can_view_profile(student_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_members pm
    JOIN pods p ON p.id = pm.pod_id
    WHERE pm.user_id = student_uuid
      AND p.created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION parent_can_view_profile(child_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_members pm_child
    JOIN pod_members pm_parent ON pm_parent.pod_id = pm_child.pod_id
    WHERE pm_child.user_id = child_uuid
      AND pm_parent.user_id = auth.uid()
      AND pm_parent.role = 'viewer'
  );
$$;

DROP POLICY IF EXISTS "profiles_select_pod_members" ON profiles;
CREATE POLICY "profiles_select_pod_members" ON profiles FOR SELECT
  USING (teacher_can_view_profile(id));

DROP POLICY IF EXISTS "profiles_select_children" ON profiles;
CREATE POLICY "profiles_select_children" ON profiles FOR SELECT
  USING (parent_can_view_profile(id));

-- Fix profiles_select_podmates (migration 006) — direct pod_members self-join.
CREATE OR REPLACE FUNCTION is_podmate(other_user_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_members pm1
    JOIN pod_members pm2 ON pm1.pod_id = pm2.pod_id
    WHERE pm1.user_id = auth.uid()
      AND pm2.user_id = other_user_uuid
      AND pm2.user_id != auth.uid()
  );
$$;

DROP POLICY IF EXISTS "profiles_select_podmates" ON profiles;
CREATE POLICY "profiles_select_podmates" ON profiles FOR SELECT
  USING (is_podmate(id));

-- ── 4. goals_select_parent — pod_members self-join ────────────────────────────

CREATE OR REPLACE FUNCTION parent_can_view_goal(goal_student_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_members pm_child
    JOIN pod_members pm_parent ON pm_parent.pod_id = pm_child.pod_id
    WHERE pm_child.user_id = goal_student_id
      AND pm_parent.user_id = auth.uid()
      AND pm_parent.role = 'viewer'
  );
$$;

DROP POLICY IF EXISTS "goals_select_parent" ON goals;
CREATE POLICY "goals_select_parent" ON goals FOR SELECT
  USING (parent_can_view_goal(student_id));

-- ── 5. star_transactions_teacher_read (migration 007) ────────────────────────

CREATE OR REPLACE FUNCTION teacher_can_view_student_stars(student_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_members pm
    JOIN pods p ON pm.pod_id = p.id
    WHERE pm.user_id = student_uuid
      AND p.created_by = auth.uid()
      AND pm.role != 'admin'
  );
$$;

DROP POLICY IF EXISTS "star_transactions_teacher_read" ON star_transactions;
CREATE POLICY "star_transactions_teacher_read" ON star_transactions FOR SELECT
  USING (teacher_can_view_student_stars(user_id));

-- ── 6. Re-apply migration 012 fixes (idempotent) ──────────────────────────────

CREATE OR REPLACE FUNCTION is_pod_member(pod_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pod_members WHERE pod_id = pod_uuid AND user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "pods_select_member" ON pods;
CREATE POLICY "pods_select_member" ON pods FOR SELECT
  USING (is_pod_member(id));

CREATE OR REPLACE FUNCTION teacher_has_student_in_pod(student_uuid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
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
