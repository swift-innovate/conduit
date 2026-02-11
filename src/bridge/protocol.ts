// ── Protocol types from the Claude Code WebSocket SDK ──
//
// When launched with --sdk-url, the CLI connects to our WebSocket server.
// All communication is NDJSON over WebSocket frames.
//
// Key findings from CLI v2.1.39 binary analysis:
//  - The CLI auto-sets --print, --input-format=stream-json, --output-format=stream-json
//    when --sdk-url is provided. Explicit flags are NOT required.
//  - The init message type is "system" with subtype "init" (NOT "system_init").
//  - Permission requests use "control_request" with subtype "can_use_tool".
//  - The CLI sends system/init BEFORE each turn, not once at connection time.
//  - The CLI does NOT send anything on connect — it waits for the first user message.

// ── CLI → Server Messages ──

export type CliToServerMessage =
  | CliSystemMessage
  | CliAssistantMessage
  | CliStreamEventMessage
  | CliResultMessage
  | CliControlRequestMessage
  | CliToolProgressMessage;

/**
 * System message sent by CLI before processing a turn.
 * type="system", subtype="init"
 *
 * Actual shape from CLI v2.1.39:
 * {
 *   "type": "system",
 *   "subtype": "init",
 *   "cwd": "/path/to/project",
 *   "session_id": "uuid",
 *   "tools": ["Bash", "Read", "Edit", ...],
 *   "mcp_servers": [],
 *   "model": "claude-opus-4-6",
 *   "permissionMode": "default",
 *   "slash_commands": [...],
 *   "apiKeySource": "none",
 *   "claude_code_version": "2.1.39",
 *   "output_style": "default",
 *   "agents": [...],
 *   "skills": [...],
 *   "plugins": [],
 *   "uuid": "uuid",
 *   "fast_mode_state": "off"
 * }
 */
export interface CliSystemMessage {
  type: "system";
  subtype: string;
  session_id?: string;
  cwd?: string;
  tools?: string[];
  mcp_servers?: unknown[];
  model?: string;
  permissionMode?: string;
  claude_code_version?: string;
  uuid?: string;
  [key: string]: unknown; // additional fields vary by version
}

export interface CliAssistantMessage {
  type: "assistant";
  message: {
    role: "assistant";
    content: AssistantContent[];
    model?: string;
    stop_reason?: string | null;
    id?: string;
    type?: string;
    usage?: Record<string, unknown>;
  };
  parent_tool_use_id?: string | null;
  session_id?: string;
  uuid?: string;
}

export type AssistantContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface CliStreamEventMessage {
  type: "stream_event";
  event: string;
  data?: unknown;
}

/**
 * Result message sent after a complete turn.
 *
 * Actual shape from CLI v2.1.39:
 * {
 *   "type": "result",
 *   "subtype": "success",
 *   "is_error": false,
 *   "duration_ms": 2814,
 *   "duration_api_ms": 2770,
 *   "num_turns": 1,
 *   "result": "Hello! I'm Claude...",
 *   "stop_reason": null,
 *   "session_id": "uuid",
 *   "total_cost_usd": 0.0638745,
 *   "usage": { "input_tokens": 3, "output_tokens": 21, ... },
 *   "modelUsage": { "claude-opus-4-6": { "inputTokens": 3, "outputTokens": 21, ... } },
 *   "permission_denials": [],
 *   "uuid": "uuid"
 * }
 */
export interface CliResultMessage {
  type: "result";
  subtype?: string;
  result?: string | {
    role: "assistant";
    content: AssistantContent[];
    model?: string;
    stop_reason?: string;
  };
  session_id?: string;
  is_error?: boolean;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    [key: string]: unknown;
  };
  modelUsage?: Record<string, {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    costUSD?: number;
    [key: string]: unknown;
  }>;
  permission_denials?: unknown[];
  uuid?: string;
}

/**
 * Control request from CLI — used for permission prompts (can_use_tool)
 * and initialization handshake.
 *
 * The CLI sends:
 * {
 *   "type": "control_request",
 *   "request_id": "uuid",
 *   "request": {
 *     "subtype": "can_use_tool",
 *     "tool_name": "Bash",
 *     "tool_input": { "command": "ls" }
 *   }
 * }
 */
export interface CliControlRequestMessage {
  type: "control_request";
  request_id: string;
  request: {
    subtype: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface CliToolProgressMessage {
  type: "tool_progress";
  tool_use_id: string;
  progress?: number;
  total?: number;
  message?: string;
}

// ── Server → CLI Messages ──

export type ServerToCliMessage =
  | ServerUserMessage
  | ServerControlResponse
  | ServerInterruptMessage;

/**
 * Send a user message to the CLI.
 * The CLI expects NDJSON with type "user".
 */
export interface ServerUserMessage {
  type: "user";
  session_id?: string;
  message: {
    role: "user";
    content: string;
  };
  parent_tool_use_id?: string | null;
}

/**
 * Response to a control_request from the CLI.
 *
 * For can_use_tool responses:
 * {
 *   "type": "control_response",
 *   "response": {
 *     "subtype": "can_use_tool_result",
 *     "request_id": "uuid",
 *     "result": {
 *       "behavior": "allow"
 *     }
 *   }
 * }
 *
 * For init responses:
 * {
 *   "type": "control_response",
 *   "response": {
 *     "subtype": "success",
 *     "request_id": "uuid",
 *     "response": { ... }
 *   }
 * }
 */
export interface ServerControlResponse {
  type: "control_response";
  response: {
    subtype: string;
    request_id: string;
    result?: {
      behavior: "allow" | "deny";
      updated_input?: Record<string, unknown>;
      message?: string;
    };
    response?: Record<string, unknown>;
    error?: string;
    [key: string]: unknown;
  };
}

// Legacy type aliases for backward compatibility
export type ServerCanUseToolResponse = ServerControlResponse;

export interface ServerInterruptMessage {
  type: "interrupt";
}
