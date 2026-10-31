import { copy } from '../../app/copy';
import { makeLine } from '../../app/session';
import { remapTune } from '../../music/tune';
import { joinBits, splitBit, textToSyllables } from '../../speech/syllables';
import { commit } from '../../store/song';
import { showToast, useUi } from '../../store/ui';

export function addLine(text: string): string {
  const line = makeLine(text);
  commit('Add line', (song) => void song.lines.push(line));
  return line.id;
}

export function addLines(texts: string[]): string[] {
  const lines = texts.map(makeLine);
  commit('Add lines', (song) => void song.lines.push(...lines));
  return lines.map((line) => line.id);
}

export function setLineText(id: string, text: string): void {
  commit('Edit line', (song) => {
    const line = song.lines.find((l) => l.id === id);
    if (!line || line.text === text) return;
    const next = textToSyllables(text);
    const tune = remapTune(line.syllables, next, line.tune);
    line.text = text;
    line.syllables = next;
    if (tune) line.tune = tune;
    else delete line.tune;
  });
}

export function deleteLine(id: string): void {
  let selected: string | null = null;
  commit('Delete line', (song) => {
    const index = song.lines.findIndex((l) => l.id === id);
    if (index < 0) return;
    song.lines.splice(index, 1);
    selected = (song.lines[index] ?? song.lines[index - 1])?.id ?? null;
  });
  useUi.setState({ selectedLineId: selected });
  showToast(copy.lines.deleted, true);
}

export function moveLine(from: number, to: number): void {
  if (from === to) return;
  commit('Move line', (song) => {
    if (to < 0 || to >= song.lines.length) return;
    const [line] = song.lines.splice(from, 1);
    song.lines.splice(to, 0, line);
  });
}

function changeBits(id: string, change: (line: { syllables: ReturnType<typeof textToSyllables> }) => ReturnType<typeof textToSyllables>): void {
  commit('Fix bits', (song) => {
    const line = song.lines.find((l) => l.id === id);
    if (!line) return;
    const next = change({ syllables: line.syllables });
    const tune = remapTune(line.syllables, next, line.tune);
    line.syllables = next;
    if (tune) line.tune = tune;
    else delete line.tune;
  });
}

export function joinLineBits(id: string, index: number): void {
  changeBits(id, ({ syllables }) => joinBits(syllables, index));
}

export function splitLineBit(id: string, index: number, at: number): void {
  changeBits(id, ({ syllables }) => splitBit(syllables, index, at));
}

/** Pasted text: one line per newline, or per slash if there are no newlines. */
export function splitPasted(text: string): string[] {
  const parts = /\r?\n/.test(text) ? text.split(/\r?\n/) : text.split('/');
  return parts.map((part) => part.trim()).filter(Boolean);
}
