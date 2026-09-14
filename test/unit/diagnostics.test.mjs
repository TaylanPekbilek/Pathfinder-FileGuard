import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeDiagnostic } from "../../plugins/fileguard/src/diagnostics.mjs";

test("sanitizeDiagnostic retains only the local diagnostic allowlist", () => {
  assert.deepEqual(
    sanitizeDiagnostic({
      code: "STATE_UNAVAILABLE",
      hook: "PreToolUse",
      at: "2026-09-15T10:00:00.000Z",
      message: "secret path and content",
      stack: "secret stack",
      payload: { content: "secret source" },
    }),
    {
      code: "STATE_UNAVAILABLE",
      hook: "PreToolUse",
      at: "2026-09-15T10:00:00.000Z",
    },
  );
});

test("sanitizeDiagnostic replaces unrecognized codes and hook names", () => {
  assert.deepEqual(
    sanitizeDiagnostic({
      code: "secret-code",
      hook: "secret-hook",
      at: "2026-09-15T10:00:00.000Z",
    }),
    {
      code: "UNKNOWN",
      hook: "Unknown",
      at: "2026-09-15T10:00:00.000Z",
    },
  );
});
