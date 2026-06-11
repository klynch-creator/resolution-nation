-- Fix the classroom join flow (June 2026).
--
-- /join looked up pods by invite_code with the student's own client, but no
-- SELECT policy allows a non-member to see a pod — so the lookup always
-- returned 0 rows and students could never join a classroom.
--
-- Fix: SECURITY DEFINER RPC that validates the code and joins atomically,
-- without exposing pod rows to non-members.

CREATE OR REPLACE FUNCTION join_pod_by_invite_code(p_code TEXT)
RETURNS TABLE (pod_id UUID, pod_name TEXT, already_member BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_pod pods%ROWTYPE;
  v_existing BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Only students join classrooms via invite code.
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'only_students_can_join';
  END IF;

  SELECT * INTO v_pod
    FROM pods
   WHERE lower(invite_code) = lower(trim(p_code))
     AND type = 'class';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invite_code';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pod_members pm
     WHERE pm.pod_id = v_pod.id AND pm.user_id = v_caller
  ) INTO v_existing;

  IF NOT v_existing THEN
    INSERT INTO pod_members (pod_id, user_id, role)
    VALUES (v_pod.id, v_caller, 'member');
  END IF;

  RETURN QUERY SELECT v_pod.id, v_pod.name, v_existing;
END;
$$;

REVOKE ALL ON FUNCTION join_pod_by_invite_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION join_pod_by_invite_code(TEXT) TO authenticated;
