import { create } from 'zustand';
import type { Song } from '../../shared/song';
import { songToMidi } from '../music/midi';
import { copy } from '../app/copy';
import { useSong } from './song';
import { showToast } from './ui';

export const useSaveError = create<{ error: string | null }>(() => ({ error: null }));

const DEBOUNCE_MS = 1500;
const RETRY_MS = 5000;
const MAX_FAILURES = 3;

let timer: number | undefined;
let lastSaved: Song | null = null;
let failures = 0;

export async function saveSongNow(song: Song): Promise<void> {
  await window.howl.files.save({ song, midi: songToMidi(song) });
}

async function attempt(): Promise<void> {
  const song = useSong.getState().song;
  if (!song || song === lastSaved) return;
  try {
    await saveSongNow(song);
    lastSaved = song;
    failures = 0;
    useSaveError.setState({ error: null });
  } catch (err) {
    failures++;
    if (failures >= MAX_FAILURES) useSaveError.setState({ error: String(err) });
    else showToast(copy.save.retrying);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void attempt(), RETRY_MS);
  }
}

/** Save straight away: on quit, on blur and when leaving a song. */
export async function flushSave(): Promise<void> {
  window.clearTimeout(timer);
  await attempt();
}

export function startAutosave(): void {
  useSong.subscribe((state, previous) => {
    if (state.song === previous.song) return;
    if (previous.song?.id !== state.song?.id) {
      lastSaved = state.song;
      return;
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void attempt(), DEBOUNCE_MS);
  });
  window.addEventListener('blur', () => void flushSave());
  window.howl.system.onFlush(flushSave);
}
