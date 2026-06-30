export type Role = "teacher" | "student" | "parent";
export type PodType = "family" | "class" | "team";
export type PodMemberRole = "admin" | "member" | "viewer";
export type UploadStatus = "pending" | "reviewed" | "confirmed";
export type GoalPriority = "critical" | "high" | "medium";
export type GoalStatus = "not_started" | "in_progress" | "completed";
export type GoalSubject = "ELA" | "Math" | "Science" | "History" | "Writing" | "Other";

export interface Goal {
  id: string;
  student_id: string;
  teacher_id: string | null;
  friendly_text: string;
  standard_code: string | null;
  subject: GoalSubject | null;
  priority: GoalPriority;
  source: string | null;
  status: GoalStatus;
  is_personal: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  grade?: string | null;
  avatar_url?: string | null;
  theme?: string | null;
  created_at: string;
  is_frozen?: boolean;
  frozen_at?: string | null;
  frozen_reason?: string | null;
}

export interface Pod {
  id: string;
  name: string;
  type: PodType;
  invite_code: string;
  created_by: string;
  created_at: string;
}

export interface PodMember {
  id: string;
  pod_id: string;
  user_id: string;
  role: PodMemberRole;
  joined_at: string;
}

export interface PodWithMembers extends Pod {
  pod_members: { count: number }[];
}

export interface ExtractedSubject {
  name: string;
  score: string | number;
  scale: string;
  standard: string | null;
  notes: string | null;
}

export interface ExtractedReportCard {
  student_name: string | null;
  grade_level: string | null;
  subjects: ExtractedSubject[];
  overall_notes: string | null;
}

export type RoadmapStatus = "draft" | "pending_approval" | "approved" | "archived";
export type StepStatus = "locked" | "active" | "completed";
export type WorkoutType = "lesson" | "practice" | "quiz" | "test-prep";

export interface RoadmapQuestion {
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: string[];
  correct_index: number;
  hint: string;
}

export interface LessonPassage {
  title: string;
  text: string;
}

export interface StepActivities {
  questions: RoadmapQuestion[];
  /** Optional grade-level reading passage (non-math lessons). */
  passage?: LessonPassage | null;
}

export interface RoadmapStep {
  id: string;
  roadmap_id: string;
  subgoal_id?: string | null;
  step_order: number;
  title: string;
  description: string | null;
  workout_type: WorkoutType | null;
  activities: StepActivities | null;
  standard_alignment: string | null;
  star_reward: number;
  status: StepStatus;
  completed_at: string | null;
  created_at: string;
}

export interface LearningRoadmap {
  id: string;
  goal_id: string;
  student_id: string;
  teacher_id: string | null;
  status: RoadmapStatus;
  approved_at: string | null;
  created_at: string;
  roadmap_steps?: RoadmapStep[];
}

// ─── Phase 12E: Roadmap subgoals + teacher-only assessments ─────────────────

export interface RoadmapSubgoal {
  id: string;
  roadmap_id: string;
  sort_order: number;
  title: string;
  description: string | null;
  target_skill: string | null;
  standard_alignment: string | null;
  status: "active" | "completed";
  created_at: string;
}

export interface RoadmapAssessment {
  id: string;
  roadmap_id: string;
  subgoal_id: string | null;
  curriculum_id: string | null;
  title: string;
  curriculum_unit: string | null;
  standard_alignment: string | null;
  teacher_notes: string | null;
  progress_signal: Record<string, unknown> | null;
  created_at: string;
}

// ─── Phase 12: AI Lesson Engine ────────────────────────────────────────────

export type LessonTier = "below" | "at" | "above";
export type LessonSource = "library" | "roadmap";
export type LessonStatus = "active" | "completed" | "failed";

export interface Lesson {
  id: string;
  student_id: string;
  source: LessonSource;
  goal_id: string | null;
  roadmap_step_id: string | null;
  subject: string;
  topic: string;
  title: string;
  tier: LessonTier;
  standard_alignment: string | null;
  activities: StepActivities;
  star_reward: number;
  content_key: string;
  passage_key?: string | null;
  status: LessonStatus;
  score_pct: number | null;
  stars_awarded: number;
  attempts: number;
  created_at: string;
  completed_at: string | null;
}

export interface StudentSkillTier {
  id: string;
  student_id: string;
  goal_id: string | null;
  subject: string;
  tier: LessonTier;
  level?: number | null;
  lessons_completed?: number;
  win_streak: number;
  loss_streak: number;
  updated_at: string;
}

/** Per-question result the client sends to complete_lesson. */
export interface LessonResponse {
  question_index: number;
  difficulty: "easy" | "medium" | "hard";
  is_correct: boolean;
  response_time_ms: number | null;
}

/** Return shape of the complete_lesson RPC. */
export interface CompleteLessonResult {
  status: "completed" | "failed";
  stars_awarded: number;
  tier: LessonTier;
  level?: number;
}

// ─── Phase 12D: Curriculum ingestion ───────────────────────────────────────

export type CurriculumStatus = "pending" | "extracted" | "confirmed";

export interface CurriculumUnit {
  name: string;
  sequence_order: number;
  standards: string[];
  skills: string[];
}

export interface CurriculumExtract {
  units: CurriculumUnit[];
  notes: string | null;
}

export interface Curriculum {
  id: string;
  teacher_id: string;
  title: string;
  grade: string | null;
  subject: string | null;
  file_url: string | null;
  extracted: CurriculumExtract | null;
  status: CurriculumStatus;
  created_at: string;
}

