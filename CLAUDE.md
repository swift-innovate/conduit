# CLAUDE.md — Conduit

> **Claude Code WebSocket Orchestration Platform**
> A standalone service that manages projects, spawns multiple Claude Code CLI sessions, and provides a dashboard UI and programmatic API for monitoring and controlling AI agent sessions.

---

## Project Overview

Conduit is a standalone service that leverages the Claude Code WebSocket SDK protocol (`--sdk-url`) to provide centralized, multi-project, multi-session orchestration of Claude Code CLI instances. It serves as a local monitoring and control dashboard consumable by humans (web UI) or external systems via REST/WebSocket API.

### Core Principles

- **Process isolation** — Conduit runs as an independent daemon. Each Claude Code CLI runs as a separate process. A crash in one session does not affect others.
- **Project-centric** — Every session belongs to a project. Projects map to filesystem folders (repos, codebases, workspaces). Claude Code CLI launches with `cwd` set to the project folder.
- **Multi-session** — Multiple concurrent Claude Code CLI sessions per project. Each session is an independent agent with its own conversation history, model, and permission context.
- **Default-allow permissions** — Conduit auto-allows all tool usage unless blocked by an explicit deny rule. No interactive permission approval, no pending queue, no timeout waiting for human input.
- **Local-only, no auth** — Designed for localhost use. No API key authentication required. All interfaces are open-access.
- **Dashboard monitoring** — The web UI is a read-only monitoring dashboard. Sessions are launched and managed but not interactively chatted with through the UI.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Conduit Service                      │
│                                                        │
│  ┌──────────┐  ┌───────────┐  ┌─────────────────────┐│
│  │  Web UI  │  │ REST API  │  │  External WS API    ││
│  │ (React)  │  │ /api/...  │  │  (consumers)        ││
│  └────┬─────┘  └─────┬─────┘  └──────────┬──────────┘│
│       └───────────────┼──────────────────┘            │
│                       ▼                                │
│  ┌────────────────────────────────────────────────┐   │
│  │              Core Engine                        │   │
│  │                                                 │   │
│  │  ┌──────────────┐  ┌───────────────────────┐   │   │
│  │  │ Project Mgr  │  │   Session Manager     │   │   │
│  │  │              │  │                       │   │   │
│  │  │ CRUD         │  │ Spawn CLI processes   │   │   │
│  │  │ Discovery    │  │ Track lifecycle       │   │   │
│  │  │ Import       │  │ Route messages        │   │   │
│  │  │ Folder maps  │  │ Handle reconnection   │   │   │
│  │  └──────────────┘  └───────────────────────┘   │   │
│  │                                                 │   │
│  │  ┌──────────────┐  ┌───────────────────────┐   │   │
│  │  │ Permission   │  │   Event Bus           │   │   │
│  │  │ Engine       │  │                       │   │   │
│  │  │              │  │ Internal pub/sub      │   │   │
│  │  │ Deny rules   │  │ Stream to UI/API      │   │   │
│  │  │ Allow rules  │  │ Audit logging         │   │   │
│  │  │ Auto-allow   │  │                       │   │   │
│  │  └──────────────┘  └───────────────────────┘   │   │
│  └────────────────────────────────────────────────┘   │
│                       │                                │
│  ┌────────────────────▼───────────────────────────┐   │
│  │         Claude Code CLI Process Pool            │   │
│  │                                                 │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐        │   │
│  │  │ CLI 1   │  │ CLI 2   │  │ CLI 3   │  ...   │   │
│  │  │ ←→ WS   │  │ ←→ WS   │  │ ←→ WS   │        │   │
│  │  │ Proj A  │  │ Proj A  │  │ Proj B  │        │   │
│  │  └─────────┘  └─────────┘  └─────────┘        │   │
│  └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### Key Data Flow

