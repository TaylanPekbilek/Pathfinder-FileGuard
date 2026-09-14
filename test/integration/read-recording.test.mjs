import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createStateStore } from "../../plugins/fileguard/src/state-store.mjs";
import { postRead, preRead, sessionStart } from "../fixtures/hook-payloads.mjs";
import { runHook } from "../helpers/run-hook.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const hookScript = (name) => path.join(
  repoRoot,
  "plugins",
  "fileguard",
  "scripts",
  "hooks",
  `${name}.mjs`,
);

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "fileguard-recording-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true })));
  const dataDir = path.join(directory, "data");
  const projectDir = path.join(directory, "project");
  const filePath = path.join(projectDir, "sample.txt");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(projectDir, { recursive: true }));
  await writeFile(filePath, "first line\nsecond line\n", "utf8");
  const store = createStateStore({ rootDir: dataDir });
  const invoke = (name, payload) => runHook({
    scriptPath: hookScript(name),
    payload,
    dataDir,
  });
  await invoke("session-start", sessionStart({ cwd: projectDir }));
  return { dataDir, projectDir, filePath, store, invoke };
}

async function scopeAndPending(store, toolUseId = "tool-read-1", agentId = null) {
  const context = await store.currentContext({ sessionId: "session-a" });
  const scope = { sessionId: "session-a", agentId, contextId: context.contextId };
  const pending = await store.readPending(scope, { toolUseId });
  return { scope, pending };
}

test("PreToolUse allows a first read and records only snapshot metadata", async (t) => {
  const { filePath, projectDir, store, invoke } = await fixture(t);
  const result = await invoke("pre-read", preRead(filePath, { cwd: projectDir }));
  const { pending } = await scopeAndPending(store);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.equal(pending.path, filePath);
  assert.equal(pending.offset, null);
  assert.equal(pending.limit, null);
  assert.equal(pending.size, 23);
  assert.match(pending.digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(pending, "content"), false);
});

test("successful PostToolUse turns a matching pending read into a read record", async (t) => {
  const { filePath, projectDir, store, invoke } = await fixture(t);
  await invoke("pre-read", preRead(filePath, { cwd: projectDir }));
  const { scope, pending } = await scopeAndPending(store);

  const result = await invoke("post-read", postRead(filePath, { cwd: projectDir }));
  const record = await store.findReadRecord(scope, {
    readKey: pending.readKey,
    digest: pending.digest,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(record.deliveredChars, 23);
  assert.equal(record.measurement, "tool-response-text");
  assert.equal(Object.hasOwn(record, "content"), false);
});

test("a read without successful PostToolUse never becomes blocking state", async (t) => {
  const { filePath, projectDir, store, invoke } = await fixture(t);
  await invoke("pre-read", preRead(filePath, { cwd: projectDir }));
  const { scope, pending } = await scopeAndPending(store);

  assert.equal(
    await store.findReadRecord(scope, {
      readKey: pending.readKey,
      digest: pending.digest,
    }),
    null,
  );
});

test("a file changed between PreToolUse and PostToolUse is not recorded", async (t) => {
  const { filePath, projectDir, store, invoke } = await fixture(t);
  await invoke("pre-read", preRead(filePath, { cwd: projectDir }));
  const { scope, pending } = await scopeAndPending(store);
  await writeFile(filePath, "changed after the read", "utf8");

  const result = await invoke("post-read", postRead(filePath, { cwd: projectDir }));

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(
    await store.findReadRecord(scope, {
      readKey: pending.readKey,
      digest: pending.digest,
    }),
    null,
  );
});

test("mismatched tool use id cannot complete another read", async (t) => {
  const { filePath, projectDir, store, invoke } = await fixture(t);
  await invoke("pre-read", preRead(filePath, { cwd: projectDir }));
  const { scope, pending } = await scopeAndPending(store);

  await invoke("post-read", postRead(filePath, {
    cwd: projectDir,
    tool_use_id: "different-tool-use",
  }));

  assert.equal(
    await store.findReadRecord(scope, {
      readKey: pending.readKey,
      digest: pending.digest,
    }),
    null,
  );
});

test("mismatched requested range cannot complete another read", async (t) => {
  const { filePath, projectDir, store, invoke } = await fixture(t);
  await invoke("pre-read", preRead(filePath, {
    cwd: projectDir,
    tool_input: { file_path: filePath, offset: 1, limit: 2 },
  }));
  const { scope, pending } = await scopeAndPending(store);

  await invoke("post-read", postRead(filePath, {
    cwd: projectDir,
    tool_input: { file_path: filePath, offset: 2, limit: 2 },
  }));

  assert.equal(
    await store.findReadRecord(scope, {
      readKey: pending.readKey,
      digest: pending.digest,
    }),
    null,
  );
});

test("PostToolUse never persists the delivered file text", async (t) => {
  const { dataDir, filePath, projectDir, invoke } = await fixture(t);
  await invoke("pre-read", preRead(filePath, { cwd: projectDir }));
  await invoke("post-read", postRead(filePath, { cwd: projectDir }));
  const files = [];

  async function collect(directory) {
    for (const entry of await import("node:fs/promises").then(({ readdir }) => readdir(directory, { withFileTypes: true }))) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(target);
      else if (entry.name.endsWith(".json")) files.push(target);
    }
  }
  await collect(dataDir);
  const stateText = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");

  assert.doesNotMatch(stateText, /first line\nsecond line/);
});

test("invalid PreToolUse input fails open", async (t) => {
  const { dataDir } = await fixture(t);
  const result = await runHook({
    scriptPath: hookScript("pre-read"),
    payload: preRead("", { tool_input: {} }),
    dataDir,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
