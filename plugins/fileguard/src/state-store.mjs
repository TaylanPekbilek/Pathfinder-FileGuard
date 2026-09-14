import { randomUUID as systemRandomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { agentKey, opaqueKey, sessionKey } from "./identity.mjs";
import { sanitizeDiagnostic } from "./diagnostics.mjs";

const READ_FIELDS = [
  "path",
  "pathKey",
  "offset",
  "limit",
  "size",
  "mtimeNs",
  "digest",
  "deliveredChars",
  "measurement",
  "readAt",
];

const PENDING_FIELDS = [
  "path",
  "pathKey",
  "offset",
  "limit",
  "size",
  "mtimeNs",
  "digest",
  "readKey",
  "createdAt",
];

const EVENT_FIELDS = [
  "path",
  "offset",
  "limit",
  "deliveredChars",
  "measurement",
  "blockedAt",
];

function pick(value, fields) {
  return Object.fromEntries(fields.map((field) => [field, value?.[field]]));
}

function safeSegment(value, name) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value === "."
    || value === ".."
    || !/^[a-zA-Z0-9._-]+$/.test(value)
  ) {
    throw new TypeError(`${name} is not a safe state key`);
  }
  return value;
}

function missing(error) {
  return error?.code === "ENOENT";
}

async function readDirectory(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export function createStateStore({
  rootDir,
  now = () => new Date(),
  randomUUID = systemRandomUUID,
} = {}) {
  if (typeof rootDir !== "string" || !path.isAbsolute(rootDir)) {
    throw new TypeError("FileGuard state root must be an absolute path");
  }

  const stateRoot = path.join(path.resolve(rootDir), "v1");
  const sessionsRoot = path.join(stateRoot, "sessions");

  const sessionDirectory = (sessionId) => path.join(sessionsRoot, sessionKey(sessionId));
  const contextsDirectory = (sessionId) => path.join(sessionDirectory(sessionId), "contexts");
  const agentDirectory = ({ sessionId, agentId }) => path.join(
    sessionDirectory(sessionId),
    "agents",
    agentId ? agentKey({ agent_id: agentId }) : "main",
  );
  const contextDirectory = (scope) => path.join(
    agentDirectory(scope),
    safeSegment(scope.contextId, "contextId"),
  );

  async function writeImmutableJson(target, value) {
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" });

    try {
      await rename(temporary, target);
    } catch (error) {
      try {
        await stat(target);
      } catch (targetError) {
        if (missing(targetError)) throw error;
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async function touchSession(sessionId) {
    const directory = sessionDirectory(sessionId);
    await mkdir(directory, { recursive: true });
    const current = now();
    await utimes(directory, current, current);
  }

  async function currentContext({ sessionId }) {
    const entries = await readDirectory(contextsDirectory(sessionId));
    const contexts = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      contexts.push(await readJson(path.join(contextsDirectory(sessionId), entry.name)));
    }

    contexts.sort((left, right) =>
      left.ordinal - right.ordinal
      || String(left.createdAt).localeCompare(String(right.createdAt))
      || String(left.contextId).localeCompare(String(right.contextId)),
    );
    return contexts.at(-1) ?? null;
  }

  async function createContext({ sessionId, trigger, ordinal }) {
    const created = now();
    const context = {
      contextId: randomUUID(),
      ordinal,
      trigger,
      createdAt: created.toISOString(),
    };
    const target = path.join(
      contextsDirectory(sessionId),
      `${created.getTime()}-${context.contextId}.json`,
    );
    await writeImmutableJson(target, context);
    await touchSession(sessionId);
    return context;
  }

  async function ensureContext({ sessionId, trigger = "startup" }) {
    const existing = await currentContext({ sessionId });
    if (existing) return existing;
    await createContext({ sessionId, trigger, ordinal: 0 });
    return currentContext({ sessionId });
  }

  async function advanceContext({ sessionId, trigger }) {
    const existing = await currentContext({ sessionId });
    await createContext({
      sessionId,
      trigger,
      ordinal: (existing?.ordinal ?? -1) + 1,
    });
    return currentContext({ sessionId });
  }

  async function writePending(scope, { toolUseId, ...value }) {
    const target = path.join(
      contextDirectory(scope),
      "pending",
      `${opaqueKey(toolUseId)}.json`,
    );
    await writeImmutableJson(target, pick(value, PENDING_FIELDS));
    await touchSession(scope.sessionId);
  }

  async function readPending(scope, { toolUseId }) {
    const target = path.join(
      contextDirectory(scope),
      "pending",
      `${opaqueKey(toolUseId)}.json`,
    );
    try {
      return await readJson(target);
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }

  async function writeReadRecord(scope, { readKey, ...value }) {
    const key = safeSegment(readKey, "readKey");
    const digest = safeSegment(value.digest, "digest");
    const target = path.join(
      contextDirectory(scope),
      "reads",
      key,
      `${digest}.json`,
    );
    await writeImmutableJson(target, pick(value, READ_FIELDS));
    await touchSession(scope.sessionId);
  }

  async function findReadRecord(scope, { readKey, digest }) {
    const target = path.join(
      contextDirectory(scope),
      "reads",
      safeSegment(readKey, "readKey"),
      `${safeSegment(digest, "digest")}.json`,
    );
    try {
      return await readJson(target);
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }

  async function writeBlockedEvent(scope, value) {
    const created = now();
    const target = path.join(
      agentDirectory(scope),
      "events",
      `${created.getTime()}-${randomUUID()}.json`,
    );
    await writeImmutableJson(target, pick(value, EVENT_FIELDS));
    await touchSession(scope.sessionId);
  }

  async function eventsForSessionKey(key) {
    const agentsRoot = path.join(sessionsRoot, safeSegment(key, "sessionKey"), "agents");
    const agents = await readDirectory(agentsRoot);
    const events = [];

    for (const agent of agents) {
      if (!agent.isDirectory()) continue;
      const eventDirectory = path.join(agentsRoot, agent.name, "events");
      for (const entry of await readDirectory(eventDirectory)) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        events.push({
          ...(await readJson(path.join(eventDirectory, entry.name))),
          sessionKey: key,
          agentKey: agent.name,
        });
      }
    }

    return events;
  }

  async function listBlockedEvents({ sessionId } = {}) {
    if (sessionId) return eventsForSessionKey(sessionKey(sessionId));
    const sessions = await readDirectory(sessionsRoot);
    const events = [];
    for (const session of sessions) {
      if (!session.isDirectory() || !/^[a-f0-9]{32}$/.test(session.name)) continue;
      events.push(...await eventsForSessionKey(session.name));
    }
    return events;
  }

  async function armOverride({ sessionId, agentId, expiresAt }) {
    const created = now();
    const target = path.join(
      agentDirectory({ sessionId, agentId }),
      "overrides",
      `${created.getTime()}-${randomUUID()}.json`,
    );
    await writeImmutableJson(target, {
      createdAt: created.toISOString(),
      expiresAt,
    });
    await touchSession(sessionId);
  }

  async function consumeOverride({ sessionId, agentId }) {
    const directory = path.join(agentDirectory({ sessionId, agentId }), "overrides");
    const entries = (await readDirectory(directory))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .sort((left, right) => right.name.localeCompare(left.name));

    for (const entry of entries) {
      const source = path.join(directory, entry.name);
      let token;
      try {
        token = await readJson(source);
      } catch (error) {
        if (missing(error)) continue;
        throw error;
      }
      if (Date.parse(token.expiresAt) <= now().getTime()) continue;

      const consumedDirectory = path.join(directory, "consumed");
      await mkdir(consumedDirectory, { recursive: true });
      const claimPath = path.join(consumedDirectory, `${entry.name}.claim`);
      let claim;
      try {
        claim = await open(claimPath, "wx");
        await claim.close();
        claim = null;
        await rm(source, { force: true });
        await touchSession(sessionId);
        return true;
      } catch (error) {
        await claim?.close();
        if (error?.code === "EEXIST" || missing(error)) continue;
        throw error;
      }
    }

    return false;
  }

  async function cleanupExpiredSessions({ retentionMs }) {
    if (!Number.isSafeInteger(retentionMs) || retentionMs < 0) {
      throw new TypeError("retentionMs must be a non-negative safe integer");
    }
    const entries = await readDirectory(sessionsRoot);
    const removed = [];
    const cutoff = now().getTime() - retentionMs;

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-f0-9]{32}$/.test(entry.name)) continue;
      const candidate = path.resolve(sessionsRoot, entry.name);
      if (path.dirname(candidate) !== path.resolve(sessionsRoot)) continue;
      const details = await stat(candidate);
      if (details.mtimeMs >= cutoff) continue;
      await rm(candidate, { recursive: true, force: false });
      removed.push(entry.name);
    }

    return removed.sort();
  }

  async function writeDiagnostic({ sessionId, ...value }) {
    const created = now();
    const target = path.join(
      sessionDirectory(sessionId),
      "diagnostics",
      `${created.getTime()}-${randomUUID()}.json`,
    );
    await writeImmutableJson(target, sanitizeDiagnostic(value));
    await touchSession(sessionId);
  }

  return {
    ensureContext,
    advanceContext,
    currentContext,
    writePending,
    readPending,
    writeReadRecord,
    findReadRecord,
    writeBlockedEvent,
    listBlockedEvents,
    armOverride,
    consumeOverride,
    cleanupExpiredSessions,
    writeDiagnostic,
  };
}
