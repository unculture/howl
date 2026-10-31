import { useEffect, useRef, useState } from 'react';
import { copy } from '../../app/copy';
import type { Line, Note, Segment } from '../../../shared/song';
import { engine } from '../../audio/engine';
import { padNotes } from '../../music/moods';
import { moveSegmentStart, resizeSegment, tuneEnd, type SegmentRef } from '../../music/tune';
import { commit, useSong } from '../../store/song';
import { editGrid, flashBit, onBeat, startLine, useTune } from './controller';

const ROWS = 10;
const DRAG_SLOP = 8;
const EDGE_PX = 14;

function rowFor(midi: number, pads: number[]): number {
  let best = 0;
  pads.forEach((pad, i) => {
    if (Math.abs(pad - midi) < Math.abs(pads[best] - midi)) best = i;
  });
  return best;
}

function changeSegment(lineId: string, ref: SegmentRef, change: Partial<Segment>): void {
  commit('Edit tune', (song) => {
    const seg = song.lines.find((l) => l.id === lineId)?.tune?.notes[ref.note]?.segments[ref.segment];
    if (seg) Object.assign(seg, change);
  });
}

function Block({ line, note, seg, refs, pads, totalBeats, editable, isHeld, heldRef, delay, shimmering, rollRef }: {
  line: Line;
  note: Note;
  seg: Segment;
  refs: SegmentRef;
  pads: number[];
  totalBeats: number;
  editable: boolean;
  isHeld: boolean;
  heldRef: React.RefObject<HTMLDivElement | null>;
  delay: number;
  shimmering: boolean;
  rollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [preview, setPreview] = useState<Partial<Segment> | null>(null);
  const shown = { ...seg, ...preview };
  const bit = line.syllables.find((s) => s.id === note.syllableId);
  const tune = line.tune;

  const onPointerDown = (start: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || !tune) return;
    start.stopPropagation();
    const el = start.currentTarget;
    el.setPointerCapture(start.pointerId);
    const roll = rollRef.current!.getBoundingClientRect();
    const beatsPerPx = totalBeats / roll.width;
    const rowHeight = roll.height / ROWS;
    const rect = el.getBoundingClientRect();
    const resizing = rect.right - start.clientX <= EDGE_PX && rect.width > EDGE_PX * 2;
    const startRow = rowFor(seg.midi, pads);
    const grid = editGrid(line.id);
    let axis: 'time' | 'pitch' | null = resizing ? 'time' : null;
    let latest: Partial<Segment> | null = null;

    const move = (event: PointerEvent) => {
      if (event.pointerId !== start.pointerId) return;
      const dx = event.clientX - start.clientX;
      const dy = event.clientY - start.clientY;
      if (!axis) {
        if (Math.hypot(dx, dy) < DRAG_SLOP) return;
        axis = Math.abs(dy) > Math.abs(dx) ? 'pitch' : 'time';
      }
      if (axis === 'pitch') {
        const row = Math.max(0, Math.min(ROWS - 1, startRow - Math.round(dy / rowHeight)));
        const midi = pads[row];
        if (midi !== (latest?.midi ?? seg.midi)) engine.blip(midi, 0.25);
        latest = { midi };
      } else if (resizing) {
        latest = { duration: resizeSegment(tune, refs, seg.duration + dx * beatsPerPx, grid) };
      } else {
        latest = { start: moveSegmentStart(tune, refs, seg.start + dx * beatsPerPx, grid) };
      }
      setPreview(latest);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== start.pointerId) return;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (event.type === 'pointerup' && latest) changeSegment(line.id, refs, latest);
      else if (event.type === 'pointerup' && !axis) {
        engine.blip(seg.midi, Math.max(0.2, Math.min(1, seg.duration * 0.6)));
        flashBit(note.syllableId);
      }
      setPreview(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!editable || !tune) return;
    const row = rowFor(seg.midi, pads);
    let change: Partial<Segment> | null = null;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const next = pads[Math.max(0, Math.min(ROWS - 1, row + (event.key === 'ArrowUp' ? 1 : -1)))];
      change = { midi: next };
      engine.blip(next, 0.25);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const delta = event.key === 'ArrowRight' ? 0.125 : -0.125;
      change = event.shiftKey
        ? { duration: resizeSegment(tune, refs, seg.duration + delta, 0.125) }
        : { start: moveSegmentStart(tune, refs, seg.start + delta, 0.125) };
    }
    if (change) {
      event.preventDefault();
      event.stopPropagation();
      changeSegment(line.id, refs, change);
    }
  };

  return (
    <div
      ref={isHeld ? heldRef : undefined}
      className={`block${refs.segment > 0 ? ' block-bend' : ''}${shimmering ? ' block-shimmer' : ''}${isHeld ? ' block-held' : ''}${preview ? ' block-dragging' : ''}${editable ? ' block-edit' : ''}`}
      data-testid="block"
      data-block
      tabIndex={editable ? 0 : undefined}
      aria-label={bit?.text}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      style={{
        left: `${(shown.start / totalBeats) * 100}%`,
        width: `${(shown.duration / totalBeats) * 100}%`,
        top: `${((ROWS - 1 - rowFor(shown.midi, pads)) / ROWS) * 100}%`,
        height: `${100 / ROWS}%`,
        animationDelay: shimmering ? `calc(${delay} * var(--duration-instant))` : undefined
      }}
    >
      {refs.segment === 0 && <span className="t-note-label">{bit?.text}</span>}
    </div>
  );
}

