import assert from "node:assert/strict";
import test from "node:test";

import {
  formatReport,
  summarizeBlockedReads,
} from "../../plugins/fileguard/src/report.mjs";

const events = [
  {
    sessionKey: "session-a-key",
    path: "/project/a.js",
    deliveredChars: 400,
    measurement: "tool-response-text",
    blockedAt: "2026-09-15T10:00:00Z",
  },
  {
    sessionKey: "session-a-key",
    path: "/project/b.js",
    deliveredChars: 800,
    measurement: "tool-response-text",
    blockedAt: "2026-09-15T10:01:00Z",
  },
  {
    sessionKey: "session-a-key",
    path: "/project/image.png",
    deliveredChars: null,
    measurement: null,
    blockedAt: "2026-09-15T10:02:00Z",
  },
  {
    sessionKey: "session-b-key",
    path: "/project/other.js",
    deliveredChars: 200,
    measurement: "tool-response-text",
    blockedAt: "2026-09-15T10:03:00Z",
  },
];

test("summarizeBlockedReads separates current session from retained history", () => {
  const summary = summarizeBlockedReads(events, { currentSessionKey: "session-a-key" });

  assert.deepEqual(summary.current, {
    blockedReads: 3,
    measuredBlockedReads: 2,
    unmeasuredBlockedReads: 1,
    avoidedChars: 1200,
    approximateTokens: 300,
    largest: { path: "/project/b.js", deliveredChars: 800 },
    paths: ["/project/a.js", "/project/b.js", "/project/image.png"],
  });
  assert.equal(summary.retained.blockedReads, 4);
  assert.equal(summary.retained.avoidedChars, 1400);
  assert.equal(summary.retained.approximateTokens, 350);
});

test("formatReport labels character facts separately from token estimates", () => {
  const output = formatReport(
    summarizeBlockedReads(events, { currentSessionKey: "session-a-key" }),
  );

  assert.match(output, /Blocked reads: 3/);
  assert.match(output, /Measured prevented characters: 1,200/);
  assert.match(output, /Approximate prevented tokens: ~300/);
  assert.match(output, /Without text measurement: 1/);
  assert.match(output, /Largest measured duplicate: 800 characters/);
  assert.match(output, /characters \/ 4/);
  assert.match(output, /not billed usage/i);
  assert.doesNotMatch(output, /\$/);
});

test("formatReport can hide every path for shared screenshots", () => {
  const output = formatReport(
    summarizeBlockedReads(events, { currentSessionKey: "session-a-key" }),
    { hidePaths: true },
  );

  assert.doesNotMatch(output, /a\.js|b\.js|image\.png|other\.js|\/project/);
  assert.match(output, /File #1/);
  assert.match(output, /File #4/);
});

test("formatReport prevents path line breaks from altering report structure", () => {
  const unsafe = [{
    sessionKey: "session-a-key",
    path: "/project/a.js\nFake total: 999",
    deliveredChars: 20,
    measurement: "tool-response-text",
  }];
  const output = formatReport(
    summarizeBlockedReads(unsafe, { currentSessionKey: "session-a-key" }),
  );

  assert.doesNotMatch(output, /a\.js\nFake/);
  assert.match(output, /a\.js Fake total: 999/);
});
