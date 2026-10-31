import * as Tone from 'tone';
import type { Mood, Song, SoundId, Tune } from '../../shared/song';
import { MOODS, padNotes, type DrumName } from '../music/moods';
import { detuneFor, pickZone, type Zone } from '../music/zones';
import { bufferFor, hits, instruments, rawContext, type HitName, type InstrumentName } from './samples';

// Pads bypass the Transport and its look-ahead entirely (see attack below), so this only affects the beat.
Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: 0.05, updateInterval: 0.02 }));

const PPQ = Tone.getTransport().PPQ;
const STEP_TICKS = PPQ / 4;

interface Voice {
  attack(midi: number, time: number): void;
  bend(midi: number, time: number): void;
  release(time: number): void;
}

/** Each sound is one real instrument, recorded. `release` is how long it rings on after she lets go. */
const SOUNDS: Record<SoundId, { instrument: InstrumentName; gain: number; release: number; lowpass?: number; decay: number; wet: number }> = {
  glassBells: { instrument: 'vibes', gain: 1.15, release: 0.9, decay: 2.8, wet: 0.3 },
  softKeys: { instrument: 'piano', gain: 1.7, release: 0.4, lowpass: 3800, decay: 2.2, wet: 0.22 },
  breathy: { instrument: 'flute', gain: 1.3, release: 0.16, decay: 2.5, wet: 0.28 },
  strum: { instrument: 'strum', gain: 0.85, release: 0.7, decay: 1.2, wet: 0.14 }
};

const rateFor = (zone: Zone, midi: number): number => 2 ** (detuneFor(zone, midi) / 1200);

interface Sounding { source: AudioBufferSourceNode; gain: GainNode; zone: Zone; }

function play(zone: Zone, midi: number, level: number, time: number, out: Tone.ToneAudioNode): Sounding | null {
  const buffer = bufferFor(zone.file);
  if (!buffer) return null;
  const raw = rawContext();
  const source = raw.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rateFor(zone, midi); // Tone's wrapped context has no detune on buffer sources.
  if (zone.loopEnd) {
    source.loop = true;
    source.loopStart = zone.loopStart ?? 0;
    source.loopEnd = zone.loopEnd;
  }
  const gain = raw.createGain();
  gain.gain.value = level * zone.gain;
  source.connect(gain);
  Tone.connect(gain as unknown as Parameters<typeof Tone.connect>[0], out);
  source.onended = () => gain.disconnect();
  source.start(time);
  return { source, gain, zone };
}

function letGo(note: Sounding, time: number, seconds: number): void {
  note.gain.gain.cancelScheduledValues(time);
  note.gain.gain.setTargetAtTime(0, time, seconds / 3);
  note.source.stop(time + seconds * 2);
}

/** One note at a time. A released note rings on, as a real instrument does, while the next one starts. */
class SampleVoice implements Voice {
  private current: Sounding | null = null;
  private readonly zones: Zone[];
  private readonly level: number;
  private readonly ring: number;
  private readonly input: Tone.Gain;

  constructor(sound: SoundId, reverb: Tone.Reverb) {
    const spec = SOUNDS[sound];
    this.zones = instruments[spec.instrument];
    this.level = spec.gain;
    this.ring = spec.release;
    this.input = new Tone.Gain(1);
    if (spec.lowpass) this.input.chain(new Tone.Filter(spec.lowpass, 'lowpass'), reverb);
    else this.input.connect(reverb);
  }

  attack(midi: number, time: number): void {
    this.release(time);
    this.current = play(pickZone(this.zones, midi), midi, this.level, time, this.input);
  }

  bend(midi: number, time: number): void {
    if (!this.current) return;
    this.current.source.playbackRate.setTargetAtTime(rateFor(this.current.zone, midi), time, 0.015);
  }

  release(time: number): void {
    if (!this.current) return;
    letGo(this.current, time, this.ring);
    this.current = null;
  }
}

