import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isColourNote, noteName, padNotes } from '../../music/moods';
import { commit, useSong } from '../../store/song';
import { useSettings } from '../../store/settings';
import { padDown, padSlide, padUp } from './controller';

const padIndexAt = (x: number, y: number): number | null => {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-pad]');
  return el ? Number(el.dataset.pad) : null;
};

export const padLatencies: number[] = [];

export function setOctave(delta: -1 | 1): void {
  commit('Change octave', (song) => {
    const next = song.octaveShift + delta;
    if (next >= -1 && next <= 1) song.octaveShift = next as -1 | 0 | 1;
  });
}

export function Pads({ keyPress }: { keyPress: React.RefObject<PadKeyHandle | null> }) {
  const mood = useSong((s) => s.song!.mood);
  const mode = useSong((s) => s.song!.noteMode);
  const octave = useSong((s) => s.song!.octaveShift);
  const showNames = useSettings((s) => s.noteNames);
  const row = useRef<HTMLDivElement>(null);
  const notes = useRef<number[]>([]);
  notes.current = padNotes(mood, mode, octave);

  useEffect(() => {
    const el = row.current!;
    const pads = () => [...el.querySelectorAll<HTMLElement>('[data-pad]')];
    const light = (index: number | null) => {
      pads().forEach((pad, i) => {
        if (i === index) pad.dataset.pressed = 'true';
        else delete pad.dataset.pressed;
      });
    };
    // Which pad each finger or the mouse is on. Only the newest one sounds (monophonic).
    const active = new Map<string, number>();
    let newest: string | null = null;

    const press = (who: string, index: number) => {
      padDown(notes.current[index], who);
      active.set(who, index);
      newest = who;
      light(index);
    };
    const release = (who: string) => {
      if (!active.has(who)) return;
      active.delete(who);
      padUp(who);
      if (newest === who) {
        newest = null;
        light(null);
      }
    };
    const onDown = (event: PointerEvent) => {
      const index = (event.target as HTMLElement).closest<HTMLElement>('[data-pad]');
      if (!index) return;
      event.preventDefault();
      press(`p${event.pointerId}`, Number(index.dataset.pad));
      padLatencies.push(performance.now() - event.timeStamp);
      if (padLatencies.length > 50) padLatencies.shift();
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that has already gone needs no capture.
      }
    };
    const onMove = (event: PointerEvent) => {
      const who = `p${event.pointerId}`;
      if (!active.has(who) || newest !== who) return;
      const index = padIndexAt(event.clientX, event.clientY);
      if (index === null || index === active.get(who)) return;
      active.set(who, index);
      padSlide(notes.current[index], who);
      light(index);
    };
    const onUp = (event: PointerEvent) => release(`p${event.pointerId}`);
    const onBlur = () => [...active.keys()].forEach(release);

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', onUp);
    window.addEventListener('blur', onBlur);
    keyPress.current = {
      down: (index, code) => press(`k${code}`, index),
      up: (code) => release(`k${code}`)
    };
    return () => {
      onBlur();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('lostpointercapture', onUp);
      window.removeEventListener('blur', onBlur);
      keyPress.current = null;
    };
  }, [keyPress]);

  return (
    <div className="pads-row">
      <button className="pad-arrow" aria-label="Lower" disabled={octave <= -1} onClick={() => setOctave(-1)}>
        <ChevronLeft />
      </button>
      <div className="pads" ref={row} data-testid="pads">
        {notes.current.map((midi, index) => (
          <div
            key={index}
            className={`pad${mode === 7 && isColourNote(midi, mood) ? ' pad-colour' : ''}`}
            data-pad={index}
            role="button"
            aria-label={noteName(midi)}
          >
            {showNames && <span className="t-caption pad-name">{noteName(midi)}</span>}
          </div>
        ))}
      </div>
      <button className="pad-arrow" aria-label="Higher" disabled={octave >= 1} onClick={() => setOctave(1)}>
        <ChevronRight />
      </button>
    </div>
  );
}

export interface PadKeyHandle {
  down(index: number, code: string): void;
  up(code: string): void;
}
