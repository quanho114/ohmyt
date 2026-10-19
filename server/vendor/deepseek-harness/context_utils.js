// Adapted from DeepSeek Harness, MIT Copyright (c) 2026 DeepSeek.
// Provenance and adaptation boundaries: ./README.md and source-manifest.json.

// Deep JSON key sorting from repeat-tool-reminder. Define own properties so
// JSON keys such as __proto__ remain data under ohmyt's untrusted tool boundary.
function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === 'object') {
    const sorted = Object.create(null);
    for (const key of Object.keys(value).sort()) sorted[key] = sortJsonValue(value[key]);
    return sorted;
  }
  return value;
}
export function canonicalize(value) { return JSON.stringify(sortJsonValue(value)); }

// Single-text adaptation of ToolResultPruner.pruneContent: preserve the head
// and tail by Unicode code point. Only the model projection is shortened.
export function pruneText(text, maxChars, marker) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 1) throw new Error('Invalid text budget');
  const points = Array.from(text), note = Array.from(marker);
  if (points.length <= maxChars) return text;
  if (note.length >= maxChars) throw new Error('Prune marker exceeds text budget');
  const retained = maxChars - note.length;
  const tail = Math.floor(retained / 5);
  const head = retained - tail;
  return points.slice(0, head).join('') + marker + (tail ? points.slice(-tail).join('') : '');
}
