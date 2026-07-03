-- 031: Profile contact info + two-way teacher↔parent messaging.
--
-- 1. profiles gains contact fields (settings page for teachers + parents).
-- 2. parent_messages becomes a two-way conversation: sender_role marks the
--    direction, title becomes optional (chat-style messages have no subject),
--    and parents may INSERT into threads where they hold an APPROVED link to
--    the student with that teacher. Teachers may UPDATE (mark read).

-- ── Profiles: contact info ────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en'
    CHECK (preferred_language IN ('en', 'es')),
  ADD COLUMN IF NOT EXISTS preferred_contact text NOT NULL DEFAULT 'app'
    CHECK (preferred_contact IN ('app', 'email', 'phone'));

-- ── Messages: two-way ─────────────────────────────────────────────────────
ALTER TABLE parent_messages
  ADD COLUMN IF NOT EXISTS sender_role text NOT NULL DEFAULT 'teacher'
    CHECK (sender_role IN ('teacher', 'parent'));

ALTER TABLE parent_messages ALTER COLUMN title DROP NOT NULL;

-- Parents can send a message into a thread only when they hold an APPROVED
-- link to that student with that teacher, and only as themselves.
CREATE POLICY "pm_parent_insert" ON parent_messages
  FOR INSERT WITH CHECK (
    parent_id = auth.uid()
    AND sender_role = 'parent'
    AND EXISTS (
      SELECT 1 FROM parent_student_links psl
      WHERE psl.parent_id = auth.uid()
        AND psl.student_id = parent_messages.student_id
        AND psl.teacher_id = parent_messages.teacher_id
        AND psl.status = 'approved'
    )
  );

-- Teachers can mark parent-sent messages as read.
CREATE POLICY "pm_teacher_update" ON parent_messages
  FOR UPDATE USING (teacher_id = auth.uid());

-- Helpful index for thread queries (teacher+parent+student, newest first).
CREATE INDEX IF NOT EXISTS parent_messages_thread_idx
  ON parent_messages (teacher_id, parent_id, student_id, created_at);

-- ── Cross-visibility of profiles across an approved link ──────────────────
-- Teacher may read profiles of parents holding an APPROVED link to their
-- students (names + contact info for messaging); parents may read the profile
-- of the linked teacher. parent_student_links policies are plain auth.uid()
-- checks, so no RLS recursion risk.
CREATE POLICY "profiles_select_linked_parents" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_student_links psl
      WHERE psl.parent_id = profiles.id
        AND psl.teacher_id = auth.uid()
        AND psl.status = 'approved'
    )
  );

CREATE POLICY "profiles_select_linked_teacher" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_student_links psl
      WHERE psl.teacher_id = profiles.id
        AND psl.parent_id = auth.uid()
        AND psl.status = 'approved'
    )
  );
