-- ============================================================
-- 035 — Profile column lockdown (security review 2026-07-26, C1/M4/L2)
--
-- PROBLEM
-- `profiles_update_own` allows a user to UPDATE their own row with no
-- column restriction, and the `profiles_lock_role` trigger guarded only
-- `role`. Column-level UPDATE grants to `authenticated` (and `anon`)
-- covered every column, so a student could:
--
--   PATCH /rest/v1/profiles?id=eq.<self>
--   {"is_frozen": false, "frozen_at": null, "frozen_reason": null}
--
-- ...and defeat the content-moderation account freeze — the child-safety
-- control that holds an account until a teacher reviews flagged writing.
-- The same hole let a student rewrite `is_under_13` / `consent_track`,
-- which are the only record of each account's COPPA consent basis now
-- that DOB is deliberately not stored.
--
-- FIX
-- 1. Revoke column-level UPDATE on the protected columns from
--    `authenticated` and `anon`. Users keep UPDATE on the columns they
--    legitimately own (full_name, grade, avatar_url, theme, contact_email,
--    phone, preferred_language, preferred_contact).
-- 2. Replace `prevent_role_change` with `prevent_protected_profile_changes`,
--    which rejects changes to any protected column unless the statement is
--    running as the table owner or service_role. This is defense in depth:
--    if a future migration re-grants a column by accident, the trigger
--    still holds.
--
-- WHY LEGITIMATE WRITES STILL WORK
--   - `resolve_moderation_flag(uuid)` is SECURITY DEFINER owned by
--     `postgres` (= the profiles table owner), so it runs with owner
--     privileges: column grants don't apply and the trigger's owner check
--     passes. Teacher unfreeze is unaffected.
--   - Server-side routes using SUPABASE_SERVICE_ROLE_KEY connect as
--     `service_role`, which bypasses RLS and is allowlisted in the trigger.
--     `lib/writing-moderation.ts` (freeze) and the roster importer keep
--     working.
--
-- ALSO IN THIS MIGRATION
-- `resolve_moderation_flag` authorized the teacher via "has a goal for this
-- student". A CSV-imported student with no goals yet could be frozen by
-- moderation and then unfreezable by anyone — a permanent lockout. Widened
-- to also accept a teacher who shares a pod with the student, using the
-- existing `teacher_has_student_in_pod()` helper.
-- ============================================================

-- ── 1. Revoke column-level UPDATE on protected columns ───────────────────────
-- `id` and `created_at` are included for record integrity: RLS's WITH CHECK
-- already prevents re-pointing a row at another user, but neither column has
-- any reason to be client-writable.
--
-- NOTE: the column-level REVOKEs below are a NO-OP against `authenticated`,
-- which held a *table-level* UPDATE grant (`authenticated=arwdDxtm`). Postgres
-- will not let a column-level revoke carve an exception out of a table-level
-- grant. Migration 035b does the real work: drop the table grant, then
-- re-grant only the user-owned columns. These statements are kept because they
-- ran against production and are harmless/idempotent — do not reorder them.
REVOKE UPDATE (
  id,
  role,
  is_frozen,
  frozen_at,
  frozen_reason,
  is_under_13,
  consent_track,
  created_at
) ON public.profiles FROM authenticated;

REVOKE UPDATE (
  id,
  role,
  is_frozen,
  frozen_at,
  frozen_reason,
  is_under_13,
  consent_track,
  created_at
) ON public.profiles FROM anon;

-- `anon` has no business updating profiles at all — RLS already blocks it
-- (profiles_update_own requires auth.uid() = id and anon has no uid), but
-- migration 020 only revoked anon function grants, not table grants.
REVOKE UPDATE ON public.profiles FROM anon;

-- ── 2. Trigger: reject protected-column changes from non-privileged roles ────
CREATE OR REPLACE FUNCTION public.prevent_protected_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Owner (SECURITY DEFINER functions such as resolve_moderation_flag) and
  -- service_role (server-side routes) may change anything.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'role_change_not_allowed';
  END IF;

  IF OLD.is_frozen     IS DISTINCT FROM NEW.is_frozen
  OR OLD.frozen_at     IS DISTINCT FROM NEW.frozen_at
  OR OLD.frozen_reason IS DISTINCT FROM NEW.frozen_reason THEN
    RAISE EXCEPTION 'moderation_state_change_not_allowed';
  END IF;

  IF OLD.is_under_13   IS DISTINCT FROM NEW.is_under_13
  OR OLD.consent_track IS DISTINCT FROM NEW.consent_track THEN
    RAISE EXCEPTION 'consent_change_not_allowed';
  END IF;

  IF OLD.id         IS DISTINCT FROM NEW.id
  OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'immutable_field_change_not_allowed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_lock_role ON public.profiles;
DROP TRIGGER IF EXISTS profiles_lock_protected ON public.profiles;

CREATE TRIGGER profiles_lock_protected
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_protected_profile_changes();

-- `prevent_role_change` is now unused; keep it out of the exposed surface.
DROP FUNCTION IF EXISTS public.prevent_role_change();

-- ── 3. Broaden teacher authorization for unfreeze ────────────────────────────
-- Previously: teacher must have a `goals` row for the student. Roster-imported
-- students have no goals on day one, so a moderation freeze was unrecoverable.
-- Now: a goal OR shared pod membership. Everything else is unchanged.
CREATE OR REPLACE FUNCTION public.resolve_moderation_flag(p_flag_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_student UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT student_id INTO v_student FROM moderation_flags WHERE id = p_flag_id;
  IF v_student IS NULL THEN RAISE EXCEPTION 'flag_not_found'; END IF;

  -- Caller must be a teacher who either set a goal for this student or
  -- shares a pod with them.
  IF NOT EXISTS (
    SELECT 1 FROM goals g
     WHERE g.student_id = v_student AND g.teacher_id = v_caller
  ) AND NOT EXISTS (
    SELECT 1 FROM pod_members pm
      JOIN pods p ON p.id = pm.pod_id
     WHERE pm.user_id = v_student
       AND p.created_by = v_caller
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE moderation_flags
     SET resolved = TRUE, resolved_by = v_caller, resolved_at = NOW()
   WHERE id = p_flag_id;

  -- Unfreeze the student once no unresolved blocking flags remain.
  IF NOT EXISTS (
    SELECT 1 FROM moderation_flags
     WHERE student_id = v_student AND severity = 'block' AND resolved = FALSE
  ) THEN
    UPDATE profiles
       SET is_frozen = FALSE, frozen_at = NULL, frozen_reason = NULL
     WHERE id = v_student;
  END IF;

  -- Ed Law 2-d recordkeeping: who lifted the freeze, and when.
  INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (v_caller, 'moderation_flag_resolved', 'profile', v_student,
          jsonb_build_object('flag_id', p_flag_id));
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_moderation_flag(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_moderation_flag(UUID) TO authenticated;
