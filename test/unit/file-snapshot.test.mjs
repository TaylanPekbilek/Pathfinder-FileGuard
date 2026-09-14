import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import {
  FileChangedDuringSnapshotError,
  snapshotFile,
} from "../../plugins/fileguard/src/file-snapshot.mjs";

test("snapshotFile returns a stable SHA-256 digest without storing content", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "fileguard-snapshot-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true })));
  const filePath = path.join(directory, "sample.txt");
  await writeFile(filePath, "hello fileguard", "utf8");

  const first = await snapshotFile(filePath);
  const second = await snapshotFile(filePath);

  assert.equal(first.digest, "44c4a259cf7c64bfd2bf55c6b4a37561e3d4ae947d2694021e088c2764d91e41");
  assert.equal(second.digest, first.digest);
  assert.equal(first.size, 15);
  assert.equal(first.filePath, second.filePath);
  assert.match(first.mtimeNs, /^\d+$/);
});

test("snapshotFile changes digest when file content changes", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "fileguard-snapshot-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true })));
  const filePath = path.join(directory, "sample.txt");
  await writeFile(filePath, "first", "utf8");
  const first = await snapshotFile(filePath);
  await writeFile(filePath, "second", "utf8");

  assert.notEqual((await snapshotFile(filePath)).digest, first.digest);
});

test("snapshotFile rejects directories", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "fileguard-snapshot-"));
  t.after(() => import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true })));
  const nested = path.join(directory, "nested");
  await mkdir(nested);

  await assert.rejects(snapshotFile(nested), /regular file/);
});

test("snapshotFile detects a file changing while it is hashed", async () => {
  let statCall = 0;
  const statFn = async () => {
    statCall += 1;
    return {
      isFile: () => true,
      size: statCall === 1 ? 1n : 2n,
      mtimeNs: statCall === 1 ? 10n : 20n,
    };
  };

  await assert.rejects(
    snapshotFile("/virtual/file", {
      realpathFn: async (value) => value,
      statFn,
      streamFactory: () => Readable.from(["x"]),
    }),
    FileChangedDuringSnapshotError,
  );
});
