declare module 'hypher' {
  export default class Hypher {
    constructor(patterns: unknown);
    hyphenate(word: string): string[];
  }
}
declare module 'hyphenation.en-us' {
  const patterns: Record<string, unknown>;
  export default patterns;
}
