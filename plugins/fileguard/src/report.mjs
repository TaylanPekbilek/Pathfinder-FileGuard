const number = new Intl.NumberFormat("en-US");

function measured(event) {
  return event?.measurement === "tool-response-text"
    && Number.isSafeInteger(event.deliveredChars)
    && event.deliveredChars >= 0;
}

function summarize(events) {
  const measuredEvents = events.filter(measured);
  const avoidedChars = measuredEvents.reduce(
    (total, event) => total + event.deliveredChars,
    0,
  );
  const largestEvent = measuredEvents.reduce(
    (largest, event) => !largest || event.deliveredChars > largest.deliveredChars
      ? event
      : largest,
    null,
  );
  const paths = [...new Set(events
    .map((event) => event.path)
    .filter((value) => typeof value === "string" && value.length > 0))]
    .sort((left, right) => left.localeCompare(right));

  return {
    blockedReads: events.length,
    measuredBlockedReads: measuredEvents.length,
    unmeasuredBlockedReads: events.length - measuredEvents.length,
    avoidedChars,
    approximateTokens: Math.floor(avoidedChars / 4),
    largest: largestEvent
      ? { path: largestEvent.path, deliveredChars: largestEvent.deliveredChars }
      : null,
    paths,
  };
}

export function summarizeBlockedReads(events, { currentSessionKey }) {
  return {
    current: summarize(events.filter((event) => event.sessionKey === currentSessionKey)),
    retained: summarize(events),
  };
}

function safePath(value) {
  return value.replace(/[\r\n\t]+/g, " ");
}

function formatSection(title, summary, { hidePaths }) {
  const labels = new Map(summary.paths.map((filePath, index) => [
    filePath,
    hidePaths ? `File #${index + 1}` : safePath(filePath),
  ]));
  const largestPath = summary.largest?.path
    ? ` (${labels.get(summary.largest.path) ?? "path unavailable"})`
    : "";
  const largest = summary.largest
    ? `${number.format(summary.largest.deliveredChars)} characters${largestPath}`
    : "not measured";
  const lines = [
    title,
    `- Blocked reads: ${number.format(summary.blockedReads)}`,
    `- Measured prevented characters: ${number.format(summary.avoidedChars)}`,
    `- Approximate prevented tokens: ~${number.format(summary.approximateTokens)}`,
    `- Without text measurement: ${number.format(summary.unmeasuredBlockedReads)}`,
    `- Largest measured duplicate: ${largest}`,
  ];

  if (summary.paths.length > 0) {
    lines.push("- Files:");
    for (const filePath of summary.paths) {
      lines.push(`  - ${labels.get(filePath)}`);
    }
  }

  return lines.join("\n");
}

export function formatReport(summary, { hidePaths = false } = {}) {
  return [
    "Pathfinder FileGuard report",
    "",
    formatSection("Current session", summary.current, { hidePaths }),
    "",
    formatSection("Retained local history (30 days)", summary.retained, { hidePaths }),
    "",
    "Measurement notes",
    "- Character counts come from measured text in the earlier successful Read response.",
    "- Approximate tokens use characters / 4 as a directional heuristic; this is not billed usage.",
  ].join("\n");
}
