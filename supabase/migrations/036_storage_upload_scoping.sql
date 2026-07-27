-- ============================================================
-- 036 — Storage upload scoping (security review 2026-07-26, H2)
--
-- PROBLEM
-- `report-cards` and `curricula` INSERT policies checked only that the caller
-- was signed in:
--
--   WITH CHECK (bucket_id = 'curricula' AND auth.role() = 'authenticated')
--
-- ...with no binding between the object path and the caller. Read policies
-- were correctly scoped to (storage.foldername(name))[1] = auth.uid(), so this
-- was not a read leak — but ANY authenticated user, including a student, could
-- write or overwrite objects under any other user's UUID prefix.
--
-- The concrete attack: plant a file under a teacher's prefix that
-- /api/extract-report-card or /api/curriculum/extract will later download and
-- feed to Claude — a prompt-injection delivery channel into a teacher-facing
-- AI feature — or clobber a teacher's uploaded curriculum.
--
-- `fluency-audio` already had the correct pattern; these two were the outliers.
--
-- Also: all three buckets had file_size_limit = NULL and
-- allowed_mime_types = NULL (only `avatars` was constrained), permitting
-- unbounded uploads of arbitrary content type.
--
-- Upload paths this must keep working:
--   report-cards   `${teacherId}/${studentId}/${name}`  (foldername[1] = uid)
--   curricula      `${userId}/${name}`                  (foldername[1] = uid)
--   fluency-audio  `${studentId}/${assessmentId}/${n}`  (foldername[1] = uid)
--
-- See 036b for the MIME allowlist correction.
-- ============================================================

-- ── Bind uploads to the caller's own folder ──────────────────────────────────
DROP POLICY IF EXISTS "report_cards_upload" ON storage.objects;
CREATE POLICY "report_cards_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'report-cards'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "curricula_upload" ON storage.objects;
CREATE POLICY "curricula_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'curricula'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- ── Scope overwrite-in-place too ─────────────────────────────────────────────
-- Without an UPDATE policy, `upsert: true` against an existing object owned by
-- someone else fails closed — but make the intent explicit rather than relying
-- on the absence of a policy.
DROP POLICY IF EXISTS "report_cards_update" ON storage.objects;
CREATE POLICY "report_cards_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'report-cards' AND (storage.foldername(name))[1] = (auth.uid())::text)
  WITH CHECK (bucket_id = 'report-cards' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "curricula_update" ON storage.objects;
CREATE POLICY "curricula_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'curricula' AND (storage.foldername(name))[1] = (auth.uid())::text)
  WITH CHECK (bucket_id = 'curricula' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- ── report-cards had no DELETE policy at all ─────────────────────────────────
-- Teachers could not remove their own uploads. (The nightly purge cron uses
-- service_role, so it was unaffected.)
DROP POLICY IF EXISTS "report_cards_delete" ON storage.objects;
CREATE POLICY "report_cards_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'report-cards' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- ── Size limits ──────────────────────────────────────────────────────────────
UPDATE storage.buckets SET file_size_limit = 10485760  WHERE id = 'report-cards';   -- 10 MB
UPDATE storage.buckets SET file_size_limit = 26214400  WHERE id = 'curricula';      -- 25 MB
UPDATE storage.buckets SET file_size_limit = 26214400  WHERE id = 'fluency-audio';  -- 25 MB
