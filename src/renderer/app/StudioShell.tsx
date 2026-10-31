import { useEffect, useRef, useState } from 'react';
import { AlignLeft, ArrowLeft, Play, Settings as SettingsIcon, Square } from 'lucide-react';
import { copy } from './copy';
import { TuneWaveIcon } from './icons';
import { commit, redo, undo, useSong } from '../store/song';
import { showToast, useUi, type Tab } from '../store/ui';
import { playSong, stopAll, useTune } from '../features/tune/controller';
import { TuneScreen } from '../features/tune/TuneScreen';
import { WordsScreen } from '../features/words/WordsScreen';
import { closeSongAndGoHome } from './session';
import { stopDictation } from '../speech/dictation';

function SongName() {
  const name = useSong((s) => s.song!.name);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  if (!editing) {
    return (
      <button className="song-name t-display-m" data-testid="song-name" onClick={() => { setDraft(name); setEditing(true); }}>
        {name}
      </button>
    );
  }
  const save = () => {
    const next = draft.trim();
    if (next && next !== name) commit('Rename song', (song) => void (song.name = next));
    setEditing(false);
  };
  return (
    <input
      className="song-name-input t-display-m"
      autoFocus
      value={draft}
      aria-label={copy.new.nameLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') save();
        if (event.key === 'Escape') setEditing(false);
      }}
    />
  );
}

function UndoButton() {
  const canUndo = useSong((s) => s.past.length > 0);
  const canRedo = useSong((s) => s.future.length > 0);
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  return (
    <button
      className="btn btn-outline"
      disabled={!canUndo && !canRedo}
      data-testid="undo"
      onPointerDown={() => {
        longPressed.current = false;
        timer.current = window.setTimeout(() => {
          longPressed.current = true;
          redo();
        }, 500);
      }}
      onPointerUp={() => window.clearTimeout(timer.current)}
      onPointerLeave={() => window.clearTimeout(timer.current)}
      onClick={(event) => {
        if (longPressed.current) return;
        stopAll();
        if (event.shiftKey) redo();
        else undo();
      }}
    >
      {copy.bar.undo}
    </button>
  );
}

export function StudioShell() {
  const tab = useUi((s) => s.tab);
  const anyTune = useSong((s) => s.song!.lines.some((line) => (line.tune?.notes.length ?? 0) > 0));
  const songPlaying = useTune((s) => s.songPlaying);

  useEffect(
    () => () => {
      stopAll();
      void stopDictation();
    },
    [tab]
  );

  const setTab = (next: Tab) => useUi.setState({ tab: next });
  const toggleSong = () => {
    if (songPlaying) stopAll();
    else if (!anyTune) showToast(copy.tune.needTune);
    else playSong();
  };

  return (
    <div className="studio">
      <header className="top-bar">
        <button className="btn-icon btn-outline" aria-label={copy.bar.backAria} onClick={closeSongAndGoHome}><ArrowLeft /></button>
        <SongName />
        <span className="flex-1 drag" />
        <div className="transport">
          <button
            className={`transport-play${songPlaying ? ' transport-playing' : ''}${anyTune ? '' : ' is-dim'}`}
            aria-label={songPlaying ? copy.bar.stop : copy.bar.play}
            data-testid="play-song"
            onClick={toggleSong}
          >
            {songPlaying ? <Square fill="currentColor" /> : <Play fill="currentColor" />}
          </button>
          <span className="t-label">{songPlaying ? copy.bar.stop : copy.bar.play}</span>
        </div>
        <span className="flex-1 drag" />
        <UndoButton />
        <button className="btn btn-outline" onClick={() => useUi.setState({ settingsOpen: true })}>
          <SettingsIcon size="var(--size-icon-sm)" />{copy.bar.settings}
        </button>
      </header>
      <div className="studio-body">
        <nav className="rail">
          {([['words', copy.rail.words, <AlignLeft key="w" />], ['tune', copy.rail.tune, <TuneWaveIcon key="t" />]] as const).map(
            ([id, label, icon]) => (
              <button key={id} className={`rail-item t-caption${tab === id ? ' rail-on' : ''}`} data-testid={`rail-${id}`} onClick={() => setTab(id)}>
                {icon}
                {label}
              </button>
            )
          )}
        </nav>
        <main className="content" key={tab}>
          {tab === 'tune' ? <TuneScreen /> : <WordsScreen />}
        </main>
      </div>
    </div>
  );
}