// ─── Phase 13: Read-Aloud Fluency ──────────────────────────────────────────

export type FluencyLevel = "below" | "approaching" | "on";
export type FluencyStatus = "active" | "completed";

export interface FluencyMiscue {
  type: "substitution" | "omission" | "insertion";
  expected?: string;
  heard?: string;
  refIndex: number;
}

export interface FluencyAssessment {
  id: string;
  student_id: string;
  source: "library" | "roadmap";
  goal_id: string | null;
  subject: string;
  grade: string | null;
  passage_title: string;
  passage_text: string;
  passage_word_count: number;
  standard_alignment: string | null;
  content_key: string;
  status: FluencyStatus;
  best_wcpm: number | null;
  best_level: FluencyLevel | null;
  attempts: number;
  created_at: string;
  completed_at: string | null;
}

export interface FluencyAttempt {
  id: string;
  assessment_id: string;
  student_id: string;
  attempt_number: number;
  audio_path: string | null;
  transcript: string | null;
  duration_seconds: number | null;
  words_correct: number;
  words_read: number;
  substitutions: number;
  omissions: number;
  insertions: number;
  errors: number;
  wcpm: number;
  accuracy_pct: number | null;
  completion_pct: number | null;
  level: FluencyLevel | null;
  norm_p25: number | null;
  norm_p50: number | null;
  norm_season: string | null;
  norm_source: string | null;
  miscues: FluencyMiscue[] | null;
  feedback: string | null;
  stars_awarded: number;
  created_at: string;
}

/** Response from /api/fluency/score shown to the student after a read. */
export interface FluencyScoreResponse {
  attempt_number: number;
  feedback: string;
  focus_words: string[];
  stars_awarded: number;
  can_retry: boolean;
  wcpm: number;
  accuracy_pct: number | null;
  completion_pct: number | null;
  level: FluencyLevel | null;
  /** grade-level target (50th percentile WCPM), null when not normed */
  target_wcpm: number | null;
  /** first-read WCPM, present on a second read */
  prev_wcpm: number | null;
}

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
export type ItemType = "card" | "skin" | "gift";

export interface StarStoreItem {
  id: string;
  name: string;
  emoji: string;
  category: string;
  rarity: Rarity;
  star_cost: number;
  bio: string;
  item_type: ItemType;
  is_giftable: boolean;
}

export interface UserInventory {
  id: string;
  user_id: string;
  item_id: string;
  acquired_at: string;
  gifted_from_user_id: string | null;
  star_store_items?: StarStoreItem;
}

export interface StudentDataUpload {
  id: string;
  student_id: string;
  teacher_id: string;
  file_type: "pdf" | "csv";
  file_url: string;
  extracted_data: ExtractedReportCard | null;
  status: UploadStatus;
  uploaded_at: string;
}

// ─── Phase 10: IEP Tools ───────────────────────────────────────────────────

export type IepArea =
  | "ELA"
  | "Math"
  | "Writing"
  | "Behavior"
  | "Social-Emotional"
  | "Other";

export type IepProgressLevel =
  | "Emerging"
  | "Developing"
  | "Approaching"
  | "Meeting"
  | "Exceeding";

export interface IepProgressNote {
  id: string;
  progress_note: string;
  progress_level: IepProgressLevel;
  data_points: string[];
  created_at: string;
}

export interface IepGoal {
  id: string;
  student_id: string;
  teacher_id: string;
  goal_text: string;
  area: IepArea;
  baseline: string | null;
  target: string | null;
  measurement: string | null;
  standard: string | null;
  progress_notes: IepProgressNote[];
  shared_with_parent: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Phase 11: Parent Dashboard ───────────────────────────────────────────

export type ParentLinkStatus = "pending" | "approved" | "denied";

export interface ParentStudentLink {
  id: string;
  parent_id: string;
  student_id: string;
  teacher_id: string | null;
  status: ParentLinkStatus;
  created_at: string;
  updated_at: string;
}

export interface ParentMessage {
  id: string;
  teacher_id: string;
  parent_id: string;
  student_id: string;
  title: string;
  body_english: string;
  body_spanish: string | null;
  sent_at: string;
  read_at: string | null;
  created_at: string;
}

// ─── Phase 14: Writing Workshop ─────────────────────────────────────────────

export type WritingMode = "short_response" | "essay";

export interface PasteEvent {
  at: string; // ISO timestamp
  chars: number; // length of attempted paste
}

export interface WritingSubmission {
  id: string;
  student_id: string;
  assignment_id: string | null;
  mode: WritingMode;
  subject: string | null;
  grade: string | null;
  standard_alignment: string | null;
  passage_title: string | null;
  passage_text: string | null;
  prompt: string;
  response_text: string;
  rubric_max: number | null;
  score: number | null;
  strengths: string | null;
  feedback: string | null;
  improvement: string | null;
  status: "submitted" | "graded";
  paste_flagged: boolean;
  paste_events: PasteEvent[] | null;
  created_at: string;
  graded_at: string | null;
}

export interface CreativeStory {
  id: string;
  student_id: string;
  title: string;
  content: string;
  word_count: number;
  paste_flagged: boolean;
  paste_events: PasteEvent[] | null;
  created_at: string;
  updated_at: string;
}

export interface ModerationFlag {
  id: string;
  student_id: string;
  source_type: "writing_submission" | "creative_story";
  source_id: string | null;
  mode: string | null;
  excerpt: string | null;
  reason: string | null;
  categories: string | null;
  severity: "flag" | "block";
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}
