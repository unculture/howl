import type { Song } from '../../shared/song';

const PPQ = 480;

function varLen(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

interface MidiEvent { tick: number; order: number; bytes: number[]; }

/** Writes a type 0 MIDI file: every line laid end to end, with a lyric event for each bit. */
export function songToMidi(song: Pick<Song, 'bpm' | 'lines'>): Uint8Array {
  const events: MidiEvent[] = [];
  const tempo = Math.round(60_000_000 / song.bpm);
  events.push({ tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255] });
  events.push({ tick: 0, order: 0, bytes: [0xff, 0x58, 0x04, 4, 2, 24, 8] });

  let offsetBeats = 0;
  for (const line of song.lines) {
    if (!line.tune) continue;
    for (const note of line.tune.notes) {
      const bit = line.syllables.find((s) => s.id === note.syllableId);
      note.segments.forEach((seg, i) => {
        const on = Math.round((offsetBeats + seg.start) * PPQ);
        const off = Math.round((offsetBeats + seg.start + seg.duration) * PPQ);
        if (i === 0 && bit) {
          const text = [...new TextEncoder().encode(bit.text)];
          events.push({ tick: on, order: 1, bytes: [0xff, 0x05, ...varLen(text.length), ...text] });
        }
        events.push({ tick: on, order: 2, bytes: [0x90, seg.midi, 96] });
        events.push({ tick: off, order: 0, bytes: [0x80, seg.midi, 0] });
      });
    }
    offsetBeats += line.tune.bars * 4;
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track: number[] = [];
  let last = 0;
  for (const event of events) {
    track.push(...varLen(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  track.push(0, 0xff, 0x2f, 0);

  const len = track.length;
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >> 8, PPQ & 255,
    0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255,
    ...track
  ]);
}
