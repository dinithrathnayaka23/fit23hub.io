import type { AiAnswerMeta, AiFlashcard, AiQuizQuestion, Announcement, AnnouncementCategory, AnnouncementReader, AppNotification, LiveSession, Material, MaterialCategory, RecordedSession, User } from "./types";

export type AnnouncementInput = {
  title: string;
  body: string;
  category: AnnouncementCategory;
  module?: string;
  linkUrl?: string;
  pinned?: boolean;
  eventAt?: string;
  expiresAt?: string;
  publish?: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

/** Status 0 means the request never reached the server: offline, DNS, or timeout. */
export const isConnectionError = (error: unknown) => error instanceof ApiError && error.status === 0;

export const isAuthError = (error: unknown) => error instanceof ApiError && error.status === 401;

/** Turns anything thrown into a sentence that is safe to show a student. */
export function describeError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const REQUEST_TIMEOUT_MS = 20_000;
// Uploads legitimately take far longer than a normal request.
const UPLOAD_TIMEOUT_MS = 180_000;

const STATUS_MESSAGES: Record<number, string> = {
  400: "Some of those details were not valid. Check them and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You do not have permission to do that.",
  404: "We could not find what you were looking for.",
  409: "That conflicts with something that already exists.",
  413: "That file is too large to upload.",
  429: "Too many requests in a row. Wait a moment and try again.",
};

function messageForStatus(status: number) {
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (status >= 500) return "The server ran into a problem. Please try again in a moment.";
  return "That request could not be completed. Please try again.";
}

function connectionMessage(timedOut: boolean) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You are offline. Reconnect to the internet and try again.";
  }
  return timedOut
    ? "The server is taking too long to respond. Check your connection and try again."
    : "Cannot reach the FIT23Hub server. It may be restarting - try again in a moment.";
}

/** Reads the readable half of the double-submit CSRF pair. */
export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)fit23hub_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Credentials and the CSRF echo, applied identically to every call. */
function buildHeaders(options: RequestInit): Headers {
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const method = (options.method || "GET").toUpperCase();
  if (UNSAFE_METHODS.has(method)) {
    const csrf = readCsrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  return headers;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = buildHeaders(options);

  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.body instanceof FormData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      // Sends the httpOnly session cookie, including cross-origin.
      credentials: "include",
      signal: controller.signal,
    });
  } catch {
    // A request that never reached the server carries status 0, so callers can
    // tell "you are offline" apart from "the server said no".
    throw new ApiError(connectionMessage(controller.signal.aborted), 0, { offline: true });
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.message || messageForStatus(response.status), response.status, data);
  }

  return data as T;
}

