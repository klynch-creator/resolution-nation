-- 032: Rotating class invite codes (RN-40).
--
-- A leaked class code currently works forever. This adds a SECURITY DEFINER
-- RPC that lets the teacher who owns a pod regenerate its invite code; the
-- old code stops working immediately (join_pod_by_invite_code looks the code
-- up live, so no other change is needed).

CREATE OR REPLACE FUNCTION rotate_pod_invite_code(p_pod_id UUID)
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

  -- Only the teacher who created the pod may rotate its code.
  IF NOT EXISTS (
    SELECT 1
      FROM pods p
      JOIN profiles pr ON pr.id = v_caller
     WHERE p.id = p_pod_id
       AND p.created_by = v_caller
       AND pr.role = 'teacher'
  ) THEN
    RAISE EXCEPTION 'not_pod_owner';
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    -- Same 8-char format as the pods.invite_code default, but sourced from
    -- pgcrypto rather than md5(random()) for better entropy.
    v_code := substring(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8);

    BEGIN
      UPDATE pods SET invite_code = v_code WHERE id = p_pod_id;
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempts >= 5 THEN
        RAISE EXCEPTION 'code_generation_failed';
      END IF;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION rotate_pod_invite_code(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION rotate_pod_invite_code(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION rotate_pod_invite_code(UUID) TO authenticated;
