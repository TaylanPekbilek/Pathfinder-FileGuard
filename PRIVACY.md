# Privacy

Pathfinder FileGuard is local-only software. It does not use an external API, contact a server, send telemetry, or require an account.

## Where state is stored

FileGuard stores its private runtime state inside Claude Code's `${CLAUDE_PLUGIN_DATA}` directory. Claude Code assigns and manages this per-plugin data location.

## What is stored

FileGuard records only the metadata required to recognize a proven duplicate read and report measured savings:

- normalized and canonical local file path;
- requested read range (`offset` and `limit`);
- file size and high-resolution modification time;
- SHA-256 content digest;
- measured character count from the successful Read response, when available;
- timestamps, block events, and aggregate counters;
- opaque hashes derived from session and agent identifiers.

The SHA-256 digest is a one-way fingerprint used for equality checks. It is not the file content.

## What is not stored

FileGuard does not store:

- source file contents or source-code bodies;
- prompts or conversation history;
- model responses;
- secrets, environment variables, or API keys;
- raw session or agent identifiers.

FileGuard does not inspect or transmit network traffic.

## Retention

Runtime records older than 30 days are removed during normal state maintenance. State is local to the current machine and is not synchronized.

When the plugin is uninstalled from its last Claude Code scope, Claude Code deletes `${CLAUDE_PLUGIN_DATA}` by default. The `--keep-data` uninstall option preserves that directory.

## File paths and reports

Local file paths can themselves contain sensitive project or user names. `/fileguard:report` shows affected paths by default so the report is useful. Use the following command before sharing a report:

```text
/fileguard:report --hide-paths
```

This replaces paths with neutral labels such as `File #1`.
