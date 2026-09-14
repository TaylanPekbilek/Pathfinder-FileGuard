import path from "node:path";

import { snapshotFile as defaultSnapshotFile } from "./file-snapshot.mjs";
import {
  normalizePathKey,
  normalizeRange,
  readKey,
} from "./identity.mjs";
import { denyRead } from "./hook-io.mjs";
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

function displayPath(filePath, cwd) {
  if (typeof cwd !== "string" || cwd.length === 0) return filePath;
  const relative = path.relative(cwd, filePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.replaceAll("\\", "/");
  }
  return filePath;
}

function duplicateMessage(filePath, cwd) {
  return `FileGuard blocked an unchanged duplicate read of "${displayPath(filePath, cwd)}" for the same requested range. This range was already delivered in the current agent context and its SHA-256 digest is unchanged. Read a different range or run /fileguard:allow-next for one bypass.`;
}

function recordMatches(record, identity, digest) {
  return record
    && record.pathKey === identity.pathKey
    && record.offset === identity.offset
    && record.limit === identity.limit
    && record.digest === digest;
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
    const currentReadKey = readKey(identity);
    const previous = await store.findReadRecord(scope, {
      readKey: currentReadKey,
      digest: snapshot.digest,
    });

    if (recordMatches(previous, identity, snapshot.digest)) {
      const bypassed = await store.consumeOverride({
        sessionId: input.session_id,
        agentId: input.agent_id ?? null,
      });
      if (!bypassed) {
        try {
          await store.writeBlockedEvent(
            { sessionId: input.session_id, agentId: input.agent_id ?? null },
            {
              path: snapshot.filePath,
              offset: range.offset,
              limit: range.limit,
              deliveredChars: previous.deliveredChars,
              measurement: previous.measurement,
              blockedAt: now().toISOString(),
            },
          );
        } catch {
          // The savings ledger is optional once a duplicate is proven.
        }
        return denyRead(duplicateMessage(snapshot.filePath, input.cwd));
      }
    }

    await store.writePending(scope, {
      toolUseId: input.tool_use_id,
      path: snapshot.filePath,
      pathKey,
      offset: range.offset,
      limit: range.limit,
      size: snapshot.size,
      mtimeNs: snapshot.mtimeNs,
      digest: snapshot.digest,
      readKey: currentReadKey,
      createdAt: now().toISOString(),
    });
  } catch {
    return null;
  }

  return null;
}
