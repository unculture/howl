import Hypher from 'hypher';
import english from 'hyphenation.en-us';
import { syllable } from 'syllable';
import type { Syllable } from '../../shared/song';

const hypher = new Hypher({ ...english, leftmin: 1, rightmin: 2 });
const VOWELS = /[aeiouy]+/gi;
const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

// Where the pattern dictionary and the syllable counter both miss how a word is sung.
const EXCEPTIONS: Record<string, string[]> = {
  walking: ['walk', 'ing'],
  whisper: ['whis', 'per'],
  forgets: ['for', 'gets'],
  river: ['riv', 'er'],
  pocket: ['pock', 'et'],
  howling: ['howl', 'ing'],
  aurora: ['au', 'ro', 'ra'],
  fire: ['fire'],
  every: ['ev', 'ery'],
  beautiful: ['beau', 'ti', 'ful'],
  remember: ['re', 'mem', 'ber']
};

export function numberToWords(value: number): string {
  if (value < 20) return UNITS[value];
  if (value < 100) return `${TENS[Math.floor(value / 10)]}${value % 10 ? ` ${UNITS[value % 10]}` : ''}`;
  if (value < 1000) {
    const rest = value % 100;
    return `${UNITS[Math.floor(value / 100)]} hundred${rest ? ` ${numberToWords(rest)}` : ''}`;
  }
  return String(value).split('').map((digit) => UNITS[Number(digit)]).join(' ');
}

/** Splits by vowel groups into the wanted number of pieces, keeping a consonant with the next piece. */
export function vowelSplit(word: string, count: number): string[] {
  const groups = [...word.matchAll(VOWELS)];
  if (count <= 1 || groups.length < 2) return [word];
  const pieces: string[] = [];
  let from = 0;
  const cuts = Math.min(count, groups.length) - 1;
  for (let i = 0; i < cuts; i++) {
    const end = groups[i].index + groups[i][0].length;
    const nextStart = groups[i + 1].index;
    const consonants = nextStart - end;
    const cut = consonants >= 2 ? end + Math.floor(consonants / 2) : end;
    pieces.push(word.slice(from, cut));
    from = cut;
  }
  pieces.push(word.slice(from));
  return pieces;
}

export function splitWord(word: string): string[] {
  const known = EXCEPTIONS[word.toLowerCase()];
  if (known) {
    let at = 0;
    return known.map((piece) => word.slice(at, (at += piece.length)));
  }
  if (word.includes("'") || word.includes('’')) {
    const count = syllable(word);
    if (count <= 1) return [word];
  }
  const pieces = hypher.hyphenate(word);
  const count = syllable(word);
  if (pieces.length !== count && word.length <= 12) return vowelSplit(word, count);
  return pieces;
}

function cleanWords(text: string): string[] {
  const spoken = text.replace(/\d+/g, (digits) => ` ${numberToWords(Number(digits))} `);
  return spoken
    .split(/[\s\-–—/]+/)
    .map((word) => word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
    .filter((word) => word.length > 0);
}

export function textToSyllables(text: string, makeId: () => string = () => crypto.randomUUID()): Syllable[] {
  return cleanWords(text).flatMap((word, wordIndex) =>
    splitWord(word).map((piece) => ({ id: makeId(), text: piece, wordIndex }))
  );
}

/** Join a bit with the next one in the same word. */
export function joinBits(bits: Syllable[], index: number): Syllable[] {
  const a = bits[index];
  const b = bits[index + 1];
  if (!a || !b || a.wordIndex !== b.wordIndex) return bits;
  return [...bits.slice(0, index), { ...a, text: a.text + b.text }, ...bits.slice(index + 2)];
}

/** Split a bit at a letter position. */
export function splitBit(bits: Syllable[], index: number, at: number, makeId: () => string = () => crypto.randomUUID()): Syllable[] {
  const bit = bits[index];
  if (!bit || at <= 0 || at >= bit.text.length) return bits;
  return [
    ...bits.slice(0, index),
    { ...bit, text: bit.text.slice(0, at) },
    { id: makeId(), text: bit.text.slice(at), wordIndex: bit.wordIndex },
    ...bits.slice(index + 1)
  ];
}