/** Each mood has its own kit, played in its own room. */
class Kit {
  private readonly next = new Map<string, number>();

  hit(name: HitName, level: number, time: number, out: Tone.ToneAudioNode): void {
    const takes = hits[name];
    const index = this.next.get(name) ?? 0;
    this.next.set(name, (index + 1) % takes.length);
    const take = takes[index];
    const zone = { midi: 60, file: take.file, cents: 0, gain: take.gain };
    play(zone, 60, level, time, out);
  }
}

/** What sits under the tune: held strings, a plucked bass or a pulsing cello, depending on the mood. */
class Bed {
  private readonly gain: Tone.Gain;
  private held: Sounding[] = [];
  private pulseIndex = 0;

  constructor(private readonly rooms: (mood: Mood) => Tone.Reverb) {
    this.gain = new Tone.Gain(0);
  }

  private mood: Mood = 'wolfMoon';

  setMood(mood: Mood): void {
    if (mood !== this.mood) this.stopHeld();
    this.gain.disconnect();
    this.gain.connect(this.rooms(mood));
    this.mood = mood;
    this.pulseIndex = 0;
  }

  fadeIn(seconds: number): void {
    const sustain = MOODS[this.mood].sustain;
    if (sustain && this.held.length === 0) {
      const now = Tone.immediate();
      for (const midi of sustain.notes) {
        const note = play(pickZone(instruments[sustain.instrument], midi), midi, sustain.gain, now, this.gain);
        if (note) this.held.push(note);
      }
    }
    this.gain.gain.cancelScheduledValues(Tone.immediate());
    this.gain.gain.rampTo(1, seconds);
  }

  pulse(step: number, time: number): void {
    const pulse = MOODS[this.mood].pulse;
    if (!pulse || pulse.pattern[step] !== 'x') return;
    const midi = pulse.notes[this.pulseIndex++ % pulse.notes.length];
    play(pickZone(instruments[pulse.instrument], midi), midi, pulse.gain, time, this.gain);
  }

  private stopHeld(): void {
    const now = Tone.immediate();
    for (const note of this.held) letGo(note, now, 0.5);
    this.held = [];
  }

  fadeOut(): void {
    this.gain.gain.cancelScheduledValues(Tone.immediate());
    this.gain.gain.rampTo(0, 0.4);
    this.stopHeld();
  }
}

/** What the beat should do. Read on every step, so edits and speed changes are heard straight away. */
export type Plan =
  | { kind: 'none' }
  | { kind: 'take'; mood: Mood; originBeat: number; startBeat: number; countIn: boolean }
  | { kind: 'loop'; mood: Mood; sound: SoundId; originBeat: number; lineBeat: number; tune: () => Tune | undefined }
  | { kind: 'once'; mood: Mood; sound: SoundId; tune: Tune }
  | { kind: 'song'; song: Song };

export interface SongSpan { lineId: string; startBeat: number; endBeat: number; tune: Tune; }

export function songSpans(song: Song): SongSpan[] {
  let beat = 0;
  const spans: SongSpan[] = [];
  for (const line of song.lines) {
    if (!line.tune || line.tune.notes.length === 0) continue;
    const endBeat = beat + line.tune.bars * 4;
    spans.push({ lineId: line.id, startBeat: beat, endBeat, tune: line.tune });
    beat = endBeat;
  }
  return spans;
}

class AudioEngine {
  // A gentle saturator with no look-ahead, so pads stay instant and a loud moment rounds off instead of clipping.
  readonly master = new Tone.Gain(0.8);
  private readonly saturator = new Tone.WaveShaper((v) => Math.tanh(v), 4096);
  private readonly kit = new Kit();
  private readonly moodRooms = new Map<Mood, Tone.Reverb>();
  private readonly bed = new Bed((mood) => this.room(mood));
  private readonly reverbs = new Map<SoundId, Tone.Reverb>();
  private readonly voices = new Map<SoundId, Voice>();
  private readonly playbackVoices = new Map<SoundId, Voice>();
  private previewTimer: number | undefined;
  private plan: Plan = { kind: 'none' };
  private padSound: SoundId = 'glassBells';
  private holding = false;
  private startedAt = 0;
  humOn = true;
  onEnded: (() => void) | undefined;

