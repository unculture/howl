import type { Feel, Mood, NoteMode, OctaveShift, SoundId } from '../../shared/song';

export type DrumName = 'boom' | 'clap' | 'tick' | 'shaker';

export interface MoodInfo {
  feel: Feel;
  rootPc: number;
  bpm: number;
  sound: SoundId;
  drums: Partial<Record<DrumName, string>>;
}

export const MOOD_ORDER: Mood[] = ['wolfMoon', 'snowfall', 'bonfire', 'running'];

export const MOODS: Record<Mood, MoodInfo> = {
  wolfMoon: {
    feel: 'moody', rootPc: 2, bpm: 84, sound: 'glassBells',
    drums: { boom: 'x...x...x...x...', clap: '....x.......x...', tick: 'x.x.x.x.x.x.x.x.', shaker: '......x.......xx' }
  },
  snowfall: {
    feel: 'dreamy', rootPc: 4, bpm: 72, sound: 'softKeys',
    drums: { boom: 'x...............', tick: 'x...x...x...x...', shaker: '..............x.' }
  },
  bonfire: {
    feel: 'bright', rootPc: 7, bpm: 92, sound: 'softKeys',
    drums: { boom: 'x.......x.......', clap: '............x...', shaker: 'x.x.x.x.x.x.x.x.' }
  },
  running: {
    feel: 'bright', rootPc: 0, bpm: 120, sound: 'breathy',
    drums: { boom: 'x...x...x...x...', clap: '....x.......x...', tick: 'xxxxxxxxxxxxxxxx' }
  }
};

const SCALES: Record<Feel, Record<NoteMode, number[]>> = {
  moody: { 5: [0, 3, 5, 7, 10], 7: [0, 2, 3, 5, 7, 8, 10] },
  bright: { 5: [0, 2, 4, 7, 9], 7: [0, 2, 4, 5, 7, 9, 11] },
  dreamy: { 5: [0, 2, 4, 7, 9], 7: [0, 2, 4, 6, 7, 9, 11] }
};

export const LOWEST_PAD_FLOOR = 57; // A3
export const PAD_COUNT = 10;
const NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function isInScale(midi: number, mood: Mood, mode: NoteMode): boolean {
  const { feel, rootPc } = MOODS[mood];
  return SCALES[feel][mode].includes((((midi - rootPc) % 12) + 12) % 12);
}

export function padNotes(mood: Mood, mode: NoteMode, octaveShift: OctaveShift): number[] {
  const notes: number[] = [];
  for (let midi = LOWEST_PAD_FLOOR; notes.length < PAD_COUNT; midi++) {
    if (isInScale(midi, mood, mode)) notes.push(midi + octaveShift * 12);
  }
  return notes;
}

/** A "colour note" is in the 7-note scale but not the 5-note one. */
export function isColourNote(midi: number, mood: Mood): boolean {
  return !isInScale(midi, mood, 5);
}

export function noteName(midi: number): string {
  return `${NAMES_FLAT[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Nearest note in the scale; ties go down. */
export function snapToScale(midi: number, mood: Mood, mode: NoteMode): number {
  for (let distance = 0; distance < 12; distance++) {
    if (isInScale(midi - distance, mood, mode)) return midi - distance;
    if (isInScale(midi + distance, mood, mode)) return midi + distance;
  }
  return midi;
}

export function rootInterval(from: Mood, to: Mood): number {
  return ((MOODS[to].rootPc - MOODS[from].rootPc + 18) % 12) - 6;
}

export function droneNotes(mood: Mood): [number, number] {
  const root = 36 + MOODS[mood].rootPc + (MOODS[mood].rootPc > 7 ? 0 : 12);
  return [root, root + 7];
}
