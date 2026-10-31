import type { Line, Mood, Song } from '../../shared/song';
import { MOODS } from '../music/moods';
import { textToSyllables } from '../speech/syllables';
import { stopReading } from '../speech/readAloud';
import { openSong, useSong } from '../store/song';
import { useUi } from '../store/ui';
import { stopAll } from '../features/tune/controller';
import { copy } from './copy';

export function makeLine(text: string): Line {
  return { id: crypto.randomUUID(), text, syllables: textToSyllables(text) };
}

export function makeSong(name: string, mood: Mood): Song {
  const now = new Date().toISOString();
  const info = MOODS[mood];
  return {
    formatVersion: 1, id: crypto.randomUUID(), name: name.trim() || copy.song.untitled, createdAt: now, updatedAt: now,
    mood, bpm: info.bpm, noteMode: 5, octaveShift: 0, sound: info.sound, lines: []
  };
}

export function enterSong(song: Song): void {
  stopAll();
  openSong(song);
  const anyTune = song.lines.some((line) => (line.tune?.notes.length ?? 0) > 0);
  useUi.setState({
    screen: 'song',
    tab: anyTune ? 'tune' : 'words',
    selectedLineId: song.lines[0]?.id ?? null,
    tuneLineId: song.lines.find((line) => !line.tune)?.id ?? song.lines[0]?.id ?? null
  });
}

export function closeSongAndGoHome(): void {
  stopAll();
  stopReading();
  useUi.setState({ screen: 'home' });
  useSong.setState({ past: [], future: [] });
}
