import type { Note, Syllable } from '../../shared/song';
import { MIN_DURATION } from './tune';

const PROVISIONAL = MIN_DURATION;

/** The tapping engine's memory: each pad down sings the next bit. Pure, so timing rules can be tested. */
export class Take {
  notes: Note[];
  private holding = false;

  constructor(private readonly bits: Syllable[], kept: Note[] = []) {
    this.notes = kept.map((note) => ({ ...note, segments: note.segments.map((seg) => ({ ...seg })) }));
  }

  get glowIndex(): number {
    return this.notes.length;
  }

  get isHolding(): boolean {
    return this.holding;
  }

  get isComplete(): boolean {
    return this.notes.length >= this.bits.length && !this.holding;
  }

  private get current() {
    const note = this.notes[this.notes.length - 1];
    return note.segments[note.segments.length - 1];
  }

  /** A pad went down. A held note ends here, then the next bit starts. Returns false if no bits are left. */
  down(beat: number, midi: number): boolean {
    if (this.holding) this.up(beat);
    if (this.notes.length >= this.bits.length) return false;
    this.notes.push({
      syllableId: this.bits[this.notes.length].id,
      segments: [{ start: Math.max(beat, this.floor()), duration: PROVISIONAL, midi }]
    });
    this.holding = true;
    return true;
  }

  /** The held finger slid to another pad: same bit, new segment. */
  slide(beat: number, midi: number): void {
    if (!this.holding) return;
    this.endCurrent(beat);
    const prev = this.current;
    this.notes[this.notes.length - 1].segments.push({ start: prev.start + prev.duration, duration: PROVISIONAL, midi });
  }

  up(beat: number): void {
    if (!this.holding) return;
    this.endCurrent(beat);
    this.holding = false;
  }

  /** Removes the last recorded note and moves the glow back. */
  backspace(): void {
    this.notes.pop();
    this.holding = false;
  }

  private floor(): number {
    if (this.notes.length === 0) return 0;
    const last = this.current;
    return last.start + last.duration;
  }

  private endCurrent(beat: number): void {
    this.current.duration = Math.max(MIN_DURATION, beat - this.current.start);
  }
}
