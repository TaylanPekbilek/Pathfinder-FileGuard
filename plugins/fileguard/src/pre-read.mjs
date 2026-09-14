import { snapshotFile as defaultSnapshotFile } from "./file-snapshot.mjs";
import {
  agentKey,
  normalizePathKey,
  normalizeRange,
  readKey,
} from "./identity.mjs";
import { createStateStore } from "./state-store.mjs";

function validatePreRead(input) {
  if (input?.hook_event_name !== "PreToolUse" || input?.tool_name !== "Read") {
    throw new TypeError("Expected a PreToolUse Read payload");
  }
  if (typeof input.session_id !== "string" || input.session_id.length === 0) {
    throw new TypeError("PreToolUse requires session_id");
  }
  if (typeof input.tool_use_id !== "string" || input.tool_use_id.length === 0) {
    throw new TypeError("PreToolUse requires tool_use_id");
  }
  if (typeof input.tool_input?.file_path !== "string" || input.tool_input.file_path.length === 0) {
    throw new TypeError("Read requires file_path");
  }
}

export async function runPreRead(input, options = {}) {
  try {
    validatePreRead(input);
    const rootDir = options.rootDir ?? process.env.CLAUDE_PLUGIN_DATA;
    const store = options.store ?? createStateStore({ rootDir });
    const takeSnapshot = options.snapshotFile ?? defaultSnapshotFile;
    const now = options.now ?? (() => new Date());
    const platform = options.platform ?? process.platform;
    const context = await store.ensureContext({
      sessionId: input.session_id,
      trigger: "implicit",
    });
    const snapshot = await takeSnapshot(input.tool_input.file_path);
    const range = normalizeRange(input.tool_input);
    const pathKey = normalizePathKey(snapshot.filePath, platform);
    const identity = {
      pathKey,
      offset: range.offset,
      limit: range.limit,
    };
    const scope = {
      sessionId: input.session_id,
      agentId: input.agent_id ?? null,
      contextId: context.contextId,
    };

    await store.writePending(scope, {
      toolUseId: input.tool_use_id,
      path: snapshot.filePath,
      pathKey,
      offset: range.offset,
      limit: range.limit,
      size: snapshot.size,
      mtimeNs: snapshot.mtimeNs,
      digest: snapshot.digest,
      readKey: readKey(identity),
      createdAt: now().toISOString(),
    });
  } catch {
    return null;
  }

  return null;
}
