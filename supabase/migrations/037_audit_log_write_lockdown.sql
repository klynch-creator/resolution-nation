-- ============================================================
-- 037 — Audit log write lockdown (security review 2026-07-26, M1)
--
-- PROBLEM
-- `write_audit()` is SECURITY DEFINER and was EXECUTE-able by `authenticated`
-- via /rest/v1/rpc/write_audit. `actor_id` is correctly forced to auth.uid(),
-- but `p_action`, `p_target_type`, `p_target_id` and `p_metadata` were fully
-- caller-controlled, with no allowlist and no rate limit. Any signed-in user —
-- including a student — could write unlimited rows claiming arbitrary actions
-- against arbitrary targets, or bury a real entry under noise.
--
-- `audit_log` is the NY Ed Law 2-d recordkeeping artifact and the evidence
-- you'd hand a district during an incident review, so forgeability matters
-- more here than the raw severity suggests.
--
-- WHY REVOKE RATHER THAN ALLOWLIST
-- The original report suggested validating `p_action` against a fixed list.
-- On inspection that's unnecessary: grepping app/ and lib/ finds ZERO client
-- callers of write_audit. It is only invoked via PERFORM from inside other
-- SECURITY DEFINER functions (migration 002), which run as the function owner
-- and are unaffected by grants to `authenticated`. The two API routes that
-- write audit rows (parent/export, roster/import) insert directly using the
-- service-role client. Revoking EXECUTE is therefore a no-op for legitimate
-- traffic and closes the hole completely — strictly better than an allowlist
-- that would need maintaining.
--
-- DEFENSE IN DEPTH
-- `authenticated` also held table-level INSERT on audit_log. RLS blocks it
-- today (audit_log has a SELECT policy only, and with RLS enabled a missing
-- INSERT policy denies), but that is one accidental "add an insert policy"
-- away from being writable. The grant is removed so the table is effectively
-- append-only from service_role and definer functions.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.write_audit(text, text, uuid, jsonb) FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM anon;
