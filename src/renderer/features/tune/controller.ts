import { create } from 'zustand';
import type { Line, Note, Song } from '../../../shared/song';
import { engine, songSpans } from '../../audio/engine';
import { Take } from '../../music/take';
import { MAX_BARS, barsFor, defaultBars, tuneEnd } from '../../music/tune';
import { commit, useSong } from '../../store/song';
import { useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';

export type TuneMode = 'idle' | 'countIn' | 'tapping' | 'looping' | 'once';

interface TuneState {
  mode: TuneMode;
  countBeat: number;
  takeNotes: Note[] | null;
  takeHolding: boolean;
  bars: number;
  shimmer: number;
  songPlaying: boolean;
  songLineId: string | null;
  sungIndex: number; // During playback: which bit is sounding. -1 for none.
  flashBit: string | null;
}

export const useTune = create<TuneState>(() => ({
  mode: 'idle', countBeat: 0, takeNotes: null, takeHolding: false, bars: 2, shimmer: 0,
  songPlaying: false, songLineId: null, sungIndex: -1, flashBit: null
}));

// A tap just before the downbeat counts as on it: children tend to anticipate.
const EARLY_TAP_BEATS = 0.25;

let take: Take | null = null;
let takeLineId: string | null = null;
let takeBarCap = MAX_BARS;
let holder: string | null = null;
let rafId = 0;

type BeatListener = (beat: number) => void;
const beatListeners = new Set<BeatListener>();
export function onBeat(listener: BeatListener): () => void {
  beatListeners.add(listener);
  return () => beatListeners.delete(listener);
}

function song(): Song | null {
  return useSong.getState().song;
}

export function currentLine(): Line | null {
  const s = song();
  if (!s) return null;
  const id = useUi.getState().tuneLineId;
  return s.lines.find((line) => line.id === id) ?? s.lines[0] ?? null;
}

function lineById(id: string | null): Line | undefined {
  return song()?.lines.find((line) => line.id === id);
}

function publishTake(): void {
  useTune.setState({ takeNotes: take ? [...take.notes] : null, takeHolding: take?.isHolding ?? false });
}

function ensureLoop(): void {
  if (rafId) return;
  const tick = () => {
    rafId = 0;
    const { mode, songPlaying } = useTune.getState();
    if (mode === 'idle' && !songPlaying) return;
    // The Transport starts a moment in the future, so keep looping until it is told to stop.
    if (engine.isRunning) frame(engine.position());
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function frame(beat: number): void {
  const state = useTune.getState();
  for (const listener of beatListeners) listener(beat);

  if (state.mode === 'countIn') {
    const firstBeat = take ? takeStartBeat : 0;
    const count = Math.min(3, Math.max(0, Math.floor(beat - firstBeat + 4)));
    if (beat >= firstBeat) useTune.setState({ mode: 'tapping' });
    else if (count !== state.countBeat) useTune.setState({ countBeat: count });
    return;
  }

  if (state.mode === 'tapping' && take) {
    const notesLeft = !take.isComplete;
    const end = state.bars * 4;
    if (notesLeft && beat >= end * 0.9 && state.bars < takeBarCap) {
      useTune.setState({ bars: state.bars + 2 });
    } else if (notesLeft && beat >= end) {
      runOutOfRoom(end);
    }
    return;
  }

  const lineId = state.songPlaying ? songLineAt(beat) : useUi.getState().tuneLineId;
  const line = lineById(lineId);
  if (state.songPlaying && lineId !== state.songLineId) {
    useTune.setState({ songLineId: lineId });
    if (useUi.getState().tab === 'tune' && lineId) useUi.setState({ tuneLineId: lineId });
  }
  if (line?.tune) {
    const local = state.songPlaying ? beat - songOffset(line.id) : beat;
    // Karaoke follows note starts: a bit stays lit until the next one begins.
    const index = line.tune.notes.findLastIndex((note) => local >= note.segments[0].start);
    if (index !== state.sungIndex) useTune.setState({ sungIndex: index });
  }
}

function songLineAt(beat: number): string | null {
  const s = song();
  if (!s) return null;
  return songSpans(s).find((span) => beat >= span.startBeat && beat < span.endBeat)?.lineId ?? null;
}

function songOffset(lineId: string): number {
  const s = song();
  return s ? (songSpans(s).find((span) => span.lineId === lineId)?.startBeat ?? 0) : 0;
}

let takeStartBeat = 0;

function beginTake(line: Line, kept: Note[], bars: number, startBeat: number): void {
  const s = song();
  if (!s) return;
  take = new Take(line.syllables, kept);
  takeLineId = line.id;
  holder = null;
  takeStartBeat = startBeat;
  takeBarCap = Math.max(MAX_BARS, Math.ceil(startBeat / 8) * 2 + 4);
  useTune.setState({
    mode: 'countIn', countBeat: 0, takeNotes: [...take.notes], takeHolding: false, bars, sungIndex: -1,
    songPlaying: false, songLineId: null
  });
  engine.humOn = useSettings.getState().hum;
  engine.prepareSound(s.sound);
  engine.startTake(s.mood, s.bpm, startBeat);
  ensureLoop();
}

/** Start: one bar of clicks, then tapping. */
export function startLine(): void {
  const line = currentLine();
  if (!line || line.syllables.length === 0) return;
  beginTake(line, [], defaultBars(line.syllables.length), 0);
}

/** Needs finishing: keep the notes she has and pick up from the next bar. */
export function carryOn(): void {
  const line = currentLine();
  if (!line?.tune) return startLine();
  const startBeat = Math.ceil(tuneEnd(line.tune) / 4 - 1e-6) * 4;
  beginTake(line, line.tune.notes, Math.max(line.tune.bars, barsFor(startBeat + 4)), startBeat);
}

export function stopAll(): void {
  engine.stop();
  engine.release();
  take = null;
  takeLineId = null;
  holder = null;
  useTune.setState({
    mode: 'idle', takeNotes: null, takeHolding: false, sungIndex: -1, songPlaying: false, songLineId: null, countBeat: 0
  });
  for (const listener of beatListeners) listener(-1);
}

/** Start line again: throw away this take and restart the count-in. */
export function restartTake(): void {
  const line = lineById(takeLineId);
  const needsFinishing = line?.tune && line.tune.notes.length > 0;
  stopAll();
  if (needsFinishing) carryOn();
  else startLine();
}

/** Again: the old tune goes on the undo stack and a new take begins. */
export function again(): void {
  const line = currentLine();
  if (!line) return;
  stopAll();
  commit('Again', (draft) => {
    const target = draft.lines.find((l) => l.id === line.id);
    if (target) delete target.tune;
  });
  startLine();
}

function finishTake(): void {
  if (!take || !takeLineId) return;
  const s = song();
  if (!s) return;
  const lineId = takeLineId;
  const notes = take.notes;
  const bars = barsFor(tuneEnd({ notes }));
  commit('Make tune', (draft) => {
    const line = draft.lines.find((l) => l.id === lineId);
    if (line) line.tune = { bars, notes };
  });
  take = null;
  takeLineId = null;
  engine.chime(s.mood);
  engine.loopFromTake(s.mood, s.sound, () => lineById(lineId)?.tune);
  useTune.setState((state) => ({ mode: 'looping', takeNotes: null, takeHolding: false, shimmer: state.shimmer + 1 }));
  ensureLoop();
}

/** The take reached the last bar with bits still to sing. Keep what she has, so nothing is lost. */
function runOutOfRoom(endBeat: number): void {
  if (!take || !takeLineId) return;
  engine.release();
  take.up(endBeat);
  const lineId = takeLineId;
  const notes = take.notes;
  const hadNew = notes.length > (lineById(lineId)?.tune?.notes.length ?? 0);
  stopAll();
  if (hadNew) {
    commit('Make tune', (draft) => {
      const line = draft.lines.find((l) => l.id === lineId);
      if (line) line.tune = { bars: barsFor(tuneEnd({ notes })), notes };
    });
  }
}

// ---- Pads. The first line of padDown makes the sound; everything else follows it. ----

export function padDown(midi: number, who: string): void {
  engine.attack(midi);
  holder = who;
  const state = useTune.getState();
  if (!take) return;
  const recording = state.mode === 'tapping' || (state.mode === 'countIn' && engine.position() >= takeStartBeat - EARLY_TAP_BEATS);
  if (!recording) return;
  const beat = Math.max(takeStartBeat, engine.position());
  take.down(beat, midi);
  if (state.mode === 'countIn') useTune.setState({ mode: 'tapping' });
  publishTake();
  if (take.isComplete) finishTake(); // A second finger pressed after the last bit was already held.
}

export function padSlide(midi: number, who: string): void {
  if (holder !== who) return;
  engine.bend(midi);
  if (take?.isHolding) {
    take.slide(engine.position(), midi);
    publishTake();
  }
}

export function padUp(who: string): void {
  if (holder !== who) return; // This finger already lost out to a newer one.
  holder = null;
  engine.release();
  if (!take?.isHolding) return;
  take.up(engine.position());
  publishTake();
  if (take.isComplete) finishTake();
}

export function backspaceBit(): void {
  if (!take || useTune.getState().mode !== 'tapping') return;
  const keptFloor = lineById(takeLineId)?.tune?.notes.length ?? 0;
  if (take.notes.length <= keptFloor) return;
  if (take.isHolding) engine.release();
  holder = null;
  take.backspace();
  publishTake();
}

export function takeIsHolding(): boolean {
  return take?.isHolding ?? false;
}

// ---- Playback ----

export function hearIt(): void {
  const s = song();
  const line = currentLine();
  if (!s || !line?.tune) return;
  stopAll();
  engine.humOn = useSettings.getState().hum;
  engine.onEnded = () => stopAll();
  engine.startOnce(s.mood, s.sound, s.bpm, line.tune);
  useTune.setState({ mode: 'once' });
  ensureLoop();
}

export function playSong(target?: Song): void {
  const s = target ?? song();
  if (!s) return;
  stopAll();
  engine.humOn = useSettings.getState().hum;
  engine.onEnded = () => stopAll();
  engine.startSong(s);
  useTune.setState({ songPlaying: true, songLineId: songSpans(s)[0]?.lineId ?? null });
  if (useUi.getState().tab === 'tune' && !target) useUi.setState({ tuneLineId: songSpans(s)[0]?.lineId ?? null });
  ensureLoop();
}

export function goToLine(lineId: string): void {
  stopAll();
  useUi.setState({ tuneLineId: lineId, selectedLineId: lineId });
}
