import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const knownSuites = new Set(["unit", "integration"]);
const requestedSuites = process.argv.slice(2);
const suites = requestedSuites.length > 0
  ? requestedSuites
  : [...knownSuites];

for (const suite of suites) {
  if (!knownSuites.has(suite)) {
    throw new TypeError(`Unknown test suite: ${suite}`);
  }
}

const files = (await Promise.all(suites.map(async (suite) => {
  const directory = path.join("test", suite);
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => path.join(directory, entry.name));
}))).flat().sort();

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
