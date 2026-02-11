# Conduit API Reference

> **Version:** 0.1.0 | **Base URL:** `http://localhost:3100/api` | **Transport:** REST + SSE + WebSocket

Conduit is a local-network Claude Code orchestration platform. It manages projects, spawns Claude Code CLI sessions, enforces deny-rule guardrails on tool permissions, and streams real-time events to consumers (Web UI, VALOR, OpenClaw, etc.).

---

## Table of Contents

- [Quick Start](#quick-start)
- [Error Handling](#error-handling)
- [Health](#health)
- [Projects](#projects)
- [Discovery & Import](#discovery--import)
- [Sessions](#sessions)
- [Messages & Streaming](#messages--streaming)
- [Permissions](#permissions)
- [Permission Rules](#permission-rules)
- [WebSocket Protocol](#websocket-protocol)
- [Event Types](#event-types)
- [Session Lifecycle](#session-lifecycle)
- [Agent Integration Guide](#agent-integration-guide)
- [Configuration](#configuration)

---

## Quick Start

A minimal workflow -- create a project, launch a session, and monitor it:

```bash
# 1. Create a project
curl -X POST http://localhost:3100/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "my-repo", "folder_path": "/home/user/my-repo"}'
# Returns: { "id": "abc123", "name": "my-repo", ... }

# 2. Launch a session in the project
curl -X POST http://localhost:3100/api/projects/abc123/sessions \
  -H "Content-Type: application/json" \
  -d '{}'
# Returns: { "id": "sess456", "status": "starting", ... }

# 3. Send a message to the session
curl -X POST http://localhost:3100/api/sessions/sess456/message \
  -H "Content-Type: application/json" \
  -d '{"content": "List the files in this project"}'
# Returns: { "ok": true }

# 4. Stream results via SSE
curl -N http://localhost:3100/api/sessions/sess456/stream
# Receives: event: connected\ndata: {"session_id":"sess456"}\n\n

# 5. Check all active sessions across projects
curl http://localhost:3100/api/sessions/active
# Returns: [{ "id": "sess456", "status": "active", ... }]

# 6. Check service health
curl http://localhost:3100/api/health
# Returns: { "status": "healthy", ... }

# 7. Kill the session when done
curl -X DELETE http://localhost:3100/api/sessions/sess456
# Returns: { "ok": true }
```

All tool-use permissions are **auto-approved by default**. Add deny rules to block specific tools or patterns -- see [Permissions](#permissions).

---

## Error Handling

All errors follow a consistent shape:

```json
{
  "error": "NOT_FOUND",
  "message": "Session not found: abc-123"
}
```

| Status | Code               | Meaning                                |
|--------|--------------------|----------------------------------------|
| 400    | `VALIDATION_ERROR` | Invalid input, missing required fields |
| 404    | `NOT_FOUND`        | Resource does not exist                |
| 409    | `CONFLICT`         | Duplicate resource or limit reached    |
| 500    | `INTERNAL_ERROR`   | Unexpected server error                |

---

## Health

### Health Check

```
GET /api/health
```

Returns service status and aggregate statistics. Returns HTTP 200 when healthy or degraded, HTTP 503 when unhealthy.

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2026-02-10T19:29:13.767Z",
  "checks": {
    "status": "healthy",
    "version": "0.1.0",
    "uptime_seconds": 3600,
    "cli_available": true,
    "database_ok": true,
    "active_sessions": 3,
    "max_sessions": 20,
    "session_capacity_pct": 15,
    "projects": 5,
    "event_subscribers": 2
  }
}
```

| Field | Type | Description |
|---|---|---|
| `status` | `string` | Top-level status: `"healthy"`, `"degraded"`, or `"unhealthy"` |
| `timestamp` | `string` | ISO 8601 timestamp of the response |
| `checks.version` | `string` | Conduit version |
| `checks.uptime_seconds` | `number` | Seconds since engine started |
| `checks.cli_available` | `boolean` | Whether Claude Code CLI was found at startup |
| `checks.database_ok` | `boolean` | Whether SQLite is responding to queries |
| `checks.active_sessions` | `number` | Currently running CLI sessions |
| `checks.max_sessions` | `number` | Global session limit |
| `checks.session_capacity_pct` | `number` | Percentage of session capacity used (0-100) |
| `checks.projects` | `number` | Total project count |
| `checks.event_subscribers` | `number` | Active event stream subscribers (SSE + WebSocket) |

**Status logic:**
- `unhealthy` -- database down or CLI not available (returns HTTP 503)
- `degraded` -- capacity above 80%
- `healthy` -- all systems nominal

---

## Projects

A **project** maps to a filesystem folder containing source code. Projects track configuration for Claude Code sessions including system prompts, default models, and permission policies.

### Project Object

| Field                     | Type    | Description                                              |
|---------------------------|---------|----------------------------------------------------------|
| `id`                      | string  | UUID                                                     |
| `name`                    | string  | Display name (auto-humanized from folder name on import) |
| `description`             | string  | Optional description                                     |
| `folder_path`             | string  | Absolute filesystem path                                 |
| `system_prompt`           | string  | Prepended to every session                               |
| `append_system_prompt`    | string  | Appended after the default system prompt                 |
| `default_model`           | string  | Model for new sessions (e.g. `claude-sonnet-4-5-20250929`)  |
| `default_permission_mode` | string  | `default`, `plan`, or `acceptEdits`                      |
| `max_sessions`            | integer | Per-project session limit                                |
| `source`                  | string  | `created` or `imported`                                  |
| `project_type`            | string  | Auto-detected: `node`, `python`, `rust`, `go`, `generic` |
| `has_claude_history`      | integer | `1` if `.claude/` directory existed at import            |
| `created_at`              | string  | ISO 8601 timestamp                                       |
| `updated_at`              | string  | ISO 8601 timestamp                                       |

### List Projects

```
GET /api/projects
```

**Response:** `200` Array of Project objects.

### Get Project

```
GET /api/projects/:id
```

**Response:** `200` Single Project object.

**Error:** `404` if project does not exist.

### Create Project

```
POST /api/projects
```

**Body:**

```json
{
  "name": "My Project",
  "folder_path": "/home/user/my-project",
  "description": "Optional description",
  "system_prompt": "You are a helpful assistant.",
  "append_system_prompt": "",
  "default_model": "claude-sonnet-4-5-20250929",
  "default_permission_mode": "default",
  "max_sessions": 5
}
```

| Field                     | Required | Default     |
|---------------------------|----------|-------------|
| `name`                    | Yes      |             |
| `folder_path`             | Yes      |             |
| `description`             | No       | `""`        |
| `system_prompt`           | No       | `""`        |
| `append_system_prompt`    | No       | `""`        |
| `default_model`           | No       | `""`        |
| `default_permission_mode` | No       | `"default"` |
| `max_sessions`            | No       | `5`         |

**Response:** `201` with created Project object.

### Update Project

```
PUT /api/projects/:id
```

**Body:** Any subset of `name`, `description`, `folder_path`, `system_prompt`, `append_system_prompt`, `default_model`, `default_permission_mode`, `max_sessions`.

**Response:** `200` Updated Project object.

**Error:** `404` if project does not exist.

### Delete Project

```
DELETE /api/projects/:id
```

Kills all active sessions for the project before deletion. Cascades to sessions, messages, and permission rules.

**Response:** `200` `{ "ok": true }`

---

## Discovery & Import

Conduit can scan your filesystem to discover and import existing project folders.

### Browse Folders

```
GET /api/folders/browse?path=/home/user/repos
```

Lists directories at the given path with project detection metadata. If `path` is omitted, defaults to `CONDUIT_PROJECT_ROOT` or the user's home directory.

**Response:**

```json
{
  "path": "/home/user/repos",
  "entries": [
    {
      "name": "conduit",
      "path": "/home/user/repos/conduit",
      "is_project": true,
      "project_type": "node",
      "has_claude_history": true,
      "session_count": 3,
      "already_imported": false
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `path` | `string` | Resolved absolute path that was browsed |
| `entries[].name` | `string` | Directory name |
| `entries[].path` | `string` | Absolute path |
| `entries[].is_project` | `boolean` | Whether it looks like a project (has project markers) |
| `entries[].project_type` | `string` | Detected type: `node`, `python`, `rust`, `go`, `generic` |
| `entries[].has_claude_history` | `boolean` | Has `.claude/` directory |
| `entries[].session_count` | `number` | Claude sessions found in `.claude/projects/` |
| `entries[].already_imported` | `boolean` | Already registered in Conduit |

Sorted: projects first, then alphabetical. Hidden directories and `node_modules`/`dist`/`build`/`__pycache__` are excluded.

### Discover Projects

```
GET /api/projects/discover?path=/home/user/repos
```

Recursively scans up to `CONDUIT_SCAN_DEPTH` (default: 2) levels deep, returning all directories that contain recognized project markers (`.git`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `.claude/`).

**Query parameters:**

| Parameter | Required | Description |
|---|---|---|
| `path` | Yes | Absolute path to scan |

**Response:** `200` Array of discovered projects:

```json
[
  {
    "folder_path": "/home/user/repos/conduit",
    "name": "Conduit",
    "project_type": "node",
    "has_claude_history": true,
    "session_count": 3,
    "already_imported": false
  }
]
```

| Field | Type | Description |
|---|---|---|
| `folder_path` | `string` | Absolute path to discovered project |
| `name` | `string` | Inferred project name (directory name) |
| `has_claude_history` | `boolean` | Whether `.claude/` directory exists |
| `session_count` | `number` | Number of existing Claude sessions found |
| `project_type` | `string` | Detected type: `node`, `python`, `rust`, `go`, `generic` |
| `already_imported` | `boolean` | Whether this folder is already registered as a project |

**Error:** `400` if `path` query parameter is missing.

### Import Project

```
POST /api/projects/import
```

**Body:**

```json
{
  "folder_path": "/home/user/repos/my-project",
  "name": "My Project",
  "import_sessions": true
}
```

| Field             | Required | Default                                                   |
|-------------------|----------|-----------------------------------------------------------|
| `folder_path`     | Yes      |                                                           |
| `name`            | No       | Humanized folder name (e.g. `my-project` -> `My Project`) |
| `import_sessions` | No       | `false` -- if `true`, imports `.claude/projects/` session IDs as closed sessions that can be resumed |

**Response:** `201` with created Project object (with `source: "imported"`).

**Errors:**
- `409` if the folder path is already imported
- `400` if `folder_path` is missing or the folder doesn't exist

---

## Sessions

A **session** wraps a single Claude Code CLI process. Conduit spawns the process, bridges communication via WebSocket, and tracks cost/token metrics.

### Session Object

| Field                | Type         | Description                                          |
|----------------------|--------------|------------------------------------------------------|
| `id`                 | string       | Conduit's session UUID                               |
| `project_id`         | string       | Parent project UUID                                  |
| `session_id`         | string       | Claude Code's internal session ID (set after init)   |
| `name`               | string       | Friendly name                                        |
| `status`             | string       | See [Session Lifecycle](#session-lifecycle)           |
| `model`              | string       | Model in use                                         |
| `cli_pid`            | integer/null | OS process ID of the CLI                             |
| `ws_port`            | integer/null | Internal WebSocket bridge port                       |
| `total_cost_usd`     | number       | Accumulated API cost                                 |
| `total_input_tokens` | integer      | Accumulated input tokens                             |
| `total_output_tokens`| integer      | Accumulated output tokens                            |
| `num_turns`          | integer      | Number of completed turns                            |
| `error_message`      | string       | Error description if status is `error`, empty otherwise |
| `created_at`         | string       | ISO 8601                                             |
| `last_active_at`     | string       | ISO 8601, updated on each message/turn               |
| `closed_at`          | string/null  | ISO 8601, set when session ends                      |

### List Sessions for Project

```
GET /api/projects/:projectId/sessions
```

**Response:** `200` Array of Session objects.

### List Active Sessions

```
GET /api/sessions/active
```

Returns all active sessions across all projects. Active sessions are those with status not in `closed` or `error`.

**Response:** `200` Array of Session objects, ordered by `last_active_at` descending.

### Create Session

```
POST /api/projects/:projectId/sessions
```

**Body (all optional):**

```json
{
  "name": "Custom Session Name",
  "model": "claude-sonnet-4-5-20250929",
  "permission_mode": "plan",
  "system_prompt": "You are a helpful assistant.",
  "resume_session_id": "existing-claude-session-uuid"
}
```

| Field               | Default                             | Description                         |
|---------------------|-------------------------------------|-------------------------------------|
| `name`              | `""` (empty string)                 | Display name for the session        |
| `model`             | Project's `default_model`           | Claude model to use                 |
| `permission_mode`   | Project's `default_permission_mode` | CLI permission mode                 |
| `system_prompt`     | `""`                                | Override system prompt               |
| `resume_session_id` | None (starts fresh session)         | Resume an existing Claude Code session by its UUID |

Creates a session record, allocates a WebSocket bridge port, and spawns a Claude Code CLI process. The session starts in `starting` status and transitions to `idle` once the CLI connects.

**Response:** `201` with Session object (status will be `starting`).

**Errors:**
- `404` if the project does not exist
- `409` if global session limit is reached (default: 20)

### Get Session

```
GET /api/sessions/:id
```

**Response:** `200` Session object with current status and metrics.

**Error:** `404` if session does not exist.

### Kill Session

```
DELETE /api/sessions/:id
```

Terminates the CLI process, closes the WebSocket bridge, releases the port, and sets status to `closed`.

**Response:** `200` `{ "ok": true }`

---

## Messages & Streaming

### Send Message

```
POST /api/sessions/:id/message
```

**Body:**

```json
{
  "content": "What files are in this project?"
}
```

| Field    | Required | Description          |
|----------|----------|----------------------|
| `content`| Yes      | The message text     |

Sends a user message to the session's Claude Code CLI. The message is processed asynchronously -- the response confirms delivery, not completion. Results stream back via SSE or WebSocket.

**Response:** `200` `{ "ok": true }`

**Error:** `400` if `content` is missing.

### Interrupt Turn

```
POST /api/sessions/:id/interrupt
```

Sends an interrupt signal to stop the current turn.

**Response:** `200` `{ "ok": true }`

### Get Message History

```
GET /api/sessions/:id/messages?limit=100&offset=0
```

Returns stored conversation messages for a session.

**Query parameters:**

| Parameter | Default | Description            |
|-----------|---------|------------------------|
| `limit`   | `100`   | Max messages to return |
| `offset`  | `0`     | Number to skip         |

**Message Object:**

| Field            | Type   | Description                                              |
|------------------|--------|----------------------------------------------------------|
| `id`             | string | Message UUID                                             |
| `session_id`     | string | Parent session                                           |
| `direction`      | string | `inbound` (CLI -> Conduit) or `outbound` (Conduit -> CLI)|
| `message_type`   | string | Protocol message type (e.g. `user`, `assistant`, `result`) |
| `message_subtype`| string | Additional classification                                |
| `content`        | string | JSON-encoded message payload                             |
| `timestamp`      | string | ISO 8601                                                 |

The `content` field contains the raw Claude Code protocol message as JSON. For `assistant` messages, parse to get the model response. For `result` messages, parse to get turn summary including cost and token counts.

### SSE Stream

```
GET /api/sessions/:id/stream
```

Server-Sent Events stream for real-time session monitoring. Connection stays open until the client disconnects.

**Headers returned:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Events emitted:**

```
event: connected
data: {"session_id":"sess456"}

event: session.message
data: {"type":"assistant","message":{...}}

event: stream.event
data: {"type":"stream_event","event":"content_block_delta","data":{...}}

event: session.result
data: {"type":"result","subtype":"success","total_cost_usd":0.063,"usage":{"input_tokens":1500,...},...}

event: session.status
data: {"status":"active"}
```

**Error:** `404` if session does not exist.

---

## Permissions

Conduit uses a **default-allow with deny-rule guardrails** permission model. All tool-use requests from Claude Code CLI sessions are automatically approved unless a matching deny rule is found. Every permission decision (allow or deny) is logged to the audit trail for observability.

This model is designed for autonomous agent operation where sessions run without human intervention. Instead of requiring explicit approval for each tool use, you define deny rules to block dangerous operations (e.g., `rm -rf`, writing to sensitive paths) and let everything else through.

### Permission Evaluation Flow

```
Incoming control_request (can_use_tool)
  |
  +-- Check project deny rules (highest priority)
  |     Match? --> DENY (logged)
  |
  +-- Check global deny rules
  |     Match? --> DENY (logged)
  |
  +-- Check project allow rules
  |     Match? --> ALLOW (logged)
  |
  +-- Check global allow rules
  |     Match? --> ALLOW (logged)
  |
  +-- No rule matched --> ALLOW (logged as default_allow)
```

### Audit Log

```
GET /api/permissions/log?session_id=abc&limit=100&offset=0
```

Returns historical permission decisions with full context.

**Query parameters:**

| Parameter    | Default | Description                          |
|--------------|---------|--------------------------------------|
| `session_id` | --     | Filter by session ID (optional)      |
| `limit`      | `100`  | Max entries to return                |
| `offset`     | `0`    | Number of entries to skip            |

**Response:** `200`

```json
[
  {
    "id": "log-uuid",
    "session_id": "session-uuid",
    "request_id": "req-abc",
    "tool_name": "Bash",
    "tool_input": "{\"command\":\"ls\"}",
    "decision": "allow",
    "decision_source": "auto_rule",
    "rule_id": "rule-uuid",
    "decided_by": "system",
    "decided_at": "2026-02-10T19:31:32.295Z"
  }
]
```

| Field            | Type        | Description                                                     |
|------------------|-------------|-----------------------------------------------------------------|
| `id`             | string      | Log entry ID                                                    |
| `session_id`     | string      | Session that triggered the request                              |
| `request_id`     | string      | Original permission request ID                                  |
| `tool_name`      | string      | Tool that was requested                                         |
| `tool_input`     | string      | JSON string of the tool arguments                               |
| `decision`       | string      | `"allow"` or `"deny"`                                           |
| `decision_source`| string      | How decided: `auto_rule`, `default_allow`                       |
| `rule_id`        | string/null | Rule that matched (if auto-decided by rule)                     |
| `decided_by`     | string      | Who made the decision (`system` for auto decisions)             |
| `decided_at`     | string      | ISO 8601 timestamp                                              |

---

## Permission Rules

Rules define automatic permission decisions. They are evaluated in priority order (highest first). Deny rules are the primary mechanism for restricting tool use.

### Rule Object

| Field         | Type        | Description                                          |
|---------------|-------------|------------------------------------------------------|
| `id`          | string      | UUID                                                 |
| `project_id`  | string/null | `null` for global rules                              |
| `tool_name`   | string      | Tool to match (`Read`, `Write`, `Bash`, `Edit`, or `*` for all) |
| `rule_content`| string      | Pattern to match against tool input (glob syntax)    |
| `behavior`    | string      | `allow` or `deny`                                    |
| `priority`    | integer     | Higher = evaluated first                             |
| `created_at`  | string      | ISO 8601                                             |

**Pattern matching:**
- Empty `rule_content` matches everything for the specified tool
- `*` wildcard matches any sequence of characters
- For `Bash` tools, the pattern matches against the `command` field
- For `Read`/`Write`/`Edit` tools, the pattern matches against the `file_path` field
- For other tools, the pattern matches against the JSON-stringified input
- Prefix patterns like `npm *` match commands starting with `npm`

### Project Rules

```
GET  /api/projects/:id/rules
POST /api/projects/:id/rules
```

**Create body:**

```json
{
  "tool_name": "Bash",
  "rule_content": "rm -rf *",
  "behavior": "deny",
  "priority": 10
}
```

| Field         | Required | Default | Description                    |
|---------------|----------|---------|--------------------------------|
| `tool_name`   | Yes      |         | Tool name or `*` for all tools |
| `behavior`    | Yes      |         | `allow` or `deny`              |
| `rule_content`| No       | `""`    | Glob pattern for tool input    |
| `priority`    | No       | `0`     | Higher = evaluated first       |

**GET Response:** `200` Array of Rule objects.

**POST Response:** `201` Created Rule object.

### Global Rules

```
GET  /api/rules/global
POST /api/rules/global
```

Same request body format. Global rules have `project_id: null` and apply to all projects.

### Update Rule

```
PUT /api/rules/:id
```

**Body:** Any subset of `tool_name`, `rule_content`, `behavior`, `priority`.

**Response:** `200` Updated Rule object.

**Error:** `404` if rule does not exist.

### Delete Rule

```
DELETE /api/rules/:id
```

**Response:** `200` `{ "ok": true }`

---

## WebSocket Protocol

External consumers connect via WebSocket for bidirectional real-time communication with a session.

```
ws://localhost:3100/api/sessions/:id/ws
```

### Connection

On successful connection, the server sends:

```json
{ "event": "connected", "session_id": "sess456" }
```

If the session is not found, the server sends an error and closes the connection:

```json
{ "event": "error", "message": "Session not found" }
```

If the CLI process is not running (crashed, closed, or failed to start), the server sends a warning but keeps the connection open:

```json
{ "event": "error", "message": "CLI process is not running (may have crashed or failed to start). Database status: error. Try creating a new session." }
```

### Client -> Server Actions

**Send a message:**

```json
{ "action": "message", "content": "Hello Claude" }
```

**Interrupt the current turn:**

```json
{ "action": "interrupt" }
```

| Field          | Required For          | Description                           |
|----------------|-----------------------|---------------------------------------|
| `action`       | All                   | `"message"` or `"interrupt"`          |
| `content`      | `message`             | The message text                      |

Invalid JSON or unknown actions return an error event:

```json
{ "event": "error", "message": "Unknown action: foo" }
```

### Server -> Client Events

**Connection established:**

```json
{ "event": "connected", "session_id": "uuid" }
```

**System initialization** (sent before each turn, NOT once on connect; contains session metadata):

```json
{ "event": "system_init", "data": { "type": "system", "subtype": "init", "session_id": "uuid", "model": "claude-opus-4-6", "tools": [...], "claude_code_version": "2.1.39", ... } }
```

**Assistant message** (Claude's response):

```json
{ "event": "assistant", "data": { "type": "assistant", "message": { "role": "assistant", "content": [...] } } }
```

**Stream event** (incremental content deltas, tool progress):

```json
{ "event": "stream_event", "data": { "type": "stream_event", "event": "content_block_delta", "data": { ... } } }
```

**Turn completed:**

```json
{ "event": "result", "data": { "type": "result", "subtype": "success", "is_error": false, "duration_ms": 2814, "duration_api_ms": 2770, "num_turns": 1, "total_cost_usd": 0.0638745, "usage": { "input_tokens": 3, "output_tokens": 21, ... }, "session_id": "uuid" } }
```

**Session status changed:**

```json
{ "event": "session_status", "status": "active" }
```

**Error:**

```json
{ "event": "error", "message": "Description of what went wrong" }
```

---

## Event Types

These event types are emitted internally and forwarded via SSE and WebSocket:

| Event Type            | Trigger                                   | Data                          |
|-----------------------|-------------------------------------------|-------------------------------|
| `session.created`     | New session spawned                       | Session object                |
| `session.status`      | Status transition                         | `{ status }`                  |
| `session.message`     | Message from CLI (assistant, system/init) | Raw protocol message          |
| `session.result`      | Turn completed                            | Cost, tokens, duration        |
| `session.error`       | CLI crashed or unexpected exit            | `{ message }`                 |
| `session.closed`      | Session terminated                        | --                            |
| `stream.event`        | Token-level stream data from CLI          | Anthropic API stream event    |

The WebSocket protocol maps these to simplified event names: `session.message` becomes `assistant` or `system_init`, `stream.event` becomes `stream_event`, `session.result` becomes `result`, etc.

---

## Session Lifecycle

```
POST /projects/:id/sessions
         |
         v
     +----------+   CLI connects    +------+
     | starting | ----------------> | idle |
     +----------+                   +------+
                                       |
                              POST message
                                       |
                                       v
                                   +--------+   turn completes   +------+
                                   | active | -----------------> | idle |
                                   +--------+                    +------+
                                       |                            |
                                  CLI crash                DELETE /sessions/:id
                                       |                            |
                                       v                            v
                                   +-------+                   +--------+
                                   | error |                   | closed |
                                   +-------+                   +--------+
```

**Status values:** `starting`, `idle`, `active`, `compacting`, `error`, `closed`

- `starting` -- CLI process spawned, waiting for WebSocket connection
- `idle` -- CLI connected and ready, no active turn
- `active` -- Processing a user message
- `compacting` -- Claude Code is compacting conversation context
- `error` -- CLI crashed or unexpected exit during a turn
- `closed` -- Session terminated (by user or idle timeout)

---

## Agent Integration Guide

### Default-Allow Permission Model

Conduit auto-approves all tool-use requests by default. Sessions run autonomously without requiring permission handling from consumers. To restrict dangerous operations, add deny rules:

```bash
# Block destructive shell commands globally
curl -X POST http://localhost:3100/api/rules/global \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "Bash", "rule_content": "rm -rf *", "behavior": "deny", "priority": 100}'

# Block writes to sensitive paths for a specific project
curl -X POST http://localhost:3100/api/projects/<project-id>/rules \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "Write", "rule_content": "/etc/*", "behavior": "deny", "priority": 100}'
```

### Launching and Monitoring Sessions

```bash
# 1. Create the project
curl -X POST http://localhost:3100/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "autonomous-agent", "folder_path": "/home/user/my-repo"}'
# Save the project ID from the response

# 2. Launch a session
curl -X POST http://localhost:3100/api/projects/<project-id>/sessions \
  -H "Content-Type: application/json" \
  -d '{}'

# 3. Send work
curl -X POST http://localhost:3100/api/sessions/<session-id>/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Implement the login feature"}'

# 4. Monitor via SSE stream
curl -N http://localhost:3100/api/sessions/<session-id>/stream
```

### Real-Time Monitoring via WebSocket

Connect via WebSocket for real-time session events:

```javascript
const ws = new WebSocket("ws://localhost:3100/api/sessions/<session-id>/ws");

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.event) {
    case "result":
      // Turn complete, session is idle and ready for next message
      console.log("Turn finished:", msg.data);
      break;

    case "session_status":
      console.log("Session status:", msg.status);
      break;

    case "error":
      console.error("Session error:", msg.message);
      break;
  }
};

// Send a message to start work
ws.send(JSON.stringify({
  action: "message",
  content: "Implement the login feature"
}));
```

### Health Monitoring

Poll `GET /api/health` to monitor overall service status. Key fields to watch:

- `checks.cli_available` -- false means no new sessions can be created
- `checks.active_sessions` vs `checks.max_sessions` -- capacity monitoring
- `checks.session_capacity_pct` -- percentage of session slots in use

Use `GET /api/sessions/active` to get a snapshot of all running sessions across projects.

---

## Configuration

All configuration is via environment variables with sensible defaults:

| Variable                           | Default                | Description                          |
|------------------------------------|------------------------|--------------------------------------|
| `CONDUIT_PORT`                     | `3100`                 | HTTP server port                     |
| `CONDUIT_HOST`                     | `0.0.0.0`             | Bind address                         |
| `CONDUIT_DB_PATH`                  | `./data/conduit.db`    | SQLite database path                 |
| `CONDUIT_CLI_PATH`                 | `claude`               | Path to Claude Code CLI binary       |
| `CLAUDE_CODE_SESSION_ACCESS_TOKEN` | (empty)                | Claude Code auth token               |
| `CONDUIT_WS_PORT_RANGE_START`     | `9000`                 | WebSocket bridge port range start    |
| `CONDUIT_WS_PORT_RANGE_END`       | `9100`                 | WebSocket bridge port range end      |
| `CONDUIT_WEBHOOK_SECRET`          | (empty)                | HMAC secret for signing webhook payloads |
| `CONDUIT_MAX_SESSIONS_GLOBAL`     | `20`                   | Maximum concurrent sessions          |
| `CONDUIT_PERMISSION_TIMEOUT_MS`   | `300000` (5 min)       | Timeout for permission decisions     |
| `CONDUIT_SESSION_IDLE_TIMEOUT_MS` | `3600000` (1 hr)       | Idle session cleanup timeout         |
| `CONDUIT_PROJECT_ROOT`            | User home directory     | Default folder browse root           |
| `CONDUIT_SCAN_DEPTH`             | `2`                    | Discovery recursion depth            |
