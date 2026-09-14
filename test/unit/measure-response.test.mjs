import assert from "node:assert/strict";
import test from "node:test";

import { measureResponseText } from "../../plugins/fileguard/src/measure-response.mjs";

test("measureResponseText counts a direct text response", () => {
  assert.equal(measureResponseText("abc"), 3);
});

test("measureResponseText counts documented content shapes", () => {
  assert.equal(measureResponseText({ content: "abc" }), 3);
  assert.equal(
    measureResponseText({
      content: [
        { type: "text", text: "abc" },
        { type: "text", text: "de" },
      ],
    }),
    5,
  );
});

test("measureResponseText counts Claude Code 2.1.270 Read file content", () => {
  assert.equal(
    measureResponseText({
      type: "text",
      file: {
        filePath: "C:\\project\\sample.txt",
        content: "first line\nsecond line\n",
        numLines: 3,
        startLine: 1,
        totalLines: 3,
      },
    }),
    23,
  );
});

test("measureResponseText counts Unicode code points rather than UTF-16 units", () => {
  assert.equal(measureResponseText("🛡️"), 2);
});

test("measureResponseText does not mistake metadata for delivered content", () => {
  assert.equal(
    measureResponseText({ filePath: "/secret/name", success: true }),
    null,
  );
  assert.equal(measureResponseText({ content: [{ type: "image", data: "abc" }] }), null);
});
