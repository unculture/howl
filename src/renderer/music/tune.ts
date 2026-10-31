import type { Line, Mood, NoteMode, Note, Segment, Syllable, Tune } from '../../shared/song';
import { rootInterval, snapToScale } from './moods';

export const MIN_DURATION = 0.125;
export const EPS = 1e-6;
export const MAX_BARS = 8;
const round8 = (v: number) => Math.round(v * 8) / 8;

export function noteEnd(note: Note): number {
  const last = note.segments[note.segments.length - 1];
  return last.start + last.duration;
}

export function tuneEnd(tune: Pick<Tune, 'notes'>): number {
  return tune.notes.reduce((end, note) => Math.max(end, noteEnd(note)), 0);
}

/** Smallest of 2/4/6/8 bars that holds endBeat. Longer takes keep growing in steps of two bars. */
export function barsFor(endBeat: number): number {
  let bars = 2;
  while (bars * 4 < endBeat - EPS) bars += 2;
  return bars;
}

export function defaultBars(bitCount: number): number {
  return bitCount <= 10 ? 2 : 4;
}

export type LineState = 'none' | 'partial' | 'complete';

export function lineState(line: Line): LineState {
  const count = line.tune?.notes.length ?? 0;
  if (count === 0) return 'none';
  return count >= line.syllables.length ? 'complete' : 'partial';
}

/** Tidy timing: starts and lengths to the nearest 1/8 beat, pushing later notes on if they collide. */
export function tidyTune(tune: Tune): Tune {
  let prevEnd = 0;
  const notes = tune.notes.map((note) => {
    const segments = note.segments.map((seg, i) => {
      let start = round8(seg.start);
      if (i > 0) start = prevEnd; // Bends stay joined.
      while (start < prevEnd - EPS) start += 0.125;
      const duration = Math.max(0.125, round8(seg.duration));
      prevEnd = start + duration;
      return { ...seg, start, duration };
    });
    return { ...note, segments };
  });
  return { notes, bars: Math.max(tune.bars, barsFor(prevEnd)) };
}

/** Same tune as: copy a source tune onto the target line's bits. */
export function sameTuneAs(source: Tune, target: Syllable[]): Tune {
  const nSrc = source.notes.length;
  const nTgt = target.length;
  if (nSrc === nTgt) {
    return {
      bars: source.bars,
      notes: source.notes.map((note, i) => ({
        syllableId: target[i].id,
        segments: note.segments.map((seg) => ({ ...seg }))
      }))
    };
  }
  const first = source.notes[0].segments[0].start;
  const span = tuneEnd(source) - first;
  const step = span / nTgt;
  const notes: Note[] = target.map((syllable, i) => {
    const src = source.notes[nTgt === 1 ? 0 : Math.round((i * (nSrc - 1)) / (nTgt - 1))];
    const srcStart = src.segments[0].start;
    const srcLen = noteEnd(src) - srcStart;
    const length = Math.max(MIN_DURATION, Math.min(step, (srcLen * nSrc) / nTgt));
    const scale = length / srcLen;
    const start = first + i * step;
    return {
      syllableId: syllable.id,
      segments: src.segments.map((seg) => ({
        midi: seg.midi,
        start: start + (seg.start - srcStart) * scale,
        duration: Math.max(MIN_DURATION / src.segments.length, seg.duration * scale)
      }))
    };
  });
  return { notes, bars: barsFor(tuneEnd({ notes })) };
}

/** Moves a tune into a new mood's key: shift by the root difference, then snap to the scale. */
export function transposeTune(tune: Tune, from: Mood, to: Mood, mode: NoteMode): Tune {
  const interval = rootInterval(from, to);
  return {
    ...tune,
    notes: tune.notes.map((note) => ({
      ...note,
      segments: note.segments.map((seg) => ({ ...seg, midi: snapToScale(seg.midi + interval, to, mode) }))
    }))
  };
}

/** After bits change: same count keeps the tune; otherwise keep only the unchanged prefix of bits. */
export function remapTune(oldBits: Syllable[], newBits: Syllable[], tune: Tune | undefined): Tune | undefined {
  if (!tune) return undefined;
  if (oldBits.length === newBits.length) {
    return {
      ...tune,
      notes: tune.notes.map((note, i) => ({ ...note, syllableId: newBits[i].id }))
    };
  }
  let keep = 0;
  while (keep < oldBits.length && keep < newBits.length && oldBits[keep].text === newBits[keep].text) keep++;
  const notes = tune.notes.slice(0, keep).map((note, i) => ({ ...note, syllableId: newBits[i].id }));
  return notes.length > 0 ? { ...tune, notes } : undefined;
}

export interface SegmentRef { note: number; segment: number; }

function flat(tune: Tune): Array<SegmentRef & { seg: Segment }> {
  return tune.notes.flatMap((note, n) => note.segments.map((seg, s) => ({ note: n, segment: s, seg })));
}

function neighbours(tune: Tune, ref: SegmentRef): { prevEnd: number; nextStart: number } {
  const all = flat(tune);
  const i = all.findIndex((x) => x.note === ref.note && x.segment === ref.segment);
  const prev = all[i - 1]?.seg;
  const next = all[i + 1]?.seg;
  return { prevEnd: prev ? prev.start + prev.duration : 0, nextStart: next ? next.start : Infinity };
}

const snapTo = (value: number, grid: number) => Math.round(value / grid) * grid;

/** Move a block in time. It stops at its neighbours, so blocks never overlap or change order. */
export function moveSegmentStart(tune: Tune, ref: SegmentRef, start: number, grid: number): number {
  const seg = tune.notes[ref.note].segments[ref.segment];
  const { prevEnd, nextStart } = neighbours(tune, ref);
  const limit = Math.min(nextStart, tune.bars * 4) - seg.duration;
  return Math.max(prevEnd, Math.min(limit, snapTo(start, grid)));
}

/** Change a block's length. It stops at the next block and never goes under the minimum. */
export function resizeSegment(tune: Tune, ref: SegmentRef, duration: number, grid: number): number {
  const seg = tune.notes[ref.note].segments[ref.segment];
  const { nextStart } = neighbours(tune, ref);
  const limit = Math.min(nextStart, tune.bars * 4) - seg.start;
  return Math.max(MIN_DURATION, Math.min(limit, snapTo(duration, grid)));
}
