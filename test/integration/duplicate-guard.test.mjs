import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { runPreRead } from "../../plugins/fileguard/src/pre-read.mjs";
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
  const directory = await mkdtemp(path.join(tmpdir(), "fileguard-guard-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
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

async function completeRead(context, overrides = {}) {
  const toolUseId = overrides.tool_use_id ?? "tool-first";
  const toolInput = overrides.tool_input ?? { file_path: context.filePath };
  const common = {
    cwd: context.projectDir,
    tool_use_id: toolUseId,
    tool_input: toolInput,
    ...(overrides.agent_id ? { agent_id: overrides.agent_id } : {}),
    ...(overrides.session_id ? { session_id: overrides.session_id } : {}),
  };
  const before = await context.invoke("pre-read", preRead(context.filePath, common));
  assert.equal(before.stdout, "");
  const after = await context.invoke("post-read", postRead(context.filePath, common));
  assert.equal(after.status, 0);
}

function parseDecision(result) {
  return result.stdout ? JSON.parse(result.stdout) : null;
}

test("an exact unchanged duplicate is denied before Read executes", async (t) => {
  const context = await fixture(t);
  await completeRead(context);

  const duplicate = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-duplicate",
  }));
  const decision = parseDecision(duplicate);

  assert.equal(duplicate.status, 0);
  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /sample\.txt/);
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /SHA-256 digest is unchanged/);
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /\/fileguard:allow-next/);
  assert.doesNotMatch(decision.hookSpecificOutput.permissionDecisionReason, /tokens|\$/i);
  const events = await context.store.listBlockedEvents({ sessionId: "session-a" });
  assert.equal(events.length, 1);
  assert.equal(events[0].deliveredChars, 23);
});

test("changed content is allowed and can become the new successful state", async (t) => {
  const context = await fixture(t);
  await completeRead(context);
  await writeFile(context.filePath, "changed content\n", "utf8");

  const changed = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-changed",
  }));

  assert.equal(changed.status, 0);
  assert.equal(changed.stdout, "");
});

test("a range not previously delivered is allowed", async (t) => {
  const context = await fixture(t);
  await completeRead(context, {
    tool_input: { file_path: context.filePath, offset: 1, limit: 1 },
  });

  const differentOffset = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-offset",
    tool_input: { file_path: context.filePath, offset: 2, limit: 1 },
  }));
  const differentLimit = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-limit",
    tool_input: { file_path: context.filePath, offset: 1, limit: 2 },
  }));
  const fullRead = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-full",
  }));

  assert.equal(differentOffset.stdout, "");
  assert.equal(differentLimit.stdout, "");
  assert.equal(fullRead.stdout, "");
});

test("a failed earlier read does not block a later attempt", async (t) => {
  const context = await fixture(t);
  await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-failed",
  }));

  const retry = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-retry",
  }));

  assert.equal(retry.stdout, "");
});

test("sessions and agents cannot block each other's first read", async (t) => {
  const context = await fixture(t);
  await completeRead(context);
  await context.invoke("session-start", sessionStart({
    cwd: context.projectDir,
    session_id: "session-b",
  }));

  const otherSession = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    session_id: "session-b",
    tool_use_id: "tool-session-b",
  }));
  const firstSubagent = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    agent_id: "agent-a",
    tool_use_id: "tool-agent-a",
  }));
  await completeRead(context, { agent_id: "agent-a", tool_use_id: "tool-agent-a-read" });
  const secondSubagent = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    agent_id: "agent-b",
    tool_use_id: "tool-agent-b",
  }));

  assert.equal(otherSession.stdout, "");
  assert.equal(firstSubagent.stdout, "");
  assert.equal(secondSubagent.stdout, "");
});

test("compact and clear each allow a fresh read", async (t) => {
  const context = await fixture(t);
  await completeRead(context);
  await context.invoke("session-start", sessionStart({ cwd: context.projectDir, source: "compact" }));
  const afterCompact = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-after-compact",
  }));
  await context.invoke("session-start", sessionStart({ cwd: context.projectDir, source: "clear" }));
  const afterClear = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-after-clear",
  }));

  assert.equal(afterCompact.stdout, "");
  assert.equal(afterClear.stdout, "");
});

test("missing files and corrupt read state fail open", async (t) => {
  const context = await fixture(t);
  await completeRead(context);
  const active = await context.store.currentContext({ sessionId: "session-a" });
  const scope = { sessionId: "session-a", agentId: null, contextId: active.contextId };
  const pending = await context.store.readPending(scope, { toolUseId: "tool-first" });
  const recordPath = path.join(
    context.dataDir,
    "v1",
    "sessions",
    (await import("../../plugins/fileguard/src/identity.mjs")).opaqueKey("session-a"),
    "agents",
    "main",
    active.contextId,
    "reads",
    pending.readKey,
    `${pending.digest}.json`,
  );
  await writeFile(recordPath, "not-json", "utf8");
  const corrupt = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-corrupt",
  }));
  await rm(context.filePath);
  const missing = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-missing",
  }));

  assert.equal(corrupt.stdout, "");
  assert.equal(missing.stdout, "");
});

test("Windows case and separator variants identify the same real file", {
  skip: process.platform !== "win32",
}, async (t) => {
  const context = await fixture(t);
  await completeRead(context);
  const alternate = context.filePath.toUpperCase().replaceAll("\\", "/");

  const duplicate = await context.invoke("pre-read", preRead(alternate, {
    cwd: context.projectDir,
    tool_use_id: "tool-case-variant",
  }));

  assert.equal(parseDecision(duplicate).hookSpecificOutput.permissionDecision, "deny");
});

test("a blocked-event write failure cannot release a proven duplicate", async () => {
  const digest = "a".repeat(64);
  const snapshot = {
    filePath: "/project/sample.txt",
    pathKey: "/project/sample.txt",
    size: 10,
    mtimeNs: "1",
    digest,
  };
  const store = {
    ensureContext: async () => ({ contextId: "context-1" }),
    findReadRecord: async () => ({
      path: snapshot.filePath,
      pathKey: snapshot.pathKey,
      offset: null,
      limit: null,
      digest,
      deliveredChars: 10,
      measurement: "tool-response-text",
    }),
    consumeOverride: async () => false,
    writeBlockedEvent: async () => { throw new Error("ledger unavailable"); },
    writePending: async () => { throw new Error("must not write pending for a denied read"); },
  };

  const decision = await runPreRead(preRead(snapshot.filePath), {
    store,
    snapshotFile: async () => snapshot,
    platform: "linux",
  });

  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
});
