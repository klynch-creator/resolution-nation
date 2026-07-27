-- ============================================================
-- 035b — Profile column grant fix (completes 035)
--
-- 035's column-level REVOKEs did not bite: `authenticated` held a table-level
-- UPDATE grant on public.profiles (`authenticated=arwdDxtm/postgres`), and
-- Postgres does not let a column-level REVOKE carve an exception out of a
-- table-level grant. Verified post-035 with has_column_privilege(): every
-- protected column still reported UPDATE = true.
--
-- Correct sequence: drop the table-level grant, then re-grant only the columns
-- a user legitimately owns.
--
-- Post-migration verification (all as expected):
--   authenticated UPDATE on is_frozen / frozen_at / frozen_reason ... false
--   authenticated UPDATE on role / consent_track / is_under_13 ...... false
--   authenticated UPDATE on id / created_at .......................... false
--   anon          UPDATE on anything ................................. false
--   authenticated UPDATE on full_name / contact_email / phone /
--                 preferred_language / preferred_contact / theme /
--                 avatar_url / grade ................................. true
--   service_role  UPDATE on is_frozen ................................ true
--   authenticated INSERT (signup upsert path) ........................ true
--
-- Live behavioural test as role `authenticated` with a student's JWT claims
-- (run in a transaction and rolled back):
--   self-unfreeze  -> BLOCKED (permission denied for table profiles)
--   role escalation-> BLOCKED (permission denied for table profiles)
--   consent rewrite-> BLOCKED (permission denied for table profiles)
--   legit self-edit-> OK
-- ============================================================

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  full_name,
  grade,
  avatar_url,
  theme,
  contact_email,
  phone,
  preferred_language,
  preferred_contact
) ON public.profiles TO authenticated;
