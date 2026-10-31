import { useEffect } from 'react';
import { redo, undo, useSong } from '../store/song';
import { hideToast, useUi } from '../store/ui';
import { StudioShell } from './StudioShell';
import { Sheet } from './ui';
import { HomeScreen } from '../features/home/HomeScreen';
import { SettingsSheet } from '../features/settings/SettingsSheet';
import { preloadDictation } from '../speech/dictation';
import { startAutosave, useSaveError } from '../store/autosave';
import { useSettings } from '../store/settings';
import { playSong, stopAll, useTune } from '../features/tune/controller';
import { stopReading } from '../speech/readAloud';
import { copy } from './copy';

function Toast() {
  const toast = useUi((s) => s.toast);
  if (!toast) return null;
  const [text, action] = toast.undo ? toast.text.split(' · ') : [toast.text, null];
  return (
    <div className="toast t-label" role="status">
      <span>{text}</span>
      {action && (
        <button className="toast-action t-label" onClick={() => { undo(); hideToast(); }}>{action}</button>
      )}
    </div>
  );
}

function useGlobalKeys() {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement).closest('input, textarea');
      const inSong = useUi.getState().screen === 'song' && useSong.getState().song;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.code === 'KeyZ' && !typing) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && event.code === 'Comma') {
        event.preventDefault();
        useUi.setState({ settingsOpen: true });
      } else if (event.key === 'Escape' && !typing) {
        stopReading();
        if (useTune.getState().songPlaying) stopAll();
      } else if (inSong && !typing && !mod) {
        if (event.shiftKey && event.code === 'Space') {
          event.preventDefault();
          if (useTune.getState().songPlaying) stopAll();
          else if (useSong.getState().song!.lines.some((l) => l.tune)) playSong();
        } else if (event.code === 'Digit1') {
          useUi.setState({ tab: 'words' });
        } else if (event.code === 'Digit2') {
          useUi.setState({ tab: 'tune' });
        }
      }
    };
    // A tapped button should not keep focus, or Space and Enter would press it again.
    const blurTapped = (event: PointerEvent) => {
      const button = (event.target as HTMLElement).closest('button');
      if (button) window.setTimeout(() => button.blur(), 0);
    };
    const noContextMenu = (event: Event) => {
      if (!(event.target as HTMLElement).closest('input, textarea, [data-context]')) event.preventDefault();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerup', blurTapped);
    window.addEventListener('contextmenu', noContextMenu);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerup', blurTapped);
      window.removeEventListener('contextmenu', noContextMenu);
    };
  }, []);
}

function SaveFailed() {
  const error = useSaveError((s) => s.error);
  if (!error) return null;
  return (
    <Sheet title={copy.save.retrying} onClose={() => useSaveError.setState({ error: null })}>
      <p className="t-caption text-secondary">{error}</p>
      <div className="sheet-actions">
        <button className="btn btn-outline" onClick={() => void window.howl.files.showFolder()}>{copy.settings.showFolder}</button>
      </div>
    </Sheet>
  );
}

export function App() {
  useGlobalKeys();
  const screen = useUi((s) => s.screen);
  const hasSong = useSong((s) => s.song !== null);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const textScale = useSettings((s) => s.textScale);
  useEffect(() => {
    document.documentElement.style.setProperty('--lyric-scale', String(textScale));
  }, [textScale]);
  useEffect(() => {
    startAutosave();
    preloadDictation();
  }, []);
  return (
    <>
      {screen === 'song' && hasSong ? <StudioShell /> : <HomeScreen />}
      {settingsOpen && <SettingsSheet />}
      <SaveFailed />
      <Toast />
    </>
  );
}
