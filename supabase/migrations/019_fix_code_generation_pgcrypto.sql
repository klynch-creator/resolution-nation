-- Fix generate_parent_link_code (June 2026).
--
-- The function (002) calls gen_random_bytes() from pgcrypto, but the
-- extension was never enabled in this project — every call failed with
-- "function gen_random_bytes(integer) does not exist", breaking the
-- student "Invite a Parent" flow.
--
-- Fix: enable pgcrypto in the extensions schema and add it to the
-- function's search_path.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION generate_parent_link_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_code TEXT;
  v_attempts INT := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'only_students_can_generate_codes';
  END IF;

  -- Invalidate previously unused codes for this student.
  UPDATE parent_link_codes
     SET used_at = NOW()
   WHERE student_id = v_caller
     AND used_at IS NULL;

  -- Generate a unique 6-char code (retry a few times on collision).
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
      INSERT INTO parent_link_codes (student_id, code)
      VALUES (v_caller, v_code);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempts > 10 THEN
        RAISE EXCEPTION 'code_generation_failed';
      END IF;
    END;
  END LOOP;

  RETURN v_code;
END;
$$;
