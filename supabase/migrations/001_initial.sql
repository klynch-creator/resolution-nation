-- ============================================================
-- Resolution Nation — Phase 1 Initial Schema
-- Run this in the Supabase SQL Editor after creating your project
-- ============================================================

-- ─────────────────────────────────────────────
-- CORE TABLES
-- ─────────────────────────────────────────────

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student', 'parent')),
  grade TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('family', 'class', 'team')),
  invite_code TEXT UNIQUE DEFAULT substring(md5(random()::text), 1, 8),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pod_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id UUID REFERENCES pods(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pod_id, user_id)
);

-- ─────────────────────────────────────────────
-- STUB TABLES (Phases 2–5 will flesh these out)
-- ─────────────────────────────────────────────

CREATE TABLE student_data_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'csv')),
  file_url TEXT,
  extracted_data JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'confirmed')),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  friendly_text TEXT NOT NULL,
  standard_code TEXT,
  subject TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium')),
  source TEXT,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  is_personal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE learning_roadmaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  curriculum_source TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'archived')),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE roadmap_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id UUID REFERENCES learning_roadmaps(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  workout_type TEXT CHECK (workout_type IN ('lesson', 'practice', 'quiz', 'test-prep')),
  activities JSONB,
  standard_alignment TEXT,
  star_reward INT DEFAULT 5,
  status TEXT DEFAULT 'locked' CHECK (status IN ('locked', 'active', 'completed')),
  completed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workout_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID REFERENCES roadmap_steps(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  question_index INT,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  is_correct BOOLEAN,
  response_time_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE star_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('earned', 'bonus', 'purchase', 'gift_sent', 'gift_received')),
  item_id UUID,
  recipient_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE star_store_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('animals', 'history', 'science', 'world', 'goods', 'skins')),
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  star_cost INT NOT NULL,
  bio TEXT NOT NULL,
  item_type TEXT DEFAULT 'card' CHECK (item_type IN ('card', 'skin', 'gift')),
  is_giftable BOOLEAN DEFAULT TRUE
);

CREATE TABLE user_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  item_id UUID REFERENCES star_store_items(id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  gifted_from_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pods ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_data_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE star_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE star_store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_inventory ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- PROFILES POLICIES
-- ─────────────────────────────────────────────

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Teachers can view profiles of students in their pods
CREATE POLICY "profiles_select_pod_members"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pod_members pm
      JOIN pods p ON p.id = pm.pod_id
      WHERE pm.user_id = profiles.id
        AND p.created_by = auth.uid()
    )
  );

-- Parents can view profiles of their linked children
CREATE POLICY "profiles_select_children"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pod_members pm_child
      JOIN pod_members pm_parent ON pm_parent.pod_id = pm_child.pod_id
      WHERE pm_child.user_id = profiles.id
        AND pm_parent.user_id = auth.uid()
        AND pm_parent.role = 'viewer'
    )
  );

-- ─────────────────────────────────────────────
-- PODS POLICIES
-- ─────────────────────────────────────────────

CREATE POLICY "pods_insert_teacher"
  ON pods FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- Also allow parents to insert family pods
CREATE POLICY "pods_insert_parent"
  ON pods FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'parent'
    )
  );

CREATE POLICY "pods_select_own"
  ON pods FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "pods_select_member"
  ON pods FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pod_members
      WHERE pod_id = pods.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "pods_update_own"
  ON pods FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "pods_delete_own"
  ON pods FOR DELETE
  USING (created_by = auth.uid());

-- ─────────────────────────────────────────────
-- POD_MEMBERS POLICIES
-- ─────────────────────────────────────────────

CREATE POLICY "pod_members_select_own"
  ON pod_members FOR SELECT
  USING (user_id = auth.uid());

-- Teachers see all members of their pods
CREATE POLICY "pod_members_select_teacher"
  ON pod_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pods WHERE id = pod_members.pod_id AND created_by = auth.uid()
    )
  );

-- Users can join pods themselves (as member)
CREATE POLICY "pod_members_insert_self"
  ON pod_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Teachers can add members to their pods