1. **Inbound** — External consumer (REST/WS) sends a message to a session
2. **Routing** — Core engine routes the message as a `user` type NDJSON message over the session's WebSocket to the corresponding Claude Code CLI
3. **Streaming** — CLI streams back `system`, `assistant`, `stream_event`, `tool_progress`, and `result` messages. Conduit relays these to all subscribers (UI, API consumers) via SSE or WebSocket
4. **Permissions** — When CLI sends a `control_request` (subtype `can_use_tool`), the Permission Engine evaluates deny rules first, then allow rules, then auto-allows if no rule matched
5. **Result** — `result` message marks turn completion. Session remains alive for multi-turn conversations

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Runtime** | Node.js + tsx | Standard runtime, tsx for TypeScript execution without compile step |
| **Server** | Hono + @hono/node-server | Lightweight framework, REST + WebSocket + SSE |
| **Web UI** | React + Vite + Tailwind CSS + Zustand | Dashboard monitoring UI with polling-based state |
| **Database** | SQLite (better-sqlite3) | Zero-config, file-based, synchronous API, perfect for standalone service |
| **Process Mgmt** | child_process.spawn | Manage Claude Code CLI subprocesses |
| **WebSocket** | ws + @hono/node-ws | ws for CLI bridge servers, @hono/node-ws for external consumer WebSocket |
| **Real-time** | WebSocket + Server-Sent Events | WS for bidirectional (external consumers), SSE for simple streaming |

---

## Project Structure

```
conduit/
├── CLAUDE.md                    # This file
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
│
├── src/
│   ├── index.ts                 # Entry point — @hono/node-server + @hono/node-ws
│   ├── config.ts                # Environment and configuration
│   │
│   ├── core/
│   │   ├── engine.ts            # Core orchestration engine
│   │   ├── project-manager.ts   # Project CRUD, discovery, import, folder browsing
│   │   ├── session-manager.ts   # Session lifecycle, CLI spawning
│   │   ├── permission-engine.ts # Deny/allow rule evaluation, auto-allow default, audit
│   │   ├── event-bus.ts         # Internal pub/sub for real-time streaming
│   │   └── types.ts             # Shared TypeScript interfaces
│   │
│   ├── bridge/
│   │   ├── ws-server.ts         # Per-session WebSocket server (ws library)
│   │   ├── ndjson.ts            # NDJSON parser/serializer
│   │   ├── message-router.ts    # Route messages by type field
│   │   ├── protocol.ts          # Protocol types from CLI v2.1.39
│   │   └── cli-launcher.ts      # Spawn CLI with child_process.spawn
│   │
│   ├── api/
│   │   ├── routes.ts            # Hono route registration
│   │   ├── projects.ts          # /api/projects + discover/import/browse + project sessions + project rules
│   │   ├── sessions.ts          # /api/sessions endpoints (active list, details, message, interrupt, kill, stream)
│   │   ├── permissions.ts       # /api/permissions endpoints (rules CRUD, audit log)
│   │   ├── health.ts            # /api/health endpoint
│   │   └── ws-external.ts       # External WebSocket handler for consumers
│   │
│   ├── db/
│   │   ├── database.ts          # better-sqlite3 connection and helpers
│   │   ├── schema.sql           # Table definitions
│   │   ├── migrations/          # Schema migrations (idempotent)
│   │   │   └── 001_add_project_discovery.sql
│   │   └── reset.ts             # Database reset script
│   │
│   └── utils/
│       ├── logger.ts            # Structured JSON logging
│       ├── errors.ts            # Error types and handlers
│       └── uuid.ts              # UUID generation (crypto.randomUUID)
│
├── ui/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx             # React entry point with BrowserRouter
│       ├── App.tsx              # Route definitions: /, /import, /projects/:id
│       ├── index.css            # Tailwind CSS base styles
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Layout.tsx          # Sidebar + Header + content shell
│       │   │   ├── Sidebar.tsx         # Navigation + project list + create/import
│       │   │   └── Header.tsx          # Connection status + cost summary
│       │   ├── dashboard/
│       │   │   ├── Dashboard.tsx       # Main dashboard: stats, active sessions, audit log, deny rules
│       │   │   ├── ProjectCard.tsx     # Project summary card
│       │   │   └── SystemHealth.tsx    # Health status, CLI/DB indicators, capacity bar
│       │   └── projects/
│       │       ├── ProjectList.tsx     # Project sessions table + new session button
│       │       ├── ProjectSettings.tsx # Project settings form (model, permission mode, etc.)
│       │       └── FolderBrowser.tsx   # Filesystem browser for importing projects
│       ├── stores/
│       │   └── app-store.ts           # Zustand store (projects, sessions, health, audit, deny rules)
│       └── lib/
│           ├── api-client.ts          # REST API client
│           └── utils.ts               # Formatting helpers (cn, formatCost, formatTokens, relativeTime)
│
├── protocol/
│   └── WEBSOCKET_PROTOCOL_REVERSED.md   # Reference protocol doc
│
└── data/
    └── conduit.db               # SQLite database (auto-created)
```

