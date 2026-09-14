import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { opaqueKey } from "../../plugins/fileguard/src/identity.mjs";
import { createStateStore } from "../../plugins/fileguard/src/state-store.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

async function fixture(t, options = {}) {
  const rootDir = await mkdtemp(path.join(tmpdir(), "fileguard-state-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(rootDir, { recursive: true, force: true })));
  let sequence = 0;
  const store = createStateStore({
    rootDir,
    now: options.now ?? (() => new Date("2026-09-15T10:00:00.000Z")),
    randomUUID: options.randomUUID ?? (() => `00000000-0000-4000-8000-${String(sequence += 1).padStart(12, "0")}`),
  });
  return { rootDir, store };
}

function readRecord(overrides = {}) {
  return {
    path: "C:\\project\\src\\a.js",
    pathKey: "c:\\project\\src\\a.js",
    offset: null,
    limit: null,
    size: 12,
    mtimeNs: "1000000",
    digest: "a".repeat(64),
    deliveredChars: 120,
    measurement: "tool-response-text",
    readAt: "2026-09-15T10:00:00.000Z",
    ...overrides,
  };
}

test("ensureContext creates one initial context and resume preserves it", async (t) => {
  const { store } = await fixture(t);

  const first = await store.ensureContext({ sessionId: "session-a", trigger: "startup" });
  const resumed = await store.ensureContext({ sessionId: "session-a", trigger: "resume" });

  assert.equal(first.ordinal, 0);
  assert.equal(resumed.contextId, first.contextId);
  assert.equal(resumed.ordinal, 0);
});

test("advanceContext creates a later context for compact and clear", async (t) => {
  const { store } = await fixture(t);
  const initial = await store.ensureContext({ sessionId: "session-a", trigger: "startup" });
  const compacted = await store.advanceContext({ sessionId: "session-a", trigger: "compact" });
  const cleared = await store.advanceContext({ sessionId: "session-a", trigger: "clear" });

  assert.notEqual(compacted.contextId, initial.contextId);
  assert.notEqual(cleared.contextId, compacted.contextId);
  assert.deepEqual([initial.ordinal, compacted.ordinal, cleared.ordinal], [0, 1, 2]);
  assert.equal((await store.currentContext({ sessionId: "session-a" })).contextId, cleared.contextId);
});

test("read records are isolated by session agent context range and digest", async (t) => {
  const { store } = await fixture(t);
  const context = await store.ensureContext({ sessionId: "session-a", trigger: "startup" });
  const scope = { sessionId: "session-a", agentId: null, contextId: context.contextId };
  await store.writeReadRecord(scope, { readKey: "1".repeat(32), ...readRecord() });

  assert.equal(
    (await store.findReadRecord(scope, { readKey: "1".repeat(32), digest: "a".repeat(64) })).size,
    12,
  );
  assert.equal(
    await store.findReadRecord({ ...scope, sessionId: "session-b" }, { readKey: "1".repeat(32), digest: "a".repeat(64) }),
    null,
  );
  assert.equal(
    await store.findReadRecord({ ...scope, agentId: "agent-a" }, { readKey: "1".repeat(32), digest: "a".repeat(64) }),
    null,
  );
  assert.equal(
    await store.findReadRecord({ ...scope, contextId: "different-context" }, { readKey: "1".repeat(32), digest: "a".repeat(64) }),
    null,
  );
  assert.equal(
    await store.findReadRecord(scope, { readKey: "2".repeat(32), digest: "a".repeat(64) }),
    null,
  );
  assert.equal(
    await store.findReadRecord(scope, { readKey: "1".repeat(32), digest: "b".repeat(64) }),
    null,
  );
});

test("read records persist only allowlisted metadata", async (t) => {
  const { rootDir, store } = await fixture(t);
  const context = await store.ensureContext({ sessionId: "session-a", trigger: "startup" });
  const scope = { sessionId: "session-a", agentId: null, contextId: context.contextId };
  const record = readRecord({
    content: "secret source text",
    prompt: "secret prompt",
    tool_response: { content: "secret response" },
    apiKey: "secret-key",
    environment: { TOKEN: "secret-token" },
  });
  await store.writeReadRecord(scope, { readKey: "1".repeat(32), ...record });
  const storedPath = path.join(
    rootDir,
    "v1",
    "sessions",
    opaqueKey("session-a"),
    "agents",
    "main",
    context.contextId,
    "reads",
    "1".repeat(32),
    `${"a".repeat(64)}.json`,
  );
  const storedText = await readFile(storedPath, "utf8");
  const stored = JSON.parse(storedText);

  assert.deepEqual(Object.keys(stored).sort(), [
    "deliveredChars",
    "digest",
    "limit",
    "measurement",
    "mtimeNs",
    "offset",
    "path",
    "pathKey",
    "readAt",
    "size",
  ]);
  assert.doesNotMatch(storedText, /secret/);
});

test("concurrent idempotent writes leave one valid read record", async (t) => {
  const { store } = await fixture(t);
  const context = await store.ensureContext({ sessionId: "session-a", trigger: "startup" });
  const scope = { sessionId: "session-a", agentId: null, contextId: context.contextId };

  await Promise.all(
    Array.from({ length: 25 }, () =>
      store.writeReadRecord(scope, { readKey: "1".repeat(32), ...readRecord() }),
    ),
  );

  const stored = await store.findReadRecord(scope, {
    readKey: "1".repeat(32),
    digest: "a".repeat(64),
  });
  assert.equal(stored.digest, "a".repeat(64));
});

test("one override token can be consumed by only one concurrent caller", async (t) => {
  const { store } = await fixture(t);
  await store.armOverride({
    sessionId: "session-a",
    agentId: null,
    expiresAt: "2026-09-15T10:05:00.000Z",
  });

  const results = await Promise.all([
    store.consumeOverride({ sessionId: "session-a", agentId: null }),
    store.consumeOverride({ sessionId: "session-a", agentId: null }),
  ]);

  assert.deepEqual(results.sort(), [false, true]);
});

test("expired override tokens are ignored", async (t) => {
  const { store } = await fixture(t, {
    now: () => new Date("2026-09-15T10:05:00.001Z"),
  });
  await store.armOverride({
    sessionId: "session-a",
    agentId: null,
    expiresAt: "2026-09-15T10:05:00.000Z",
  });

  assert.equal(await store.consumeOverride({ sessionId: "session-a", agentId: null }), false);
});

test("blocked events can be listed for one session or retained history", async (t) => {
  const { store } = await fixture(t);
  await store.writeBlockedEvent(
    { sessionId: "session-a", agentId: null },
    {
      path: "/project/a.js",
      offset: null,
      limit: null,
      deliveredChars: 100,
      measurement: "tool-response-text",
      blockedAt: "2026-09-15T10:00:00.000Z",
    },
  );
  await store.writeBlockedEvent(
    { sessionId: "session-b", agentId: "agent-b" },
    {
      path: "/project/b.js",
      offset: 1,
      limit: 10,
      deliveredChars: 50,
      measurement: "tool-response-text",
      blockedAt: "2026-09-15T10:01:00.000Z",
    },
  );

  assert.equal((await store.listBlockedEvents({ sessionId: "session-a" })).length, 1);
  assert.equal((await store.listBlockedEvents({})).length, 2);
});

test("cleanup removes only expired opaque session directories", async (t) => {
  const now = new Date("2026-09-15T10:00:00.000Z");
  const { rootDir, store } = await fixture(t, { now: () => now });
  await store.ensureContext({ sessionId: "old-session", trigger: "startup" });
  await store.ensureContext({ sessionId: "new-session", trigger: "startup" });
  const sessionsRoot = path.join(rootDir, "v1", "sessions");
  const oldPath = path.join(sessionsRoot, opaqueKey("old-session"));
  const oldTime = new Date(now.getTime() - 31 * DAY_MS);
  await utimes(oldPath, oldTime, oldTime);

  const removed = await store.cleanupExpiredSessions({ retentionMs: 30 * DAY_MS });

  assert.deepEqual(removed, [opaqueKey("old-session")]);
  await assert.rejects(stat(oldPath), { code: "ENOENT" });
  assert.equal((await stat(path.join(sessionsRoot, opaqueKey("new-session")))).isDirectory(), true);
});
