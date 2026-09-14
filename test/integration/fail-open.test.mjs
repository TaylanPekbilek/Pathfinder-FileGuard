import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { sessionKey } from "../../plugins/fileguard/src/identity.mjs";
import { createStateStore } from "../../plugins/fileguard/src/state-store.mjs";
import { preRead, sessionStart } from "../fixtures/hook-payloads.mjs";
import { runHook } from "../helpers/run-hook.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const hookPath = (name) => path.join(
  repoRoot,
  "plugins",
  "fileguard",
  "scripts",
  "hooks",
  `${name}.mjs`,
);

async function expectFailOpen(result) {
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "fileguard-fail-open-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataDir = path.join(directory, "data");
  const projectDir = path.join(directory, "project");
  const filePath = path.join(projectDir, "sample.txt");
  await mkdir(projectDir, { recursive: true });
  await writeFile(filePath, "safe fixture text", "utf8");
  return {
    dataDir,
    directory,
    filePath,
    projectDir,
    invoke: (payload, options = {}) => runHook({
      scriptPath: hookPath("pre-read"),
      payload,
      dataDir: options.dataDir ?? dataDir,
      rawInput: options.rawInput,
    }),
  };
}

test("malformed and incomplete PreToolUse payloads fail open", async (t) => {
  const context = await fixture(t);
  await expectFailOpen(await context.invoke(null, { rawInput: "{not-json" }));

  const missingSession = preRead(context.filePath, { cwd: context.projectDir });
  delete missingSession.session_id;
  await expectFailOpen(await context.invoke(missingSession));

  const missingPath = preRead(context.filePath, { cwd: context.projectDir });
  missingPath.tool_input = {};
  await expectFailOpen(await context.invoke(missingPath));
});

test("unreadable targets and unavailable state fail open", async (t) => {
  const context = await fixture(t);

  await expectFailOpen(await context.invoke(preRead(context.projectDir, {
    cwd: context.projectDir,
    tool_use_id: "directory-target",
  })));

  const removedPath = path.join(context.projectDir, "removed-before-snapshot.txt");
  await writeFile(removedPath, "gone", "utf8");
  await rm(removedPath);
  await expectFailOpen(await context.invoke(preRead(removedPath, {
    cwd: context.projectDir,
    tool_use_id: "removed-target",
  })));

  const dataPathThatIsAFile = path.join(context.directory, "not-a-directory");
  await writeFile(dataPathThatIsAFile, "state unavailable", "utf8");
  await expectFailOpen(await context.invoke(preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "unavailable-store",
  }), { dataDir: dataPathThatIsAFile }));
});

test("corrupt context and read records cannot cause a block", async (t) => {
  const context = await fixture(t);
  const start = await runHook({
    scriptPath: hookPath("session-start"),
    payload: sessionStart({ cwd: context.projectDir }),
    dataDir: context.dataDir,
  });
  assert.equal(start.status, 0);

  const contextsDir = path.join(
    context.dataDir,
    "v1",
    "sessions",
    sessionKey("session-a"),
    "contexts",
  );
  const [contextFile] = await readdir(contextsDir);
  await writeFile(path.join(contextsDir, contextFile), "not-json", "utf8");

  await expectFailOpen(await context.invoke(preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "corrupt-context",
  })));

  await rm(context.dataDir, { recursive: true, force: true });
  await runHook({
    scriptPath: hookPath("session-start"),
    payload: sessionStart({ cwd: context.projectDir }),
    dataDir: context.dataDir,
  });
  const first = preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "pending-read",
  });
  await context.invoke(first);

  const store = createStateStore({ rootDir: context.dataDir });
  const active = await store.currentContext({ sessionId: "session-a" });
  const scope = {
    sessionId: "session-a",
    agentId: null,
    contextId: active.contextId,
  };
  const pending = await store.readPending(scope, { toolUseId: "pending-read" });
  const exactReadDir = path.join(
    context.dataDir,
    "v1",
    "sessions",
    sessionKey("session-a"),
    "agents",
    "main",
    active.contextId,
    "reads",
    pending.readKey,
  );
  await mkdir(exactReadDir, { recursive: true });
  await writeFile(path.join(exactReadDir, `${pending.digest}.json`), "not-json", "utf8");

  await expectFailOpen(await context.invoke(preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "corrupt-read-record",
  })));
});