---

## Database Schema

```sql
-- Projects map to filesystem folders
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    folder_path TEXT NOT NULL,
    system_prompt TEXT DEFAULT '',
    append_system_prompt TEXT DEFAULT '',
    default_model TEXT DEFAULT '',
    default_permission_mode TEXT DEFAULT 'default',
    max_sessions INTEGER DEFAULT 5,
    source TEXT NOT NULL DEFAULT 'created',           -- 'created' or 'imported'
    project_type TEXT DEFAULT 'generic',              -- detected project type
    has_claude_history INTEGER DEFAULT 0,             -- had .claude/ on import
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Permission rules per project (or global when project_id is NULL)
CREATE TABLE IF NOT EXISTS permission_rules (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    rule_content TEXT DEFAULT '',
    behavior TEXT NOT NULL,                           -- 'allow' or 'deny'
    priority INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Active and historical sessions
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    name TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'idle',
    model TEXT DEFAULT '',
    cli_pid INTEGER,
    ws_port INTEGER,
    total_cost_usd REAL DEFAULT 0.0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    num_turns INTEGER DEFAULT 0,
    error_message TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT
);

-- Session message transcript
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    direction TEXT NOT NULL,
    message_type TEXT NOT NULL,
    message_subtype TEXT DEFAULT '',
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Permission decision audit log
CREATE TABLE IF NOT EXISTS permission_log (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_input TEXT NOT NULL,
    decision TEXT NOT NULL,
    decision_source TEXT NOT NULL,
    rule_id TEXT REFERENCES permission_rules(id),
    decided_by TEXT DEFAULT '',
    decided_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Webhook endpoints for async notifications
CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '[]',
    secret TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_permission_log_session ON permission_log(session_id);
CREATE INDEX IF NOT EXISTS idx_permission_rules_project ON permission_rules(project_id);
```

---

## REST API

### Projects

```
POST   /api/projects                    Create a project
GET    /api/projects                    List all projects
GET    /api/projects/:id                Get project details
PUT    /api/projects/:id                Update project settings
DELETE /api/projects/:id                Delete project (kills all sessions)
```

### Project Discovery & Import

```
GET    /api/projects/discover?path=...  Scan folder for Claude Code projects
POST   /api/projects/import             Import existing project folder
GET    /api/folders/browse?path=...     Browse filesystem directories
```

### Sessions

```
POST   /api/projects/:id/sessions       Launch new session in project
GET    /api/projects/:id/sessions        List sessions for project
GET    /api/sessions/active              List all active sessions across projects
GET    /api/sessions/:id                 Get session details
POST   /api/sessions/:id/message         Send message to session
POST   /api/sessions/:id/interrupt       Interrupt current turn
DELETE /api/sessions/:id                 Kill session and CLI process
GET    /api/sessions/:id/messages        Get message history (supports ?limit=N&offset=N)
GET    /api/sessions/:id/stream          SSE stream of session events
WS     /api/sessions/:id/ws              Full bidirectional WebSocket
```

