-- ============================================================
-- Resolution Nation — Phase 13: Read-Aloud Fluency
-- Students read a grade-level passage aloud; speech-to-text + alignment
-- produce WCPM / accuracy / miscues, classified against Hasbrouck-Tindal
-- (2017) ORF norms. Results (incl. a stored voice recording) are for TEACHERS
-- and PARENTS — the student only sees supportive, level-free feedback.
--
--   - fluency_assessments : one passage assignment per (student, passage)
--   - fluency_attempts    : each read (read 1, read 2, …) with metrics + audio
--   - record_fluency_attempt() : SECURITY DEFINER RPC — inserts an attempt,
--                                awards capped stars, rolls up the best score.
--
-- Security model matches migrations 016/021: all star writes go through a
-- SECURITY DEFINER RPC; the RPC computes the star payout itself (capped) and
-- never trusts a client-supplied amount.
--
-- COMPLIANCE: audio is a child's voice recording, stored in a PRIVATE bucket.
-- Teacher/parent playback is via short-lived signed URLs minted server-side
-- after an authorization check (see app/api/fluency/audio/[attemptId]).
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. FLUENCY_ASSESSMENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fluency_assessments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source             TEXT NOT NULL DEFAULT 'library' CHECK (source IN ('library','roadmap')),
  goal_id            UUID REFERENCES goals(id) ON DELETE SET NULL,
  subject            TEXT NOT NULL DEFAULT 'Reading',
  grade              TEXT,                       -- grade snapshot at generation
  passage_title      TEXT NOT NULL,
  passage_text       TEXT NOT NULL,
  passage_word_count INT  NOT NULL,
  standard_alignment TEXT,
  content_key        TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  best_wcpm          INT,
  best_level         TEXT CHECK (best_level IN ('below','approaching','on')),
  attempts           INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  completed_at       TIMESTAMPTZ
);

-- One passage instance per (student, content_key): avoids exact duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS fluency_assessments_no_repeat
  ON fluency_assessments (student_id, content_key);

CREATE INDEX IF NOT EXISTS fluency_assessments_student
  ON fluency_assessments (student_id, created_at DESC);

ALTER TABLE fluency_assessments ENABLE ROW LEVEL SECURITY;

-- Student: full access to own assessments (status/best_* are written only by the
-- DEFINER RPC, which runs regardless of these policies).
CREATE POLICY "fluency_assessments_student_all" ON fluency_assessments
  FOR ALL USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

-- Teacher: read assessments for any student they set a goal for.
CREATE POLICY "fluency_assessments_teacher_read" ON fluency_assessments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM goals g
     WHERE g.student_id = fluency_assessments.student_id
       AND g.teacher_id = auth.uid()
  ));

-- Parent: read assessments for an approved-linked child.
CREATE POLICY "fluency_assessments_parent_read" ON fluency_assessments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM parent_student_links psl
     WHERE psl.student_id = fluency_assessments.student_id
       AND psl.parent_id  = auth.uid()
       AND psl.status     = 'approved'
  ));

-- ─────────────────────────────────────────────
-- 2. FLUENCY_ATTEMPTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fluency_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id    UUID NOT NULL REFERENCES fluency_assessments(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,  -- denormalized for RLS
  attempt_number   INT  NOT NULL,
  audio_path       TEXT,                 -- path in the private 'fluency-audio' bucket
  transcript       TEXT,
  duration_seconds NUMERIC,
  words_correct    INT NOT NULL DEFAULT 0,
  words_read       INT NOT NULL DEFAULT 0,
  substitutions    INT NOT NULL DEFAULT 0,
  omissions        INT NOT NULL DEFAULT 0,
  insertions       INT NOT NULL DEFAULT 0,
  errors           INT NOT NULL DEFAULT 0,
  wcpm             INT NOT NULL DEFAULT 0,
  accuracy_pct     NUMERIC,
  completion_pct   NUMERIC,
  level            TEXT CHECK (level IN ('below','approaching','on')),  -- null = not normed (K / G1 fall)
  norm_p25         INT,
  norm_p50         INT,
  norm_season      TEXT,
  norm_source      TEXT,
  miscues          JSONB,
  feedback         TEXT,                 -- supportive, level-free; safe to show student
  stars_awarded    INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS fluency_attempts_assessment
  ON fluency_attempts (assessment_id, attempt_number);

ALTER TABLE fluency_attempts ENABLE ROW LEVEL SECURITY;

-- Student: read own attempts (no client INSERT — writes go via the RPC).
CREATE POLICY "fluency_attempts_student_read" ON fluency_attempts
  FOR SELECT USING (student_id = auth.uid());

-- Teacher: read attempts for assessments of students they teach.
CREATE POLICY "fluency_attempts_teacher_read" ON fluency_attempts
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM fluency_assessments fa
    JOIN goals g ON g.student_id = fa.student_id
    WHERE fa.id = fluency_attempts.assessment_id
      AND g.teacher_id = auth.uid()
  ));

-- Parent: read attempts for an approved-linked child.
CREATE POLICY "fluency_attempts_parent_read" ON fluency_attempts
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM fluency_assessments fa
    JOIN parent_student_links psl ON psl.student_id = fa.student_id
    WHERE fa.id = fluency_attempts.assessment_id
      AND psl.parent_id = auth.uid()
      AND psl.status = 'approved'
  ));

