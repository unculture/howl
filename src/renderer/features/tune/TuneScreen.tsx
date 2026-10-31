import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { copy } from '../../app/copy';
import { Segmented } from '../../app/ui';
import { SpeakerButton } from '../words/SpeakerButton';
import { lineState } from '../../music/tune';
import { commit, useSong } from '../../store/song';
import { useUi } from '../../store/ui';
import {
  again, backspaceBit, carryOn, currentLine, goToLine, hearIt, playSong, restartTake, startLine, stopAll, useTune
} from './controller';
import { Pads, setOctave, type PadKeyHandle } from './Pads';
import { Roll } from './Roll';
import { TuneActionsExtra, TuneMenus, tidyNow } from './TuneExtras';

const PAD_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];

export function TuneScreen() {
  const lines = useSong((s) => s.song!.lines);
  const noteMode = useSong((s) => s.song!.noteMode);
  useUi((s) => s.tuneLineId);
  const line = currentLine();
  const mode = useTune((s) => s.mode);
  const takeNotes = useTune((s) => s.takeNotes);
  const liveBars = useTune((s) => s.bars);
  const sungIndex = useTune((s) => s.sungIndex);
  const flashedBit = useTune((s) => s.flashBit);
  const songPlaying = useTune((s) => s.songPlaying);
  const keyHandle = useRef<PadKeyHandle | null>(null);

  const index = line ? lines.findIndex((l) => l.id === line.id) : -1;
  const state = line ? lineState(line) : 'none';
  const recording = mode === 'countIn' || mode === 'tapping';
  const playing = mode === 'looping' || mode === 'once' || songPlaying;
  const notes = takeNotes ?? line?.tune?.notes ?? [];
  const bars = recording ? liveBars : (line?.tune?.bars ?? 2);
  const needsFinishing = !recording && state === 'partial';
  const hasTune = !recording && state === 'complete';
  const isLast = index === lines.length - 1;

  const nextLine = () => {
    if (isLast) playSong();
    else goToLine(lines[index + 1].id);
  };

  // Keyboard map, spec section 10. Latest state is read through a ref so the listener stays put.
  const keys = useRef({ mode, hasTune, needsFinishing, playing, index, lines, nextLine, hasNotes: notes.length > 0 });
  keys.current = { mode, hasTune, needsFinishing, playing, index, lines, nextLine, hasNotes: notes.length > 0 };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, [role="menu"], .sheet')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const padIndex = PAD_KEYS.indexOf(event.code);
      if (padIndex >= 0) {
        event.preventDefault();
        if (!event.repeat) keyHandle.current?.down(padIndex, event.code);
        return;
      }
      if (event.repeat || event.shiftKey) return;
      const k = keys.current;
      const recordingNow = k.mode === 'countIn' || k.mode === 'tapping';
      if (target.closest('[data-block]') && event.code.startsWith('Arrow')) return;
      switch (event.code) {
        case 'Space':
          event.preventDefault();
          if (recordingNow) stopAll();
          else if (k.playing) stopAll();
          else if (k.hasTune) hearIt();
          else if (k.needsFinishing) carryOn();
          else startLine();
          break;
        case 'Enter':
          event.preventDefault();
          if (k.hasTune) k.nextLine();
          else if (!recordingNow && !k.playing) startLine();
          break;
        case 'Backspace':
          event.preventDefault();
          backspaceBit();
          break;
        case 'KeyR':
          if (k.hasTune || k.needsFinishing) again();
          break;
        case 'KeyT':
          if (k.hasTune) tidyNow();
          break;
        case 'KeyZ':
          setOctave(-1);
          break;
        case 'KeyX':
          setOctave(1);
          break;
        case 'Digit5':
          commit('Change notes', (song) => void (song.noteMode = 5));
          break;
        case 'Digit7':
          commit('Change notes', (song) => void (song.noteMode = 7));
          break;
        case 'ArrowLeft':
          if (k.index > 0) goToLine(k.lines[k.index - 1].id);
          break;
        case 'ArrowRight':
          if (k.index < k.lines.length - 1) goToLine(k.lines[k.index + 1].id);
          break;
        default:
      }
    };
    const up = (event: KeyboardEvent) => {
      if (PAD_KEYS.includes(event.code)) keyHandle.current?.up(event.code);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  if (!line) return null;

  const glowIndex = recording ? notes.length : needsFinishing ? notes.length : state === 'none' ? 0 : -1;
  const hint =
    mode === 'countIn' ? copy.tune.hintCountIn
    : mode === 'tapping' ? copy.tune.hintTapping
    : needsFinishing ? copy.tune.hintFinish
    : state === 'none' ? copy.tune.hintReady
    : '';

  return (
    <div className="tune" key={line.id}>
      <header className="tune-header">
        <h1 className="t-display-l">{copy.tune.title(index + 1)}</h1>
        <button className="btn-icon btn-outline" aria-label="Previous line" disabled={index <= 0}
          onClick={() => goToLine(lines[index - 1].id)}><ChevronLeft /></button>
        <button className="btn-icon btn-outline" aria-label="Next line" disabled={isLast}
          onClick={() => goToLine(lines[index + 1].id)}><ChevronRight /></button>
        <span className="flex-1" />
        <TuneMenus />
      </header>

      <div className="lyric-row">
        <SpeakerButton text={line.text} size="small" />
        <div className="lyric-bits t-lyric-l" data-testid="lyric">
          {line.syllables.map((bit, i) => {
            const next = line.syllables[i + 1];
            const joinsNext = next?.wordIndex === bit.wordIndex;
            const sung = playing ? (sungIndex >= i) : glowIndex === -1 || i < glowIndex;
            const cls = i === glowIndex && !playing ? 'bit-glow'
              : (playing && sungIndex === i) || flashedBit === bit.id ? 'bit-now'
              : sung ? 'bit-sung' : 'bit-todo';
            return (
              <span key={bit.id} className={joinsNext ? 'bit-wrap' : 'bit-wrap bit-word-end'}>
                <span className={cls}>{bit.text}</span>
                {joinsNext && <span className="bit-dot">·</span>}
              </span>
            );
          })}
        </div>
        <span className="t-body text-secondary lyric-hint">{hint}</span>
      </div>

      <Roll line={line} notes={notes} bars={bars} needsFinishing={needsFinishing} />
      <Pads keyPress={keyHandle} />

      <div className="tune-actions">
        {recording && (
          <>
            <button className="btn btn-outline" onClick={stopAll}>{copy.tune.stop}</button>
            {mode === 'tapping' && <button className="btn btn-outline" onClick={restartTake}>{copy.tune.startAgain}</button>}
          </>
        )}
        {needsFinishing && (
          <>
            <button className="btn btn-primary" onClick={carryOn}>{copy.tune.carryOn}</button>
            <button className="btn btn-outline" onClick={again}>{copy.tune.again}</button>
          </>
        )}
        {hasTune && (
          <>
            {mode === 'idle' && !songPlaying && <button className="btn btn-secondary" data-testid="hear" onClick={hearIt}>{copy.tune.hearIt}</button>}
            <button className="btn btn-outline" data-testid="again" onClick={again}>{copy.tune.again}</button>
            <TuneActionsExtra />
          </>
        )}
        <span className="flex-1" />
        {hasTune && (
          <button className="btn btn-primary" data-testid="next" onClick={nextLine}>
            {isLast ? copy.tune.playSong : copy.tune.next}
          </button>
        )}
        {mode === 'tapping' && <span className="t-caption text-tertiary">{copy.tune.holdHint}</span>}
        <Segmented
          tone="moonlight"
          value={noteMode}
          options={[{ value: 5, label: copy.tune.notes5 }, { value: 7, label: copy.tune.notes7 }]}
          onChange={(value) => commit('Change notes', (song) => void (song.noteMode = value))}
        />
      </div>
    </div>
  );
}
