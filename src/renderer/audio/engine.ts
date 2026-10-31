import * as Tone from 'tone';
import type { Mood, Song, SoundId, Tune } from '../../shared/song';
import { MOODS, droneNotes, type DrumName } from '../music/moods';

// Pads bypass the Transport and its look-ahead entirely (see attack below), so this only affects the beat.
Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: 0.05, updateInterval: 0.02 }));

const PPQ = Tone.getTransport().PPQ;
const STEP_TICKS = PPQ / 4;
const hz = (midi: number) => Tone.Frequency(midi, 'midi').toFrequency();

interface Voice {
  attack(midi: number, time: number): void;
  bend(midi: number, time: number): void;
  release(time: number): void;
}

const REVERB: Record<SoundId, { decay: number; wet: number }> = {
  glassBells: { decay: 2.8, wet: 0.35 },
  softKeys: { decay: 2.2, wet: 0.25 },
  breathy: { decay: 2.5, wet: 0.3 }
};

function makeReverb(sound: SoundId, out: Tone.ToneAudioNode): Tone.Reverb {
  return new Tone.Reverb(REVERB[sound]).connect(out);
}

function makeVoice(sound: SoundId, reverb: Tone.Reverb): Voice {
  if (sound === 'glassBells') {
    const synth = new Tone.FMSynth({
      harmonicity: 3.01,
      modulationIndex: 14,
      envelope: { attack: 0.005, decay: 1.2, sustain: 0, release: 1.2 },
      modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0, release: 0.8 },
      volume: -8
    }).connect(reverb);
    return monoVoice(synth);
  }
  if (sound === 'softKeys') {
    const filter = new Tone.Filter(2400, 'lowpass').connect(reverb);
    const synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.6, sustain: 0.35, release: 0.8 },
      volume: -3
    }).connect(filter);
    return monoVoice(synth);
  }
  const chorus = new Tone.Chorus({ frequency: 1.2, delayTime: 3.5, depth: 0.5, wet: 0.5 }).start().connect(reverb);
  const filter = new Tone.Filter({ frequency: 1400, type: 'lowpass', Q: 1 }).connect(chorus);
  const envelope = { attack: 0.06, decay: 0.3, sustain: 0.7, release: 0.6 };
  const synth = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope, volume: -9 }).connect(filter);
  const air = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope, volume: -30 }).connect(filter);
  const voice = monoVoice(synth);
  return {
    attack(midi, time) {
      voice.attack(midi, time);
      air.triggerAttack(time);
    },
    bend: voice.bend,
    release(time) {
      voice.release(time);
      air.triggerRelease(time);
    }
  };
}

function monoVoice(synth: Tone.Synth | Tone.FMSynth): Voice {
  return {
    attack(midi, time) {
      synth.portamento = 0; // A new bit starts cleanly; only bends glide.
      synth.triggerAttack(hz(midi), time);
    },
    bend(midi, time) {
      synth.portamento = 0.04;
      synth.setNote(hz(midi), time);
    },
    release(time) {
      synth.triggerRelease(time);
    }
  };
}

class Drums {
  private readonly bus = new Tone.Gain(0.8).toDestination();
  private readonly boom = new Tone.MembraneSynth({
    pitchDecay: 0.04, octaves: 5, envelope: { attack: 0.002, decay: 0.32, sustain: 0, release: 0.1 }, volume: -8
  }).connect(this.bus);
  private readonly clapFilter = new Tone.Filter(1800, 'bandpass').connect(this.bus);
  private readonly clap = new Tone.NoiseSynth({
    noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.14, sustain: 0, release: 0.05 }, volume: -14
  }).connect(this.clapFilter);
  private readonly tickFilter = new Tone.Filter(7500, 'highpass').connect(this.bus);
  private readonly tick = new Tone.NoiseSynth({
    noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 }, volume: -22
  }).connect(this.tickFilter);
  private readonly shakerFilter = new Tone.Filter(5200, 'highpass').connect(this.bus);
  private readonly shaker = new Tone.NoiseSynth({
    noise: { type: 'pink' }, envelope: { attack: 0.008, decay: 0.07, sustain: 0, release: 0.02 }, volume: -20
  }).connect(this.shakerFilter);

  hit(name: DrumName, time: number, velocity: number): void {
    if (name === 'boom') this.boom.triggerAttackRelease(52, '16n', time, velocity);
    else this[name].triggerAttackRelease('32n', time, velocity);
  }
}

