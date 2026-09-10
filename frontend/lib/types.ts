export type UserRole = "STUDENT" | "ADMIN" | "SUPER_ADMIN";

/** Both roles reach the admin console; only SUPER_ADMIN can change roles. */
export const ADMIN_ROLES: UserRole[] = ["ADMIN", "SUPER_ADMIN"];
export const isAdminRole = (role?: UserRole | null) => role === "ADMIN" || role === "SUPER_ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED";

export type User = {
  id: string;
  fullName: string;
  indexNo: string;
  email: string;
  profileImageUrl?: string | null;
  role: UserRole;
  status: UserStatus;
  suspensionReason?: string | null;
  emailVerifiedAt?: string | null;
  createdAt?: string;
  deletedAt?: string | null;
};

export type MaterialCategory =
  | "NOTES"
  | "LECTURE_SLIDES"
  | "LAB_SHEETS"
  | "TUTORIALS"
  | "PAPERS_AND_ANSWERS";

export type Material = {
  id: string;
  title: string;
  module: string;
  semester: number;
  academicYear: string;
  description?: string | null;
  category: MaterialCategory;
  fileUrl?: string | null;
  externalUrl?: string | null;
  createdAt: string;
  deletedAt?: string | null;
  uploader: {
    id: string;
    fullName: string;
    indexNo: string;
    role: UserRole;
  };
  deletedBy?: {
    id: string;
    fullName: string;
  } | null;
};

export type RecordedSession = {
  id: string;
  title: string;
  module: string;
  semester: number;
  academicYear: string;
  description?: string | null;
  videoUrl: string;
  createdAt: string;
  uploader: {
    id: string;
    fullName: string;
    role: UserRole;
  };
};

export type LiveSession = {
  id: string;
  title: string;
  module: string;
  semester: number;
  academicYear: string;
  description?: string | null;
  streamUrl: string;
  recordingUrl?: string | null;
  scheduledFor?: string | null;
  isLive: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  manager: {
    id: string;
    fullName: string;
    role: UserRole;
  };
};

export type NotificationType =
  | "WELCOME"
  | "MATERIAL_UPLOADED"
  | "RECORDING_PUBLISHED"
  | "LIVE_SCHEDULED"
  | "LIVE_STARTED"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_REACTIVATED"
  | "ROLE_CHANGED"
  | "PASSWORD_CHANGED"
  | "NEW_STUDENT_JOINED"
  | "ACCOUNT_DELETED"
  | "ANNOUNCEMENT_POSTED";

export type AnnouncementCategory =
  | "GENERAL"
  | "EXAM"
  | "DEADLINE"
  | "SCHEDULE_CHANGE"
  | "EVENT"
  | "RESOURCE";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  module?: string | null;
  linkUrl?: string | null;
  pinned: boolean;
  eventAt?: string | null;
  publishedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  deletedAt?: string | null;
  author: { id: string; fullName: string; role: UserRole };
  deletedBy?: { id: string; fullName: string } | null;
  /** Present on the student board only. */
  acknowledged?: boolean;
  acknowledgedCount: number;
};

export type AnnouncementReader = {
  id: string;
  fullName: string;
  indexNo: string;
  acknowledgedAt?: string;
};

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  actorName?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export type AiQuizQuestion = {
  q: string;
  options: string[];
  answerIndex: number;
  why?: string;
};

export type AiFlashcard = {
  front: string;
  back: string;
};

/** Which provider actually answered - useful for debugging fallback behaviour. */
export type AiAnswerMeta = {
  provider: string;
  model: string;
  latencyMs: number;
  fallbackDepth: number;
  cached: boolean;
};
