// ── Shared TypeScript interfaces for Conduit ──

// ── Projects ──
export type ProjectSource = "created" | "imported";
export type ProjectType = "node" | "python" | "rust" | "go" | "generic";

export interface Project {
  id: string;
  name: string;
  description: string;
  folder_path: string;
  system_prompt: string;
  append_system_prompt: string;
  default_model: string;
  default_permission_mode: string;
  max_sessions: number;
  source: ProjectSource;
  project_type: ProjectType;
  has_claude_history: number;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  folder_path: string;
  description?: string;
  system_prompt?: string;
  append_system_prompt?: string;
  default_model?: string;
  default_permission_mode?: string;
  max_sessions?: number;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  folder_path?: string;
  system_prompt?: string;
  append_system_prompt?: string;
  default_model?: string;
  default_permission_mode?: string;
  max_sessions?: number;
}

// ── Project Discovery ──
export interface DiscoveredProject {
  folder_path: string;
  name: string;
  has_claude_history: boolean;
  session_count: number;
  project_type: ProjectType;
  already_imported: boolean;
}

export interface ImportProjectInput {
  folder_path: string;
  name?: string;
  import_sessions?: boolean;
}

export interface BrowseEntry {
  name: string;
  path: string;
  has_claude_history: boolean;
  session_count: number;
  project_type: ProjectType;
  is_project: boolean;
  already_imported: boolean;
}

// ── Sessions ──
export type SessionStatus = "idle" | "starting" | "active" | "compacting" | "error" | "closed";

export interface Session {
  id: string;
  project_id: string;
  session_id: string;
  name: string;
  status: SessionStatus;
  model: string;
  cli_pid: number | null;
  ws_port: number | null;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  num_turns: number;
  error_message: string;
  created_at: string;
  last_active_at: string;
  closed_at: string | null;
}

export interface CreateSessionInput {
  name?: string;
  model?: string;
  permission_mode?: string;
  system_prompt?: string;
  resume_session_id?: string;
}

// ── Messages ──
export type MessageDirection = "inbound" | "outbound";

export interface Message {
  id: string;
  session_id: string;
  direction: MessageDirection;
  message_type: string;
  message_subtype: string;
  content: string;
  timestamp: string;
}

// ── Permissions ──
export type PermissionBehavior = "allow" | "deny";

export interface PermissionRule {
  id: string;
  project_id: string | null;
  tool_name: string;
  rule_content: string;
  behavior: PermissionBehavior;
  priority: number;
  created_at: string;
}

export interface CreatePermissionRuleInput {
  tool_name: string;
  rule_content?: string;
  behavior: PermissionBehavior;
  priority?: number;
}

export interface PermissionDecision {
  behavior: "allow" | "deny";
  updated_input?: Record<string, unknown>;
}

export interface PermissionLogEntry {
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

// ── Webhooks ──
export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string;
  secret: string;
  active: number;
  created_at: string;
}

// ── Events ──
export type EventType =
  | "session.created"
  | "session.status"
  | "session.message"
  | "session.result"
  | "session.error"
  | "session.closed"
  | "stream.event";

export interface ConduitEvent {
  type: EventType;
  session_id: string;
  data: unknown;
  timestamp: number;
}

// ── External WebSocket Protocol ──
export type ClientAction =
  | { action: "message"; content: string }
  | { action: "interrupt" }
  | { action: "set_model"; model: string }
  | { action: "set_permission_mode"; mode: string };

export type ServerEvent =
  | { event: "connected"; session_id: string }
  | { event: "system_init"; data: unknown }
  | { event: "assistant"; data: unknown }
  | { event: "stream_event"; data: unknown }
  | { event: "result"; data: unknown }
  | { event: "session_status"; status: string }
  | { event: "error"; message: string };