### Permissions

```
GET    /api/projects/:id/rules           List permission rules for project
POST   /api/projects/:id/rules           Create project permission rule
GET    /api/rules/global                 List global permission rules
POST   /api/rules/global                 Create global permission rule
PUT    /api/rules/:id                    Update permission rule
DELETE /api/rules/:id                    Delete permission rule
GET    /api/permissions/log              Query audit log (supports ?session_id=...&limit=N&offset=N)
```

### System

```
GET    /api/health                       Service health check with detailed status
POST   /api/webhooks                     Register webhook
DELETE /api/webhooks/:id                 Remove webhook
```

#### Health Response

`GET /api/health` returns a detailed status object:

| Field | Description |
|---|---|
| `status` | Overall health: `"healthy"`, `"degraded"`, or `"unhealthy"` |
| `checks.cli_available` | Whether the Claude Code CLI binary is reachable |
| `checks.database_ok` | Whether the SQLite database is responsive |
| `checks.uptime_seconds` | Server uptime in seconds |
| `checks.session_capacity_pct` | Percentage of max global sessions currently in use |
| `checks.active_sessions` | Number of currently active sessions |
| `checks.max_sessions` | Maximum allowed concurrent sessions |
| `checks.projects` | Number of registered projects |
| `checks.event_subscribers` | Number of active event stream subscribers |
| `checks.version` | Conduit version string |

---

## WebSocket Protocol (External API)

External consumers connect to `/api/sessions/:id/ws` for bidirectional control:

```typescript
// Client → Conduit
{ action: "message", content: "string" }
{ action: "interrupt" }

// Conduit → Client
{ event: "connected", session_id: "string" }
{ event: "system_init", data: object }
{ event: "assistant", data: object }
{ event: "stream_event", data: object }
{ event: "result", data: object }
{ event: "session_status", status: "string" }
{ event: "error", message: "string" }
```

---

## CLI ↔ Bridge WebSocket Protocol

Each session gets a dedicated `ws` (npm library) server on a unique port. The CLI connects via `--sdk-url ws://localhost:{port}`. All communication is NDJSON over WebSocket frames.

### CLI → Server (Bridge) Messages

| type | subtype | Description |
|---|---|---|
| `system` | `init` | Sent BEFORE each turn (not once at connect). Contains session_id, model, tools, version, etc. |
| `assistant` | — | Assistant response with content array (text, tool_use, tool_result) |
| `stream_event` | — | Streaming events (partial tokens, progress) |
| `result` | `success` | Turn completion with `total_cost_usd`, `usage.input_tokens`, `usage.output_tokens`, `num_turns` |
| `control_request` | `can_use_tool` | Permission request with `request_id`, `request.tool_name`, `request.tool_input` |
| `tool_progress` | — | Tool execution progress |
| `keep_alive` | — | Keepalive pings (ignored) |

### Server (Bridge) → CLI Messages

| type | Description |
|---|---|
| `user` | Send a user message: `{ type: "user", message: { role: "user", content: "..." } }` |
| `control_response` | Permission response: `{ type: "control_response", response: { subtype: "can_use_tool_result", request_id: "...", result: { behavior: "allow"\|"deny" } } }` |
| `interrupt` | Interrupt the current turn: `{ type: "interrupt" }` |

### Key Protocol Notes (CLI v2.1.39)

- The CLI auto-sets `--print`, `--input-format=stream-json`, `--output-format=stream-json`, `--verbose` when `--sdk-url` is provided. These flags must NOT be passed explicitly.
- The CLI does NOT send any data on WebSocket connect. It silently connects and waits for user messages. The WebSocket connection event is the readiness signal.
- The `system` init message (type `"system"`, subtype `"init"`) is sent BEFORE each turn, not once at connection time.
- Permission requests use `type: "control_request"` with `request.subtype: "can_use_tool"` (not a bare `can_use_tool` type).
- Result messages carry `total_cost_usd` at top level and token counts inside `usage` object (not as flat fields).

