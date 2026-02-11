// ── Spawn Claude Code CLI with --sdk-url ──
//
// When --sdk-url is provided, the CLI (v2.1.39+) automatically:
//   1. Enables --print mode (headless, non-interactive)
//   2. Sets --input-format=stream-json (NDJSON via stdin/WS)
//   3. Sets --output-format=stream-json (NDJSON via stdout/WS)
//   4. Enables --verbose (detailed streaming events)
//
// The CLI connects to the WS server as a client. All communication
// (prompts, responses, permission requests) flows over the WebSocket.
//
// IMPORTANT: The CLI does NOT send any data until it receives a user
// message. The system/init message is sent BEFORE each turn, not at
// connection time. This means the bridge should NOT wait for system_init
// to confirm the session is ready — the WebSocket connection event itself
// is the signal that the CLI is ready to receive messages.

import { spawn, type ChildProcess } from "child_process";
import { config } from "../config";
import { logger } from "../utils/logger";

const log = logger.create("cli-launcher");

export interface CliLaunchOptions {
  cwd: string;
  wsPort: number;
  model?: string;
  permissionMode?: string;
  resumeSessionId?: string;
  forkSession?: boolean;
  systemPrompt?: string;
  appendSystemPrompt?: string;
}

export interface LaunchedCli {
  process: ChildProcess;
  pid: number;
  kill: () => void;
  onExit: (callback: (code: number | null) => void) => void;
  getStderr: () => string;
}

export function launchCli(options: CliLaunchOptions): LaunchedCli {
  const args: string[] = [
    "--sdk-url", `ws://localhost:${options.wsPort}`,
    // --print, --input-format=stream-json, --output-format=stream-json, and
    // --verbose are all auto-set by the CLI when --sdk-url is provided.
    // We do NOT need to pass them explicitly. The CLI validates this
    // internally with: "Error: --sdk-url requires both
    // --input-format=stream-json and --output-format=stream-json."
    // and auto-sets them before the check runs.
  ];

  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.permissionMode) {
    args.push("--permission-mode", options.permissionMode);
  }
  if (options.resumeSessionId) {
    args.push("--resume", options.resumeSessionId);
  }
  if (options.forkSession) {
    args.push("--fork-session");
  }
  if (options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt);
  }
  if (options.appendSystemPrompt) {
    args.push("--append-system-prompt", options.appendSystemPrompt);
  }

  // With --sdk-url, CLI connects to the WS server and waits for user messages.
  // No -p flag needed — the CLI auto-enables --print mode.
  // No initial prompt needed — user messages arrive over the WebSocket.

  const env: Record<string, string> = { ...process.env as Record<string, string> };
  if (config.sessionToken) {
    env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = config.sessionToken;
  }

  log.info("Launching CLI", { cwd: options.cwd, port: options.wsPort, model: options.model });

  const proc = spawn(config.cliPath, args, {
    cwd: options.cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pid = proc.pid;
  if (!pid) {
    log.error("CLI process failed to start - no PID", { cliPath: config.cliPath, cwd: options.cwd });
    throw new Error(`Failed to start CLI process. Is '${config.cliPath}' installed and in PATH?`);
  }

  log.info("CLI process started", { pid, port: options.wsPort, cliPath: config.cliPath });

  // Accumulate stderr output (capped at 4KB) for error reporting
  const STDERR_MAX_BYTES = 4096;
  let stderrBuf = "";

  proc.stderr?.on("data", (chunk: Buffer) => {
    const output = chunk.toString();
    if (stderrBuf.length < STDERR_MAX_BYTES) {
      stderrBuf += output;
      if (stderrBuf.length > STDERR_MAX_BYTES) {
        stderrBuf = stderrBuf.slice(0, STDERR_MAX_BYTES);
      }
    }
    const trimmed = output.trim();
    log.debug("CLI stderr", { pid, output: trimmed });
    if (trimmed.toLowerCase().includes("error") || trimmed.toLowerCase().includes("fail")) {
      log.warn("CLI error output", { pid, output: trimmed });
    }
  });

  // Log stdout — if output appears here in --sdk-url mode, something is wrong
  proc.stdout?.on("data", (chunk: Buffer) => {
    const output = chunk.toString().trim();
    if (output) {
      log.info("CLI stdout", { pid, output: output.slice(0, 500) });
    }
  });

  proc.on("error", (err) => {
    log.error("CLI spawn error", { pid, error: err.message, cliPath: config.cliPath });
  });

  return {
    process: proc,
    pid,
    kill() {
      try {
        proc.kill("SIGTERM");
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5000);
        log.info("CLI process killed", { pid });
      } catch (err) {
        log.warn("Failed to kill CLI process", { pid, error: String(err) });
      }
    },
    onExit(callback: (code: number | null) => void) {
      proc.on("exit", (code) => {
        callback(code);
      });
    },
    getStderr() {
      return stderrBuf.trim();
    },
  };
}
