import type { Mood } from '../../../shared/song';

export const MOOD_VAR: Record<Mood, string> = {
  wolfMoon: 'var(--color-mood-wolf-moon)',
  snowfall: 'var(--color-mood-snowfall)',
  bonfire: 'var(--color-mood-bonfire)',
  running: 'var(--color-mood-running)'
};

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Each song gets its own view of its mood's sky, always the same for that song. */
export function tileStyle(id: string, mood: Mood): React.CSSProperties {
  const h = hash(id);
  return {
    backgroundImage: MOOD_VAR[mood],
    backgroundSize: '180% 180%',
    backgroundPosition: `${h % 100}% ${(h >> 8) % 60}%`,
    ['--horizon' as string]: `${55 + ((h >> 16) % 25)}%`
  };
}

export function relativeDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayStart(now) - dayStart(date)) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