export function Roll({ line, notes, bars, needsFinishing }: { line: Line; notes: Note[]; bars: number; needsFinishing: boolean }) {
  const mood = useSong((s) => s.song!.mood);
  const mode = useSong((s) => s.song!.noteMode);
  const octave = useSong((s) => s.song!.octaveShift);
  const tuneMode = useTune((s) => s.mode);
  const countBeat = useTune((s) => s.countBeat);
  const holding = useTune((s) => s.takeHolding);
  const shimmer = useTune((s) => s.shimmer);
  const songPlaying = useTune((s) => s.songPlaying);
  const playhead = useRef<HTMLDivElement>(null);
  const heldBlock = useRef<HTMLDivElement>(null);
  const roll = useRef<HTMLDivElement>(null);
  const [shimmering, setShimmering] = useState(false);
  const pads = padNotes(mood, mode, octave);
  const totalBeats = bars * 4;
  const pct = (beat: number) => `${(beat / totalBeats) * 100}%`;

  useEffect(() => {
    if (shimmer === 0) return;
    setShimmering(true);
    const timer = window.setTimeout(() => setShimmering(false), 1200);
    return () => window.clearTimeout(timer);
  }, [shimmer]);

  const heldStart = useRef(0);
  const lastNote = notes[notes.length - 1];
  const lastSeg = lastNote?.segments[lastNote.segments.length - 1];
  heldStart.current = lastSeg?.start ?? 0;

  // During Play song the position is across the whole song; the screen shows the current line's own beats.
  const lineOffset = useRef(0);
  const songSpans = useSong((s) => s.song!.lines);
  lineOffset.current = songPlaying
    ? songSpans.slice(0, songSpans.findIndex((l) => l.id === line.id)).reduce((sum, l) => sum + (l.tune?.notes.length ? l.tune.bars * 4 : 0), 0)
    : 0;

  useEffect(
    () =>
      onBeat((beat) => {
        const el = playhead.current;
        if (!el) return;
        const local = beat - lineOffset.current;
        if (beat < 0 || local < 0) {
          el.style.display = 'none';
          return;
        }
        el.style.display = 'block';
        el.style.left = `${(local / totalBeats) * 100}%`;
        const held = heldBlock.current;
        if (held) held.style.width = `${(Math.max(0.125, local - heldStart.current) / totalBeats) * 100}%`;
      }),
    [totalBeats]
  );

  const beats = Array.from({ length: totalBeats + 1 }, (_, i) => i);
  const recording = tuneMode === 'countIn' || tuneMode === 'tapping';
  const showStart = tuneMode === 'idle' && !songPlaying && notes.length === 0;
  const editable = !recording && !needsFinishing && !songPlaying;
  let blockIndex = 0;

  const waitingFrom = needsFinishing && line.tune ? Math.ceil(tuneEnd(line.tune) / 4 - 1e-6) * 4 : 0;

  return (
    <div className="roll" data-testid="roll" ref={roll}>
      {beats.slice(1, -1).map((beat) => (
        <div key={beat} className={`roll-line${beat % 4 === 0 ? ' roll-bar' : ''}`} style={{ left: pct(beat) }} />
      ))}

      {notes.map((note, n) =>
        note.segments.map((seg, s) => (
          <Block
            key={`${note.syllableId}-${s}`}
            line={line}
            note={note}
            seg={seg}
            refs={{ note: n, segment: s }}
            pads={pads}
            totalBeats={totalBeats}
            editable={editable}
            isHeld={holding && n === notes.length - 1 && s === note.segments.length - 1}
            heldRef={heldBlock}
            delay={blockIndex++}
            shimmering={shimmering}
            rollRef={roll}
          />
        ))
      )}

      {needsFinishing &&
        line.syllables.slice(notes.length).map((bit, i) => (
          <div
            key={bit.id}
            className="block-waiting"
            style={{ left: pct(Math.min(waitingFrom + i, totalBeats - 1)), width: pct(1), top: `${(4 / ROWS) * 100}%`, height: `${100 / ROWS}%` }}
          >
            <span className="t-note-label">{bit.text}</span>
          </div>
        ))}

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
