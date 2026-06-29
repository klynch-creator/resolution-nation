-- ============================================================
-- Resolution Nation — Writing Workshop (Phase 14, June 2026)
--
-- A dedicated writing space (separate from lessons), with three modes:
--   short_response (RACE/RADD, state-test style), essay, and creative.
-- All student writing is AI-moderated for school-appropriateness; clearly
-- inappropriate content blocks (freezes) the account and flags it to the
-- teacher + parent, who can see exactly what was written. A teacher resolves
-- the flag to unfreeze. Copy-paste into writing fields is logged.
--
-- Writes that set moderation/freeze state are performed server-side with the
-- service-role key (the moderation API); the only client-facing privileged
-- action is resolve_moderation_flag (teacher), a SECURITY DEFINER RPC.
-- ============================================================

-- ── 1. Account freeze flags on profiles ──────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_frozen     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS frozen_at     TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS frozen_reason TEXT;

-- ── 2. Writing submissions (short_response + essay) ──────────────────────────
CREATE TABLE IF NOT EXISTS writing_submissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignment_id      UUID,                       -- groups short responses sharing one passage
  mode               TEXT NOT NULL CHECK (mode IN ('short_response','essay')),
  subject            TEXT,
  grade              TEXT,
  standard_alignment TEXT,
  passage_title      TEXT,
  passage_text       TEXT,
  prompt             TEXT NOT NULL,
  response_text      TEXT NOT NULL DEFAULT '',
  rubric_max         INT,                        -- 2 (short response) or 4 (essay)
  score              INT,
  strengths          TEXT,
  feedback           TEXT,
  improvement        TEXT,
  status             TEXT NOT NULL DEFAULT 'graded' CHECK (status IN ('submitted','graded')),
  paste_flagged      BOOLEAN NOT NULL DEFAULT FALSE,
  paste_events       JSONB,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  graded_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS writing_subs_student ON writing_submissions (student_id, created_at DESC);

-- ── 3. Creative stories (evolving documents) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS creative_stories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT 'Untitled Story',
  content       TEXT NOT NULL DEFAULT '',
  word_count    INT NOT NULL DEFAULT 0,
  paste_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  paste_events  JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS creative_stories_student ON creative_stories (student_id, updated_at DESC);

-- ── 4. Moderation flags ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moderation_flags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_type  TEXT NOT NULL CHECK (source_type IN ('writing_submission','creative_story')),
  source_id    UUID,
  mode         TEXT,
  excerpt      TEXT,                              -- exactly what was written (teacher view)
  reason       TEXT,
  categories   TEXT,
  severity     TEXT NOT NULL CHECK (severity IN ('flag','block')),
  resolved     BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS moderation_flags_student ON moderation_flags (student_id, resolved, created_at DESC);

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE writing_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_stories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_flags    ENABLE ROW LEVEL SECURITY;

-- writing_submissions: student full access to own; teacher/parent read.
CREATE POLICY "ws_student_all" ON writing_submissions
  FOR ALL USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "ws_teacher_read" ON writing_submissions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM goals g WHERE g.student_id = writing_submissions.student_id AND g.teacher_id = auth.uid()
  ));
CREATE POLICY "ws_parent_read" ON writing_submissions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM parent_student_links psl
     WHERE psl.student_id = writing_submissions.student_id
       AND psl.parent_id = auth.uid() AND psl.status = 'approved'
  ));

-- creative_stories: student full access to own; teacher/parent read.
CREATE POLICY "cs_student_all" ON creative_stories
  FOR ALL USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());
CREATE POLICY "cs_teacher_read" ON creative_stories
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM goals g WHERE g.student_id = creative_stories.student_id AND g.teacher_id = auth.uid()
  ));
CREATE POLICY "cs_parent_read" ON creative_stories
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM parent_student_links psl
     WHERE psl.student_id = creative_stories.student_id
       AND psl.parent_id = auth.uid() AND psl.status = 'approved'
  ));

-- moderation_flags: teacher read+update (resolve via RPC, but allow read);
-- parent read; student may read own (so the lockout screen can explain).
CREATE POLICY "mf_student_read" ON moderation_flags
  FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "mf_teacher_read" ON moderation_flags
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM goals g WHERE g.student_id = moderation_flags.student_id AND g.teacher_id = auth.uid()
  ));
CREATE POLICY "mf_parent_read" ON moderation_flags
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM parent_student_links psl
     WHERE psl.student_id = moderation_flags.student_id
       AND psl.parent_id = auth.uid() AND psl.status = 'approved'
  ));

-- ── 6. resolve_moderation_flag RPC (teacher unfreeze) ────────────────────────
CREATE OR REPLACE FUNCTION resolve_moderation_flag(p_flag_id UUID)
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

  -- Caller must be a teacher who has a goal for this student.
  IF NOT EXISTS (
    SELECT 1 FROM goals g WHERE g.student_id = v_student AND g.teacher_id = v_caller
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
END;
$$;

REVOKE ALL ON FUNCTION resolve_moderation_flag(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_moderation_flag(UUID) TO authenticated;
