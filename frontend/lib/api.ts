import type { LiveSession, Material, MaterialCategory, RecordedSession, User } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
type PaginationMeta = { page: number; pageSize: number; total: number; totalPages: number };

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = `${API_BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(`Cannot connect to backend API (${API_BASE}). Check backend server and NEXT_PUBLIC_API_URL.`);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data as T;
}

export const api = {
  async register(input: { fullName: string; indexNo: string; email: string; password: string }) {
    return request<{ user: User; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async login(input: { email: string; password: string }) {
    return request<{ user: User; token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async me(token: string) {
    return request<{ user: User }>("/auth/me", {}, token);
  },

  async uploadProfileImage(token: string, file: File) {
    const formData = new FormData();
    formData.append("image", file);

    return request<{ user: User }>("/auth/profile-image", {
      method: "POST",
      body: formData,
    }, token);
  },

  async getMaterials(token: string, query?: {
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
    }>(`/materials${suffix}`, {}, token);
  },

  async uploadMaterial(token: string, payload: {
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
    }, token);
  },

  async deleteMaterial(token: string, id: string) {
    return request<{ message: string }>(`/materials/${id}`, { method: "DELETE" }, token);
  },

  async getRecordedSessions(token: string, query?: { module?: string; semester?: number; academicYear?: string; page?: number; pageSize?: number }) {
    const params = new URLSearchParams();
    if (query?.module) params.set("module", query.module);
    if (query?.semester) params.set("semester", String(query.semester));
    if (query?.academicYear) params.set("academicYear", query.academicYear);
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{ sessions: RecordedSession[]; pagination: PaginationMeta }>(`/recordings${suffix}`, {}, token);
  },

  async createRecordedSession(token: string, payload: { title: string; module: string; semester: number; academicYear: string; description?: string; videoUrl?: string; file?: File }) {
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
    }, token);
  },

  async deleteRecordedSession(token: string, id: string) {
    return request<{ message: string }>(`/recordings/${id}`, { method: "DELETE" }, token);
  },

  async getLiveSessions(token: string, query?: { module?: string; semester?: number; academicYear?: string; page?: number; pageSize?: number }) {
    const params = new URLSearchParams();
    if (query?.module) params.set("module", query.module);
    if (query?.semester) params.set("semester", String(query.semester));
    if (query?.academicYear) params.set("academicYear", query.academicYear);
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{ sessions: LiveSession[]; pagination: PaginationMeta }>(`/live${suffix}`, {}, token);
  },

  async createLiveSession(token: string, payload: { title: string; module: string; semester: number; academicYear: string; description?: string; streamUrl: string; scheduledFor?: string; recordingUrl?: string }) {
    return request<{ session: LiveSession }>("/live", {
      method: "POST",
      body: JSON.stringify(payload),
    }, token);
  },

  async updateLiveSession(token: string, id: string, payload: { title?: string; module?: string; semester?: number; academicYear?: string; description?: string; streamUrl?: string; scheduledFor?: string; recordingUrl?: string }) {
    return request<{ session: LiveSession }>(`/live/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }, token);
  },

  async setLiveStatus(token: string, id: string, isLive: boolean) {
    return request<{ session: LiveSession }>(`/live/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isLive }),
    }, token);
  },

  async deleteLiveSession(token: string, id: string) {
    return request<{ message: string }>(`/live/${id}`, { method: "DELETE" }, token);
  },

  async adminOverview(token: string) {
    return request<{ stats: Record<string, number> }>("/admin/overview", {}, token);
  },

  async overview(token: string) {
    return request<{ stats: Record<string, number> }>("/overview", {}, token);
  },

  async adminUsers(token: string, query?: { q?: string; page?: number; pageSize?: number }) {
    const params = new URLSearchParams();
    if (query?.q) params.set("q", query.q);
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<{ users: User[]; pagination: PaginationMeta }>(`/admin/users${suffix}`, {}, token);
  },

  async updateUser(token: string, id: string, payload: { role?: "STUDENT" | "ADMIN"; status?: "ACTIVE" | "SUSPENDED" }) {
    return request<{ user: User }>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }, token);
  },

  async askAi(token: string, prompt: string) {
    return request<{ response: string }>("/ai/query", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }, token);
  },

  async getAiSources(token: string) {
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
    }> }>("/ai/sources", {}, token);
  },

  async getAiSourcesByProject(token: string, projectId: string) {
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
    }> }>(`/ai/sources${suffix}`, {}, token);
  },

  async uploadAiSource(token: string, payload: {
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
    }, token);
  },

  async getAiChats(token: string) {
    return request<{ chats: Array<{ id: string; title: string; projectId?: string | null; createdAt: string; updatedAt: string }> }>("/ai/chats", {}, token);
  },

  async getAiChatsByProject(token: string, projectId: string) {
    const suffix = `?projectId=${encodeURIComponent(projectId)}`;
    return request<{ chats: Array<{ id: string; title: string; projectId?: string | null; createdAt: string; updatedAt: string }> }>(`/ai/chats${suffix}`, {}, token);
  },

  async createAiChat(token: string, title?: string, projectId?: string) {
    return request<{ chat: { id: string; title: string; projectId?: string | null; createdAt: string; updatedAt: string } }>("/ai/chats", {
      method: "POST",
      body: JSON.stringify({ title, projectId }),
    }, token);
  },

  async getAiProjects(token: string) {
    return request<{ projects: Array<{ id: string; name: string; description?: string | null; createdAt: string; updatedAt: string }> }>("/ai/projects", {}, token);
  },

  async createAiProject(token: string, payload: { name: string; description?: string }) {
    return request<{ project: { id: string; name: string; description?: string | null; createdAt: string; updatedAt: string } }>("/ai/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    }, token);
  },

  async getAiMessages(token: string, chatId: string) {
    return request<{ messages: Array<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
      citations: Array<{ id: string; title: string; module: string; academicYear: string; semester: number; excerpt: string; score: number }>;
    }> }>(`/ai/chats/${chatId}/messages`, {}, token);
  },

  async askAiInChat(token: string, chatId: string, prompt: string) {
    return request<{
      response: string;
      message: {
        id: string;
        role: string;
        content: string;
        createdAt: string;
        citations: Array<{ id: string; title: string; module: string; academicYear: string; semester: number; excerpt: string; score: number }>;
      };
    }>(`/ai/chats/${chatId}/query`, {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }, token);
  },

  async generateQuizInChat(token: string, chatId: string, payload?: { sourceId?: string; count?: number }) {
    return request<{
      response: string;
      message: {
        id: string;
        role: string;
        content: string;
        createdAt: string;
        citations: Array<{ id: string; title: string; module: string; academicYear: string; semester: number; excerpt: string; score: number }>;
      };
    }>(`/ai/chats/${chatId}/quiz`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }, token);
  },

  async generateFlashcardsInChat(token: string, chatId: string, payload?: { sourceId?: string; count?: number }) {
    return request<{
      response: string;
      message: {
        id: string;
        role: string;
        content: string;
        createdAt: string;
        citations: Array<{ id: string; title: string; module: string; academicYear: string; semester: number; excerpt: string; score: number }>;
      };
    }>(`/ai/chats/${chatId}/flashcards`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }, token);
  },
};

export function resolveAssetUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `${API_BASE.replace(/\/api$/, "")}${url}`;
}
