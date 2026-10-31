import { useCallback, useEffect, useState } from 'react';
import { Mic, Volume2 } from 'lucide-react';
import type { Mood } from '../../../shared/song';
import { MOOD_COPY, copy } from '../../app/copy';
import { enterSong, makeSong } from '../../app/session';
import { Sheet } from '../../app/ui';
import { engine } from '../../audio/engine';
import { MOOD_ORDER } from '../../music/moods';
import { readAloud } from '../../speech/readAloud';
import { startDictation, stopDictation, useDictation } from '../../speech/dictation';
import { saveSongNow } from '../../store/autosave';
import { MOOD_VAR } from './art';

export function MoodCard({ mood, selected, compact, onClick }: { mood: Mood; selected: boolean; compact?: boolean; onClick: () => void }) {
  return (
    <button className={`mood-card${selected ? ' mood-on' : ''}${compact ? ' mood-compact' : ''}`} data-testid={`mood-${mood}`} aria-pressed={selected} onClick={onClick}>
      <span className="mood-orb" style={{ background: MOOD_VAR[mood] }} />
      <span className="mood-text">
        <span className="t-title">{MOOD_COPY[mood].name}</span>
        {!compact && <span className="t-caption text-secondary">{MOOD_COPY[mood].description}</span>}
      </span>
    </button>
  );
}

export function NewSongSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [mood, setMood] = useState<Mood>('wolfMoon');
  const [previewing, setPreviewing] = useState<Mood | null>(null);
  const micStatus = useDictation((s) => s.status);

  const close = useCallback(() => {
    engine.stop();
    void stopDictation();
    onClose();
  }, [onClose]);

  useEffect(() => () => engine.stop(), []);

  const tapMood = (next: Mood) => {
    setMood(next);
    if (previewing === next) {
      engine.stop();
      setPreviewing(null);
      return;
    }
    engine.onEnded = () => setPreviewing(null);
    engine.previewMood(next);
    setPreviewing(next);
    window.setTimeout(() => setPreviewing((current) => (current === next ? null : current)), 4000);
  };

  const start = async () => {
    engine.stop();
    const song = makeSong(name, mood);
    await saveSongNow(song);
    enterSong(song);
    onClose();
  };

  return (
    <Sheet title={copy.new.title} onClose={close}>
      <label className="field-label t-heading" htmlFor="song-name">{copy.new.nameLabel}</label>
      <div className="name-field">
        <input
          id="song-name"
          className="t-display-m"
          data-testid="new-name"
          placeholder={copy.new.namePlaceholder}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void start();
          }}
        />
        <button
          className="btn btn-tonal"
          disabled={micStatus === 'loading' || micStatus === 'nomic' || micStatus === 'finishing'}
          onClick={() => {
            if (micStatus === 'listening') void stopDictation();
            else void startDictation({ single: true, onLine: setName });
          }}
        >
          <Mic size="var(--size-icon-sm)" />{micStatus === 'listening' ? copy.bar.stop : copy.new.say}
        </button>
        <button className="btn btn-tonal" disabled={!name.trim()} onClick={() => readAloud(name, 'new-song-name')}>
          <Volume2 size="var(--size-icon-sm)" />{copy.new.hear}
        </button>
      </div>
      <p className="field-label t-heading">{copy.new.moodLabel}</p>
      <div className="mood-grid">
        {MOOD_ORDER.map((id) => <MoodCard key={id} mood={id} selected={mood === id} onClick={() => tapMood(id)} />)}
      </div>
      <div className="sheet-actions">
        <button className="btn btn-primary btn-large" data-testid="start-writing" onClick={() => void start()}>{copy.new.start}</button>
      </div>
    </Sheet>
  );
}
