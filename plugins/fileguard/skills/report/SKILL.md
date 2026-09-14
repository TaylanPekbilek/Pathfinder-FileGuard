---
name: report
description: Show measured FileGuard duplicate-read savings for the current session and retained local history.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/commands/report.mjs" *)
---

Accept either no arguments or exactly `--hide-paths`.

With no arguments, run exactly:

`node "${CLAUDE_PLUGIN_ROOT}/scripts/commands/report.mjs" --data-dir "${CLAUDE_PLUGIN_DATA}" --session "$FILEGUARD_SESSION_ID"`

With `--hide-paths`, run exactly:

`node "${CLAUDE_PLUGIN_ROOT}/scripts/commands/report.mjs" --data-dir "${CLAUDE_PLUGIN_DATA}" --session "$FILEGUARD_SESSION_ID" --hide-paths`

For any other argument, do not run a command and reply with: `Usage: /fileguard:report [--hide-paths]`

Return valid command stdout verbatim. Do not read project files and do not perform any other action.

Arguments received: $ARGUMENTS
