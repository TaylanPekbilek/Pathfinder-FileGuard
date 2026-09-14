import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";

export class FileChangedDuringSnapshotError extends Error {
  constructor(filePath) {
    super(`File changed while it was being hashed: ${filePath}`);
    this.name = "FileChangedDuringSnapshotError";
  }
}

function metadata(stats, filePath) {
  if (!stats.isFile()) {
    throw new TypeError(`Path is not a regular file: ${filePath}`);
  }

  const size = Number(stats.size);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new RangeError(`File size cannot be represented safely: ${filePath}`);
  }

  const mtimeNs = stats.mtimeNs ?? BigInt(Math.trunc(Number(stats.mtimeMs) * 1_000_000));
  return { size, mtimeNs: mtimeNs.toString() };
}

export async function snapshotFile(filePath, options = {}) {
  const realpathFn = options.realpathFn ?? realpath;
  const statFn = options.statFn ?? stat;
  const streamFactory = options.streamFactory ?? createReadStream;
  const canonicalPath = await realpathFn(filePath);
  const before = metadata(await statFn(canonicalPath, { bigint: true }), canonicalPath);
  const hash = createHash("sha256");

  for await (const chunk of streamFactory(canonicalPath)) {
    hash.update(chunk);
  }

  const after = metadata(await statFn(canonicalPath, { bigint: true }), canonicalPath);
  if (before.size !== after.size || before.mtimeNs !== after.mtimeNs) {
    throw new FileChangedDuringSnapshotError(canonicalPath);
  }

  return {
    filePath: canonicalPath,
    digest: hash.digest("hex"),
    size: after.size,
    mtimeNs: after.mtimeNs,
  };
}
