-- Fix: redeem_parent_link_code left the link 'pending' forever when the
-- student has no class pod (no teacher exists to approve). Since the code can
-- only come from the child's own signed-in account, auto-approve in that case.
-- When a teacher IS linked, their approval is still required (COPPA/FERPA
-- school control).

create or replace function public.redeem_parent_link_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  INSERT INTO pod_members (pod_id, user_id, role)
  VALUES (v_pod_id, v_caller, 'viewer')
  ON CONFLICT (pod_id, user_id) DO NOTHING;

  SELECT p.created_by INTO v_teacher_id
    FROM pod_members pm
    JOIN pods p ON p.id = pm.pod_id
   WHERE pm.user_id = v_student.id
     AND p.type = 'class'
   LIMIT 1;

  -- No teacher on record → nobody exists to approve; auto-approve.
  -- Teacher on record → require their approval as before.
  INSERT INTO parent_student_links (parent_id, student_id, teacher_id, status)
  VALUES (
    v_caller,
    v_record.student_id,
    v_teacher_id,
    CASE WHEN v_teacher_id IS NULL THEN 'approved' ELSE 'pending' END
  )
  ON CONFLICT (parent_id, student_id) DO UPDATE
    SET status = CASE
          WHEN parent_student_links.status = 'approved' THEN 'approved'
          WHEN EXCLUDED.teacher_id IS NULL
            AND parent_student_links.teacher_id IS NULL THEN 'approved'
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
