// ── REST API client ──

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Health
  health: () => request<any>("/health"),
  // Projects
  listProjects: () => request<any[]>("/projects"),
  getProject: (id: string) => request<any>(`/projects/${id}`),
  createProject: (data: any) => request<any>("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: any) => request<any>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<any>(`/projects/${id}`, { method: "DELETE" }),

  // Project Discovery / Import / Browse
  discoverProjects: (path: string) => request<any[]>(`/projects/discover?path=${encodeURIComponent(path)}`),
  importProject: (data: { folder_path: string; name?: string; import_sessions?: boolean }) =>
    request<any>("/projects/import", { method: "POST", body: JSON.stringify(data) }),
  browseFolders: (path?: string) => {
    const qs = path ? `?path=${encodeURIComponent(path)}` : "";
    return request<{ path: string; entries: any[] }>(`/folders/browse${qs}`);
  },

  // Sessions
  getActiveSessions: () => request<any[]>("/sessions/active"),
  listSessions: (projectId: string) => request<any[]>(`/projects/${projectId}/sessions`),
  getSession: (id: string) => request<any>(`/sessions/${id}`),
  createSession: (projectId: string, data?: any) => request<any>(`/projects/${projectId}/sessions`, { method: "POST", body: JSON.stringify(data ?? {}) }),
  killSession: (sessionId: string) => request<any>(`/sessions/${sessionId}`, { method: "DELETE" }),

  // Rules
  getProjectRules: (projectId: string) => request<any[]>(`/projects/${projectId}/rules`),
  createProjectRule: (projectId: string, data: any) => request<any>(`/projects/${projectId}/rules`, { method: "POST", body: JSON.stringify(data) }),
  getGlobalRules: () => request<any[]>("/rules/global"),
  createGlobalRule: (data: any) => request<any>("/rules/global", { method: "POST", body: JSON.stringify(data) }),
  updateRule: (ruleId: string, data: any) => request<any>(`/rules/${ruleId}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRule: (ruleId: string) => request<any>(`/rules/${ruleId}`, { method: "DELETE" }),

  // Audit log
  getAuditLog: (params?: { session_id?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.session_id) qs.set("session_id", params.session_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    return request<any[]>(`/permissions/log?${qs}`);
  },
};
