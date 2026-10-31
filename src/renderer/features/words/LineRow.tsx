import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { copy } from '../../app/copy';
import type { Line } from '../../../shared/song';
import { lineState } from '../../music/tune';
import { useReading } from '../../speech/readAloud';
import { startDictation, stopDictation, useDictation } from '../../speech/dictation';
import { useTune } from '../tune/controller';
import { SpeakerButton } from './SpeakerButton';
import { addLine, deleteLine, joinLineBits, moveLine, setLineText, splitLineBit } from './lineActions';

const LONG_PRESS_MS = 200;
const SWIPE_OPEN = 96;
const MOVE_SLOP = 8;

function FieldMic({ onText }: { onText: (text: string) => void }) {
  const status = useDictation((s) => s.status);
  const listening = status === 'listening';
  return (
    <button
      className={`btn-icon field-mic${listening ? ' field-mic-on' : ''}`}
      aria-label={copy.new.say}
      disabled={status === 'loading' || status === 'nomic' || status === 'finishing'}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => {
        if (listening) void stopDictation();
        else void startDictation({ single: true, onLine: onText });
      }}
    >
      <Mic size="var(--size-icon-sm)" />
    </button>
  );
}

function LineField({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const finish = (action: () => void) => {
    if (done.current) return;
    done.current = true;
    action();
  };
  return (
    <div className="line-field">
      <input
        className="t-lyric-m"
        autoFocus
        value={text}
        aria-label={copy.lines.typeLine}
        data-testid="line-input"
        onChange={(event) => setText(event.target.value)}
        onBlur={() => finish(() => onSave(text.trim()))}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') finish(() => onSave(text.trim()));
          if (event.key === 'Escape') finish(onCancel);
        }}
      />
      <FieldMic onText={setText} />
    </div>
  );
}

export function NewLineRow({ onDone }: { onDone: (id: string | null) => void }) {
  return (
    <div className="line-row line-editing">
      <LineField initial="" onSave={(text) => onDone(text ? addLine(text) : null)} onCancel={() => onDone(null)} />
    </div>
  );
}

function LyricText({ line, reading, wordIndex }: { line: Line; reading: boolean; wordIndex: number }) {
  if (!reading) return <span className="line-text t-lyric-m">{line.text}</span>;
  return (
    <span className="line-text t-lyric-m">
      {line.text.split(/(\s+)/).filter(Boolean).reduce<{ count: number; nodes: React.ReactNode[] }>(
        (acc, part, i) => {
          if (/^\s+$/.test(part)) {
            acc.nodes.push(part);
            return acc;
          }
          const n = acc.count++;
          acc.nodes.push(
            <span key={i} className={n === wordIndex ? 'word-now' : n < wordIndex ? 'word-read' : 'word-todo'}>{part}</span>
          );
          return acc;
        },
        { count: 0, nodes: [] }
      ).nodes}
    </span>
  );
}

function SplitPopover({ text, onSplit, onClose }: { text: string; onSplit: (at: number) => void; onClose: () => void }) {
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('.split-popover')) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', escape, true);
    };
  }, [onClose]);
  return (
    <div className="split-popover" data-testid="split-popover">
      {[...text].map((letter, i) => (
        <span key={i} className="split-part">
          {i > 0 && <button className="split-gap" aria-label={`${text.slice(0, i)} ${text.slice(i)}`} data-testid="split-gap" onClick={() => onSplit(i)}><span /></button>}
          <span className="split-letter">{letter}</span>
        </span>
      ))}
    </div>
  );
}

