export type Role = "teacher" | "student" | "parent";
export type PodType = "family" | "class" | "team";
export type PodMemberRole = "admin" | "member" | "viewer";
export type UploadStatus = "pending" | "reviewed" | "confirmed";
export type GoalPriority = "critical" | "high" | "medium";
export type GoalStatus = "not_started" | "in_progress" | "completed";
export type GoalSubject = "ELA" | "Math" | "Science" | "Social Studies" | "Writing" | "Other";

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
  created_at: string;
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

export interface StepActivities {
  questions: RoadmapQuestion[];
}

export interface RoadmapStep {
  id: string;
  roadmap_id: string;
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

export type IepArea = "ELA" | "Math" | "Writing" | "Behavior" | "Social-Emotional" | "Other";
export type IepProgressLevel = "Emerging" | "Developing" | "Approaching" | "Meeting" | "Exceeding";

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
  created_at: string;
  updated_at: string;
}

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
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
