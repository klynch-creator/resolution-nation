-- 034: Teacher-initiated parent invites (RN-41).
--
-- Until now only students could mint parent-link codes (002/017/030 flow).
-- Teachers frequently drive family engagement — especially in K-2, where a
-- 5-year-old relaying a 6-char code home is unreliable. This migration lets
-- the teacher who owns a student's class pod mint the code directly (e.g. to
-- print for backpack folders or read out at conferences).
--
-- Consent posture: when a TEACHER minted the code, redemption creates the
-- parent-student link as APPROVED immediately — the teacher initiating the
-- invite IS the school-side approval that the pending step exists to capture
-- (school-track COPPA consent, decision 2026-07-06). Student-minted codes
-- keep the existing pending → teacher-approval flow.

-- 1. Track who minted each code. NULL = student self-minted (legacy + default).
ALTER TABLE parent_link_codes
  ADD COLUMN IF NOT EXISTS minted_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. Teachers may see codes for students in their class pods (lets the
--    dashboard show whether an unexpired code is outstanding).
DROP POLICY IF EXISTS "parent_link_codes_select_teacher" ON parent_link_codes;
CREATE POLICY "parent_link_codes_select_teacher"
  ON parent_link_codes FOR SELECT
  USING (teacher_has_student_in_pod(student_id));

-- 3. Mint a code on behalf of a student in the caller's class pod.
CREATE OR REPLACE FUNCTION teacher_generate_parent_link_code(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- The student must be a member of a class pod created by the caller.
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

  -- One active code per student: invalidate previously unused codes
  -- (same behavior as the student-minted RPC).
  UPDATE parent_link_codes
     SET used_at = NOW()
   WHERE student_id = p_student_id
     AND used_at IS NULL;

  -- Same 6-char format as generate_parent_link_code (002).
  LOOP
    v_attempts := v_attempts + 1;
    v_code := upper(
      substr(translate(encode(gen_random_bytes(8), 'base64'),
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

REVOKE ALL ON FUNCTION teacher_generate_parent_link_code(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION teacher_generate_parent_link_code(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION teacher_generate_parent_link_code(UUID) TO authenticated;

-- 4. Redeem: teacher-minted codes skip the pending step. Everything else is
--    unchanged from 030 (student-minted + no teacher → auto-approve;
--    student-minted + teacher on record → pending).
CREATE OR REPLACE FUNCTION public.redeem_parent_link_code(p_code TEXT)
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
  v_minted_by_teacher BOOLEAN := FALSE;
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

  -- Was this code minted by a teacher? (Their invite = school approval.)
  IF v_record.minted_by IS NOT NULL THEN
    SELECT TRUE INTO v_minted_by_teacher
      FROM profiles
     WHERE id = v_record.minted_by AND role = 'teacher';
    v_minted_by_teacher := COALESCE(v_minted_by_teacher, FALSE);
  END IF;

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

  -- Approval routing: prefer the minting teacher, else the class-pod teacher.
  IF v_minted_by_teacher THEN
    v_teacher_id := v_record.minted_by;
  ELSE
    SELECT p.created_by INTO v_teacher_id
      FROM pod_members pm
      JOIN pods p ON p.id = pm.pod_id
     WHERE pm.user_id = v_student.id
       AND p.type = 'class'
     LIMIT 1;
  END IF;

  -- Teacher-minted → approved now. No teacher anywhere → approved (030).
  -- Student-minted with a teacher on record → pending teacher approval.
  INSERT INTO parent_student_links (parent_id, student_id, teacher_id, status)
  VALUES (
    v_caller,
    v_record.student_id,
    v_teacher_id,
    CASE
      WHEN v_minted_by_teacher THEN 'approved'
      WHEN v_teacher_id IS NULL THEN 'approved'
      ELSE 'pending'
    END
  )
  ON CONFLICT (parent_id, student_id) DO UPDATE
    SET status = CASE
          WHEN parent_student_links.status = 'approved' THEN 'approved'
          WHEN EXCLUDED.status = 'approved' THEN 'approved'
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
