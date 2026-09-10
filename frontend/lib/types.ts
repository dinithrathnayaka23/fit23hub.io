export type UserRole = "STUDENT" | "ADMIN";
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
  uploader: {
    id: string;
    fullName: string;
    indexNo: string;
    role: UserRole;
  };
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
  | "ACCOUNT_DELETED";

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
