import { describe, expect, test } from 'vitest';
import { joinBits, numberToWords, splitBit, textToSyllables } from '../src/renderer/speech/syllables';

const split = (text: string) => textToSyllables(text).map((s) => s.text);

describe('syllables', () => {
  test.each([
    ['walking', ['walk', 'ing']],
    ['whisper', ['whis', 'per']],
    ['forgets', ['for', 'gets']],
    ['river', ['riv', 'er']],
    ['pocket', ['pock', 'et']],
    ['moon', ['moon']],
    ['the', ['the']],
    ['remember', ['re', 'mem', 'ber']],
    ['howling', ['howl', 'ing']],
    ['aurora', ['au', 'ro', 'ra']],
    ['fire', ['fire']],
    ['every', ['ev', 'ery']],
    ['beautiful', ['beau', 'ti', 'ful']]
  ])('%s', (word, expected) => {
    expect(split(word)).toEqual(expected);
  });

  test('a whole line keeps word grouping', () => {
    const bits = textToSyllables('the pine trees whisper my name');
    expect(bits.map((b) => b.text)).toEqual(['the', 'pine', 'trees', 'whis', 'per', 'my', 'name']);
    expect(bits[3].wordIndex).toBe(bits[4].wordIndex);
    expect(bits[2].wordIndex).not.toBe(bits[3].wordIndex);
  });

  test("apostrophes stay inside words: don't is one bit", () => {
    expect(split("don't")).toEqual(["don't"]);
    expect(split("i'm")).toEqual(["i'm"]);
  });

  test('punctuation is stripped for splitting', () => {
    expect(split('moon, river!')).toEqual(['moon', 'riv', 'er']);
  });

  test('numbers are spoken words', () => {
    expect(split('3 wolves')).toEqual(['three', 'wolves']);
    expect(numberToWords(21)).toBe('twenty one');
  });

  test('keeps her casing', () => {
    expect(split('River')).toEqual(['Riv', 'er']);
  });

  test('common lyric words split into the right number of bits', () => {
    const cases: Record<string, number> = {
      and: 1, cold: 1, under: 2, keep: 1, snow: 1, feet: 1, name: 1, trees: 1, wolves: 1, forever: 3,
      little: 2, singing: 2, running: 2, midnight: 2, shadow: 2, silver: 2, broken: 2, ocean: 2, wild: 1,
      heart: 1, love: 1, stars: 1, night: 1, dreaming: 2, together: 3, tomorrow: 3, mountain: 2, fired: 1
    };
    for (const [word, count] of Object.entries(cases)) expect(split(word), word).toHaveLength(count);
  });

  test('join and split', () => {
    const bits = textToSyllables('whisper');
    const joined = joinBits(bits, 0);
    expect(joined.map((b) => b.text)).toEqual(['whisper']);
    const resplit = splitBit(joined, 0, 2);
    expect(resplit.map((b) => b.text)).toEqual(['wh', 'isper']);
    expect(resplit[1].wordIndex).toBe(resplit[0].wordIndex);
    const two = textToSyllables('the moon');
    expect(joinBits(two, 0)).toBe(two); // Different words do not join.
    expect(splitBit(two, 0, 0)).toBe(two);
  });
});
