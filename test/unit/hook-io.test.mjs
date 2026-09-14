import assert from "node:assert/strict";
import { PassThrough, Readable } from "node:stream";
import test from "node:test";

import {
  denyRead,
  readHookInput,
  writeHookOutput,
} from "../../plugins/fileguard/src/hook-io.mjs";

test("readHookInput parses one JSON object from stdin", async () => {
  const input = Readable.from(['{"hook_event_name":"PreToolUse"}']);

  assert.deepEqual(await readHookInput(input), {
    hook_event_name: "PreToolUse",
  });
});

test("readHookInput rejects malformed JSON", async () => {
  await assert.rejects(
    readHookInput(Readable.from(["not-json"])),
    SyntaxError,
  );
});

test("readHookInput rejects payloads larger than one MiB", async () => {
  const oversized = `{"value":"${"x".repeat(1024 * 1024)}"}`;

  await assert.rejects(
    readHookInput(Readable.from([oversized])),
    /exceeds 1048576 bytes/,
  );
});

test("denyRead returns Claude Code's supported PreToolUse shape", () => {
  assert.deepEqual(denyRead("duplicate"), {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "duplicate",
    },
  });
});

test("writeHookOutput emits exactly one JSON line", () => {
  const output = new PassThrough();

  writeHookOutput({ ok: true }, output);

  assert.equal(output.read().toString("utf8"), '{"ok":true}\n');
});
