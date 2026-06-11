-- Wire the invite-code flow into parent_student_links (June 2026).
--
-- redeem_parent_link_code (002) only added the parent to the child's family
-- pod, but the parent dashboard and all parent-facing RLS policies key off
-- parent_student_links with status='approved'. Result: a parent who redeemed
-- a code saw an empty dashboard.
--
-- Decision (2026-06-11): code redemption creates a PENDING link that the
-- student's teacher approves in the teacher dashboard — keeps the school in
-- the COPPA/FERPA consent loop. Approval continues to flow through the
-- existing /api/approve-parent-link route.

CREATE OR REPLACE FUNCTION redeem_parent_link_code(
  p_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_record parent_link_codes%ROWTYPE;
  v_student profiles%ROWTYPE;
  v_pod_id UUID;
  v_teacher_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller AND role = 'parent'
  ) THEN
    RAISE EXCEPTION 'only_parents_can_redeem';
  END IF;

  SELECT * INTO v_record
    FROM parent_link_codes
   WHERE code = upper(p_code)
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  IF v_record.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'code_already_used';
  END IF;

  IF v_record.expires_at < NOW() THEN
    RAISE EXCEPTION 'code_expired';
  END IF;

  SELECT * INTO v_student FROM profiles WHERE id = v_record.student_id;

  -- Find or create the student's family pod.
  SELECT pm.pod_id INTO v_pod_id
    FROM pod_members pm
    JOIN pods p ON p.id = pm.pod_id
   WHERE pm.user_id = v_student.id
     AND p.type = 'family'
   LIMIT 1;

  IF v_pod_id IS NULL THEN
    INSERT INTO pods (name, type, created_by)
    VALUES (v_student.full_name || '''s Family', 'family', v_caller)
    RETURNING id INTO v_pod_id;

    INSERT INTO pod_members (pod_id, user_id, role)
    VALUES (v_pod_id, v_student.id, 'member');
  END IF;

  -- Add the parent as viewer if not already present.
  INSERT INTO pod_members (pod_id, user_id, role)
  VALUES (v_pod_id, v_caller, 'viewer')
  ON CONFLICT (pod_id, user_id) DO NOTHING;

  -- Resolve the student's teacher from their class pod (for approval routing).
  SELECT p.created_by INTO v_teacher_id
    FROM pod_members pm
    JOIN pods p ON p.id = pm.pod_id
   WHERE pm.user_id = v_student.id
     AND p.type = 'class'
   LIMIT 1;

  -- Create (or revive) the parent-student link as PENDING teacher approval.
  -- The parent dashboard unlocks when the teacher approves.
  INSERT INTO parent_student_links (parent_id, student_id, teacher_id, status)
  VALUES (v_caller, v_record.student_id, v_teacher_id, 'pending')
  ON CONFLICT (parent_id, student_id) DO UPDATE
    SET status = CASE
          WHEN parent_student_links.status = 'approved' THEN 'approved'
          ELSE 'pending'
        END,
        teacher_id = COALESCE(parent_student_links.teacher_id, EXCLUDED.teacher_id),
        updated_at = NOW();

  UPDATE parent_link_codes
     SET used_at = NOW(), used_by = v_caller
   WHERE id = v_record.id;

  RETURN v_pod_id;
END;
$$;
