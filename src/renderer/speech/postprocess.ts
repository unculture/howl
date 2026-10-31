const HALLUCINATIONS = new Set(['thank you', 'thanks for watching', 'you', 'bye', '']);
const MAX_WORDS = 14;

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/[.,;:!?]+$/g, '').trim();
}

function splitLongLine(line: string): string[] {
  const words = line.split(/\s+/);
  if (words.length <= MAX_WORDS || !line.includes(',')) return [line];
  const middle = line.length / 2;
  let best = -1;
  for (let i = line.indexOf(','); i !== -1; i = line.indexOf(',', i + 1)) {
    if (best === -1 || Math.abs(i - middle) < Math.abs(best - middle)) best = i;
  }
  const left = line.slice(0, best).trim();
  const right = line.slice(best + 1).trim();
  return [left, right].filter(Boolean).flatMap(splitLongLine);
}

/** Turns what Whisper heard into her lines, per spec section 7. */
export function cleanUtterance(raw: string): string[] {
  const unbracketed = raw
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (HALLUCINATIONS.has(normalise(unbracketed))) return [];
  const line = unbracketed.replace(/[.,;:!?]+$/g, '').trim();
  if (!line) return [];
  return splitLongLine(line).map((part) => part.replace(/[.,;:!?]+$/g, '').trim()).filter(Boolean);
}

/** She writes lower-case: if all her lines are, match her. */
export function applyHerCasing(text: string, existing: string[]): string {
  return existing.length > 0 && existing.every((line) => line === line.toLowerCase())
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
}
