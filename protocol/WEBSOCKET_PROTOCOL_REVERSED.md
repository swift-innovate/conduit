# Claude Code WebSocket SDK Protocol (Reversed)

> Verified against CLI v2.1.39 via binary analysis and live testing (2026-02-11)

## Overview

Claude Code CLI supports a `--sdk-url` flag that connects to an external WebSocket server instead of using its built-in terminal UI. This enables programmatic control of Claude Code sessions.

## Connection Flow

1. CLI is launched with `--sdk-url ws://host:port`
2. CLI auto-sets `--print`, `--input-format=stream-json`, `--output-format=stream-json`, `--verbose`
3. CLI connects to the WebSocket endpoint (takes ~2-3 seconds for startup/auth)
4. CLI sends **nothing** on connect — it silently waits for messages
5. Server sends a `user` message to start a conversation turn
6. CLI sends `system` (subtype: `init`) message with session metadata, then processes the prompt
7. CLI streams back responses as `assistant`, `stream_event`, and `result` messages
8. When CLI needs tool approval, it sends `control_request` (subtype: `can_use_tool`) and waits for `control_response`

**IMPORTANT**: The CLI does NOT send any data upon WebSocket connection. The `system/init` message is sent BEFORE each turn (when a user message is received), not once at connection time. The WebSocket connection event itself is the signal that the CLI is ready.

## Message Format

All messages are NDJSON (Newline-Delimited JSON) sent over WebSocket text frames.

## CLI → Server Messages

### system (subtype: init)
Sent before each turn (NOT once on connect). Contains session metadata.
```json
{
  "type": "system",
  "subtype": "init",
  "cwd": "/path/to/project",
  "session_id": "uuid",
  "tools": ["Bash", "Read", "Edit", "Write", "Glob", "Grep", ...],
  "mcp_servers": [],
  "model": "claude-opus-4-6",
  "permissionMode": "default",
  "slash_commands": [...],
  "apiKeySource": "none",
  "claude_code_version": "2.1.39",
  "output_style": "default",
  "agents": [...],
  "skills": [...],
  "plugins": [],
  "uuid": "uuid",
  "fast_mode_state": "off"
}
```

### assistant
Streamed assistant responses.
```json
{
  "type": "assistant",
  "message": {
    "model": "claude-opus-4-6",
    "id": "msg_...",
    "type": "message",
    "role": "assistant",
    "content": [
      { "type": "text", "text": "..." },
      { "type": "tool_use", "id": "...", "name": "...", "input": {...} }
    ],
    "stop_reason": null,
    "stop_sequence": null,
    "usage": {
      "input_tokens": 3,
      "output_tokens": 21,
      "cache_creation_input_tokens": 9016,
      "cache_read_input_tokens": 13969,
      "service_tier": "standard"
    }
  },
  "parent_tool_use_id": null,
  "session_id": "uuid",
  "uuid": "uuid"
}
```

### stream_event
Real-time streaming events (partial tokens, progress).
```json
{
  "type": "stream_event",
  "event": "content_block_delta",
  "data": {...}
}
```

### result
Final result after a complete turn.
```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 2814,
  "duration_api_ms": 2770,
  "num_turns": 1,
  "result": "Hello! I'm Claude...",
  "stop_reason": null,
  "session_id": "uuid",
  "total_cost_usd": 0.0638745,
  "usage": {
    "input_tokens": 3,
    "output_tokens": 21,
    "cache_creation_input_tokens": 9016,
    "cache_read_input_tokens": 13969,
    "service_tier": "standard"
  },
  "modelUsage": {
    "claude-opus-4-6": {
      "inputTokens": 3,
      "outputTokens": 21,
      "cacheReadInputTokens": 13969,
      "cacheCreationInputTokens": 9016,
      "costUSD": 0.0638745,
      "contextWindow": 200000,
      "maxOutputTokens": 32000
    }
  },
  "permission_denials": [],
  "uuid": "uuid"
}
```

### control_request (subtype: can_use_tool)
Permission request before tool execution.
```json
{
  "type": "control_request",
  "request_id": "uuid",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "Bash",
    "tool_input": {
      "command": "ls -la"
    }
  }
}
```

### tool_progress
Progress updates during tool execution.
```json
{
  "type": "tool_progress",
  "tool_use_id": "...",
  "progress": 50,
  "total": 100,
  "message": "Reading files..."
}
```

## Server → CLI Messages

### user
Send a user message/prompt to start a new turn.
```json
{
  "type": "user",
  "session_id": "",
  "message": {
    "role": "user",
    "content": "Please review this code"
  },
  "parent_tool_use_id": null
}
```

### control_response (for can_use_tool)
Response to a permission request.
```json
{
  "type": "control_response",
  "response": {
    "subtype": "can_use_tool_result",
    "request_id": "uuid",
    "result": {
      "behavior": "allow"
    }
  }
}
```

### interrupt
Interrupt the current turn.
```json
{
  "type": "interrupt"
}
```

## CLI Launch Flags

When `--sdk-url` is provided, the CLI automatically sets these flags:
- `--print` (headless mode)
- `--input-format stream-json` (NDJSON input)
- `--output-format stream-json` (NDJSON output)
- `--verbose` (detailed streaming events)

So the minimal launch command is:
```
claude --sdk-url ws://localhost:9000
```

With additional options:
```
claude --sdk-url ws://localhost:9000 \
       --model claude-sonnet-4-5-20250929 \
       --permission-mode default
```

Key flags:
- `--sdk-url`: WebSocket URL for the SDK server (the only required flag)
- `--model`: Model to use (optional)
- `--permission-mode`: Permission mode — default, plan, acceptEdits, bypassPermissions, delegate, dontAsk (optional)
- `--resume`: Resume a previous session by ID (optional)
- `--fork-session`: Fork from current session (optional)
- `--system-prompt`: Override system prompt (optional)
- `--append-system-prompt`: Append to system prompt (optional)
- `--dangerously-skip-permissions`: Skip all permission checks (optional, for sandboxed environments)

Note: `--print`, `--input-format`, `--output-format`, and `--verbose` are NOT needed when using `--sdk-url` — they are set automatically.
