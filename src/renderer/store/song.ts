import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { create } from 'zustand';
import type { Song } from '../../shared/song';

enablePatches();

interface HistoryEntry { name: string; patches: Patch[]; inverse: Patch[]; }

interface SongState {
  song: Song | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  revision: number;
}

export const useSong = create<SongState>(() => ({ song: null, past: [], future: [], revision: 0 }));

/** Every change to a song goes through here, so every change can be undone. */
export function commit(name: string, recipe: (song: Song) => void): void {
  const { song, past, revision } = useSong.getState();
  if (!song) return;
  const [next, patches, inverse] = produceWithPatches(song, recipe);
  if (patches.length === 0) return;
  useSong.setState({
    song: { ...next, updatedAt: new Date().toISOString() },
    past: [...past, { name, patches, inverse }],
    future: [],
    revision: revision + 1
  });
}

export function undo(): void {
  const { song, past, future, revision } = useSong.getState();
  const entry = past[past.length - 1];
  if (!song || !entry) return;
  useSong.setState({
    song: { ...applyPatches(song, entry.inverse), updatedAt: new Date().toISOString() },
    past: past.slice(0, -1),
    future: [...future, entry],
    revision: revision + 1
  });
}

export function redo(): void {
  const { song, past, future, revision } = useSong.getState();
  const entry = future[future.length - 1];
  if (!song || !entry) return;
  useSong.setState({
    song: { ...applyPatches(song, entry.patches), updatedAt: new Date().toISOString() },
    past: [...past, entry],
    future: future.slice(0, -1),
    revision: revision + 1
  });
}

export function openSong(song: Song | null): void {
  useSong.setState({ song, past: [], future: [], revision: 0 });
}
