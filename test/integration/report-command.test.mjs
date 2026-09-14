import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createStateStore } from "../../plugins/fileguard/src/state-store.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const commandPath = path.join(
  repoRoot,
  "plugins",
  "fileguard",
  "scripts",
  "commands",
  "report.mjs",
);

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
  const dataDir = await mkdtemp(path.join(tmpdir(), "fileguard-report-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const store = createStateStore({ rootDir: dataDir });
  await store.writeBlockedEvent(
    { sessionId: "session-a", agentId: null },
    {
      path: "C:\\secret-project\\src\\large.js",
      offset: null,
      limit: null,
      deliveredChars: 1200,
      measurement: "tool-response-text",
      blockedAt: "2026-09-15T10:00:00.000Z",
    },
  );
  await store.writeBlockedEvent(
    { sessionId: "session-b", agentId: null },
    {
      path: "C:\\other-project\\src\\small.js",
      offset: null,
      limit: null,
      deliveredChars: 200,
      measurement: "tool-response-text",
      blockedAt: "2026-09-15T10:01:00.000Z",
    },
  );
  return dataDir;
}

test("report command prints current and retained savings without money claims", async (t) => {
  const dataDir = await fixture(t);
  const result = await runCommand([
    "--data-dir",
    dataDir,
    "--session",
    "session-a",
  ]);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Current session[\s\S]*Blocked reads: 1/);
  assert.match(result.stdout, /Retained local history \(30 days\)[\s\S]*Blocked reads: 2/);
  assert.match(result.stdout, /large\.js/);
  assert.doesNotMatch(result.stdout, /\$/);
});

test("report --hide-paths removes sensitive path text", async (t) => {
  const dataDir = await fixture(t);
  const result = await runCommand([
    "--data-dir",
    dataDir,
    "--session",
    "session-a",
    "--hide-paths",
  ]);

  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /secret-project|other-project|large\.js|small\.js/);
  assert.match(result.stdout, /File #1/);
});

test("report rejects missing session identity", async (t) => {
  const dataDir = await fixture(t);
  const result = await runCommand(["--data-dir", dataDir]);

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /session/i);
});

test("report rejects unknown arguments", async (t) => {
  const dataDir = await fixture(t);
  const result = await runCommand([
    "--data-dir",
    dataDir,
    "--session",
    "session-a",
    "--money",
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /unknown argument/i);
});
