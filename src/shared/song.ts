export type Mood = 'wolfMoon' | 'snowfall' | 'bonfire' | 'running';
export type Feel = 'moody' | 'bright' | 'dreamy';
export type SoundId = 'glassBells' | 'softKeys' | 'breathy' | 'strum';
export type NoteMode = 5 | 7;
export type OctaveShift = -1 | 0 | 1;

export interface Segment {
  start: number; // beats from the start of the line's take
  duration: number; // beats, min 0.125
  midi: number;
}

export interface Note {
  syllableId: string;
  segments: Segment[]; // more than one = a bend
}

export interface Tune {
  bars: number;
  notes: Note[];
}

export interface Syllable {
  id: string;
  text: string;
  wordIndex: number;
}

export interface Line {
  id: string;
  text: string;
  syllables: Syllable[];
  tune?: Tune;
}

export interface Song {
  formatVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  mood: Mood;
  bpm: number;
  noteMode: NoteMode;
  octaveShift: OctaveShift;
  sound: SoundId;
  lines: Line[];
}
