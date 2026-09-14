function countCodePoints(value) {
  return [...value].length;
}

export function measureResponseText(response) {
  if (typeof response === "string") {
    return countCodePoints(response);
  }

  if (response === null || typeof response !== "object") {
    return null;
  }

  if (
    response.type === "text"
    && response.file !== null
    && typeof response.file === "object"
    && typeof response.file.content === "string"
  ) {
    return countCodePoints(response.file.content);
  }

  if (typeof response.content === "string") {
    return countCodePoints(response.content);
  }

  if (!Array.isArray(response.content)) {
    return null;
  }

  const textBlocks = response.content.filter(
    (block) => block?.type === "text" && typeof block.text === "string",
  );
  if (textBlocks.length === 0) return null;

  return textBlocks.reduce((total, block) => total + countCodePoints(block.text), 0);
}
