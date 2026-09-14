const MAX_HOOK_INPUT_BYTES = 1024 * 1024;

export async function readHookInput(stream = process.stdin) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > MAX_HOOK_INPUT_BYTES) {
      throw new RangeError(`Hook input exceeds ${MAX_HOOK_INPUT_BYTES} bytes`);
    }

    chunks.push(buffer);
  }

  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Hook input must be a JSON object");
  }

  return parsed;
}

export function denyRead(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

export function writeHookOutput(value, stream = process.stdout) {
  stream.write(`${JSON.stringify(value)}\n`);
}
