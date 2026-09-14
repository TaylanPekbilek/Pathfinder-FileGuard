import { readHookInput, writeHookOutput } from "../../src/hook-io.mjs";
import { runPreRead } from "../../src/pre-read.mjs";

try {
  const input = await readHookInput();
  const output = await runPreRead(input);
  if (output) writeHookOutput(output);
} catch (error) {
  if (process.env.FILEGUARD_DEBUG === "1") {
    process.stderr.write(`[FileGuard] PreToolUse failed: ${error?.name || "Error"}\n`);
  }
}
