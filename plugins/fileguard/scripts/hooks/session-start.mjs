import { readHookInput } from "../../src/hook-io.mjs";
import { runSessionStart } from "../../src/session-start.mjs";

try {
  const input = await readHookInput();
  await runSessionStart(input);
} catch (error) {
  if (process.env.FILEGUARD_DEBUG === "1") {
    process.stderr.write(`[FileGuard] SessionStart failed: ${error?.name || "Error"}\n`);
  }
}
