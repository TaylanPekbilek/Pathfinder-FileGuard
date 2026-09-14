# Pathfinder FileGuard

**Stop unchanged files from entering the same Claude Code context twice.**

[Türkçe kullanım kılavuzu](docs/tr/KULLANIM.md)

FileGuard is a small, fully local Claude Code plugin. After a successful `Read`, it remembers the file content and requested range for the current context. If Claude tries to read that exact unchanged content again, FileGuard denies the duplicate before the file is returned.

It does not call another model, use an API, send telemetry, or store file contents.

## The 20-second example

Without FileGuard:

```text
Claude reads src/app.ts
Claude reads the same unchanged src/app.ts again
The same content enters the active context twice
```

With FileGuard:

```text
First read:  allowed and recorded after success
Second exact unchanged read: blocked before content is returned
Need it anyway? Run /fileguard:allow-next, then retry once
```

FileGuard prevents proven duplicate content from re-entering the active context. Actual token billing and cache behavior vary, so it does not promise an exact billing reduction.

## What it blocks

| Situation | Result |
| --- | --- |
| Same file, same range, same content, same agent and context | Blocked |
| First read | Allowed |
| File content changed | Allowed |
| Different `offset` or `limit` | Allowed |
| New Claude Code session | Allowed |
| Different subagent | Allowed |
| Context created after compaction or clear | Allowed |
| File or local state cannot be verified safely | Allowed (fail-open) |
| One-read override was armed | Allowed once |

FileGuard currently watches Claude Code's `Read` tool only. See [Limitations](LIMITATIONS.md) for the exact boundary.

## Requirements

- Claude Code 2.1.270 or newer
- Node.js 20 or newer

The release candidate has been verified on Windows with Claude Code 2.1.270 in a restricted, read-only live session. A sequential unchanged duplicate was blocked before content was returned; the one-read override passed exactly once; the next duplicate was blocked again; and a compacted context allowed a fresh read.

## Try it locally

Clone the repository, open a terminal in its root, and run:

```sh
claude --plugin-dir ./plugins/fileguard
```

FileGuard becomes active for that Claude Code session. No dependency installation, account, API key, or server is required.

## Install from the GitHub marketplace

After this repository is published, run these inside Claude Code:

```text
/plugin marketplace add TaylanPekbilek/Pathfinder-FileGuard
/plugin install fileguard@pathfinder-tools
```

The equivalent terminal commands are:

```sh
claude plugin marketplace add TaylanPekbilek/Pathfinder-FileGuard
claude plugin install fileguard@pathfinder-tools
```

Claude Code's official documentation explains [plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [plugins](https://code.claude.com/docs/en/plugins-reference), and [hooks](https://code.claude.com/docs/en/hooks).

## Commands

### Allow one duplicate read

```text
/fileguard:allow-next
```

Arms a one-use override for the next otherwise-blocked read in the current session. It expires after five minutes and is consumed by one eligible read.

### Show measured savings

```text
/fileguard:report
```

Reports blocked reads, measured prevented characters, a directional token estimate, and the largest measured duplicate for the current session and retained 30-day history.

Hide file paths in shared output:

```text
/fileguard:report --hide-paths
```

The token estimate uses `characters / 4`. It is a rough comparison aid, not Claude billing data.

## Privacy and safety

FileGuard runs locally and keeps only the metadata needed to prove an exact duplicate. It never stores source file contents or model responses and makes no network requests. Read [Privacy](PRIVACY.md) for the stored fields and retention details.

When FileGuard is uncertain—for example, because a file disappeared or local state is damaged—it allows the read. This avoids blocking legitimate work at the cost of letting some duplicates pass.

## Disable or uninstall

```sh
claude plugin disable fileguard@pathfinder-tools
claude plugin uninstall fileguard@pathfinder-tools
```

Uninstalling the plugin from its last scope deletes its Claude-managed plugin data by default. Add `--keep-data` to the uninstall command if you want to retain it. To remove only the marketplace registration:

```sh
claude plugin marketplace remove pathfinder-tools
```

## Development

Run the complete test suite:

```sh
npm test
```

Validate the plugin manifest and hooks with Claude Code:

```sh
claude plugin validate ./plugins/fileguard
```

## License

[MIT](LICENSE)

## Support the project

If FileGuard saves you time or tokens, please consider starring the repository and sharing it with other Claude Code users. Your experience and feedback will help guide the useful tools we build next.
