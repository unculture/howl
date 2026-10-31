// Builds the bundled instrument samples from two CC0 libraries: VCSL and VSCO 2 Community Edition.
// The results are committed, so this only runs when the sounds change. Needs ffmpeg and network.
// Usage: node scripts/make-samples.mjs [cacheDir]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cache = process.argv[2] ?? '.sample-cache';
const OUT = 'src/renderer/public/samples';
const RATE = 44100;
const LIBS = { vcsl: 'sgossner/VCSL', vsco: 'sgossner/VSCO-2-CE' };
const BRANCH = 'master';

// Pitched instruments. `every` semitones between chosen notes across `from`..`to`.
const PITCHED = {
  vibes: { lib: 'vcsl', dir: 'Idiophones/Struck Idiophones/Vibraphone/Soft Mallets/', match: /_v2_rr1/, from: 48, to: 86, every: 5, seconds: 4.5 },
  piano: { lib: 'vcsl', dir: 'Chordophones/Zithers/Upright Piano, Yamaha/Sustains/', match: /_vl2_rr1/, from: 43, to: 91, every: 5, seconds: 4.5 },
  flute: { lib: 'vsco', dir: 'Woodwinds/Flute/susNV/', match: /_v[12]_1/, from: 60, to: 93, every: 5, seconds: 4, loop: true },
  strum: { lib: 'vcsl', dir: 'Chordophones/Composite Chordophones/Strumstick/Finger/', match: /_vl2_rr1/, from: 40, to: 81, every: 4, seconds: 3.5 },
  cello: { lib: 'vsco', dir: 'Strings/Cello Section/susvib/', match: /_v[12]_1/, from: 36, to: 62, every: 7, seconds: 5, loop: true },
  violins: { lib: 'vsco', dir: 'Strings/Violin Section/susVib/', match: /_v1/, from: 64, to: 84, every: 7, seconds: 5, loop: true },
  bassPluck: { lib: 'vsco', dir: 'Strings/Solo Contrabass/Pizz/', match: /_v1_rr1/, from: 28, to: 50, every: 7, seconds: 1.8 },
  celloShort: { lib: 'vsco', dir: 'Strings/Cello Section/spic/', match: /_v2_RR1/, from: 36, to: 55, every: 7, seconds: 0.7 }
};

// One-shot percussion. Every pattern repeats, so each hit has several takes.
const VCSL_HIT = 'Idiophones/Struck Idiophones/';
const VCSL_DRUM = 'Membranophones/Struck Membranophones/';
const HITS = {
  bigBoom: { dir: `${VCSL_DRUM}Bass Drum 1/`, match: /hit_v5_rr[12]/, seconds: 1.4 },
  tightBoom: { dir: `${VCSL_DRUM}Bass Drum 1/`, match: /hit_v3_rr[12]/, seconds: 0.5 },
  softBoom: { dir: `${VCSL_DRUM}Frame Drum/`, match: /HDrumL_HitMuted_v2/, seconds: 0.8 },
  cajonLow: { dir: `${VCSL_HIT}Cajon/`, match: /hit1_f_rr/, seconds: 0.5 },
  cajonSlap: { dir: `${VCSL_HIT}Cajon/`, match: /hit3_f_rr/, seconds: 0.4 },
  claps: { dir: `${VCSL_HIT}Claps/`, match: /^Clap_rr[1-4]/, seconds: 0.5 },
  snare: { dir: `${VCSL_DRUM}Snare Drum, Modern 1/`, match: /HitSN_v6/, seconds: 0.5 },
  hat: { dir: `${VCSL_HIT}Hi-Hat Cymbal/`, match: /HitC_v[12]_rr1/, seconds: 0.25 },
  shaker: { dir: `${VCSL_HIT}Shaker, Small/`, match: /Mid_Shaker(Low|High)Faster_(Up|Down)_rr1/, seconds: 0.25 },
  tamb: { dir: `${VCSL_HIT}Tambourine 1/`, match: /Hit_v[12]_rr1/, seconds: 0.5 },
  tambShake: { dir: `${VCSL_HIT}Tambourine 1/`, match: /Shake_rr/, seconds: 0.4 },
  sleigh: { dir: `${VCSL_HIT}Sleigh Bells/`, match: /Sleighbells_Hit_rr/, seconds: 0.7 },
  woodblock: { dir: `${VCSL_HIT}Woodblock/`, match: /.*/, seconds: 0.2, take: 2 }
};