---

## CLI Launcher

Each session spawns a Claude Code CLI process via `child_process.spawn`:

```typescript
const args = [
    "--sdk-url", `ws://localhost:${wsPort}`,
    // --print, --input-format, --output-format, --verbose are all
    // auto-set by CLI when --sdk-url is provided. NOT passed explicitly.
];

if (model) args.push("--model", model);
if (permissionMode) args.push("--permission-mode", permissionMode);
if (resumeSessionId) args.push("--resume", resumeSessionId);
if (forkSession) args.push("--fork-session");
if (systemPrompt) args.push("--system-prompt", systemPrompt);
if (appendSystemPrompt) args.push("--append-system-prompt", appendSystemPrompt);

spawn(config.cliPath, args, {
    cwd: project.folder_path,
    env: { ...process.env, CLAUDE_CODE_SESSION_ACCESS_TOKEN: config.sessionToken },
    stdio: ["pipe", "pipe", "pipe"],
});
```

Valid permission modes: `acceptEdits`, `bypassPermissions`, `default`, `delegate`, `dontAsk`, `plan`.

---

## Permission Engine Logic

```
Incoming control_request (can_use_tool)
  │
  ├─► Check project deny rules (highest priority)
  │     └─ Match? → DENY (log: auto_rule)
  │
  ├─► Check global deny rules
  │     └─ Match? → DENY (log: auto_rule)
  │
  ├─► Check project allow rules
  │     └─ Match? → ALLOW (log: auto_rule)
  │
  ├─► Check global allow rules
  │     └─ Match? → ALLOW (log: auto_rule)
  │
  └─► No rule matched → ALLOW (log: auto_default)
```

The permission engine is **default-allow** with deny-rule guardrails. There is no pending approval queue, no timeout, and no interactive human approval. Every permission request is resolved synchronously.

### Rule Matching

- **Tool name**: Exact match or `*` wildcard for all tools
- **Rule content**: Optional glob pattern matched against tool input
  - For `Bash` tools: pattern matched against `command`
  - For `Write`/`Edit`/`Read` tools: pattern matched against `file_path`
  - For other tools: pattern matched against JSON-stringified input
- **Prefix patterns**: `"git:*"` matches commands starting with `"git"`

### Permission Behaviors

Only two behaviors exist: `allow` and `deny`. There is no `ask` behavior.

---

## Configuration

### Environment Variables

```bash
# Server
CONDUIT_PORT=3100
CONDUIT_HOST=0.0.0.0
CONDUIT_DB_PATH=./data/conduit.db

# Claude Code
CONDUIT_CLI_PATH=claude
CLAUDE_CODE_SESSION_ACCESS_TOKEN=

# WebSocket Bridge
CONDUIT_WS_PORT_RANGE_START=9000
CONDUIT_WS_PORT_RANGE_END=9100

# Webhooks
CONDUIT_WEBHOOK_SECRET=

# Limits
CONDUIT_MAX_SESSIONS_GLOBAL=20
CONDUIT_PERMISSION_TIMEOUT_MS=300000
CONDUIT_SESSION_IDLE_TIMEOUT_MS=3600000

# Project Discovery
CONDUIT_PROJECT_ROOT=                     # Default root for folder browsing (default: user home)
CONDUIT_SCAN_DEPTH=2                      # How deep to scan for projects in discover mode

# Logging
LOG_LEVEL=info                            # debug, info, warn, error
```

---

## Development Commands

```bash
# Install dependencies
npm install
cd ui && npm install

# Start development server (with hot reload)
npm run dev

# Start UI development server
cd ui && npm run dev

# Type check
npx tsc --noEmit

# Build TypeScript
npm run build

# Start production server
npm start

# Database reset
npm run db:reset

