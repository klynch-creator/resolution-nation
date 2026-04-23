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
