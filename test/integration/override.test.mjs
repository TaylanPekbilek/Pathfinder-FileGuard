import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { postRead, preRead, sessionStart } from "../fixtures/hook-payloads.mjs";
import { runHook } from "../helpers/run-hook.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const pluginRoot = path.join(repoRoot, "plugins", "fileguard");
const commandPath = path.join(pluginRoot, "scripts", "commands", "allow-next.mjs");
const hookPath = (name) => path.join(pluginRoot, "scripts", "hooks", `${name}.mjs`);

function runCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [commandPath, ...args], {
      cwd: repoRoot,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "fileguard-override-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataDir = path.join(directory, "data");
  const projectDir = path.join(directory, "project");
  const filePath = path.join(projectDir, "sample.txt");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(projectDir, { recursive: true }));
  await writeFile(filePath, "first line\nsecond line\n", "utf8");
  const invoke = (name, payload) => runHook({
    scriptPath: hookPath(name),
    payload,
    dataDir,
  });
  await invoke("session-start", sessionStart({ cwd: projectDir }));
  await invoke("pre-read", preRead(filePath, {
    cwd: projectDir,
    tool_use_id: "tool-first",
  }));
  await invoke("post-read", postRead(filePath, {
    cwd: projectDir,
    tool_use_id: "tool-first",
  }));
  return { dataDir, projectDir, filePath, invoke };
}

test("allow-next permits exactly one otherwise-blocked read", async (t) => {
  const context = await fixture(t);
  const before = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-before-override",
  }));
  assert.equal(JSON.parse(before.stdout).hookSpecificOutput.permissionDecision, "deny");

  const armed = await runCommand([
    "--data-dir",
    context.dataDir,
    "--session",
    "session-a",
  ]);
  assert.equal(armed.status, 0);
  assert.equal(armed.stderr, "");
  assert.equal(
    armed.stdout,
    "FileGuard: the next otherwise-blocked read in this session may proceed once. The bypass expires in 5 minutes.\n",
  );

  const allowed = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-allowed-once",
  }));
  assert.equal(allowed.stdout, "");
  await context.invoke("post-read", postRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-allowed-once",
  }));

  const blockedAgain = await context.invoke("pre-read", preRead(context.filePath, {
    cwd: context.projectDir,
    tool_use_id: "tool-blocked-again",
  }));
  assert.equal(JSON.parse(blockedAgain.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("allow-next rejects missing session identity instead of creating a global bypass", async (t) => {
  const context = await fixture(t);

  const result = await runCommand(["--data-dir", context.dataDir]);

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /restart Claude Code with FileGuard enabled/i);
});

test("allow-next rejects a relative state directory", async () => {
  const result = await runCommand([
    "--data-dir",
    "relative-data",
    "--session",
    "session-a",
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /absolute/);
});

test("allow-next rejects unknown arguments", async (t) => {
  const context = await fixture(t);

  const result = await runCommand([
    "--data-dir",
    context.dataDir,
    "--session",
    "session-a",
    "--forever",
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /unknown argument/i);
});
