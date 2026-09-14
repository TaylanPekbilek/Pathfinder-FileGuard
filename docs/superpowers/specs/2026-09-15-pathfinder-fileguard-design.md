# Pathfinder FileGuard Design

**Date:** 2026-09-15  
**Status:** Approved design  
**Product:** Pathfinder FileGuard  
**Repository:** `C:\Users\tay_p\Documents\Codex\Pathfinder-FileGuard`

## 1. Purpose

Pathfinder FileGuard is a small, free, open-source Claude Code plugin that prevents an unchanged file or file range from being read repeatedly into the same active agent context. Its purpose is to stop avoidable context growth and token usage before the repeated `Read` tool call executes.

FileGuard must remain narrow, transparent, local, and easy to uninstall. This repository is limited to protecting against repeated reads of unchanged files in the same active context.

## 2. Product Positioning

FileGuard is not presented as a novel category. Existing open-source tools already detect or block repeated reads. FileGuard differentiates through a deliberately small scope, conservative decisions, visible reasons, no telemetry, zero external API calls, and reproducible savings measurements.

The user promise is:

> Stop Claude Code from loading the same unchanged file into the same active context twice without a clear override.

FileGuard is free. Its purpose is to establish trust, demonstrate measurable token savings, and improve through real-world community feedback.

## 3. Target User and Platform

The first release targets Claude Code users working in software repositories on Windows, macOS, and Linux. Windows is the first verified platform because the initial real-world test environment is Windows.

The plugin is installed at user scope so it can protect multiple projects. All runtime data stays on the user's machine.

## 4. Scope

### 4.1 Included

- Observe Claude Code `Read` calls through hooks.
- Record successful reads by session, agent, absolute path, requested range, and context generation.
- Detect an identical read of unchanged content in the same active agent context.
- Block the redundant read before its contents enter the model context.
- Explain why the read was blocked.
- Allow an explicit one-read override.
- Reset context-sensitive protection after compaction.
- Keep main-agent and subagent histories isolated.
- Report blocked reads, avoided characters, and directionally estimated avoided tokens.
- Run locally with Node.js built-ins and no external AI or application API.

### 4.2 Excluded

- Directory, repository, `Glob`, or `Grep` scan deduplication.
- Shell command or test-output compression.
- Repeated-error and alternative-strategy detection.
- External-service state tracking, including Google Console and OAuth flows.
- Codex, Gemini CLI, Cursor, or other agent integrations.
- Cloud storage, synchronization, accounts, telemetry, or analytics upload.
- Local or remote language models and embeddings.
- Graphical dashboards.
- Payments, licensing, subscriptions, or paid features.
- Long-document claim verification and hallucination detection.

## 5. Technical Approach

FileGuard is a Claude Code plugin implemented with small Node.js hook programs and plugin commands. It uses no third-party runtime dependencies.

### 5.1 Components

1. **Pre-read guard:** Runs on `PreToolUse` for the `Read` tool. It normalizes the request, checks prior read state, verifies file state, and allows or denies the call.
2. **Successful-read recorder:** Runs after a successful `Read` and records only reads whose content was actually delivered.
3. **Context lifecycle handler:** Tracks session start and compaction events. A compaction starts a new context generation in the same Claude session.
4. **Local state store:** Maintains per-session, per-agent read records and an append-only savings ledger in the Claude plugin data directory.
5. **Override command:** Arms one narrowly scoped bypass for the next matching read request.
6. **Report command:** Summarizes blocked reads and estimated savings without contacting an external service.

### 5.2 Read Identity

A read identity contains:

- Claude session identifier
- Agent identifier, with the main agent represented explicitly
- Normalized absolute file path
- Requested offset
- Requested limit
- Context generation number

Windows paths are normalized case-insensitively and with consistent separators. macOS and Linux paths preserve platform-appropriate case behavior. Relative and home-relative spellings are not trusted as separate identities; Claude Code supplies an absolute path to `PreToolUse` file hooks.

### 5.3 Content State

After a successful read, FileGuard records:

- File size
- High-resolution modification time when available
- A SHA-256 content digest for the relevant file state
- Delivered character count or a conservative estimate when exact output size is unavailable
- Timestamp of the successful read

On a possible duplicate, FileGuard first checks inexpensive metadata. When metadata indicates the same state, it verifies the digest before blocking. If the file cannot be inspected reliably, FileGuard allows the read.

### 5.4 Duplicate Definition

A read is blocked only when all of these conditions are true:

- The earlier read completed successfully.
- The session identifier is the same.
- The agent identifier is the same.
- The context generation is the same.
- The normalized absolute path is the same.
- The requested range is the same, including full-file reads.
- The current file digest matches the digest recorded after the earlier successful read.
- No valid one-read override is armed for that identity.

If any condition is false or cannot be proven, the read is allowed.

### 5.5 Decision Flow

1. Claude Code proposes a `Read` tool call.
2. The pre-read guard normalizes the request.
3. If there is no matching successful read, FileGuard allows it.
4. If a matching record exists, FileGuard checks current file metadata and digest.
5. If the content or requested range changed, FileGuard allows the read.
6. If the read is a proven duplicate in the same active context, FileGuard denies it before execution.
7. The denial message identifies the prior read and explains how to request a different range or use the one-read override.
8. Allowed successful reads update the local state and ledger.

