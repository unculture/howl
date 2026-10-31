export interface Zone {
  midi: number;
  file: string;
  cents: number; // How sharp the recording is of its named note.
  gain: number;
  loopStart?: number;
  loopEnd?: number;
}

/** The recording closest to this note. On a tie the higher one wins: shifting down sounds more natural. */
export function pickZone<T extends { midi: number }>(zones: T[], midi: number): T {
  return zones.reduce((best, zone) => {
    const gap = Math.abs(zone.midi - midi);
    const bestGap = Math.abs(best.midi - midi);
    return gap < bestGap || (gap === bestGap && zone.midi > best.midi) ? zone : best;
  });
}

/** How far to shift a recording, in cents, so it plays this note in tune. */
export function detuneFor(zone: { midi: number; cents: number }, midi: number): number {
  return (midi - zone.midi) * 100 - zone.cents;
}
