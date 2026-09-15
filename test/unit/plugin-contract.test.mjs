import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const claudeProbe = spawnSync("claude", ["--version"], {
  cwd: repoRoot,
  encoding: "utf8",
  shell: false,
});
const claudeTest = claudeProbe.error?.code === "ENOENT" ? test.skip : test;

function validatePlugin(target) {
  return spawnSync("claude", ["plugin", "validate", target], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
}

claudeTest("Claude Code accepts the FileGuard marketplace", () => {
  const result = validatePlugin(".");
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.doesNotMatch(output, /warning/i);
});

claudeTest("Claude Code accepts the FileGuard plugin package", () => {
  const result = validatePlugin("./plugins/fileguard");
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.doesNotMatch(output, /warning/i);
});