## 6. Override Behavior

The `/fileguard:allow-next` command creates a single-use bypass. The bypass is scoped to the next otherwise-blocked `Read` in the current session and agent, expires after five minutes, and is deleted immediately after use.

The override does not disable FileGuard globally. A separate configuration switch may disable the plugin through Claude Code's normal plugin controls; FileGuard does not create its own permanent bypass mechanism.

## 7. Context and Agent Isolation

FileGuard treats each agent context separately. A file read by the main agent does not prevent a subagent from reading it, and one subagent does not block another subagent's first read.

After Claude Code completes a manual or automatic compaction, FileGuard increments the context generation. Reads from the earlier generation remain in the savings ledger but cannot block reads in the new compacted context.

A new Claude session always starts with an empty active read set. FileGuard does not assume that content from an earlier session remains available to the model.

## 8. Safety and Failure Handling

FileGuard follows a fail-open policy. If state is missing, corrupted, locked, incompatible, or unavailable; a file cannot be hashed; a path cannot be normalized; or a hook times out, the read is allowed and a concise diagnostic is logged locally.

The hook never modifies, deletes, or rewrites project files. It reads file metadata and content only to establish a digest. Runtime records contain paths, ranges, sizes, digests, timestamps, and counts, but not file contents, prompts, API keys, environment variables, or model responses.

State writes use atomic replacement or append-only records as appropriate. Concurrent agents must not corrupt shared state. Stale session state is cleaned according to a documented retention limit without touching project data.

## 9. User Feedback

A blocked read returns a concise message similar to:

> FileGuard blocked an unchanged duplicate read of `src/example.ts` lines 1-240. The same range was successfully read in this active agent context and the file digest is unchanged. Read a different range or run `/fileguard:allow-next` for a one-time bypass.

Messages must not claim exact billed-token savings. They may report avoided characters and a clearly labeled approximate token estimate.

## 10. Savings Report

The `/fileguard:report` command reports:

- Number of blocked reads in the current session
- Number of blocked reads across retained local history
- Avoided characters
- Approximate avoided tokens using a documented heuristic
- Largest individual duplicate read prevented
- File paths involved, with an option to suppress paths in shared screenshots

The report must distinguish measured character counts from estimated token counts. It must not estimate monetary savings unless a user explicitly supplies a price configuration in a later release.

## 11. Testing Strategy

Automated tests invoke hook programs with synthetic Claude Code hook payloads. The suite covers at least:

- First read is allowed.
- Exact unchanged duplicate in the same context is blocked.
- Modified content is allowed even when the path and range match.
- Different offset or limit is allowed when that range has not already been delivered.
- A failed earlier read does not create a blocking record.
- Main-agent and subagent records are isolated.
- Separate subagents are isolated.
- A new session is isolated.
- A post-compaction context generation allows a fresh read.
- Windows path case and separator variants resolve consistently.
- macOS and Linux path semantics remain correct.
- A valid override allows one read and is then consumed.
- An expired override is ignored.
- Corrupted or locked state fails open.
- Missing and deleted files fail open to Claude Code's normal behavior.
- Savings totals match the recorded blocked payloads.

The plugin is also tested in a real Claude Code session against `C:\AI-Projects\AI-Shorts-Agent`, subject to the user's access approval. The real-world acceptance test must demonstrate at least one correctly blocked duplicate without preventing a necessary read.

## 12. Success Criteria

The first public release is acceptable when:

- Every proven duplicate in the automated test matrix is blocked before file content enters context.
- No required read in the allow-case test matrix is blocked.
- Hook failure never prevents normal Claude Code operation.
- The report correctly separates measured characters from estimated tokens.
- No project file content or secret is stored in FileGuard runtime data.
- Installation, override, report, disable, and uninstall instructions are reproducible on Windows.
- Basic automated tests pass on Windows, macOS, and Linux.

## 13. Distribution

FileGuard is published as an MIT-licensed GitHub repository and Claude Code plugin. The repository includes the plugin manifest, hooks, commands, automated tests, a concise README, privacy statement, limitations, and uninstall instructions.

Initial distribution uses a GitHub-hosted Claude plugin marketplace. Submission to Anthropic's public plugin directory occurs only after the real-world acceptance test and cross-platform test suite pass.

FileGuard has no telemetry. Public claims about savings are backed by reproducible test inputs and distinguish synthetic measurements from real-session observations.

## 14. Delivery Estimate

With focused work and available Codex quota:

- Test harness and first blocking prototype: one day
- Safe session, agent, range, digest, compaction, and override behavior: two to three additional days
- Reporting, documentation, packaging, and cross-platform validation: two to four additional days

The target is a testable MVP in three to five focused days and a public beta in approximately one to two weeks. These are estimates, not guarantees; Claude Code hook behavior and cross-platform findings may change the schedule.

## 15. Support FileGuard

If FileGuard saves you time or tokens, please consider starring the repository and sharing it with other Claude Code users. Your experience and feedback will help guide the useful tools we build next.