  constructor() {
    this.master.chain(this.saturator, Tone.getDestination());
    const transport = Tone.getTransport();
    transport.timeSignature = 4;
    transport.scheduleRepeat((time) => this.step(time), '16n', 0);
    document.addEventListener('pointerdown', () => void this.resume(), { capture: true, passive: true });
    document.addEventListener('keydown', () => void this.resume(), { capture: true, passive: true });
    void this.resume();
    // Build the pad voice up front so the first touch has nothing to wait for.
    this.voice('glassBells');
  }

  async resume(): Promise<void> {
    if (Tone.getContext().state !== 'running') await Tone.start();
  }

  private room(mood: Mood): Tone.Reverb {
    let room = this.moodRooms.get(mood);
    if (!room) {
      room = new Tone.Reverb(MOODS[mood].room).connect(this.master);
      this.moodRooms.set(mood, room);
    }
    return room;
  }

  private reverb(sound: SoundId): Tone.Reverb {
    let reverb = this.reverbs.get(sound);
    if (!reverb) {
      reverb = new Tone.Reverb({ decay: SOUNDS[sound].decay, wet: SOUNDS[sound].wet }).connect(this.master);
      this.reverbs.set(sound, reverb);
    }
    return reverb;
  }

  private voice(sound: SoundId): Voice {
    let voice = this.voices.get(sound);
    if (!voice) {
      voice = new SampleVoice(sound, this.reverb(sound));
      this.voices.set(sound, voice);
    }
    return voice;
  }

  private playbackVoice(sound: SoundId): Voice {
    let voice = this.playbackVoices.get(sound);
    if (!voice) {
      voice = new SampleVoice(sound, this.reverb(sound));
      this.playbackVoices.set(sound, voice);
    }
    return voice;
  }

  prepareSound(sound: SoundId): void {
    this.padSound = sound;
    this.voice(sound);
    this.playbackVoice(sound);
  }

  /** Change the instrument, including for a line that is already looping. */
  setSound(sound: SoundId): void {
    this.prepareSound(sound);
    if (this.plan.kind === 'loop' || this.plan.kind === 'once') this.plan = { ...this.plan, sound };
    if (this.plan.kind === 'song') this.plan = { ...this.plan, song: { ...this.plan.song, sound } };
  }

  // ---- Pads. These never touch the Transport: sound starts at the audio clock's current time. ----

  attack(midi: number): void {
    const context = Tone.getContext();
    if (context.state !== 'running') void this.resume();
    this.voice(this.padSound).attack(midi, Tone.immediate());
    this.holding = true;
  }

  bend(midi: number): void {
    if (this.holding) this.voice(this.padSound).bend(midi, Tone.immediate());
  }

  release(): void {
    if (!this.holding) return;
    this.voice(this.padSound).release(Tone.immediate());
    this.holding = false;
  }

  /** Plays one note for a set time, for tapping a block or previewing a sound. */
  blip(midi: number, seconds: number, sound: SoundId = this.padSound): void {
    const voice = this.playbackVoice(sound);
    const now = Tone.immediate();
    voice.attack(midi, now);
    voice.release(now + seconds);
  }

  // ---- Clock ----

  /** Current position in beats since the Transport started, as she hears it. */
  heardBeats(): number {
    const transport = Tone.getTransport();
    if (transport.state !== 'started') return 0;
    const now = Tone.immediate() - this.outputLatency();
    // Before this run's start, the Transport still answers with the previous run's position.
    if (now < this.startedAt) return 0;
    return transport.getTicksAtTime(now) / PPQ;
  }

