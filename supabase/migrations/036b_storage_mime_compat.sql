-- ============================================================
-- 036b — Storage MIME allowlist compatibility fix
--
-- The first pass at 036 set strict MIME allowlists that would have broken
-- real uploads:
--
--   * fluency-audio: MediaRecorder reports `audio/webm;codecs=opus`
--     (app/dashboard/student/fluency/page.tsx:108 -> recorder.mimeType), and a
--     parameterised type does not match a bare `audio/webm` entry. Every
--     student read-aloud recording would have failed to store.
--   * curricula: app/dashboard/teacher/curriculum/page.tsx:113 falls back to
--     `application/octet-stream` when the browser reports no file.type.
--
-- What the allowlist is actually for: these are private buckets served only
-- through short-lived signed URLs to an authorized caller, so the meaningful
-- risk is a stored file that RENDERS in the browser off that signed URL
-- (text/html, image/svg+xml) or that gets fed to pdf-parse. Content served as
-- `application/octet-stream` downloads rather than renders, so permitting it
-- costs nothing. `audio/*` covers codec parameters.
-- ============================================================

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['audio/*']
 WHERE id = 'fluency-audio';

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'application/pdf',
         'text/csv',
         'text/plain',
         'application/vnd.ms-excel',
         'application/octet-stream'
       ]
 WHERE id = 'report-cards';

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'application/pdf',
         'text/csv',
         'text/plain',
         'application/vnd.ms-excel',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/octet-stream'
       ]
 WHERE id = 'curricula';

-- Verified post-migration: all 14 storage policies across the four buckets
-- are folder-scoped, and every bucket has a size limit and MIME allowlist.