function BitChips({ line }: { line: Line }) {
  const [splitting, setSplitting] = useState<string | null>(null);
  const [popped, setPopped] = useState<string | null>(null);
  return (
    <div className="chips">
      <div className="chips-row">
        {line.syllables.map((bit, i) => {
          const next = line.syllables[i + 1];
          const joinsNext = next?.wordIndex === bit.wordIndex;
          return (
            <span key={bit.id} className={`chip-group${joinsNext ? '' : ' chip-word-end'}`}>
              <span className="chip-anchor">
                <button
                  className={`bit-chip${popped === bit.id ? ' bit-pop' : ''}`}
                  data-testid="bit"
                  onClick={(event) => {
                    event.stopPropagation();
                    if ([...bit.text].length >= 2) setSplitting(bit.id);
                  }}
                >
                  {bit.text}
                </button>
                {splitting === bit.id && (
                  <SplitPopover
                    text={bit.text}
                    onClose={() => setSplitting(null)}
                    onSplit={(at) => {
                      splitLineBit(line.id, i, at);
                      setSplitting(null);
                    }}
                  />
                )}
              </span>
              {joinsNext && (
                <button
                  className="join-dot"
                  data-testid="join"
                  aria-label={`${bit.text}${next.text}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPopped(bit.id);
                    joinLineBits(line.id, i);
                  }}
                ><span /></button>
              )}
            </span>
          );
        })}
        <span className="chips-count t-caption text-secondary" data-testid="bit-count">
          {line.syllables.length === 1 ? '1 bit to sing' : copy.lines.bits(line.syllables.length)}
        </span>
      </div>
      <p className="t-caption text-secondary">{copy.lines.fixHint}</p>
    </div>
  );
}

export function LineRow(props: {
  line: Line;
  index: number;
  count: number;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onEditDone: () => void;
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { line, index, selected, editing, onSelect, onEdit, onEditDone, listRef } = props;
  const reading = useReading((s) => s.readingId === line.id);
  const wordIndex = useReading((s) => s.wordIndex);
  const playing = useTune((s) => s.songLineId === line.id);
  const rowRef = useRef<HTMLDivElement>(null);
  const [swipe, setSwipe] = useState(0);
  const [isOpen, setOpen] = useState(false);
  const state = lineState(line);

  // Reorder (press 200ms, then drag) and swipe left to reveal Delete. Buttons keep their own taps.
  const onPointerDown = (start: React.PointerEvent<HTMLDivElement>) => {
    if ((start.target as HTMLElement).closest('button, input') || editing) return;
    const row = rowRef.current!;
    const pointerId = start.pointerId;
    const startX = start.clientX;
    const startY = start.clientY;
    const startSwipe = isOpen ? -SWIPE_OPEN : 0;
    let mode: 'press' | 'drag' | 'swipe' | 'none' = 'press';
    let moved = false;
    let target = index;
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('.line-outer') ?? [])];
    const rects = rows.map((el) => el.getBoundingClientRect());
    const myRect = rects[index];

    const hold = window.setTimeout(() => {
      if (mode !== 'press') return;
      mode = 'drag';
      row.closest('.line-outer')?.classList.add('line-dragging');
    }, LONG_PRESS_MS);

    const preventScroll = (event: TouchEvent) => {
      if (mode === 'drag' || mode === 'swipe') event.preventDefault();
    };

    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.hypot(dx, dy) > MOVE_SLOP) moved = true;
      if (mode === 'press' && moved) {
        window.clearTimeout(hold);
        mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'none';
      }
      if (mode === 'swipe') setSwipe(Math.max(-SWIPE_OPEN * 1.5, Math.min(0, startSwipe + dx)));
      if (mode === 'drag') {
        const outer = rows[index];
        outer.style.transform = `translateY(${dy}px)`;
        const center = myRect.top + myRect.height / 2 + dy;
        target = rects.findIndex((rect) => center < rect.bottom);
        if (target < 0) target = rows.length - 1;
        rows.forEach((el, i) => {
          if (i === index) return;
          const shift = i > index && i <= target ? -myRect.height : i < index && i >= target ? myRect.height : 0;
          el.style.transform = shift ? `translateY(${shift}px)` : '';
        });
      }
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      window.clearTimeout(hold);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      row.removeEventListener('touchmove', preventScroll);
      if (mode === 'drag') {
        rows.forEach((el) => {
          el.style.transform = '';
          el.classList.remove('line-dragging');
        });
        if (event.type === 'pointerup') moveLine(index, target);
      } else if (mode === 'swipe') {
        const open = startSwipe + (event.clientX - startX) < -SWIPE_OPEN / 2;
        setOpen(open);
        setSwipe(open ? -SWIPE_OPEN : 0);
      } else if (!moved) {
        if (isOpen) {
          setOpen(false);
          setSwipe(0);
        } else onSelect();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    row.addEventListener('touchmove', preventScroll, { passive: false });
  };

  if (editing) {
    return (
      <div className="line-outer">
        <div className="line-row line-editing">
          <LineField
            initial={line.text}
            onCancel={onEditDone}
            onSave={(text) => {
              onEditDone();
              if (text) setLineText(line.id, text);
              else deleteLine(line.id);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="line-outer">
      {swipe < 0 && (
        <button className="line-swipe-delete t-label" data-testid="swipe-delete" onClick={() => deleteLine(line.id)}>{copy.lines.delete}</button>
      )}
      <div
        ref={rowRef}
        className={`line-row${selected ? ' line-selected' : ''}${reading || playing ? ' line-active' : ''}`}
        data-testid="line"
        style={swipe ? { transform: `translateX(${swipe}px)` } : undefined}
        onPointerDown={onPointerDown}
      >
        <div className="line-main">
          <SpeakerButton text={line.text} id={line.id} />
          <LyricText line={line} reading={reading} wordIndex={wordIndex} />
          {selected ? (
            <button className="btn btn-outline" data-testid="edit" onClick={(event) => { event.stopPropagation(); onEdit(); }}>{copy.lines.edit}</button>
          ) : state !== 'none' ? (
            <span className={`tune-badge${state === 'complete' ? ' tune-badge-full' : ''}`} aria-hidden="true">♪</span>
          ) : null}
        </div>
        {selected && <BitChips line={line} />}
      </div>
    </div>
  );
}