-- ─────────────────────────────────────────────
-- 3. Private storage bucket for voice recordings (mirrors report-cards)
-- ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('fluency-audio', 'fluency-audio', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "fluency_audio_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'fluency-audio' AND auth.role() = 'authenticated'
                         AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "fluency_audio_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'fluency-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "fluency_audio_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'fluency-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ─────────────────────────────────────────────
-- 4. record_fluency_attempt() RPC
-- Inserts a scored attempt, awards capped stars, rolls up best score/level.
-- Metrics are computed server-side (Node) and passed in; the RPC computes the
-- star payout itself and caps it, so a forged metric cannot inflate stars.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_fluency_attempt(
  p_assessment_id  UUID,
  p_attempt_number INT,
  p_audio_path     TEXT,
  p_transcript     TEXT,
  p_metrics        JSONB,
  p_feedback       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller     UUID := auth.uid();
  v_assessment fluency_assessments%ROWTYPE;
  v_attempt_id UUID;
  v_wcpm       INT := COALESCE((p_metrics->>'wcpm')::INT, 0);
  v_level      TEXT := NULLIF(p_metrics->>'level','');
  v_prior_best INT;
  v_reward     INT := 0;
  v_total_awarded INT;
  STAR_CAP CONSTANT INT := 15;   -- max stars per assessment, all reads combined
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_assessment FROM fluency_assessments WHERE id = p_assessment_id;
  IF v_assessment.id IS NULL THEN
    RAISE EXCEPTION 'assessment_not_found';
  END IF;
  IF v_assessment.student_id <> v_caller THEN
    RAISE EXCEPTION 'assessment_not_owned';
  END IF;

  -- Best WCPM among prior attempts (for the improvement bonus).
  SELECT MAX(wcpm) INTO v_prior_best
    FROM fluency_attempts WHERE assessment_id = p_assessment_id;

  -- Insert the attempt (idempotent on (assessment_id, attempt_number)).
  INSERT INTO fluency_attempts (
    assessment_id, student_id, attempt_number, audio_path, transcript,
    duration_seconds, words_correct, words_read, substitutions, omissions,
    insertions, errors, wcpm, accuracy_pct, completion_pct, level,
    norm_p25, norm_p50, norm_season, norm_source, miscues, feedback
  ) VALUES (
    p_assessment_id, v_caller, p_attempt_number, p_audio_path, p_transcript,
    NULLIF(p_metrics->>'durationSeconds','')::NUMERIC,
    COALESCE((p_metrics->>'wordsCorrect')::INT, 0),
    COALESCE((p_metrics->>'wordsRead')::INT, 0),
    COALESCE((p_metrics->>'substitutions')::INT, 0),
    COALESCE((p_metrics->>'omissions')::INT, 0),
    COALESCE((p_metrics->>'insertions')::INT, 0),
    COALESCE((p_metrics->>'errors')::INT, 0),
    v_wcpm,
    NULLIF(p_metrics->>'accuracyPct','')::NUMERIC,
    NULLIF(p_metrics->>'completionPct','')::NUMERIC,
    v_level,
    NULLIF(p_metrics->>'normP25','')::INT,
    NULLIF(p_metrics->>'normP50','')::INT,
    NULLIF(p_metrics->>'normSeason',''),
    NULLIF(p_metrics->>'normSource',''),
    p_metrics->'miscues',
    p_feedback
  )
  ON CONFLICT (assessment_id, attempt_number) DO NOTHING
  RETURNING id INTO v_attempt_id;

  IF v_attempt_id IS NULL THEN
    RAISE EXCEPTION 'attempt_already_recorded';
  END IF;

  -- Star payout (computed here, never trusted from client; capped per assessment).
  --   First read:  +5 (participation)
  --   Later read:  +10 if WCPM improved over prior best, else +3 (effort)
  IF p_attempt_number <= 1 OR v_prior_best IS NULL THEN
    v_reward := 5;
  ELSIF v_wcpm > v_prior_best THEN
    v_reward := 10;
  ELSE
    v_reward := 3;
  END IF;

  SELECT COALESCE(SUM(stars_awarded), 0) INTO v_total_awarded
    FROM fluency_attempts WHERE assessment_id = p_assessment_id;
  IF v_total_awarded + v_reward > STAR_CAP THEN
    v_reward := GREATEST(0, STAR_CAP - v_total_awarded);
  END IF;

  IF v_reward > 0 THEN
    INSERT INTO star_transactions (user_id, amount, type, item_id)
    VALUES (v_caller, v_reward, 'earned', v_attempt_id);
    UPDATE fluency_attempts SET stars_awarded = v_reward WHERE id = v_attempt_id;
  END IF;

  -- Roll up assessment best score/level + status.
  UPDATE fluency_assessments
     SET attempts     = attempts + 1,
         best_wcpm    = GREATEST(COALESCE(best_wcpm, 0), v_wcpm),
         best_level   = CASE
                          WHEN v_wcpm >= COALESCE(best_wcpm, -1) AND v_level IS NOT NULL
                            THEN v_level ELSE best_level END,
         status       = 'completed',
         completed_at = COALESCE(completed_at, NOW())
   WHERE id = p_assessment_id;

  RETURN jsonb_build_object('attempt_id', v_attempt_id, 'stars_awarded', v_reward);
END;
$$;

REVOKE ALL ON FUNCTION record_fluency_attempt(UUID, INT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_fluency_attempt(UUID, INT, TEXT, TEXT, JSONB, TEXT) TO authenticated;
