-- ============================================================
-- Resolution Nation — Phase 1 Security Hardening
-- Run after 001_initial.sql in the Supabase SQL Editor.
--
-- This migration closes three issues found during the May 2026
-- code audit:
--   1. star_transactions RLS allowed any authenticated user to
--      insert star_transactions for themselves, effectively
--      minting unlimited stars from the browser.
--   2. /api/parent/link enumerated all auth users to find a
--      child by email — a privacy and scaling hazard.
--      Replaced with an invite-code flow backed by a new table.
--   3. No audit log existed for sensitive reads/writes.
--      FERPA / NY Ed Law 2-d expect one.
--
-- Also adds tables to support:
--   - In-app account deletion (Apple 5.1.1(v), Google Play).
--   - Parent-child link via short rotating codes.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. STAR ECONOMY — close the self-mint exploit
-- ─────────────────────────────────────────────

-- The original policy "stars_insert_system" allowed clients to
-- insert any row where user_id = auth.uid(). Drop it.
DROP POLICY IF EXISTS "stars_insert_system" ON star_transactions;

-- Clients can still SELECT their own transactions (kept from 001),
-- but inserts must now go through the award_stars RPC below.
-- No INSERT policy on star_transactions for the anon/authenticated
-- roles means PostgREST will reject direct inserts. Only
-- SECURITY DEFINER functions running as the table owner can write.

-- Award stars for a roadmap step completion or bonus.
-- SECURITY DEFINER — the function runs with the table owner's
-- privileges. The function itself enforces who can award stars
-- and how many, replacing the trust we used to put in RLS.
CREATE OR REPLACE FUNCTION award_stars(
  p_user_id UUID,
  p_amount INT,
  p_type TEXT,
  p_item_id UUID DEFAULT NULL,
  p_step_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_txn_id UUID;
  v_step_owner UUID;
  v_step_status TEXT;
  v_step_reward INT;
BEGIN
  -- Basic guards
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  IF p_type NOT IN ('earned', 'bonus') THEN
    RAISE EXCEPTION 'invalid_type';
  END IF;

  -- 'earned' must be tied to a completed roadmap step that
  -- belongs to the recipient. The step's star_reward column is
  -- the source of truth; we never trust a client-supplied amount.
  IF p_type = 'earned' THEN
    IF p_step_id IS NULL THEN
      RAISE EXCEPTION 'earned_requires_step';
    END IF;

    SELECT lr.student_id, rs.status, rs.star_reward
      INTO v_step_owner, v_step_status, v_step_reward
      FROM roadmap_steps rs
      JOIN learning_roadmaps lr ON lr.id = rs.roadmap_id
     WHERE rs.id = p_step_id;

    IF v_step_owner IS NULL THEN
      RAISE EXCEPTION 'step_not_found';
    END IF;

    IF v_step_owner <> p_user_id THEN
      RAISE EXCEPTION 'step_not_owned_by_user';
    END IF;

    IF v_step_status <> 'completed' THEN
      RAISE EXCEPTION 'step_not_completed';
    END IF;

    IF p_amount > v_step_reward THEN
      RAISE EXCEPTION 'amount_exceeds_step_reward';
    END IF;

    -- One earned transaction per step.
    IF EXISTS (
      SELECT 1 FROM star_transactions
       WHERE type = 'earned' AND item_id = p_step_id::uuid
    ) THEN
      RAISE EXCEPTION 'step_already_rewarded';
    END IF;
  END IF;

  -- 'bonus' may only be granted by a teacher to a student in
  -- a pod the teacher created.
  IF p_type = 'bonus' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM profiles
       WHERE id = v_caller AND role = 'teacher'
    ) THEN
      RAISE EXCEPTION 'only_teachers_grant_bonus';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pod_members pm
        JOIN pods p ON p.id = pm.pod_id
       WHERE pm.user_id = p_user_id
         AND p.created_by = v_caller
    ) THEN
      RAISE EXCEPTION 'recipient_not_in_teacher_pod';
    END IF;
  END IF;

  INSERT INTO star_transactions (user_id, amount, type, item_id)
  VALUES (p_user_id, p_amount, p_type, COALESCE(p_step_id, p_item_id))
  RETURNING id INTO v_txn_id;

  RETURN v_txn_id;
END;
$$;

-- Allow authenticated users to invoke. Authorization is inside
-- the function body (caller checks above).
REVOKE ALL ON FUNCTION award_stars(UUID, INT, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION award_stars(UUID, INT, TEXT, UUID, UUID) TO authenticated;

-- Spend stars (purchase from the star store).
-- Enforces "user must have enough stars" atomically.
CREATE OR REPLACE FUNCTION spend_stars(
  p_item_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_cost INT;
  v_balance INT;
  v_txn_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT star_cost INTO v_cost
    FROM star_store_items
   WHERE id = p_item_id;

  IF v_cost IS NULL THEN
    RAISE EXCEPTION 'item_not_found';
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN type IN ('earned', 'bonus', 'gift_received') THEN amount
      WHEN type IN ('purchase', 'gift_sent') THEN -amount
      ELSE 0
    END
  ), 0)
    INTO v_balance
    FROM star_transactions
   WHERE user_id = v_caller;

  IF v_balance < v_cost THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  INSERT INTO star_transactions (user_id, amount, type, item_id)
  VALUES (v_caller, v_cost, 'purchase', p_item_id)
  RETURNING id INTO v_txn_id;

  INSERT INTO user_inventory (user_id, item_id)
  VALUES (v_caller, p_item_id);

  RETURN v_txn_id;