const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteOf(name) {
  const match = /(?:^|_)([A-G])(#|b)?(-?\d)(?:_|\.|$)/.exec(name);
  if (!match) return null;
  // These libraries call middle C "C3": their flute starts at "C3", but a real flute's lowest note is C4.
  return (Number(match[3]) + 2) * 12 + NAMES[match[1]] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
}

const trees = {};
function tree(lib) {
  if (!trees[lib]) {
    const file = join(cache, `${lib}.json`);
    if (!existsSync(file)) {
      mkdirSync(cache, { recursive: true });
      writeFileSync(file, execFileSync('gh', ['api', `repos/${LIBS[lib]}/git/trees/${BRANCH}?recursive=1`], { maxBuffer: 1 << 28 }));
    }
    trees[lib] = JSON.parse(readFileSync(file, 'utf8')).tree.filter((t) => t.type === 'blob' && /\.wav$/i.test(t.path)).map((t) => t.path);
  }
  return trees[lib];
}

function fetchWav(lib, path) {
  const file = join(cache, lib, path.replace(/[^\w.-]+/g, '_'));
  if (!existsSync(file)) {
    mkdirSync(join(cache, lib), { recursive: true });
    const url = `https://raw.githubusercontent.com/${LIBS[lib]}/${BRANCH}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const got = spawnSync('curl', ['-sSfL', '--retry', '3', '-o', file, url]);
    if (got.status !== 0) throw new Error(`Could not download ${url}: ${got.stderr}`);
  }
  return file;
}

function decode(file) {
  const raw = execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-ac', '2', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const copy = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length);
  const all = new Float32Array(copy);
  const left = new Float32Array(all.length >> 1);
  const right = new Float32Array(all.length >> 1);
  for (let i = 0; i < left.length; i++) {
    left[i] = all[i * 2];
    right[i] = all[i * 2 + 1];
  }
  return [left, right];
}

function encode(channels, file) {
  const interleaved = new Float32Array(channels[0].length * 2);
  for (let i = 0; i < channels[0].length; i++) {
    interleaved[i * 2] = channels[0][i];
    interleaved[i * 2 + 1] = channels[1][i];
  }
  // Through a file, not a pipe: ffmpeg can stall forever reading a large stdin.
  const temp = `${file}.raw`;
  writeFileSync(temp, Buffer.from(interleaved.buffer));
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-i', temp, '-c:a', 'libvorbis', '-q:a', '5', file], { timeout: 60000 });
  rmSync(temp);
}

function peakOf(channels) {
  let peak = 0;
  for (const c of channels) for (const v of c) peak = Math.max(peak, Math.abs(v));
  return peak;
}

/** Starts the file right at the sound, so a tap and its note line up. */
function trimToOnset(channels, seconds) {
  const threshold = peakOf(channels) * 0.04;
  let onset = channels[0].findIndex((v, i) => Math.abs(v) > threshold || Math.abs(channels[1][i]) > threshold);
  onset = Math.max(0, onset - Math.round(RATE * 0.002));
  const end = Math.min(channels[0].length, onset + Math.round(seconds * RATE));
  const out = channels.map((c) => c.slice(onset, end));
  const fadeIn = Math.round(RATE * 0.001);
  const fadeOut = Math.min(Math.round(RATE * 0.12), out[0].length >> 2);
  for (const c of out) {
    for (let i = 0; i < fadeIn; i++) c[i] *= i / fadeIn;
    for (let i = 0; i < fadeOut; i++) c[c.length - 1 - i] *= i / fadeOut;
  }
  return out;
}

/** Bakes an equal-power crossfade so the loop point can't click. Returns loop points in seconds. */
function bakeLoop(channels) {
  const length = channels[0].length;
  const start = Math.round(length * 0.35);
  const end = Math.round(length * 0.92);
  const fade = Math.min(Math.round(RATE * 0.4), start - 1, (end - start) >> 1);
  for (const c of channels) {
    for (let i = 0; i < fade; i++) {
      const t = (i + 1) / fade;
      c[end - fade + i] = c[end - fade + i] * Math.cos((t * Math.PI) / 2) + c[start - fade + i] * Math.sin((t * Math.PI) / 2);
    }
  }
  return { out: channels.map((c) => c.slice(0, end)), loopStart: start / RATE, loopEnd: end / RATE };
}

/** Level of the note's body, ignoring the very first transient. */
function bodyLevel(channels) {
  const from = Math.round(RATE * 0.02);
  const to = Math.min(channels[0].length, Math.round(RATE * 0.4));
  let sum = 0;
  for (let i = from; i < to; i++) sum += channels[0][i] ** 2 + channels[1][i] ** 2;
  return Math.sqrt(sum / (2 * Math.max(1, to - from)));
}

/** Finds the true pitch near the named note by autocorrelation. Returns cents sharp of the name. */
function centsOff(channels, midi) {
  const from = Math.round(RATE * 0.08);
  const size = Math.min(channels[0].length - from, Math.round(RATE * 0.5));
  const expected = RATE / (440 * 2 ** ((midi - 69) / 12));
  const score = (lag) => {
    let sum = 0;
    for (let i = 0; i + lag < size; i += 2) sum += channels[0][from + i] * channels[0][from + i + lag];
    return sum;
  };
  const low = Math.floor(expected / 2 ** (60 / 1200));
  const high = Math.ceil(expected * 2 ** (60 / 1200));
  let best = 0;
  let bestLag = expected;
  for (let lag = low; lag <= high; lag++) {
    const s = score(lag);
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  const a = score(bestLag - 1);
  const b = score(bestLag + 1);
  const shift = (a - b) / (2 * (a - 2 * best + b) || 1);
  const cents = 1200 * Math.log2(expected / (bestLag + shift));
  // A real recording is never far out. A big reading means the measurement is wrong, so ignore it.
  return Math.abs(cents) < 25 ? Math.round(cents) : 0;
}

/** The fundamental by autocorrelation, to catch a library that names its octaves differently. */
function detectedMidi(channels) {
  const from = Math.round(RATE * 0.08);
  const size = Math.min(channels[0].length - from, Math.round(RATE * 0.4));
  const score = (lag) => {
    let sum = 0;
    for (let i = 0; i + lag < size; i += 2) sum += channels[0][from + i] * channels[0][from + i + lag];
    return sum;
  };
  const energy = score(0);
  let dipped = false;
  let best = 0;
  let bestLag = 0;
  const maxLag = Math.round(RATE / 30);
  for (let lag = 1; lag < maxLag; lag++) {
    const s = score(lag) / energy;
    if (s < 0) dipped = true;
    if (dipped && s > best) {
      best = s;
      bestLag = lag;
    }
    // Take the first strong peak, once it has clearly stopped rising.
    if (dipped && best > 0.5 && s < best * 0.8) break;
  }
  return bestLag ? Math.round(69 + 12 * Math.log2(RATE / bestLag / 440)) : null;
}

const round = (value) => Math.round(value * 1000) / 1000;
rmSync(OUT, { recursive: true, force: true });
const manifest = { instruments: {}, hits: {} };

for (const [name, spec] of Object.entries(PITCHED)) {
  mkdirSync(join(OUT, name), { recursive: true });
  const options = tree(spec.lib)
    .filter((path) => path.includes(spec.dir) && spec.match.test(path.split('/').pop()))
    .map((path) => ({ path, midi: noteOf(path.split('/').pop()) }))
    .filter((o) => o.midi !== null)
    .sort((a, b) => a.midi - b.midi);
  if (!options.length) throw new Error(`No files for ${name}`);
  const chosen = new Map();
  for (let target = spec.from; target <= spec.to; target += spec.every) {
    const near = options.reduce((best, o) => (Math.abs(o.midi - target) < Math.abs(best.midi - target) ? o : best));
    chosen.set(near.midi, near);
  }
  const report = [];
  const zones = [...chosen.values()].map(({ path, midi }) => {
    const channels = trimToOnset(decode(fetchWav(spec.lib, path)), spec.seconds);
    const zone = { midi, file: `${name}/${midi}.ogg`, cents: centsOff(channels, midi), gain: round(0.18 / Math.max(bodyLevel(channels), 1e-4)) };
    report.push(`${midi}~${detectedMidi(channels)}(${zone.cents})`);
    let out = channels;
    if (spec.loop) {
      const looped = bakeLoop(channels);
      out = looped.out;
      zone.loopStart = round(looped.loopStart);
      zone.loopEnd = round(looped.loopEnd);
    }
    encode(out, join(OUT, zone.file));
    return zone;
  });
  manifest.instruments[name] = zones;
  console.log(name, 'named~detected(cents):', report.join(' '));
}

for (const [name, spec] of Object.entries(HITS)) {
  mkdirSync(join(OUT, name), { recursive: true });
  const files = tree('vcsl').filter((path) => path.includes(spec.dir) && spec.match.test(path.split('/').pop())).slice(0, spec.take ?? 4);
  if (!files.length) throw new Error(`No files for ${name}`);
  manifest.hits[name] = files.map((path, i) => {
    const channels = trimToOnset(decode(fetchWav('vcsl', path)), spec.seconds);
    const file = `${name}/${i}.ogg`;
    encode(channels, join(OUT, file));
    return { file, gain: round(0.7 / Math.max(peakOf(channels), 1e-4)) };
  });
  console.log(name, files.length);
}

writeFileSync('src/renderer/audio/samples.json', `${JSON.stringify(manifest, null, 1)}\n`);
writeFileSync(join(OUT, 'CREDITS.txt'), `Instrument recordings from these libraries, both CC0 (public domain):
VCSL, Versilian Community Sample Library: https://github.com/sgossner/VCSL
VSCO 2 Community Edition, Versilian Studios: https://github.com/sgossner/VSCO-2-CE
Processed by scripts/make-samples.mjs.
`);
