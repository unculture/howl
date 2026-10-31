import type { Feel, Mood, NoteMode, OctaveShift, SoundId } from '../../shared/song';

export type DrumName = 'boom' | 'clap' | 'tick' | 'shaker';
export type HitId = 'bigBoom' | 'tightBoom' | 'softBoom' | 'cajonLow' | 'cajonSlap' | 'claps' | 'snare' | 'hat' | 'shaker' | 'tamb' | 'tambShake' | 'sleigh';
export type BedInstrument = 'cello' | 'violins' | 'bassPluck' | 'celloShort';

/** A long held note under the mood. Only ever the root and fifth, so it can't write a melody. */
export interface BedSustain { instrument: BedInstrument; notes: number[]; gain: number; }
/** A repeating low note. `pattern` is 16 steps; each x plays the next of `notes` in turn. */
export interface BedPulse { instrument: BedInstrument; notes: number[]; pattern: string; gain: number; }

export interface MoodInfo {
  feel: Feel;
  rootPc: number;
  bpm: number;
  sound: SoundId;
  drums: Partial<Record<DrumName, string>>;
  kit: Partial<Record<DrumName, { hit: HitId; gain: number }>>;
  room: { decay: number; wet: number };
  swing: number; // How late the off-beat sixteenths land, as a share of a sixteenth.
  sustain?: BedSustain;
  pulse?: BedPulse;
  /** The mood card's preview only: [pad, start beat, length in beats]. Never used for her songs. */
  preview: [number, number, number][];
}

export const MOOD_ORDER: Mood[] = ['wolfMoon', 'snowfall', 'bonfire', 'running'];

export const MOODS: Record<Mood, MoodInfo> = {
  wolfMoon: {
    feel: 'moody', rootPc: 2, bpm: 84, sound: 'glassBells',
    drums: { boom: 'x...x...x...x...', clap: '....x.......x...', tick: 'x.x.x.x.x.x.x.x.', shaker: '......x.......xx' },
    kit: {
      boom: { hit: 'bigBoom', gain: 0.42 },
      clap: { hit: 'claps', gain: 0.3 },
      tick: { hit: 'tamb', gain: 0.1 },
      shaker: { hit: 'tambShake', gain: 0.12 }
    },
    room: { decay: 3.6, wet: 0.3 },
    swing: 0,
    sustain: { instrument: 'cello', notes: [38, 45], gain: 0.13 },
    preview: [[0, 0, 1.5], [3, 1.5, 0.5], [4, 2, 2]]
  },
  snowfall: {
    feel: 'dreamy', rootPc: 4, bpm: 72, sound: 'softKeys',
    drums: { boom: 'x...............', tick: 'x...x...x...x...', shaker: '..............x.' },
    kit: {
      boom: { hit: 'softBoom', gain: 0.32 },
      tick: { hit: 'sleigh', gain: 0.08 },
      shaker: { hit: 'sleigh', gain: 0.08 }
    },
    room: { decay: 4.5, wet: 0.4 },
    swing: 0,
    sustain: { instrument: 'violins', notes: [64, 71], gain: 0.13 },
    preview: [[7, 0, 1], [5, 1, 1], [4, 2, 1], [2, 3, 1]]
  },
  bonfire: {
    feel: 'bright', rootPc: 7, bpm: 92, sound: 'strum',
    drums: { boom: 'x.......x.......', clap: '............x...', shaker: 'x.x.x.x.x.x.x.x.' },
    kit: {
      boom: { hit: 'cajonLow', gain: 0.8 },
      clap: { hit: 'cajonSlap', gain: 0.5 },
      shaker: { hit: 'shaker', gain: 0.22 }
    },
    room: { decay: 1, wet: 0.12 },
    swing: 0.28,
    pulse: { instrument: 'bassPluck', notes: [43, 38], pattern: 'x.......x.......', gain: 0.7 },
    preview: [[2, 0, 0.5], [4, 0.5, 0.5], [5, 1, 0.5], [4, 1.5, 0.5], [2, 2, 1], [4, 3, 1]]
  },
  running: {
    feel: 'bright', rootPc: 0, bpm: 120, sound: 'breathy',
    drums: { boom: 'x...x...x...x...', clap: '....x.......x...', tick: 'xxxxxxxxxxxxxxxx' },
    kit: {
      boom: { hit: 'tightBoom', gain: 0.45 },
      clap: { hit: 'snare', gain: 0.32 },
      tick: { hit: 'hat', gain: 0.11 }
    },
    room: { decay: 0.8, wet: 0.08 },
    swing: 0,
    pulse: { instrument: 'celloShort', notes: [36, 36, 43, 36], pattern: 'x.x.x.x.x.x.x.x.', gain: 0.3 },
    preview: [[2, 0, 0.5], [3, 0.5, 0.5], [4, 1, 0.5], [5, 1.5, 0.5], [4, 2, 0.5], [3, 2.5, 0.5], [5, 3, 1]]
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
