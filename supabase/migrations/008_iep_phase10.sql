-- Phase 10: IEP Tools

CREATE TABLE IF NOT EXISTS iep_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  goal_text TEXT NOT NULL,
  area TEXT NOT NULL,
  baseline TEXT,
  target TEXT,
  measurement TEXT,
  standard TEXT,
  progress_notes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE iep_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iep_teacher_all" ON iep_goals
  FOR ALL USING (teacher_id = auth.uid());

CREATE POLICY "iep_student_read" ON iep_goals
  FOR SELECT USING (student_id = auth.uid());

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_iep_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER iep_goals_updated_at
  BEFORE UPDATE ON iep_goals
  FOR EACH ROW EXECUTE FUNCTION update_iep_goals_updated_at();
