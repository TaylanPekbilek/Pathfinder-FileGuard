import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createStateStore } from "../../plugins/fileguard/src/state-store.mjs";
import { sessionStart } from "../fixtures/hook-payloads.mjs";
import { runHook } from "../helpers/run-hook.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const scriptPath = path.join(
  repoRoot,
  "plugins",
  "fileguard",
  "scripts",
  "hooks",
  "session-start.mjs",
);

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "fileguard-session-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true })));
  const dataDir = path.join(directory, "data");
  const envFile = path.join(directory, "claude-env.sh");
  const store = createStateStore({ rootDir: dataDir });
  const invoke = (payload) => runHook({
    scriptPath,
    payload,
    dataDir,
    env: { CLAUDE_ENV_FILE: envFile },
  });
  return { dataDir, envFile, store, invoke };
}

test("startup creates context zero and resume preserves it", async (t) => {
  const { store, invoke } = await fixture(t);

  const started = await invoke(sessionStart());
  const initial = await store.currentContext({ sessionId: "session-a" });
  const resumed = await invoke(sessionStart({ source: "resume" }));
  const afterResume = await store.currentContext({ sessionId: "session-a" });

  assert.equal(started.status, 0);
  assert.equal(started.stdout, "");
  assert.equal(resumed.status, 0);
  assert.equal(initial.ordinal, 0);
  assert.equal(afterResume.contextId, initial.contextId);
});

test("compact and clear each create one later context", async (t) => {
  const { store, invoke } = await fixture(t);
  await invoke(sessionStart());

  await invoke(sessionStart({ source: "compact" }));
  const compacted = await store.currentContext({ sessionId: "session-a" });
  await invoke(sessionStart({ source: "clear" }));
  const cleared = await store.currentContext({ sessionId: "session-a" });

  assert.equal(compacted.ordinal, 1);
  assert.equal(cleared.ordinal, 2);
  assert.notEqual(cleared.contextId, compacted.contextId);
});

test("separate sessions start with independent context zero", async (t) => {
  const { store, invoke } = await fixture(t);
  await invoke(sessionStart());
  await invoke(sessionStart({ session_id: "session-b" }));

  const first = await store.currentContext({ sessionId: "session-a" });
  const second = await store.currentContext({ sessionId: "session-b" });

  assert.equal(first.ordinal, 0);
  assert.equal(second.ordinal, 0);
  assert.notEqual(first.contextId, second.contextId);
});

test("SessionStart exports a safely quoted current session id", async (t) => {
  const { envFile, invoke } = await fixture(t);
  const result = await invoke(sessionStart({ session_id: "session-'quoted" }));

  assert.equal(result.status, 0);
  assert.equal(
    await readFile(envFile, "utf8"),
    "export FILEGUARD_SESSION_ID='session-'\"'\"'quoted'\n",
  );
});

test("malformed hook input fails open without writing hook output", async (t) => {
  const { dataDir } = await fixture(t);
  const result = await runHook({
    scriptPath,
    rawInput: "not-json",
    dataDir,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("missing plugin data directory fails open", async () => {
  const result = await runHook({
    scriptPath,
    payload: sessionStart(),
    dataDir: "",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
