import path from "node:path";

import { sessionKey } from "../../src/identity.mjs";
import { formatReport, summarizeBlockedReads } from "../../src/report.mjs";
import { createStateStore } from "../../src/state-store.mjs";

function parseArguments(argv) {
  const values = { hidePaths: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--hide-paths") {
      if (values.hidePaths) throw new TypeError("Duplicate argument: --hide-paths");
      values.hidePaths = true;
      continue;
    }
    if (argument !== "--data-dir" && argument !== "--session") {
      throw new TypeError(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      throw new TypeError(`Missing value for ${argument}`);
    }
    const key = argument === "--data-dir" ? "dataDir" : "sessionId";
    if (values[key]) throw new TypeError(`Duplicate argument: ${argument}`);
    values[key] = value;
    index += 1;
  }
  return values;
}

export async function createReport(argv) {
  const { dataDir, sessionId, hidePaths } = parseArguments(argv);
  if (!sessionId) throw new TypeError("Session identity is required.");
  if (!dataDir || !path.isAbsolute(dataDir)) {
    throw new TypeError("FileGuard data directory must be absolute.");
  }
  const store = createStateStore({ rootDir: dataDir });
  const events = await store.listBlockedEvents({});
  const summary = summarizeBlockedReads(events, {
    currentSessionKey: sessionKey(sessionId),
  });
  return formatReport(summary, { hidePaths });
}

try {
  process.stdout.write(`${await createReport(process.argv.slice(2))}\n`);
} catch (error) {
  process.stderr.write(`FileGuard: ${error.message}\n`);
  process.exitCode = 1;
}
