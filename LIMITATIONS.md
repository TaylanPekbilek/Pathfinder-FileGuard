# Limitations

Pathfinder FileGuard deliberately has a narrow first-version scope.

- It protects Claude Code `Read` tool calls only. It does not intercept `Glob`, `Grep`, `Bash`, editor access, MCP tools, or other ways of reading files.
- Direct `@file` references can enter context without a `PreToolUse(Read)` event and therefore may bypass FileGuard.
- Two identical first reads started at the same time may both pass before either successful result is recorded.
- Content hashing adds local disk I/O and CPU work. Files are streamed while hashing rather than loaded wholly into memory.
- FileGuard fails open. If identity, filesystem, or state verification is uncertain, the read is allowed; some duplicate reads can therefore pass.
- The report's token number is a `characters / 4` heuristic. It is not measured usage, a bill, or a guarantee of savings.
- Binary or non-text reads can be recognized by digest, but may have no meaningful character or token estimate.
- State stays on one machine. There is no cloud account, synchronization, or shared team history.
- A new session, subagent, compaction, or clear operation creates a separate protection context. A read that was blocked in an older context is allowed in the new one.
- If a file changes and later returns to earlier content with different metadata, FileGuard may safely allow and record it again.
- Version 0.1 targets Claude Code 2.1.270 or newer and Node.js 20 or newer.

These boundaries favor predictable behavior: FileGuard blocks only when it can prove that the same content range already entered the same active context successfully.
