import { useEffect, useRef, useState } from 'react';
import type { Mood, SoundId } from '../../../shared/song';
import { MOOD_COPY, SOUND_COPY, copy } from '../../app/copy';
import { engine } from '../../audio/engine';
import { MOODS, MOOD_ORDER, padNotes } from '../../music/moods';
import { lineState, sameTuneAs, tidyTune, transposeTune } from '../../music/tune';
import { commit, useSong } from '../../store/song';
import { showToast } from '../../store/ui';
import { MoodCard } from '../home/NewSongSheet';
import { MOOD_VAR } from '../home/art';
import { currentLine, markTidied, stopAll, useTune } from './controller';

export function tidyNow(): void {
  const line = currentLine();
  if (!line?.tune) return;
  commit('Tidy timing', (song) => {
    const target = song.lines.find((l) => l.id === line.id);
    if (target?.tune) target.tune = tidyTune(target.tune);
  });
  markTidied(line.id);
  showToast(copy.tune.tidied, true);
}

function useOutsideClose(open: boolean, close: () => void) {
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape, true);
    };
  }, [open, close]);
  return anchor;
}

function Dropdown({ label, icon, testId, disabled, align = 'right', children }: {
  label: string;
  icon?: React.ReactNode;
  testId: string;
  disabled?: boolean;
  align?: 'left' | 'right';
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useRef(() => setOpen(false)).current;
  const anchor = useOutsideClose(open, close);
  return (
    <div className="dropdown" ref={anchor}>
      <button className="chip-button t-label" data-testid={testId} disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon}{label}
      </button>
      {open && <div className={`dropdown-panel dropdown-${align}`} role="menu">{children(close)}</div>}
    </div>
  );
}

function changeMood(mood: Mood): void {
  stopAll();
  commit('Change mood', (song) => {
    if (song.mood === mood) return;
    for (const line of song.lines) {
      if (line.tune) line.tune = transposeTune(line.tune, song.mood, mood, song.noteMode);
    }
    song.mood = mood;
    song.bpm = MOODS[mood].bpm;
    song.sound = MOODS[mood].sound;
  });
  engine.prepareSound(MOODS[mood].sound);
}

function SpeedPanel() {
  const bpm = useSong((s) => s.song!.bpm);
  const mood = useSong((s) => s.song!.mood);
  const [value, setValue] = useState(bpm);
  useEffect(() => setValue(bpm), [bpm]);
  const save = (next: number) => commit('Change speed', (song) => void (song.bpm = next));
  return (
    <div className="speed-panel">
      <input
        type="range"
        className="slider"
        min={60}
        max={140}
        value={value}
        aria-label={copy.tune.speed}
        data-testid="speed-slider"
        onChange={(event) => {
          const next = Number(event.target.value);
          setValue(next);
          engine.setBpm(next); // Heard straight away; the undo step lands on release.
        }}
        onPointerUp={() => save(value)}
        onKeyUp={() => save(value)}
      />
      <div className="speed-labels t-caption text-secondary">
        <span>{copy.tune.slow}</span>
        <span>{copy.tune.fast}</span>
      </div>
      <button
        className="btn btn-ghost"
        data-testid="speed-reset"
        onClick={() => {
          setValue(MOODS[mood].bpm);
          engine.setBpm(MOODS[mood].bpm);
          save(MOODS[mood].bpm);
        }}
      >
        {copy.tune.reset}
      </button>
    </div>
  );
}

function pickSound(sound: SoundId): void {
  commit('Change sound', (song) => void (song.sound = sound));
  engine.setSound(sound);
  const song = useSong.getState().song;
  if (song) engine.blip(padNotes(song.mood, song.noteMode, song.octaveShift)[3], 1, sound);
}

export function TuneMenus() {
  const mood = useSong((s) => s.song!.mood);
  const sound = useSong((s) => s.song!.sound);
  const mode = useTune((s) => s.mode);
  const recording = mode === 'countIn' || mode === 'tapping';
  return (
    <div className="tune-menus">
      <Dropdown
        testId="mood-chip"
        disabled={recording}
        label={MOOD_COPY[mood].name}
        icon={<span className="chip-orb" style={{ background: MOOD_VAR[mood] }} />}
      >
        {(close) => (
          <div className="dropdown-moods">
            {MOOD_ORDER.map((id) => (
              <MoodCard key={id} compact mood={id} selected={id === mood} onClick={() => { changeMood(id); close(); }} />
            ))}
          </div>
        )}
      </Dropdown>
      <Dropdown testId="speed-chip" label={copy.tune.speed}>{() => <SpeedPanel />}</Dropdown>
      <Dropdown testId="sound-chip" label={copy.tune.sound(SOUND_COPY[sound])}>
        {() =>
          (Object.keys(SOUND_COPY) as SoundId[]).map((id) => (
            <button key={id} className="menu-item t-label" role="menuitemradio" aria-checked={id === sound} data-testid={`sound-${id}`} onClick={() => pickSound(id)}>
              {SOUND_COPY[id]}
            </button>
          ))
        }
      </Dropdown>
    </div>
  );
}

function SameTuneAs() {
  const lines = useSong((s) => s.song!.lines);
  const current = currentLine();
  const sources = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.id !== current?.id && lineState(line) === 'complete');
  if (sources.length === 0) return null;
  return (
    <Dropdown testId="same-as" label={copy.tune.sameAs} align="left">
      {(close) =>
        sources.map(({ line, index }) => (
          <button
            key={line.id}
            className="menu-item t-label"
            role="menuitem"
            data-testid="same-as-item"
            onClick={() => {
              close();
              stopAll();
              const targetId = currentLine()?.id;
              commit('Same tune', (song) => {
                const target = song.lines.find((l) => l.id === targetId);
                const source = song.lines.find((l) => l.id === line.id);
                if (target && source?.tune) target.tune = sameTuneAs(source.tune, target.syllables);
              });
            }}
          >
            {copy.tune.sameAsItem(index + 1, line.text.split(/\s+/).slice(0, 3).join(' '))}
          </button>
        ))
      }
    </Dropdown>
  );
}

export function TuneActionsExtra() {
  return (
    <>
      <button className="btn btn-outline" data-testid="tidy" onClick={tidyNow}>{copy.tune.tidy}</button>
      <SameTuneAs />
    </>
  );
}
