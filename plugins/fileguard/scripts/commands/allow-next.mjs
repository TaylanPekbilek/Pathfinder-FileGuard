import path from "node:path";

import { createStateStore } from "../../src/state-store.mjs";

const SUCCESS = "FileGuard: the next otherwise-blocked read in this session may proceed once. The bypass expires in 5 minutes.";

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
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

export async function armNextRead(argv, options = {}) {
  const { dataDir, sessionId } = parseArguments(argv);
  if (!sessionId) {
    throw new TypeError("Session identity is missing; restart Claude Code with FileGuard enabled.");
  }
  if (!dataDir || !path.isAbsolute(dataDir)) {
    throw new TypeError("FileGuard data directory must be absolute.");
  }
  const now = options.now ?? (() => new Date());
  const store = options.store ?? createStateStore({ rootDir: dataDir });
  const current = now();
  await store.armOverride({
    sessionId,
    agentId: null,
    expiresAt: new Date(current.getTime() + 5 * 60 * 1000).toISOString(),
  });
  return SUCCESS;
}

try {
  const message = await armNextRead(process.argv.slice(2));
  process.stdout.write(`${message}\n`);
} catch (error) {
  process.stderr.write(`FileGuard: ${error.message}\n`);
  process.exitCode = 1;
}
