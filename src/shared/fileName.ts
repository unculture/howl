const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** A file name that is safe on Windows and macOS. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 80)
    .trim();
  if (!cleaned || RESERVED.test(cleaned)) return 'Untitled song';
  return cleaned;
}
