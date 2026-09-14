import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { postRead, preRead, sessionStart } from "../fixtures/hook-payloads.mjs";
import { runHook } from "../helpers/run-hook.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const pluginRoot = path.join(repoRoot, "plugins", "fileguard");
const hookPath = (name) => path.join(pluginRoot, "scripts", "hooks", `${name}.mjs`);
const commandPath = (name) => path.join(pluginRoot, "scripts", "commands", `${name}.mjs`);

function runCommand(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [commandPath(name), ...args], {
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

async function jsonStateText(root) {
  const files = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.name.endsWith(".json")) files.push(target);
    }
  }

  await visit(root);
  return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
}

test("the release flow blocks, reports, bypasses once, and resets on compact", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "fileguard-full-flow-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataDir = path.join(directory, "data");
  const projectDir = path.join(directory, "project");
  const filePath = path.join(projectDir, "sample.txt");
  const deliveredText = "private fixture sentence 8d96c57b";
  await mkdir(projectDir, { recursive: true });
  await writeFile(filePath, deliveredText, "utf8");

  const invoke = (name, payload) => runHook({
    scriptPath: hookPath(name),
    payload,
    dataDir,
  });
  const readPayload = (event, toolUseId) => event(filePath, {
    cwd: projectDir,
    tool_use_id: toolUseId,
    ...(event === postRead
      ? { tool_response: { content: [{ type: "text", text: deliveredText }] } }
      : {}),
  });

  assert.equal(
    (await invoke("session-start", sessionStart({ cwd: projectDir }))).stdout,
    "",
  );
  assert.equal((await invoke("pre-read", readPayload(preRead, "read-1"))).stdout, "");
  assert.equal((await invoke("post-read", readPayload(postRead, "read-1"))).stdout, "");

  const firstBlock = await invoke("pre-read", readPayload(preRead, "read-2"));
  assert.equal(
    JSON.parse(firstBlock.stdout).hookSpecificOutput.permissionDecision,
    "deny",
  );

  const report = await runCommand("report", [
    "--data-dir",
    dataDir,
    "--session",
    "session-a",
    "--hide-paths",
  ]);
  assert.equal(report.status, 0);
  assert.match(report.stdout, /Current session[\s\S]*Blocked reads: 1/);
  assert.match(report.stdout, /Measured prevented characters: 33/);
  assert.doesNotMatch(report.stdout, /sample\.txt/);

  const override = await runCommand("allow-next", [
    "--data-dir",
    dataDir,
    "--session",
    "session-a",
  ]);
  assert.equal(override.status, 0);
  assert.match(override.stdout, /may proceed once/);

  assert.equal((await invoke("pre-read", readPayload(preRead, "read-3"))).stdout, "");
  assert.equal((await invoke("post-read", readPayload(postRead, "read-3"))).stdout, "");

  const secondBlock = await invoke("pre-read", readPayload(preRead, "read-4"));
  assert.equal(
    JSON.parse(secondBlock.stdout).hookSpecificOutput.permissionDecision,
    "deny",
  );

  await invoke("session-start", sessionStart({ cwd: projectDir, source: "compact" }));
  assert.equal((await invoke("pre-read", readPayload(preRead, "read-5"))).stdout, "");

  assert.equal((await jsonStateText(dataDir)).includes(deliveredText), false);
});
