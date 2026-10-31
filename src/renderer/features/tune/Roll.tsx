import { useEffect, useRef } from 'react';
import { copy } from '../../app/copy';
import type { Line, Note } from '../../../shared/song';
import { padNotes } from '../../music/moods';
import { useSong } from '../../store/song';
import { onBeat, startLine, useTune } from './controller';

const ROWS = 10;

function rowFor(midi: number, pads: number[]): number {
  let best = 0;
  pads.forEach((pad, i) => {
    if (Math.abs(pad - midi) < Math.abs(pads[best] - midi)) best = i;
  });
  return best;
}

export function Roll({ line, notes, bars }: { line: Line; notes: Note[]; bars: number }) {
  const mood = useSong((s) => s.song!.mood);
  const mode = useSong((s) => s.song!.noteMode);
  const octave = useSong((s) => s.song!.octaveShift);
  const tuneMode = useTune((s) => s.mode);
  const countBeat = useTune((s) => s.countBeat);
  const holding = useTune((s) => s.takeHolding);
  const shimmer = useTune((s) => s.shimmer);
  const playhead = useRef<HTMLDivElement>(null);
  const heldBlock = useRef<HTMLDivElement>(null);
  const pads = padNotes(mood, mode, octave);
  const totalBeats = bars * 4;
  const pct = (beat: number) => `${(beat / totalBeats) * 100}%`;

  const heldStart = useRef(0);
  const lastNote = notes[notes.length - 1];
  const lastSeg = lastNote?.segments[lastNote.segments.length - 1];
  heldStart.current = lastSeg?.start ?? 0;

  useEffect(
    () =>
      onBeat((beat) => {
        const el = playhead.current;
        if (!el) return;
        if (beat < 0) {
          el.style.display = 'none';
          return;
        }
        el.style.display = 'block';
        el.style.left = `${(beat / totalBeats) * 100}%`;
        const held = heldBlock.current;
        if (held && beat >= 0) held.style.width = `${(Math.max(0.125, beat - heldStart.current) / totalBeats) * 100}%`;
      }),
    [totalBeats]
  );

  const beats = Array.from({ length: totalBeats + 1 }, (_, i) => i);
  const showStart = tuneMode === 'idle' && notes.length === 0;
  let blockIndex = 0;

  return (
    <div className="roll" data-testid="roll">
      {beats.slice(1, -1).map((beat) => (
        <div key={beat} className={`roll-line${beat % 4 === 0 ? ' roll-bar' : ''}`} style={{ left: pct(beat) }} />
      ))}

      {notes.map((note, n) => {
        const bit = line.syllables.find((s) => s.id === note.syllableId);
        return note.segments.map((seg, s) => {
          const isHeld = holding && n === notes.length - 1 && s === note.segments.length - 1;
          const delay = blockIndex++;
          return (
            <div
              key={`${note.syllableId}-${s}-${shimmer}`}
              ref={isHeld ? heldBlock : undefined}
              className={`block${s > 0 ? ' block-bend' : ''}${shimmer > 0 ? ' block-shimmer' : ''}`}
              data-testid="block"
              style={{
                left: pct(seg.start),
                width: pct(seg.duration),
                top: `${((ROWS - 1 - rowFor(seg.midi, pads)) / ROWS) * 100}%`,
                height: `${100 / ROWS}%`,
                animationDelay: shimmer > 0 ? `calc(${delay} * var(--duration-instant))` : undefined
              }}
            >
              {s === 0 && <span className="t-note-label">{bit?.text}</span>}
            </div>
          );
        });
      })}

      <div className="playhead" ref={playhead} style={{ display: 'none' }} />

      {showStart && (
        <div className="roll-center">
          <button className="btn btn-primary btn-tall btn-glow" data-testid="start" onClick={startLine}>
            {copy.tune.start}
          </button>
          <p className="t-body text-secondary">{copy.tune.startCaption}</p>
        </div>
      )}

      {tuneMode === 'countIn' && (
        <div className="roll-center">
          <div className="count-number" key={countBeat}>{4 - countBeat}</div>
          <div className="count-dots">
            {[0, 1, 2, 3].map((dot) => (
              <span key={dot} className={`count-dot${dot <= countBeat ? ' count-dot-on' : ''}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
