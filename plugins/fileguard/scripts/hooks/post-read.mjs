import { readHookInput } from "../../src/hook-io.mjs";
import { runPostRead } from "../../src/post-read.mjs";

try {
  const input = await readHookInput();
  await runPostRead(input);
} catch (error) {
  if (process.env.FILEGUARD_DEBUG === "1") {
    process.stderr.write(`[FileGuard] PostToolUse failed: ${error?.name || "Error"}\n`);
  }
}
