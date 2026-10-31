import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import type { SongSummary } from '../../../shared/api';
import { copy } from '../../app/copy';
import { enterSong } from '../../app/session';
import { Sheet } from '../../app/ui';
import { saveSongNow } from '../../store/autosave';
import { showToast, useUi } from '../../store/ui';
import { playSong, stopAll, useTune } from '../tune/controller';
import { NewSongSheet } from './NewSongSheet';
import { relativeDate, tileStyle } from './art';

interface MenuState { song: SongSummary; x: number; y: number; }

async function openById(id: string): Promise<void> {
  try {
    enterSong(await window.howl.files.load(id));
  } catch {
    showToast(copy.file.wontOpen);
  }
}

function SongCard({ song, onMenu, renaming, onRenamed }: {
  song: SongSummary;
  onMenu: (menu: MenuState) => void;
  renaming: boolean;
  onRenamed: () => void;
}) {
  const [playingHere, setPlayingHere] = useState(false);
  const songPlaying = useTune((s) => s.songPlaying);
  const press = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const [draft, setDraft] = useState(song.name);
  useEffect(() => {
    if (!songPlaying) setPlayingHere(false);
  }, [songPlaying]);
  useEffect(() => setDraft(song.name), [song.name, renaming]);

  const togglePlay = async () => {
    if (playingHere) {
      stopAll();
      return;
    }
    if (!song.hasTune) {
      showToast(copy.tune.needTune);
      return;
    }
    const full = await window.howl.files.load(song.id).catch(() => null);
    if (!full) {
      showToast(copy.file.wontOpen);
      return;
    }
    playSong(full);
    setPlayingHere(true);
  };

  const saveName = async () => {
    onRenamed();
    const next = draft.trim();
    if (!next || next === song.name) return;
    const full = await window.howl.files.load(song.id);
    await saveSongNow({ ...full, name: next, updatedAt: new Date().toISOString() });
  };

  return (
    <article
      className="song-card"
      data-context
      data-testid="song-card"
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ song, x: event.clientX, y: event.clientY });
      }}
    >
      <button
        className="song-tile"
        style={tileStyle(song.id, song.mood)}
        aria-label={song.name}
        onPointerDown={(event) => {
          longPressed.current = false;
          const { clientX: x, clientY: y } = event;
          press.current = window.setTimeout(() => {
            longPressed.current = true;
            onMenu({ song, x, y });
          }, 500);
        }}
        onPointerUp={() => window.clearTimeout(press.current)}
        onPointerLeave={() => window.clearTimeout(press.current)}
        onPointerCancel={() => window.clearTimeout(press.current)}
        onClick={() => {
          if (!longPressed.current) void openById(song.id);
        }}
        onKeyDown={(event) => {
          if (event.code === 'Space') {
            event.preventDefault();
            void togglePlay();
          }
        }}
      >
        <span className="song-water" />
      </button>
      <div className="song-foot">
        <div className="song-info">
          {renaming ? (
            <input
              className="t-title song-rename"
              autoFocus
              value={draft}
              aria-label={copy.home.rename}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void saveName();
                if (event.key === 'Escape') onRenamed();
              }}
            />
          ) : (
            <p className="t-title song-title">{song.name}</p>
          )}
          <p className="t-caption text-secondary">
            {song.lineCount === 1 ? `1 line · ${relativeDate(song.updatedAt)}` : copy.home.meta(song.lineCount, relativeDate(song.updatedAt))}
          </p>
        </div>
        <button
          className={`card-play${song.hasTune ? '' : ' is-dim'}`}
          aria-label={playingHere ? copy.bar.stop : copy.bar.play}
          onClick={() => void togglePlay()}
        >
          {playingHere ? <Square fill="currentColor" /> : <Play fill="currentColor" />}
        </button>
      </div>
    </article>
  );
}

function CardMenu({ menu, onRename, onDelete, onClose }: { menu: MenuState; onRename: () => void; onDelete: () => void; onClose: () => void }) {
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('.menu')) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // Delayed so the pointer that opened the menu doesn't also close it.
    const timer = window.setTimeout(() => window.addEventListener('pointerdown', close, true), 0);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', escape, true);
    };
  }, [onClose]);
  const left = Math.min(menu.x, window.innerWidth - 220);
  const top = Math.min(menu.y, window.innerHeight - 200);
  return (
    <div className="menu" role="menu" style={{ left, top }}>
      <button className="menu-item t-label" role="menuitem" onClick={onRename}>{copy.home.rename}</button>
      <button className="menu-item t-label" role="menuitem" onClick={() => { void window.howl.files.showFile(menu.song.id); onClose(); }}>{copy.home.showFile}</button>
      <button className="menu-item t-label" role="menuitem" data-testid="menu-delete" onClick={onDelete}>{copy.home.delete}</button>
    </div>
  );
}

export function HomeScreen() {
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SongSummary | null>(null);

  const refresh = useCallback(() => {
    void window.howl.files.list().then(setSongs);
  }, []);

  useEffect(() => {
    refresh();
    return window.howl.files.onChanged(refresh);
  }, [refresh]);

  const openFile = async () => {
    const result = await window.howl.files.import();
    if (result.failed) showToast(copy.file.wontOpen);
    else if (result.id) await openById(result.id);
  };

  const closeMenu = useCallback(() => setMenu(null), []);
  const newSong = (
    <button className="btn btn-primary btn-large" data-testid="new-song" onClick={() => setCreating(true)}>{copy.home.newSong}</button>
  );

  return (
    <div className="home">
      <div className="home-glow" aria-hidden="true" />
      <header className="home-top">
        <span className="home-logo t-display-m">{copy.app.name}</span>
        <span className="flex-1 drag" />
        <button className="btn btn-outline" data-testid="open-file" onClick={() => void openFile()}>{copy.home.openFile}</button>
        <button className="btn btn-outline" onClick={() => useUi.setState({ settingsOpen: true })}>{copy.home.settings}</button>
      </header>
      {songs && songs.length === 0 ? (
        <div className="home-empty">
          <h1 className="t-display-xl">{copy.home.title}</h1>
          <p className="t-title">{copy.home.empty}</p>
          {newSong}
        </div>
      ) : (
        <>
          <div className="home-hero">
            <h1 className="t-display-xl">{copy.home.title}</h1>
            <span className="flex-1" />
            {newSong}
          </div>
          <div className="song-grid">
            {songs?.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                renaming={renaming === song.id}
                onRenamed={() => setRenaming(null)}
                onMenu={setMenu}
              />
            ))}
          </div>
        </>
      )}
      {menu && (
        <CardMenu
          menu={menu}
          onClose={closeMenu}
          onRename={() => { setRenaming(menu.song.id); setMenu(null); }}
          onDelete={() => { setDeleting(menu.song); setMenu(null); }}
        />
      )}
      {creating && <NewSongSheet onClose={() => setCreating(false)} />}
      {deleting && (
        <Sheet title={copy.home.deleteTitle(deleting.name)} onClose={() => setDeleting(null)}>
          <p className="t-body text-secondary">{copy.home.deleteBody}</p>
          <div className="sheet-actions">
            <button className="btn btn-outline" onClick={() => setDeleting(null)}>{copy.home.deleteCancel}</button>
            <button
              className="btn btn-primary"
              data-testid="confirm-delete"
              onClick={() => {
                void window.howl.files.delete(deleting.id).then(refresh);
                setDeleting(null);
              }}
            >
              {copy.home.deleteConfirm}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
