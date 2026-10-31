import { Volume2 } from 'lucide-react';
import { readAloud, useReading } from '../../speech/readAloud';

export function SpeakerButton({ text, id, size = 'large' }: { text: string; id?: string; size?: 'large' | 'small' }) {
  const readingId = id ?? text;
  const reading = useReading((s) => s.readingId === readingId);
  return (
    <button
      className={`speaker${size === 'small' ? ' speaker-small' : ''}${reading ? ' speaker-on' : ''}`}
      aria-label="Read it out"
      aria-pressed={reading}
      onClick={(event) => {
        event.stopPropagation();
        readAloud(text, readingId);
      }}
    >
      <Volume2 size="var(--size-icon-sm)" />
    </button>
  );
}
