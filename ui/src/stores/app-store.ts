// ── Zustand state management ──

import { create } from "zustand";
import { api } from "../lib/api-client";

interface Project {
  id: string;
  name: string;
  description: string;
  folder_path: string;
  system_prompt: string;
  default_model: string;
  default_permission_mode: string;
  max_sessions: number;
  created_at: string;
  updated_at: string;
}

interface Session {
  id: string;
  project_id: string;
  session_id: string;
  name: string;
  status: string;
  model: string;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  num_turns: number;
  created_at: string;
  last_active_at: string;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    status: string;
    version: string;
    uptime_seconds: number;
    cli_available: boolean;
    database_ok: boolean;
    active_sessions: number;
    max_sessions: number;
    session_capacity_pct: number;
    projects: number;
    event_subscribers: number;
  };
}

interface AuditLogEntry {
  id: string;
  session_id: string;
  request_id: string;
  tool_name: string;
  tool_input: string;
  decision: string;
  decision_source: string;
  rule_id: string | null;
  decided_by: string;
  decided_at: string;
}

interface PermissionRule {
  id: string;
  project_id: string | null;
  tool_name: string;
  rule_content: string;
  behavior: string;
  priority: number;
  created_at: string;
}

interface AppState {
  // Projects
  projects: Project[];
  selectedProjectId: string | null;
  loadProjects: () => Promise<void>;
  selectProject: (id: string | null) => void;

  // Sessions
  sessions: Session[];
  loadSessions: (projectId: string) => Promise<void>;
  refreshSession: (id: string) => Promise<void>;
  updateSessionFields: (id: string, fields: Partial<Session>) => void;

  // Health
  health: HealthStatus | null;
  loadHealth: () => Promise<void>;

  // Dashboard
  allSessions: Session[];
  auditLog: AuditLogEntry[];
  denyRules: PermissionRule[];
  loadAllSessions: () => Promise<void>;
  loadAuditLog: () => Promise<void>;
  loadDenyRules: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Projects
  projects: [],
  selectedProjectId: null,
  async loadProjects() {
    const projects = await api.listProjects();
    set({ projects });
  },
  selectProject(id) {
    const current = get().selectedProjectId;
    if (id === current) {
      // Same project — just reload sessions, don't reset state
      if (id) get().loadSessions(id);
      return;
    }
    set({ selectedProjectId: id, sessions: [] });
    if (id) get().loadSessions(id);
  },

  // Sessions
  sessions: [],
  async loadSessions(projectId) {
    const sessions = await api.listSessions(projectId);
    set({ sessions });
  },
  async refreshSession(id) {
    const session = await api.getSession(id);
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? session : s)),
    }));
  },
  updateSessionFields(id, fields) {
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...fields } : s)),
    }));
  },

  // Health
  health: null,
  async loadHealth() {
    try {
      const health = await api.health();
      set({ health });
    } catch {
      set({ health: null });
    }
  },

  // Dashboard
  allSessions: [],
  auditLog: [],
  denyRules: [],
  async loadAllSessions() {
    try {
      const allSessions = await api.getActiveSessions();
      set({ allSessions });
    } catch {
      set({ allSessions: [] });
    }
  },
  async loadAuditLog() {
    try {
      const auditLog = await api.getAuditLog({ limit: 20 });
      set({ auditLog });
    } catch {
      set({ auditLog: [] });
    }
  },
  async loadDenyRules() {
    try {
      // Fetch global deny rules
      const globalRules = await api.getGlobalRules();
      const globalDeny = globalRules.filter((r: any) => r.behavior === "deny");

      // Fetch per-project deny rules for each project
      const projects = get().projects;
      const projectRuleArrays = await Promise.all(
        projects.map((p) => api.getProjectRules(p.id).catch(() => [] as any[])),
      );
      const projectDeny = projectRuleArrays.flat().filter((r: any) => r.behavior === "deny");

      set({ denyRules: [...globalDeny, ...projectDeny] });
    } catch {
      set({ denyRules: [] });
    }
  },
}));