CREATE POLICY "pod_members_insert_teacher"
  ON pod_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pods WHERE id = pod_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "pod_members_delete_own"
  ON pod_members FOR DELETE
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- GOALS POLICIES
-- ─────────────────────────────────────────────

CREATE POLICY "goals_select_student_own"
  ON goals FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "goals_select_teacher"
  ON goals FOR SELECT
  USING (teacher_id = auth.uid());

CREATE POLICY "goals_select_parent"
  ON goals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pod_members pm_child
      JOIN pod_members pm_parent ON pm_parent.pod_id = pm_child.pod_id
      WHERE pm_child.user_id = goals.student_id
        AND pm_parent.user_id = auth.uid()
        AND pm_parent.role = 'viewer'
    )
  );

CREATE POLICY "goals_insert_teacher"
  ON goals FOR INSERT
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "goals_insert_personal"
  ON goals FOR INSERT
  WITH CHECK (student_id = auth.uid() AND is_personal = TRUE);

CREATE POLICY "goals_update_teacher"
  ON goals FOR UPDATE
  USING (teacher_id = auth.uid());

CREATE POLICY "goals_update_student_status"
  ON goals FOR UPDATE
  USING (student_id = auth.uid());

-- ─────────────────────────────────────────────
-- STAR TRANSACTIONS POLICIES
-- ─────────────────────────────────────────────

CREATE POLICY "stars_select_own"
  ON star_transactions FOR SELECT
  USING (user_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "stars_insert_system"
  ON star_transactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- STAR STORE ITEMS (public read)
-- ─────────────────────────────────────────────

CREATE POLICY "star_store_select_all"
  ON star_store_items FOR SELECT
  USING (TRUE);

-- ─────────────────────────────────────────────
-- USER INVENTORY POLICIES
-- ─────────────────────────────────────────────

CREATE POLICY "inventory_select_own"
  ON user_inventory FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "inventory_insert_own"
  ON user_inventory FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- LEARNING ROADMAPS POLICIES
-- ─────────────────────────────────────────────

CREATE POLICY "roadmaps_select_student"
  ON learning_roadmaps FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "roadmaps_select_teacher"
  ON learning_roadmaps FOR SELECT
  USING (teacher_id = auth.uid());

CREATE POLICY "roadmaps_insert_teacher"
  ON learning_roadmaps FOR INSERT
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "roadmaps_update_teacher"
  ON learning_roadmaps FOR UPDATE
  USING (teacher_id = auth.uid());

-- ─────────────────────────────────────────────
-- ROADMAP STEPS POLICIES
-- ─────────────────────────────────────────────

CREATE POLICY "steps_select_via_roadmap"
  ON roadmap_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM learning_roadmaps lr
      WHERE lr.id = roadmap_steps.roadmap_id
        AND (lr.student_id = auth.uid() OR lr.teacher_id = auth.uid())
    )
  );

CREATE POLICY "steps_insert_teacher"
  ON roadmap_steps FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM learning_roadmaps lr
      WHERE lr.id = roadmap_id AND lr.teacher_id = auth.uid()
    )
  );

CREATE POLICY "steps_update_teacher"
  ON roadmap_steps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM learning_roadmaps lr
      WHERE lr.id = roadmap_steps.roadmap_id AND lr.teacher_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- WORKOUT RESPONSES POLICIES
-- ─────────────────────────────────────────────

CREATE POLICY "responses_select_own"
  ON workout_responses FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "responses_select_teacher"
  ON workout_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM roadmap_steps rs
      JOIN learning_roadmaps lr ON lr.id = rs.roadmap_id
      WHERE rs.id = workout_responses.step_id AND lr.teacher_id = auth.uid()
    )
  );

CREATE POLICY "responses_insert_own"
  ON workout_responses FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- STUDENT DATA UPLOADS POLICIES
-- ─────────────────────────────────────────────

CREATE POLICY "uploads_select_teacher"
  ON student_data_uploads FOR SELECT
  USING (teacher_id = auth.uid());

CREATE POLICY "uploads_select_student"
  ON student_data_uploads FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "uploads_insert_teacher"
  ON student_data_uploads FOR INSERT
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "uploads_update_teacher"
  ON student_data_uploads FOR UPDATE
  USING (teacher_id = auth.uid());