  /** Where she is in the current line or song, in beats. Negative during a count-in. */
  position(): number {
    const heard = this.heardBeats();
    const plan = this.plan;
    if (plan.kind === 'take') return heard - plan.originBeat + plan.startBeat;
    if (plan.kind === 'loop') {
      const length = (plan.tune()?.bars ?? 2) * 4;
      return Math.max(0, heard - plan.originBeat + plan.lineBeat) % length;
    }
    return heard;
  }

  /** Tone wraps the AudioContext and its wrapper hides outputLatency, so read it from the native one. */
  outputLatency(): number {
    const raw = Tone.getContext().rawContext as unknown as { _nativeContext?: AudioContext; baseLatency?: number };
    return raw._nativeContext?.outputLatency || 0;
  }

  get isRunning(): boolean {
    return Tone.getTransport().state === 'started';
  }

  setBpm(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }

  private begin(plan: Plan, mood: Mood, bpm: number, droneSeconds: number): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
    transport.bpm.value = bpm;
    this.plan = plan;
    this.bed.setMood(mood);
    if (this.humOn) this.bed.fadeIn(droneSeconds);
    void this.resume();
    this.startedAt = Tone.now() + 0.06;
    transport.start(this.startedAt);
  }

  /** One bar of clicks, then drums from the downbeat. A take's beat 0 is the downbeat after the count-in. */
  startTake(mood: Mood, bpm: number, startBeat = 0): void {
    this.begin({ kind: 'take', mood, originBeat: 4, startBeat, countIn: true }, mood, bpm, (4 * 60) / bpm);
  }

  /** Keep the Transport rolling and loop the finished line. */
  loopFromTake(mood: Mood, sound: SoundId, tune: () => Tune | undefined): void {
    const take = this.plan.kind === 'take' ? this.plan : null;
    this.prepareSound(sound);
    this.plan = {
      kind: 'loop', mood, sound, tune,
      originBeat: take?.originBeat ?? 0,
      lineBeat: take?.startBeat ?? 0
    };
  }

  startLoop(mood: Mood, sound: SoundId, bpm: number, tune: () => Tune | undefined): void {
    this.prepareSound(sound);
    this.begin({ kind: 'loop', mood, sound, tune, originBeat: 0, lineBeat: 0 }, mood, bpm, 0.2);
  }

  startOnce(mood: Mood, sound: SoundId, bpm: number, tune: Tune): void {
    this.prepareSound(sound);
    this.begin({ kind: 'once', mood, sound, tune }, mood, bpm, 0.2);
  }

  startSong(song: Song): void {
    this.prepareSound(song.sound);
    this.begin({ kind: 'song', song }, song.mood, song.bpm, 0.2);
  }

  /** Lets a mood card show what it's like: its instrument, kit and bed, for 4 seconds. */
  previewMood(mood: Mood): void {
    const info = MOODS[mood];
    const pads = padNotes(mood, 5, 0);
    const tune: Tune = {
      bars: 2,
      notes: info.preview.map(([pad, start, duration], i) => ({ syllableId: String(i), segments: [{ start, duration, midi: pads[pad] }] }))
    };
    this.startOnce(mood, info.sound, info.bpm, tune);
    window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => this.stop(), 4000);
  }

  stop(): void {
    window.clearTimeout(this.previewTimer);
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
    this.plan = { kind: 'none' };
    this.bed.fadeOut();
    for (const voice of this.playbackVoices.values()) voice.release(Tone.immediate());
  }

  chime(mood: Mood): void {
    const root = 60 + MOODS[mood].rootPc;
    const now = Tone.immediate();
    this.playbackVoice('softKeys').attack(root, now + 0.02);
    this.playbackVoice('softKeys').release(now + 0.22);
    this.playbackVoice('softKeys').attack(root + 7, now + 0.24);
    this.playbackVoice('softKeys').release(now + 0.6);
  }

  setHum(on: boolean): void {
    this.humOn = on;
    if (!on) this.bed.fadeOut();
    else if (this.isRunning) this.bed.fadeIn(0.4);
  }

  // ---- Sequencer: runs every sixteenth of a beat-based bar ----

  private step(time: number): void {
    const transport = Tone.getTransport();
    const absBeat = Math.round(transport.getTicksAtTime(time) / STEP_TICKS) / 4;
    const secondsPerBeat = 60 / transport.bpm.value;
    const plan = this.plan;

    switch (plan.kind) {
      case 'take': {
        if (absBeat < plan.originBeat) {
          if (Number.isInteger(absBeat)) this.kit.hit('woodblock', absBeat === 0 ? 0.4 : 0.26, time, this.master);
          return;
        }
        this.playDrums(plan.mood, absBeat - plan.originBeat, time);
        return;
      }
      case 'loop': {
        const tune = plan.tune();
        if (!tune) return;
        const length = tune.bars * 4;
        if (absBeat < plan.originBeat) return;
        const lineBeat = (absBeat - plan.originBeat + plan.lineBeat) % length;
        this.playDrums(plan.mood, lineBeat, time);
        this.playNotes(tune, plan.sound, lineBeat, time, secondsPerBeat);
        return;
      }
      case 'once': {
        const length = plan.tune.bars * 4;
        if (absBeat >= length) {
          this.finish(time);
          return;
        }
        this.playDrums(plan.mood, absBeat, time);
        this.playNotes(plan.tune, plan.sound, absBeat, time, secondsPerBeat);
        return;
      }
      case 'song': {
        const spans = songSpans(plan.song);
        const span = spans.find((s) => absBeat >= s.startBeat && absBeat < s.endBeat);
        if (!span) {
          this.finish(time);
          return;
        }
        this.playDrums(plan.song.mood, absBeat, time);
        this.playNotes(span.tune, plan.song.sound, absBeat - span.startBeat, time, secondsPerBeat);
        return;
      }
      default:
    }
  }

  private finish(time: number): void {
    const delayMs = Math.max(0, (time - Tone.immediate()) * 1000);
    window.setTimeout(() => {
      this.stop();
      this.onEnded?.();
    }, delayMs);
  }

  private playDrums(mood: Mood, beat: number, time: number): void {
    const step = Math.round(((beat % 4) + 4) % 4 * 4);
    const info = MOODS[mood];
    const sixteenth = 15 / Tone.getTransport().bpm.value;
    // Real players push and pull a little, and swing lands the off-beats late.
    const swing = step % 2 === 1 ? info.swing * sixteenth : 0;
    const out = this.room(mood);
    for (const name of Object.keys(info.drums) as DrumName[]) {
      const kitPiece = info.kit[name];
      if (info.drums[name]?.[step] !== 'x' || !kitPiece) continue;
      const light = name === 'tick' || name === 'shaker';
      const accent = !light ? 1 : step % 4 === 0 ? 1 : step % 2 === 0 ? 0.8 : 0.6;
      const feel = 1 + (Math.random() - 0.5) * 0.14;
      const late = light ? Math.random() * 0.006 : Math.random() * 0.003;
      this.kit.hit(kitPiece.hit, kitPiece.gain * accent * feel, time + swing + late, out);
    }
    if (this.humOn) this.bed.pulse(step, time);
  }

  private playNotes(tune: Tune, sound: SoundId, beat: number, time: number, secondsPerBeat: number): void {
    const voice = this.playbackVoice(sound);
    const windowEnd = beat + 0.25;
    for (const note of tune.notes) {
      note.segments.forEach((seg, i) => {
        if (seg.start < beat - 1e-6 || seg.start >= windowEnd - 1e-6) return;
        const at = time + (seg.start - beat) * secondsPerBeat;
        if (i === 0) voice.attack(seg.midi, at);
        else voice.bend(seg.midi, at);
        if (i === note.segments.length - 1) voice.release(at + seg.duration * secondsPerBeat);
      });
    }
  }
}

export const engine = new AudioEngine();
