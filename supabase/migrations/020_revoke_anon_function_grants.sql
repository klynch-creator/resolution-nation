-- Finish locking SECURITY DEFINER functions away from anon (June 2026).
--
-- Two gaps left after 015:
--   1. The RLS helper functions still carried the implicit PUBLIC grant
--      (=X/postgres), which anon inherits even after "REVOKE ... FROM anon".
--   2. Supabase's default privileges grant EXECUTE to anon explicitly on
--      newly created functions (gift_item, join_pod_by_invite_code).
--
-- All of these are authenticated-only by design.

-- RLS helpers
REVOKE EXECUTE ON FUNCTION public.is_pod_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_podmate(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_teacher_pod(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.parent_can_view_goal(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.parent_can_view_profile(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.teacher_can_view_profile(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.teacher_can_view_student_stars(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.teacher_has_student_in_pod(uuid) FROM PUBLIC, anon;

-- User-facing RPCs
REVOKE EXECUTE ON FUNCTION public.award_stars(uuid, integer, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.spend_stars(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gift_item(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_pod_by_invite_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_parent_link_code() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.redeem_parent_link_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_account_deletion(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_account_deletion() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.write_audit(text, text, uuid, jsonb) FROM PUBLIC, anon;

-- Keep future functions from leaking to anon by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
