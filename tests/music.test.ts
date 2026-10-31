import { describe, expect, test } from 'vitest';
import { Midi } from '@tonejs/midi';
import JSZip from 'jszip';
import type { Mood, NoteMode, OctaveShift, Song, Syllable, Tune } from '../src/shared/song';
import { packSong, unpackSong, SongFileError } from '../src/shared/howlFile';
import { MOOD_ORDER, isColourNote, isInScale, noteName, padNotes, snapToScale } from '../src/renderer/music/moods';
import { Take } from '../src/renderer/music/take';
import { barsFor, moveSegmentStart, remapTune, resizeSegment, sameTuneAs, tidyTune, transposeTune, tuneEnd } from '../src/renderer/music/tune';
import { songToMidi } from '../src/renderer/music/midi';

const bits = (...texts: string[]): Syllable[] => texts.map((text, i) => ({ id: `s${i}`, text, wordIndex: i }));
const tuneOf = (...notes: Array<[number, number, number]>): Tune => ({
  bars: 2,
  notes: notes.map(([start, duration, midi], i) => ({ syllableId: `s${i}`, segments: [{ start, duration, midi }] }))
});

describe('pads', () => {
  test('Wolf moon examples from the spec', () => {
    expect(padNotes('wolfMoon', 5, 0).map(noteName)).toEqual(['A3', 'C4', 'D4', 'F4', 'G4', 'A4', 'C5', 'D5', 'F5', 'G5']);
    expect(padNotes('wolfMoon', 7, 0).map(noteName)).toEqual(['A3', 'Bb3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'Bb4', 'C5']);
  });

  test('tables for every mood, mode and octave', () => {
    const table: Record<string, number[]> = {};
    for (const mood of MOOD_ORDER) {
      for (const mode of [5, 7] as NoteMode[]) {
        for (const octave of [-1, 0, 1] as OctaveShift[]) {
          const notes = padNotes(mood as Mood, mode, octave);
          table[`${mood}.${mode}.${octave}`] = notes;
          expect(notes).toHaveLength(10);
          expect(notes.every((n) => isInScale(n, mood, mode))).toBe(true);
          expect(notes[0] - octave * 12).toBeGreaterThanOrEqual(57);
        }
      }
    }
    expect(table).toMatchSnapshot();
  });

  test('colour notes are the ones outside the 5-note scale', () => {
    expect(isColourNote(58, 'wolfMoon')).toBe(true); // Bb
    expect(isColourNote(57, 'wolfMoon')).toBe(false); // A
  });

  test('snapping ties go down', () => {
    // C major pentatonic: Eb(63) is between D and E; a tie goes to D.
    expect(snapToScale(63, 'running', 5)).toBe(62);
  });
});

describe('tapping engine', () => {
  const line = bits('the', 'pine', 'trees');

  test('each pad down sings the next bit, up sets its length', () => {
    const take = new Take(line);
    expect(take.glowIndex).toBe(0);
    take.down(1, 60);
    expect(take.glowIndex).toBe(1);
    take.up(2.5);
    expect(take.notes[0]).toEqual({ syllableId: 's0', segments: [{ start: 1, duration: 1.5, midi: 60 }] });
  });

  test('a very short tap is at least the minimum length', () => {
    const take = new Take(line);
    take.down(1, 60);
    take.up(1.01);
    expect(take.notes[0].segments[0].duration).toBe(0.125);
  });

  test('sliding makes joined segments on the same bit', () => {
    const take = new Take(line);
    take.down(0, 60);
    take.slide(1, 62);
    take.up(2);
    expect(take.notes).toHaveLength(1);
    expect(take.notes[0].segments).toEqual([
      { start: 0, duration: 1, midi: 60 },
      { start: 1, duration: 1, midi: 62 }
    ]);
  });

  test('a second finger ends the held note and starts the next bit', () => {
    const take = new Take(line);
    take.down(0, 60);
    take.down(1, 62);
    expect(take.notes).toHaveLength(2);
    expect(take.notes[0].segments[0].duration).toBe(1);
    expect(take.isHolding).toBe(true);
  });

  test('backspace moves the glow back', () => {
    const take = new Take(line);
    take.down(0, 60);
    take.up(1);
    take.down(1, 62);
    take.up(2);
    take.backspace();
    expect(take.glowIndex).toBe(1);
  });

  test('complete only after the last bit is released', () => {
    const take = new Take(line);
    for (const beat of [0, 1]) {
      take.down(beat, 60);
      take.up(beat + 0.5);
    }
    take.down(2, 60);
    expect(take.isComplete).toBe(false);
    take.up(3);
    expect(take.isComplete).toBe(true);
    expect(take.down(4, 60)).toBe(false);
  });

  test('notes never overlap even when a tap lands inside the minimum length of the last one', () => {
    const take = new Take(line);
    take.down(1, 60);
    take.up(1.01);
    take.down(1.02, 62);
    expect(take.notes[1].segments[0].start).toBe(1.125);
  });

  test('carry on keeps the earlier notes', () => {
    const take = new Take(line, tuneOf([0, 1, 60]).notes);
    expect(take.glowIndex).toBe(1);
  });
});

describe('helpers', () => {
  test('bars', () => {
    expect(barsFor(1)).toBe(2);
    expect(barsFor(8)).toBe(2);
    expect(barsFor(8.1)).toBe(4);
    expect(barsFor(31)).toBe(8);
  });

  test('tidy timing rounds to 1/8 and pushes collisions on', () => {
    const tidy = tidyTune(tuneOf([0.06, 0.02, 60], [0.11, 0.3, 62]));
    expect(tidy.notes[0].segments[0]).toEqual({ start: 0, duration: 0.125, midi: 60 });
    expect(tidy.notes[1].segments[0].start).toBe(0.125);
    expect(tidy.notes[1].segments[0].duration).toBe(0.25);
  });

  test('tidy timing keeps bends joined', () => {
    const tune: Tune = { bars: 2, notes: [{ syllableId: 's0', segments: [
      { start: 0.02, duration: 0.97, midi: 60 }, { start: 0.99, duration: 1.02, midi: 62 }
    ] }] };
    const [a, b] = tidyTune(tune).notes[0].segments;
    expect(b.start).toBe(a.start + a.duration);
  });

  test('same tune with equal counts copies note for note', () => {
    const result = sameTuneAs(tuneOf([0, 1, 60], [1, 1, 62]), [
      { id: 'x', text: 'a', wordIndex: 0 }, { id: 'y', text: 'b', wordIndex: 1 }
    ]);
    expect(result.notes.map((n) => n.syllableId)).toEqual(['x', 'y']);
    expect(result.notes[1].segments[0]).toEqual({ start: 1, duration: 1, midi: 62 });
  });

  test('same tune with more bits maps across evenly and does not overlap', () => {
    const target = bits('a', 'b', 'c', 'd', 'e');
    const result = sameTuneAs(tuneOf([0, 1, 60], [1, 1, 62], [2, 2, 64]), target);
    expect(result.notes).toHaveLength(5);
    expect(result.notes.map((n) => n.segments[0].midi)).toEqual([60, 62, 62, 64, 64]);
    const starts = result.notes.map((n) => n.segments[0].start);
    [0, 0.8, 1.6, 2.4, 3.2].forEach((want, i) => expect(starts[i]).toBeCloseTo(want));
    result.notes.forEach((n, i) => {
      if (i < 4) expect(n.segments[0].start + n.segments[0].duration).toBeLessThanOrEqual(starts[i + 1] + 1e-9);
    });
  });

  test('same tune with fewer bits', () => {
    const result = sameTuneAs(tuneOf([0, 1, 60], [1, 1, 62], [2, 1, 64], [3, 1, 65]), bits('a', 'b'));
    expect(result.notes.map((n) => n.segments[0].midi)).toEqual([60, 65]);
    expect(tuneEnd(result)).toBeLessThanOrEqual(4);
  });

  test('mood change transposes and stays in key', () => {
    const wolf = tuneOf([0, 1, 62], [1, 1, 65], [2, 1, 69]); // D F A in D minor pentatonic
    const moved = transposeTune(wolf, 'wolfMoon', 'running', 5);
    expect(moved.notes[0].segments[0].midi).toBe(60); // D → C, the root stays the root
    for (const note of moved.notes) expect(isInScale(note.segments[0].midi, 'running', 5)).toBe(true);
  });

  test('text edit with the same count keeps the tune and remaps ids', () => {
    const next = [{ id: 'n0', text: 'x', wordIndex: 0 }, { id: 'n1', text: 'y', wordIndex: 1 }];
    const tune = remapTune(bits('a', 'b'), next, tuneOf([0, 1, 60], [1, 1, 62]))!;
    expect(tune.notes.map((n) => n.syllableId)).toEqual(['n0', 'n1']);
  });

  test('text edit with a changed count keeps only the unchanged prefix', () => {
    const next = [{ id: 'n0', text: 'a', wordIndex: 0 }, { id: 'n1', text: 'z', wordIndex: 1 }, { id: 'n2', text: 'q', wordIndex: 2 }];
    const tune = remapTune(bits('a', 'b'), next, tuneOf([0, 1, 60], [1, 1, 62]))!;
    expect(tune.notes).toHaveLength(1);
    expect(tune.notes[0].syllableId).toBe('n0');
  });

  test('blocks stop at their neighbours', () => {
    const tune = tuneOf([0, 1, 60], [2, 1, 62], [4, 1, 64]);
    const ref = { note: 1, segment: 0 };
    expect(moveSegmentStart(tune, ref, 0.2, 1 / 16)).toBe(1);
    expect(moveSegmentStart(tune, ref, 3.9, 1 / 16)).toBe(3);
    expect(resizeSegment(tune, ref, 9, 1 / 16)).toBe(2);
    expect(resizeSegment(tune, ref, 0.01, 1 / 16)).toBe(0.125);
  });
});

describe('song file', () => {
  const song: Song = {
    formatVersion: 1, id: 'abc', name: 'moon pocket', createdAt: '2026-10-31T10:00:00.000Z', updatedAt: '2026-10-31T10:00:00.000Z',
    mood: 'wolfMoon', bpm: 84, noteMode: 5, octaveShift: 0, sound: 'glassBells',
    lines: [
      { id: 'l1', text: 'the pine', syllables: bits('the', 'pine'), tune: { bars: 2, notes: [
        { syllableId: 's0', segments: [{ start: 0, duration: 1, midi: 62 }] },
        { syllableId: 's1', segments: [{ start: 1, duration: 1, midi: 65 }, { start: 2, duration: 1, midi: 67 }] }
      ] } },
      { id: 'l2', text: 'no tune yet', syllables: bits('no', 'tune', 'yet') },
      { id: 'l3', text: 'the', syllables: bits('the'), tune: { bars: 2, notes: [{ syllableId: 's0', segments: [{ start: 0, duration: 1, midi: 69 }] }] } }
    ]
  };

  test('song.json round-trips unchanged and the zip holds the 4 files', async () => {
    const bytes = await packSong(song, songToMidi(song));
    expect(await unpackSong(bytes)).toEqual(song);
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(['README.txt', 'lyrics.txt', 'song.json', 'tune.mid']);
    expect(await zip.file('lyrics.txt')!.async('string')).toBe('the pine\nno tune yet\nthe\n');
  });

  test('unknown files are preserved on save', async () => {
    const old = new JSZip();
    old.file('takes/one.flac', 'keep me');
    const previous = await old.generateAsync({ type: 'uint8array' });
    const zip = await JSZip.loadAsync(await packSong(song, songToMidi(song), previous));
    expect(await zip.file('takes/one.flac')!.async('string')).toBe('keep me');
  });

  test('tune.mid is type 0 and parses back with notes, tempo, offsets and lyrics', () => {
    const bytes = songToMidi(song);
    expect(bytes[9]).toBe(0);
    const midi = new Midi(bytes);
    expect(midi.tracks.flatMap((t) => t.notes)).toHaveLength(4);
    expect(Math.round(midi.header.tempos[0].bpm)).toBe(84);
    const notes = midi.tracks[0].notes;
    expect(notes[3].ticks).toBe(8 * 480); // line 3 starts after line 1's two bars; line 2 has no tune
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('the');
    expect(text).toContain('pine');
    expect(bytes.filter((_, i) => bytes[i] === 0xff && bytes[i + 1] === 0x05).length).toBe(3);
  });

  test('corrupt and newer files are refused', async () => {
    await expect(unpackSong(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(SongFileError);
    const newer = new JSZip();
    newer.file('song.json', JSON.stringify({ ...song, formatVersion: 2 }));
    await expect(unpackSong(await newer.generateAsync({ type: 'uint8array' }))).rejects.toBeInstanceOf(SongFileError);
  });
});
