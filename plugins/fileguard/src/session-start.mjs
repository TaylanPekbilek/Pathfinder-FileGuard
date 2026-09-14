import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { createStateStore } from "./state-store.mjs";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function quoteForPosixShell(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function validateInput(input) {
  if (input?.hook_event_name !== "SessionStart") {
    throw new TypeError("Expected a SessionStart hook payload");
  }
  if (typeof input.session_id !== "string" || input.session_id.length === 0) {
    throw new TypeError("SessionStart requires session_id");
  }
}

export async function runSessionStart(input, options = {}) {
  validateInput(input);
  const rootDir = options.rootDir ?? process.env.CLAUDE_PLUGIN_DATA;
  const envFile = options.envFile ?? process.env.CLAUDE_ENV_FILE;
  const store = options.store ?? createStateStore({ rootDir });

  if (input.source === "compact" || input.source === "clear") {
    await store.advanceContext({ sessionId: input.session_id, trigger: input.source });
  } else {
    await store.ensureContext({
      sessionId: input.session_id,
      trigger: input.source || "startup",
    });
  }

  if (typeof envFile === "string" && envFile.length > 0) {
    await mkdir(path.dirname(path.resolve(envFile)), { recursive: true });
    await appendFile(
      envFile,
      `export FILEGUARD_SESSION_ID=${quoteForPosixShell(input.session_id)}\n`,
      "utf8",
    );
  }

  try {
    await store.cleanupExpiredSessions({ retentionMs: RETENTION_MS });
  } catch {
    // Retention cleanup is optional and must never affect session startup.
  }
}
