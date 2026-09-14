const KNOWN_CODES = new Set([
  "HOOK_INPUT_INVALID",
  "SNAPSHOT_FAILED",
  "STATE_CORRUPT",
  "STATE_UNAVAILABLE",
]);

const KNOWN_HOOKS = new Set([
  "PreToolUse",
  "PostToolUse",
  "SessionStart",
  "Command",
  "Report",
]);

export function sanitizeDiagnostic(value) {
  return {
    code: KNOWN_CODES.has(value?.code) ? value.code : "UNKNOWN",
    hook: KNOWN_HOOKS.has(value?.hook) ? value.hook : "Unknown",
    at: value?.at,
  };
}
