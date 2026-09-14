import assert from "node:assert/strict";
import test from "node:test";

import {
  agentKey,
  normalizePathKey,
  normalizeRange,
  opaqueKey,
  readKey,
} from "../../plugins/fileguard/src/identity.mjs";

test("Windows path keys ignore case and separator spelling", () => {
  assert.equal(
    normalizePathKey("C:\\Work\\Src\\APP.ts", "win32"),
    "c:\\work\\src\\app.ts",
  );
  assert.equal(
    normalizePathKey("C:/Work/Src/APP.ts", "win32"),
    "c:\\work\\src\\app.ts",
  );
});

test("Linux path keys preserve case", () => {
  assert.notEqual(
    normalizePathKey("/Work/APP.ts", "linux"),
    normalizePathKey("/work/app.ts", "linux"),
  );
});

test("macOS path keys preserve case conservatively", () => {
  assert.notEqual(
    normalizePathKey("/Work/APP.ts", "darwin"),
    normalizePathKey("/work/app.ts", "darwin"),
  );
});

test("missing range values remain distinct from explicit values", () => {
  assert.deepEqual(normalizeRange({}), { offset: null, limit: null });
  assert.deepEqual(normalizeRange({ offset: 10, limit: 50 }), {
    offset: 10,
    limit: 50,
  });
});

test("invalid range values are rejected", () => {
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "10"]) {
    assert.throws(() => normalizeRange({ offset: value }), /offset/);
    assert.throws(() => normalizeRange({ limit: value }), /limit/);
  }
});

test("main and subagents receive isolated opaque keys", () => {
  assert.equal(agentKey({}), "main");
  assert.notEqual(agentKey({ agent_id: "agent-a" }), agentKey({ agent_id: "agent-b" }));
  assert.equal(agentKey({ agent_id: "agent-a" }).length, 32);
});

test("opaque keys never expose their raw identifier", () => {
  const key = opaqueKey("private-session-id");

  assert.equal(key.length, 32);
  assert.doesNotMatch(key, /private-session-id/);
});

test("read keys change when the path or requested range changes", () => {
  const base = { pathKey: "/project/a.js", offset: null, limit: null };

  assert.notEqual(readKey(base), readKey({ ...base, offset: 1 }));
  assert.notEqual(readKey(base), readKey({ ...base, limit: 50 }));
  assert.notEqual(readKey(base), readKey({ ...base, pathKey: "/project/b.js" }));
});
