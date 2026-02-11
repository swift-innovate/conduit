-- Conduit database schema

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
    behavior TEXT NOT NULL,
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