END;
$$;

REVOKE ALL ON FUNCTION spend_stars(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION spend_stars(UUID) TO authenticated;


-- ─────────────────────────────────────────────
-- 2. PARENT–CHILD LINK via INVITE CODE
-- (replaces auth.admin.listUsers() enumeration)
-- ─────────────────────────────────────────────

CREATE TABLE parent_link_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- 6-char alphanumeric, uppercase. Generated server-side.
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(code) = 6)
);

CREATE INDEX parent_link_codes_student_idx
  ON parent_link_codes (student_id, used_at);

ALTER TABLE parent_link_codes ENABLE ROW LEVEL SECURITY;

-- Students see only their own codes.
CREATE POLICY "parent_link_codes_select_own_student"
  ON parent_link_codes FOR SELECT
  USING (student_id = auth.uid());

-- Direct inserts are blocked; codes are minted by the
-- generate_parent_link_code RPC below.
-- (No INSERT policy = no inserts via PostgREST.)

-- Mint a one-time-use parent-link code on behalf of the student.
-- Caller must be the student themselves.
CREATE OR REPLACE FUNCTION generate_parent_link_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    -- Pad if random stripping made it short.
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

REVOKE ALL ON FUNCTION generate_parent_link_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_parent_link_code() TO authenticated;

-- Redeem a code: caller (parent) presents the code shared by the
-- student. Returns the family pod id on success. No user
-- enumeration possible — the code is the only identifier.
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

  UPDATE parent_link_codes
     SET used_at = NOW(), used_by = v_caller
   WHERE id = v_record.id;

  RETURN v_pod_id;
END;
$$;

REVOKE ALL ON FUNCTION redeem_parent_link_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_parent_link_code(TEXT) TO authenticated;


-- ─────────────────────────────────────────────
-- 3. AUDIT LOG
-- Required posture for NY Ed Law 2-d and most district DPAs.
-- ─────────────────────────────────────────────

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  ip INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_log_actor_idx ON audit_log (actor_id, created_at DESC);
CREATE INDEX audit_log_target_idx ON audit_log (target_type, target_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Audit log is write-only from client paths. Reads are restricted
-- to the user's own audit entries (parents will need the data
-- export endpoint to see audits of their child's record).
CREATE POLICY "audit_log_select_self"
  ON audit_log FOR SELECT
  USING (actor_id = auth.uid());

-- Helper for application code to write audit entries.
CREATE OR REPLACE FUNCTION write_audit(
  p_action TEXT,
  p_target_type TEXT,
  p_target_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_metadata);
END;
$$;

REVOKE ALL ON FUNCTION write_audit(TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION write_audit(TEXT, TEXT, UUID, JSONB) TO authenticated;


-- ─────────────────────────────────────────────
-- 4. ACCOUNT DELETION REQUESTS
-- Required by Apple App Store Review Guideline 5.1.1(v) and
-- Google Play User Data policy. Implemented as a soft-delete
-- queue: 30 days to recover, then a job hard-deletes.
-- ─────────────────────────────────────────────

CREATE TABLE account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  reason TEXT,
  UNIQUE (user_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX account_deletion_pending_idx
  ON account_deletion_requests (scheduled_for)
  WHERE completed_at IS NULL AND cancelled_at IS NULL;

ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deletion_requests_select_own"
  ON account_deletion_requests FOR SELECT
  USING (user_id = auth.uid());

-- Direct inserts/updates blocked; go through the RPCs below.

CREATE OR REPLACE FUNCTION request_account_deletion(
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_request_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO account_deletion_requests (user_id, reason)
  VALUES (v_caller, p_reason)
  ON CONFLICT (user_id)
  DO UPDATE SET
    requested_at = NOW(),
    scheduled_for = NOW() + INTERVAL '30 days',
    cancelled_at = NULL,
    reason = EXCLUDED.reason
  RETURNING id INTO v_request_id;

  PERFORM write_audit(
    'account_deletion_requested',
    'profiles',
    v_caller,
    jsonb_build_object('reason', p_reason)
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION request_account_deletion(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_account_deletion(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION cancel_account_deletion()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_updated INT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE account_deletion_requests
     SET cancelled_at = NOW()
   WHERE user_id = v_caller
     AND cancelled_at IS NULL
     AND completed_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    PERFORM write_audit(
      'account_deletion_cancelled',
      'profiles',
      v_caller,
      NULL
    );
  END IF;

  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION cancel_account_deletion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_account_deletion() TO authenticated;


-- ─────────────────────────────────────────────
-- 5. POD_MEMBERS — guard against duplicate links
-- (the redeem_parent_link_code function uses ON CONFLICT,
--  which requires a unique constraint. Added in 001 already
--  as UNIQUE(pod_id, user_id); kept here as a safety check.)
-- ─────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'pod_members'
       AND indexdef LIKE '%pod_id%user_id%'
  ) THEN
    -- Index expected from 001's UNIQUE(pod_id, user_id) constraint;
    -- this is a defensive no-op.
    NULL;
  END IF;
END $$;


-- ─────────────────────────────────────────────
-- 6. PROFILES — make role immutable post-creation
-- A user cannot promote themselves from student to teacher
-- once their profile exists.
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'role_change_not_allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_lock_role ON profiles;
CREATE TRIGGER profiles_lock_role
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_change();