export const api = {
  async register(input: { fullName: string; indexNo: string; email: string; password: string }) {
    return request<{
      message: string;
      email: string;
      requiresVerification: boolean;
      previewUrl?: string | null;
      verifyUrl?: string;
    }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async logout() {
    return request<{ message: string }>("/auth/logout", { method: "POST" });
  },

  async login(input: { email: string; password: string }) {
    return request<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async me() {
    return request<{ user: User }>("/auth/me", {});
  },

  async changePassword(payload: { currentPassword: string; newPassword: string }) {
    return request<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async forgotPassword(email: string) {
    return request<{ message: string; previewUrl?: string | null; resetUrl?: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async verifyResetToken(token: string) {
    return request<{ valid: boolean; email: string; fullName: string }>(
      `/auth/reset-password/${encodeURIComponent(token)}`,
    );
  },

  async resetPassword(payload: { token: string; newPassword: string }) {
    return request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async verifyEmailToken(token: string) {
    return request<{ valid: boolean; email: string; alreadyVerified: boolean }>(
      `/auth/verify-email/${encodeURIComponent(token)}`,
    );
  },

  async verifyEmail(token: string) {
    return request<{ message: string; email: string }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  async resendVerification(email: string) {
    return request<{ message: string; previewUrl?: string | null; verifyUrl?: string }>(
      "/auth/resend-verification",
      { method: "POST", body: JSON.stringify({ email }) },
    );
  },

  async deleteAccount(payload: { password: string; confirm: string }) {
    return request<{ message: string }>("/auth/account", {
      method: "DELETE",
      body: JSON.stringify(payload),
    });
  },

  async getNotifications(query?: { page?: number; pageSize?: number; filter?: "all" | "unread" }) {
    const params = new URLSearchParams();
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    if (query?.filter) params.set("filter", query.filter);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{
      notifications: AppNotification[];
      unread: number;
      pagination: PaginationMeta;
    }>(`/notifications${suffix}`, {});
  },

  async getUnreadNotificationCount() {
    return request<{ unread: number }>("/notifications/unread-count", {});
  },

  async markNotificationRead(id: string) {
    return request<{ message: string; unread: number }>(`/notifications/${id}/read`, { method: "PATCH" });
  },

  async markAllNotificationsRead() {
    return request<{ message: string; unread: number }>("/notifications/read-all", { method: "POST" });
  },

  async deleteNotification(id: string) {
    return request<{ message: string; unread: number }>(`/notifications/${id}`, { method: "DELETE" });
  },

  async clearNotifications() {
    return request<{ message: string; unread: number }>("/notifications", { method: "DELETE" });
  },

  async uploadProfileImage(file: File) {
    const formData = new FormData();
    formData.append("image", file);

    return request<{ user: User }>("/auth/profile-image", {
      method: "POST",
      body: formData,
    });
  },

  async getMaterials(query?: {
    q?: string;
    category?: string;
    module?: string;
    semester?: number;
    academicYear?: string;
    page?: number;
    pageSize?: number;
    sort?: "recent" | "oldest" | "title";
  }) {
    const params = new URLSearchParams();
    if (query?.q) params.set("q", query.q);
    if (query?.category) params.set("category", query.category);
    if (query?.module) params.set("module", query.module);
    if (query?.semester) params.set("semester", String(query.semester));
    if (query?.academicYear) params.set("academicYear", query.academicYear);
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    if (query?.sort) params.set("sort", query.sort);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{
      materials: Material[];
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    }>(`/materials${suffix}`, {});
  },

  async uploadMaterial(payload: {
    title: string;
    module: string;
    semester: number;
    academicYear: string;
    description?: string;
    category: MaterialCategory;
    externalUrl?: string;
    file?: File;
  }) {
    const formData = new FormData();
    formData.append("title", payload.title);
    formData.append("module", payload.module);
    formData.append("semester", String(payload.semester));
    formData.append("academicYear", payload.academicYear);
    formData.append("category", payload.category);
    if (payload.description) formData.append("description", payload.description);
    if (payload.externalUrl) formData.append("externalUrl", payload.externalUrl);
    if (payload.file) formData.append("file", payload.file);

    return request<{ material: Material }>("/materials", {
      method: "POST",
      body: formData,
    });
  },

  async deleteMaterial(id: string) {
    return request<{ message: string }>(`/materials/${id}`, { method: "DELETE" });
  },

  async getArchivedMaterials(query?: { page?: number; pageSize?: number }) {
    const params = new URLSearchParams();
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{ materials: Material[]; pagination: PaginationMeta }>(
      `/materials/admin/archived${suffix}`,
      {},
    );
  },

  async restoreMaterial(id: string) {
    return request<{ material: Material }>(`/materials/admin/${id}/restore`, { method: "POST" });
  },

  async purgeMaterial(id: string) {
    return request<{ message: string }>(`/materials/admin/${id}/purge`, { method: "DELETE" });
  },

  async getAnnouncements(query?: {
    category?: AnnouncementCategory;
    filter?: "upcoming" | "pending";
    page?: number;
    pageSize?: number;
  }) {
    const params = new URLSearchParams();
    if (query?.category) params.set("category", query.category);
    if (query?.filter) params.set("filter", query.filter);
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{ announcements: Announcement[]; pending: number; pagination: PaginationMeta }>(
      `/announcements${suffix}`,
      {},
    );
  },

  async getUpcomingAnnouncements(limit = 3) {
    return request<{ announcements: Announcement[] }>(`/announcements/upcoming?limit=${limit}`, {});
  },

  async acknowledgeAnnouncement(id: string) {
    return request<{ acknowledged: boolean; acknowledgedCount: number }>(
      `/announcements/${id}/acknowledge`,
      { method: "POST" },
    );
  },

  async adminAnnouncements(query?: { archived?: boolean; page?: number; pageSize?: number }) {
    const params = new URLSearchParams();
    if (query?.archived) params.set("archived", "true");
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{ announcements: Announcement[]; audience: number; pagination: PaginationMeta }>(
      `/announcements/admin/all${suffix}`,
      {},
    );
  },

  async createAnnouncement(payload: AnnouncementInput) {
    return request<{ announcement: Announcement }>("/announcements/admin", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateAnnouncement(id: string, payload: AnnouncementInput) {
    return request<{ announcement: Announcement }>(`/announcements/admin/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  async publishAnnouncement(id: string) {
    return request<{ announcement: Announcement }>(`/announcements/admin/${id}/publish`, { method: "POST" });
  },

  async unpublishAnnouncement(id: string) {
    return request<{ announcement: Announcement }>(`/announcements/admin/${id}/unpublish`, { method: "POST" });
  },

  async archiveAnnouncement(id: string) {
    return request<{ message: string }>(`/announcements/admin/${id}`, { method: "DELETE" });
  },

  async restoreAnnouncement(id: string) {
    return request<{ announcement: Announcement }>(`/announcements/admin/${id}/restore`, { method: "POST" });
  },

  async announcementReaders(id: string) {
    return request<{
      announcement: { id: string; title: string; publishedAt: string | null };
      acknowledged: AnnouncementReader[];
      pending: AnnouncementReader[];
      audience: number;
    }>(`/announcements/admin/${id}/acknowledgements`, {});
  },

  async getRecordedSessions(query?: { module?: string; semester?: number; academicYear?: string; page?: number; pageSize?: number }) {
    const params = new URLSearchParams();
    if (query?.module) params.set("module", query.module);
    if (query?.semester) params.set("semester", String(query.semester));
    if (query?.academicYear) params.set("academicYear", query.academicYear);
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{ sessions: RecordedSession[]; pagination: PaginationMeta }>(`/recordings${suffix}`, {});
  },

  async createRecordedSession(payload: { title: string; module: string; semester: number; academicYear: string; description?: string; videoUrl?: string; file?: File }) {
    const formData = new FormData();
    formData.append("title", payload.title);
    formData.append("module", payload.module);
    formData.append("semester", String(payload.semester));
    formData.append("academicYear", payload.academicYear);
    if (payload.description) formData.append("description", payload.description);
    if (payload.videoUrl) formData.append("videoUrl", payload.videoUrl);
    if (payload.file) formData.append("file", payload.file);

    return request<{ session: RecordedSession }>("/recordings", {
      method: "POST",
      body: formData,
    });
  },

  async deleteRecordedSession(id: string) {
    return request<{ message: string }>(`/recordings/${id}`, { method: "DELETE" });
  },

  async getLiveSessions(query?: { module?: string; semester?: number; academicYear?: string; page?: number; pageSize?: number }) {
    const params = new URLSearchParams();
    if (query?.module) params.set("module", query.module);
    if (query?.semester) params.set("semester", String(query.semester));
    if (query?.academicYear) params.set("academicYear", query.academicYear);
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{ sessions: LiveSession[]; pagination: PaginationMeta }>(`/live${suffix}`, {});
  },

  async createLiveSession(payload: { title: string; module: string; semester: number; academicYear: string; description?: string; streamUrl: string; scheduledFor?: string; recordingUrl?: string }) {
    return request<{ session: LiveSession }>("/live", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateLiveSession(id: string, payload: { title?: string; module?: string; semester?: number; academicYear?: string; description?: string; streamUrl?: string; scheduledFor?: string; recordingUrl?: string }) {
    return request<{ session: LiveSession }>(`/live/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  async setLiveStatus(id: string, isLive: boolean) {
    return request<{ session: LiveSession }>(`/live/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isLive }),
    });
  },

  async deleteLiveSession(id: string) {
    return request<{ message: string }>(`/live/${id}`, { method: "DELETE" });
  },

  async adminOverview() {
    return request<{ stats: Record<string, number> }>("/admin/overview", {});
  },

  async overview() {
    return request<{ stats: Record<string, number> }>("/overview", {});
  },

  async adminUsers(query?: { q?: string; page?: number; pageSize?: number }) {
    const params = new URLSearchParams();
    if (query?.q) params.set("q", query.q);
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{ users: User[]; pagination: PaginationMeta }>(`/admin/users${suffix}`, {});
  },

  async updateUser(id: string, payload: { role?: "STUDENT" | "ADMIN"; status?: "ACTIVE" | "SUSPENDED"; reason?: string }) {
    return request<{ user: User }>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async getArchivedUsers(query?: { page?: number; pageSize?: number }) {
    const params = new URLSearchParams();
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{ users: User[]; pagination: PaginationMeta }>(`/admin/users/archived${suffix}`, {});
  },

  async archiveUser(id: string) {
    return request<{ user: User; message: string }>(`/admin/users/${id}`, { method: "DELETE" });
  },

  async restoreUser(id: string) {
    return request<{ user: User }>(`/admin/users/${id}/restore`, { method: "POST" });
  },

  async askAi(prompt: string) {
    return request<{ response: string }>("/ai/query", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
  },

  async getAiSources() {
    return request<{ sources: Array<{
      id: string;
      title: string;
      module: string;
      semester: number;
      academicYear: string;
      description?: string | null;
      contentText: string;
      fileUrl?: string | null;
      projectId?: string | null;
      createdAt: string;
    }> }>("/ai/sources", {});
  },

  async getAiSourcesByProject(projectId: string) {
    const suffix = `?projectId=${encodeURIComponent(projectId)}`;
    return request<{ sources: Array<{
      id: string;
      title: string;
      module: string;
      semester: number;
      academicYear: string;
      description?: string | null;
      contentText: string;
      fileUrl?: string | null;
      projectId?: string | null;
      createdAt: string;
    }> }>(`/ai/sources${suffix}`, {});
  },

  async uploadAiSource(payload: {
    projectId?: string;
    title: string;
    module: string;
    semester: number;
    academicYear: string;
    description?: string;
    contentText?: string;
    file?: File;
  }) {
    const formData = new FormData();
    formData.append("title", payload.title);
    formData.append("module", payload.module);
    formData.append("semester", String(payload.semester));
    formData.append("academicYear", payload.academicYear);
    if (payload.projectId) formData.append("projectId", payload.projectId);
    if (payload.description) formData.append("description", payload.description);
    if (payload.contentText) formData.append("contentText", payload.contentText);
    if (payload.file) formData.append("file", payload.file);
    return request<{ source: { id: string } }>("/ai/sources", {
      method: "POST",
      body: formData,
    });
  },

  async getAiChats() {
    return request<{ chats: Array<{ id: string; title: string; projectId?: string | null; createdAt: string; updatedAt: string }> }>("/ai/chats", {});
  },

  async getAiChatsByProject(projectId: string) {
    const suffix = `?projectId=${encodeURIComponent(projectId)}`;
    return request<{ chats: Array<{ id: string; title: string; projectId?: string | null; createdAt: string; updatedAt: string }> }>(`/ai/chats${suffix}`, {});
  },

  async createAiChat(title?: string, projectId?: string) {
    return request<{ chat: { id: string; title: string; projectId?: string | null; createdAt: string; updatedAt: string } }>("/ai/chats", {
      method: "POST",
      body: JSON.stringify({ title, projectId }),
    });
  },

  async getAiProjects() {
    return request<{ projects: Array<{ id: string; name: string; description?: string | null; createdAt: string; updatedAt: string }> }>("/ai/projects", {});
  },

  async createAiProject(payload: { name: string; description?: string }) {
    return request<{ project: { id: string; name: string; description?: string | null; createdAt: string; updatedAt: string } }>("/ai/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getAiMessages(chatId: string) {
    return request<{ messages: Array<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
      citations: Array<{ id: string; title: string; module: string; academicYear: string; semester: number; excerpt: string; score: number }>;
    }> }>(`/ai/chats/${chatId}/messages`, {});
  },

  async askAiInChat(chatId: string, prompt: string) {
    return request<{
      response: string;
      message: {
        id: string;
        role: string;
        content: string;
        createdAt: string;
        citations: Array<{ id: string; title: string; module: string; academicYear: string; semester: number; excerpt: string; score: number }>;
      };
      degraded?: boolean;
      meta?: AiAnswerMeta | null;
    }>(`/ai/chats/${chatId}/query`, {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
  },

  async generateQuizInChat(chatId: string, payload?: { sourceId?: string; count?: number }) {
    return request<{
      response: string;
      message: {
        id: string;
        role: string;
        content: string;
        createdAt: string;
        citations: Array<{ id: string; title: string; module: string; academicYear: string; semester: number; excerpt: string; score: number }>;
      };
      quiz?: AiQuizQuestion[];
      degraded?: boolean;
      meta?: AiAnswerMeta | null;
    }>(`/ai/chats/${chatId}/quiz`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async generateFlashcardsInChat(chatId: string, payload?: { sourceId?: string; count?: number }) {
    return request<{
      response: string;
      message: {
        id: string;
        role: string;
        content: string;
        createdAt: string;
        citations: Array<{ id: string; title: string; module: string; academicYear: string; semester: number; excerpt: string; score: number }>;
      };
      flashcards?: AiFlashcard[];
      degraded?: boolean;
      meta?: AiAnswerMeta | null;
    }>(`/ai/chats/${chatId}/flashcards`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
};

/**
 * Streams the personal-data export to a file. This bypasses request() because
 * the endpoint returns an attachment rather than a JSON body.
 */
export async function downloadDataExport(): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/export-data`, {
    credentials: "include",
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.message || "Failed to export your data", response.status, data);
  }

  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] || "fit23hub-data-export.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

type StreamHandlers = {
  onMeta?: (citations: unknown[]) => void;
  onToken?: (chunk: string) => void;
  onDone?: (payload: {
    degraded?: boolean;
    truncated?: boolean;
    meta?: AiAnswerMeta | null;
    message?: unknown;
  }) => void;
  onError?: (message: string) => void;
};

/**
 * Streams an answer over SSE, decoding the frames by hand because EventSource
 * cannot send a POST body or custom headers. Throws ApiError if the
 * stream never opens, so the caller can fall back to the plain endpoint.
 */
export async function askAiInChatStream(
  chatId: string,
  prompt: string,
  handlers: StreamHandlers = {},
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/ai/chats/${chatId}/query/stream`, {
    method: "POST",
    signal,
    credentials: "include",
    headers: buildHeaders({ method: "POST" }),
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.message || "Failed to start the answer stream", response.status, data);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleFrame = (frame: string) => {
    let event = "message";
    const dataLines: string[] = [];

    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }

    if (!dataLines.length) return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(dataLines.join("\n"));
    } catch {
      return;
    }

    if (event === "token") handlers.onToken?.(String(payload.t ?? ""));
    else if (event === "meta") handlers.onMeta?.((payload.citations as unknown[]) || []);
    else if (event === "done") handlers.onDone?.(payload as Parameters<NonNullable<StreamHandlers["onDone"]>>[0]);
    else if (event === "error") handlers.onError?.(String(payload.message ?? "Stream failed"));
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    frames.forEach(handleFrame);
  }

  if (buffer.trim()) handleFrame(buffer);
}

export function resolveAssetUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `${API_BASE.replace(/\/api$/, "")}${url}`;
}
