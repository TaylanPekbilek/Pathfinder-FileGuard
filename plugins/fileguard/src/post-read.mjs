import { snapshotFile as defaultSnapshotFile } from "./file-snapshot.mjs";
import { normalizePathKey, normalizeRange, readKey } from "./identity.mjs";
import { measureResponseText } from "./measure-response.mjs";
import { createStateStore } from "./state-store.mjs";

function validatePostRead(input) {
  if (input?.hook_event_name !== "PostToolUse" || input?.tool_name !== "Read") {
    throw new TypeError("Expected a PostToolUse Read payload");
  }
  if (typeof input.session_id !== "string" || input.session_id.length === 0) {
    throw new TypeError("PostToolUse requires session_id");
  }
  if (typeof input.tool_use_id !== "string" || input.tool_use_id.length === 0) {
    throw new TypeError("PostToolUse requires tool_use_id");
  }
  if (typeof input.tool_input?.file_path !== "string" || input.tool_input.file_path.length === 0) {
    throw new TypeError("Read requires file_path");
  }
}

export async function runPostRead(input, options = {}) {
  try {
    validatePostRead(input);
    const rootDir = options.rootDir ?? process.env.CLAUDE_PLUGIN_DATA;
    const store = options.store ?? createStateStore({ rootDir });
    const takeSnapshot = options.snapshotFile ?? defaultSnapshotFile;
    const now = options.now ?? (() => new Date());
    const platform = options.platform ?? process.platform;
    const context = await store.currentContext({ sessionId: input.session_id });
    if (!context) return false;

    const scope = {
      sessionId: input.session_id,
      agentId: input.agent_id ?? null,
      contextId: context.contextId,
    };
    const pending = await store.readPending(scope, { toolUseId: input.tool_use_id });
    if (!pending) return false;

    const snapshot = await takeSnapshot(input.tool_input.file_path);
    const range = normalizeRange(input.tool_input);
    const pathKey = normalizePathKey(snapshot.filePath, platform);
    const currentReadKey = readKey({
      pathKey,
      offset: range.offset,
      limit: range.limit,
    });
    const unchanged = pending.pathKey === pathKey
      && pending.offset === range.offset
      && pending.limit === range.limit
      && pending.readKey === currentReadKey
      && pending.digest === snapshot.digest
      && pending.size === snapshot.size
      && pending.mtimeNs === snapshot.mtimeNs;
    if (!unchanged) return false;

    const deliveredChars = measureResponseText(input.tool_response);
    await store.writeReadRecord(scope, {
      readKey: currentReadKey,
      path: snapshot.filePath,
      pathKey,
      offset: range.offset,
      limit: range.limit,
      size: snapshot.size,
      mtimeNs: snapshot.mtimeNs,
      digest: snapshot.digest,
      deliveredChars,
      measurement: deliveredChars === null ? null : "tool-response-text",
      readAt: now().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}