class Drone {
  private readonly gain = new Tone.Gain(0).toDestination();
  private readonly filter = new Tone.Filter(520, 'lowpass').connect(this.gain);
  private readonly a = new Tone.Oscillator({ type: 'triangle', frequency: 220, volume: -24 }).connect(this.filter);
  private readonly b = new Tone.Oscillator({ type: 'sine', frequency: 330, volume: -24 }).connect(this.filter);
  private running = false;

  setMood(mood: Mood): void {
    const [root, fifth] = droneNotes(mood);
    this.a.frequency.value = hz(root);
    this.b.frequency.value = hz(fifth);
  }

  fadeIn(seconds: number): void {
    if (!this.running) {
      this.a.start();
      this.b.start();
      this.running = true;
    }
    this.gain.gain.cancelScheduledValues(Tone.immediate());
    this.gain.gain.rampTo(1, seconds);
  }

  fadeOut(): void {
    this.gain.gain.cancelScheduledValues(Tone.immediate());
    this.gain.gain.rampTo(0, 0.4);
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
  private readonly master = new Tone.Gain(1).toDestination();
  private readonly drums = new Drums();
  private readonly drone = new Drone();
  private readonly click = new Tone.MembraneSynth({
    pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 }, volume: -18
  }).toDestination();
  private readonly reverbs = new Map<SoundId, Tone.Reverb>();
  private readonly voices = new Map<SoundId, Voice>();
  private readonly playbackVoices = new Map<SoundId, Voice>();
  private previewTimer: number | undefined;
  private plan: Plan = { kind: 'none' };
  private padSound: SoundId = 'glassBells';
  private holding = false;
  humOn = true;
  onEnded: (() => void) | undefined;

  constructor() {
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

  private reverb(sound: SoundId): Tone.Reverb {
    let reverb = this.reverbs.get(sound);
    if (!reverb) {
      reverb = makeReverb(sound, this.master);
      this.reverbs.set(sound, reverb);
    }
    return reverb;
  }

  private voice(sound: SoundId): Voice {
    let voice = this.voices.get(sound);
    if (!voice) {
      voice = makeVoice(sound, this.reverb(sound));
      this.voices.set(sound, voice);
    }
    return voice;
  }

  private playbackVoice(sound: SoundId): Voice {
    let voice = this.playbackVoices.get(sound);
    if (!voice) {
      voice = makeVoice(sound, this.reverb(sound));
      this.playbackVoices.set(sound, voice);
    }
    return voice;
  }

  prepareSound(sound: SoundId): void {
    this.padSound = sound;
    this.voice(sound);
    this.playbackVoice(sound);
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

  private outputLatency(): number {
    return Tone.getContext().rawContext instanceof AudioContext
      ? (Tone.getContext().rawContext as AudioContext).outputLatency || 0
      : 0;
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
    this.drone.setMood(mood);
    if (this.humOn) this.drone.fadeIn(droneSeconds);
    void this.resume();
    transport.start(Tone.now() + 0.06);
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

  /** Beat-based preview for a mood card: its beat, drone and a short phrase of pad notes, for 4 seconds. */
  previewMood(mood: Mood, notes: number[]): void {
    const info = MOODS[mood];
    const tune: Tune = {
      bars: 2,
      notes: notes.map((midi, i) => ({ syllableId: String(i), segments: [{ start: i, duration: 0.9, midi }] }))
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
    this.drone.fadeOut();
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
    if (!on) this.drone.fadeOut();
    else if (this.isRunning) this.drone.fadeIn(0.4);
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
          if (Number.isInteger(absBeat)) this.click.triggerAttackRelease(absBeat === 0 ? 'G5' : 'D5', '32n', time);
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
    const pattern = MOODS[mood].drums;
    for (const name of Object.keys(pattern) as DrumName[]) {
      if (pattern[name]?.[step] !== 'x') continue;
      const quiet = mood === 'running' && name === 'tick' ? 0.5 : mood === 'snowfall' && name === 'tick' ? 0.6 : 1;
      this.drums.hit(name, time, quiet);
    }
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