# Run tests
npm test
```

---

## Session Lifecycle

1. **Create** — `POST /api/projects/:id/sessions` allocates a port, inserts a DB record, starts a bridge WS server, spawns the CLI process
2. **Starting** — CLI process launched, waiting for it to connect to the bridge WebSocket
3. **Idle** — CLI connected to bridge, ready to receive user messages. Session auto-generates a friendly name (e.g., "Swift Spark", "Calm Nexus")
4. **Active** — Processing a turn (user message sent, CLI is working). Transitions from idle when a user message is sent and CLI responds with system/init
5. **Error** — CLI process exited unexpectedly or failed to start. `error_message` field captures stderr output
6. **Closed** — Gracefully terminated via `DELETE /api/sessions/:id`

On startup, the session manager cleans up orphaned sessions from previous runs by killing any stale CLI processes and marking their sessions as `error`.

---

## Security Considerations

- **Local-only access** — Conduit is designed for localhost use. No API key authentication is required.
- **Audit everything** — Every permission decision is logged in the `permission_log` table with tool name, input, decision, source, and timestamp.
- **Input sanitization** — The `updatedInput` pattern allows Conduit to sanitize or modify tool arguments before execution via allow rules.
- **SQL column allowlists** — Dynamic UPDATE builders in `permission-engine.ts` and `project-manager.ts` use explicit column allowlists to prevent SQL injection via crafted field names.
- **Process isolation** — Each Claude Code CLI runs as a separate process. A crash in one doesn't affect others.
- **Token security** — `CLAUDE_CODE_SESSION_ACCESS_TOKEN` is never exposed via API. Stored in environment only.
- **Stderr capture** — CLI stderr is captured (capped at 4KB) for error reporting when sessions fail to start.

---

## TypeScript Types (key interfaces)

### Session Statuses
```typescript
type SessionStatus = "idle" | "starting" | "active" | "compacting" | "error" | "closed";
```

### Permission Types
```typescript
type PermissionBehavior = "allow" | "deny";

interface PermissionDecision {
  behavior: "allow" | "deny";
  updated_input?: Record<string, unknown>;
}
```

### External WebSocket Types
```typescript
type ClientAction =
  | { action: "message"; content: string }
  | { action: "interrupt" }
  | { action: "set_model"; model: string }
  | { action: "set_permission_mode"; mode: string };

type ServerEvent =
  | { event: "connected"; session_id: string }
  | { event: "system_init"; data: unknown }
  | { event: "assistant"; data: unknown }
  | { event: "stream_event"; data: unknown }
  | { event: "result"; data: unknown }
  | { event: "session_status"; status: string }
  | { event: "error"; message: string };
```

### Event Types
```typescript
type EventType =
  | "session.created"
  | "session.status"
  | "session.message"
  | "session.result"
  | "session.error"
  | "session.closed"
  | "stream.event";
```

---

## Changelog

### Recent Fixes

- **Fixed token/cost double-counting** — Session manager result handler now SETs `total_cost_usd`, `total_input_tokens`, and `total_output_tokens` from the result payload instead of incrementing, preventing inflated stats on multi-turn conversations.
- **CLI launch failure cleanup** — When a CLI process fails to start, the bridge WebSocket server is properly closed and the allocated port is released back to the pool.
- **SQL column allowlists** — Dynamic UPDATE builders in `permission-engine.ts` and `project-manager.ts` now validate column names against an explicit allowlist, closing a potential SQL injection vector.
- **NDJSON flush on WebSocket close** — The NDJSON parser now flushes its internal buffer when the WebSocket connection closes, preventing the final message from being silently dropped.
- **Orphaned CLI process cleanup** — On startup, the session manager checks for sessions with stale `cli_pid` values from previous runs and kills any still-running orphaned processes.

---

## Reference

- **Protocol Spec**: `protocol/WEBSOCKET_PROTOCOL_REVERSED.md`
- **Claude Code Docs**: https://docs.anthropic.com/en/docs/claude-code/overview
- **Hono Framework**: https://hono.dev
- **better-sqlite3**: https://github.com/WiseLibs/better-sqlite3
- **ws**: https://github.com/websockets/ws
