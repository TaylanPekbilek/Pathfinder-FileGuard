import { createHash } from "node:crypto";
import path from "node:path";

export function opaqueKey(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("Identifier must be a non-empty string");
  }

  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);
}

export function agentKey(input) {
  return typeof input?.agent_id === "string" && input.agent_id.length > 0
    ? opaqueKey(input.agent_id)
    : "main";
}

export function sessionKey(sessionId) {
  return opaqueKey(sessionId);
}

export function normalizePathKey(filePath, platform = process.platform) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new TypeError("file_path must be a non-empty string");
  }

  if (platform === "win32") {
    return path.win32.normalize(filePath).toLowerCase();
  }

  return path.posix.normalize(filePath);
}

function normalizeRangeValue(name, value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

export function normalizeRange(toolInput) {
  return {
    offset: normalizeRangeValue("offset", toolInput?.offset),
    limit: normalizeRangeValue("limit", toolInput?.limit),
  };
}

export function readKey({ pathKey, offset, limit }) {
  return opaqueKey(JSON.stringify({ pathKey, offset, limit }));
}
