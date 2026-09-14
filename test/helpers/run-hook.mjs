import { spawn } from "node:child_process";

export function runHook({ scriptPath, payload, rawInput, dataDir, env = {} }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: dataDir,
        ...env,
      },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
    child.stdin.end(rawInput ?? JSON.stringify(payload));
  });
}
