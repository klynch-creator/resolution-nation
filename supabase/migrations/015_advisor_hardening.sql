-- Fix remaining security advisor warnings (June 2026).
-- Applied to production 2026-06-11 via MCP (remote name: 015_advisor_hardening).

-- 1. Pin search_path on trigger functions flagged by function_search_path_mutable.
ALTER FUNCTION public.update_parent_student_links_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- 2. handle_new_user is an auth trigger function — it should never be callable
--    via the PostgREST RPC surface. Triggers fire as the table owner, so
--    revoking EXECUTE from API roles does not affect signup.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- 3. RLS helper functions: needed by `authenticated` (they are referenced in
--    policies evaluated as the calling role) but never by `anon`.
REVOKE EXECUTE ON FUNCTION public.is_pod_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_podmate(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_teacher_pod(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.parent_can_view_goal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.parent_can_view_profile(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.teacher_can_view_profile(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.teacher_can_view_student_stars(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.teacher_has_student_in_pod(uuid) FROM anon;

-- 4. User-facing RPCs: signed-in only by design; ensure anon cannot call them.
REVOKE EXECUTE ON FUNCTION public.award_stars(uuid, integer, text, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.spend_stars(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_parent_link_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.redeem_parent_link_code(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_account_deletion(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_account_deletion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.write_audit(text, text, uuid, jsonb) FROM anon;
