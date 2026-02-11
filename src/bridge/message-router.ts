// ── Route messages by type field ──
//
// The CLI sends NDJSON messages over the WebSocket with these types:
//   "system"          - System messages (subtype: "init" for initialization)
//   "assistant"       - Assistant responses
//   "stream_event"    - Streaming events (partial tokens, progress)
//   "result"          - Turn completion with usage/cost data
//   "control_request" - Permission requests (subtype: "can_use_tool")
//   "tool_progress"   - Tool execution progress
//   "keep_alive"      - Keepalive pings (ignored)

import type { CliToServerMessage, CliControlRequestMessage, CliSystemMessage } from "./protocol";
import { eventBus } from "../core/event-bus";
import { logger } from "../utils/logger";
import type { ConduitEvent, EventType } from "../core/types";

const log = logger.create("message-router");

export type PermissionRequestHandler = (
  sessionId: string,
  requestId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
) => void;

export interface MessageRouterCallbacks {
  onSystemInit?: (sessionId: string, data: unknown) => void;
  onAssistant?: (sessionId: string, data: unknown) => void;
  onStreamEvent?: (sessionId: string, data: unknown) => void;
  onResult?: (sessionId: string, data: unknown) => void;
  onPermissionRequest?: PermissionRequestHandler;
}

export function routeMessage(
  conduitSessionId: string,
  message: CliToServerMessage,
  callbacks: MessageRouterCallbacks,
) {
  const type = message.type;

  switch (type) {
    // CLI v2.1.39 sends type="system" with subtype="init" (not "system_init")
    case "system": {
      const sysMsg = message as CliSystemMessage;
      if (sysMsg.subtype === "init") {
        log.info("System init received", {
          session_id: conduitSessionId,
          cli_session_id: sysMsg.session_id,
          model: sysMsg.model,
          version: sysMsg.claude_code_version,
        });
        callbacks.onSystemInit?.(conduitSessionId, sysMsg);
      } else {
        log.info("System message received", { session_id: conduitSessionId, subtype: sysMsg.subtype });
      }
      emitEvent("session.message", conduitSessionId, message);
      break;
    }

    case "assistant": {
      log.info("Assistant message received", { session_id: conduitSessionId });
      callbacks.onAssistant?.(conduitSessionId, message);
      emitEvent("session.message", conduitSessionId, message);
      break;
    }

    case "stream_event": {
      callbacks.onStreamEvent?.(conduitSessionId, message);
      emitEvent("stream.event", conduitSessionId, message);
      break;
    }

    case "result": {
      const resultMsg = message as any;
      log.info("Result received", {
        session_id: conduitSessionId,
        subtype: resultMsg.subtype,
        total_cost_usd: resultMsg.total_cost_usd,
        input_tokens: resultMsg.usage?.input_tokens,
        output_tokens: resultMsg.usage?.output_tokens,
        num_turns: resultMsg.num_turns,
      });
      callbacks.onResult?.(conduitSessionId, message);
      emitEvent("session.result", conduitSessionId, message);
      break;
    }

    // CLI v2.1.39 sends type="control_request" with subtype="can_use_tool"
    // (not bare "can_use_tool" type)
    case "control_request": {
      const ctrlMsg = message as CliControlRequestMessage;
      if (ctrlMsg.request?.subtype === "can_use_tool") {
        const toolName = ctrlMsg.request.tool_name ?? "unknown";
        const toolInput = ctrlMsg.request.tool_input ?? {};
        log.info("Permission request (control_request)", {
          session_id: conduitSessionId,
          request_id: ctrlMsg.request_id,
          tool: toolName,
        });
        callbacks.onPermissionRequest?.(
          conduitSessionId,
          ctrlMsg.request_id,
          toolName,
          toolInput,
        );
      } else if (ctrlMsg.request?.subtype === "init") {
        // Some versions send init as control_request instead of system message
        log.info("Init control_request received", { session_id: conduitSessionId });
        callbacks.onSystemInit?.(conduitSessionId, ctrlMsg);
        emitEvent("session.message", conduitSessionId, message);
      } else {
        log.info("Control request received", {
          session_id: conduitSessionId,
          subtype: ctrlMsg.request?.subtype,
        });
        emitEvent("session.message", conduitSessionId, message);
      }
      break;
    }

    case "tool_progress": {
      emitEvent("stream.event", conduitSessionId, message);
      break;
    }

    // Keepalive messages — ignore
    case "keep_alive" as any: {
      log.debug("Keep-alive received", { session_id: conduitSessionId });
      break;
    }

    default:
      log.warn("Unknown message type", { type, session_id: conduitSessionId });
      emitEvent("session.message", conduitSessionId, message);
  }
}

function emitEvent(type: EventType, sessionId: string, data: unknown) {
  const event: ConduitEvent = {
    type,
    session_id: sessionId,
    data,
    timestamp: Date.now(),
  };
  eventBus.emit(event);
}
