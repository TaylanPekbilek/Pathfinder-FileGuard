export const sessionStart = (overrides = {}) => ({
  session_id: "session-a",
  transcript_path: "/tmp/session-a.jsonl",
  cwd: "/tmp/project",
  hook_event_name: "SessionStart",
  source: "startup",
  model: "claude-sonnet-5",
  ...overrides,
});

export const preRead = (filePath, overrides = {}) => ({
  session_id: "session-a",
  transcript_path: "/tmp/session-a.jsonl",
  cwd: "/tmp/project",
  hook_event_name: "PreToolUse",
  tool_name: "Read",
  tool_input: { file_path: filePath },
  tool_use_id: "tool-read-1",
  ...overrides,
});

export const postRead = (filePath, overrides = {}) => ({
  session_id: "session-a",
  transcript_path: "/tmp/session-a.jsonl",
  cwd: "/tmp/project",
  hook_event_name: "PostToolUse",
  tool_name: "Read",
  tool_input: { file_path: filePath },
  tool_response: {
    content: [{ type: "text", text: "first line\nsecond line\n" }],
  },
  tool_use_id: "tool-read-1",
  ...overrides,
});
