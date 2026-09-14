---
name: allow-next
description: Arm one five-minute bypass for the next otherwise-blocked FileGuard read in the current Claude Code session.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/commands/allow-next.mjs" *)
---

Run exactly this command once:

`node "${CLAUDE_PLUGIN_ROOT}/scripts/commands/allow-next.mjs" --data-dir "${CLAUDE_PLUGIN_DATA}" --session "$FILEGUARD_SESSION_ID"`

Return the command's stdout verbatim. Do not read project files and do not perform any other action.
