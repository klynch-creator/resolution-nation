-- 034b: teacher_generate_parent_link_code failed at runtime with
-- "function gen_random_bytes(integer) does not exist" — pgcrypto lives in
-- the `extensions` schema and 034 set search_path = public only.
-- Same class of bug migration 019 fixed for generate_parent_link_code.
-- Fix: include `extensions` in the function's search_path.

CREATE OR REPLACE FUNCTION teacher_generate_parent_link_code(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_code TEXT;
  v_expires TIMESTAMPTZ;
  v_attempts INT := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller AND role = 'teacher'
  ) THEN
    RAISE EXCEPTION 'only_teachers_can_generate';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pod_members pm
      JOIN pods p ON p.id = pm.pod_id
     WHERE pm.user_id = p_student_id
       AND p.created_by = v_caller
       AND p.type = 'class'
  ) THEN
    RAISE EXCEPTION 'student_not_in_your_class';
  END IF;

  UPDATE parent_link_codes
     SET used_at = NOW()
   WHERE student_id = p_student_id
     AND used_at IS NULL;

  LOOP
    v_attempts := v_attempts + 1;
    v_code := upper(
      substr(translate(encode(extensions.gen_random_bytes(8), 'base64'),
                       '+/=OIl01', ''),
             1, 6)
    );

    IF length(v_code) < 6 THEN
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO parent_link_codes (student_id, code, minted_by)
      VALUES (p_student_id, v_code, v_caller)
      RETURNING expires_at INTO v_expires;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempts > 10 THEN
        RAISE EXCEPTION 'code_generation_failed';
      END IF;
    END;
  END LOOP;

  INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (v_caller, 'teacher_parent_invite_minted', 'profile', p_student_id,
          jsonb_build_object('expires_at', v_expires));

  RETURN jsonb_build_object('code', v_code, 'expires_at', v_expires);
END;
$$;
