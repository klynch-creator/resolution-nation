-- ============================================================
-- Resolution Nation — Phase 12D: Curriculum ingestion
-- Teachers upload a curriculum document; AI extracts units/standards/skills.
-- Teacher-only data (education record) — never exposed to students/parents.
-- ============================================================

CREATE TABLE IF NOT EXISTS curricula (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  grade       TEXT,
  subject     TEXT,
  file_url    TEXT,
  extracted   JSONB,   -- { units: [{ name, sequence_order, standards:[], skills:[] }], notes }
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','extracted','confirmed')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS curricula_teacher ON curricula (teacher_id, created_at DESC);

ALTER TABLE curricula ENABLE ROW LEVEL SECURITY;

-- Teacher owns their curricula. No student/parent policy => invisible to them.
CREATE POLICY "curricula_teacher_all" ON curricula
  FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- ── Storage bucket for curriculum documents (mirrors report-cards) ──────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('curricula', 'curricula', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "curricula_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'curricula' AND auth.role() = 'authenticated');

CREATE POLICY "curricula_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'curricula' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "curricula_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'curricula' AND auth.uid()::text = (storage.foldername(name))[1]);
