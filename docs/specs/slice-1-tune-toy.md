# Slice 1 · Tune Toy — build spec

**Status:** ready to build · **Version:** 1.0 · **Date:** 31 Oct 2026
**Read first:** [`CLAUDE.md`](../../CLAUDE.md), [`docs/design-system/README.md`](../design-system/README.md), [`docs/architecture.md`](../architecture.md)
**Visual reference:** [`docs/wireframes/`](../wireframes/) — especially `tt-2-your-lines.png`, `tt-3-tune-states.png`, `05-tune.png`, `05b-tune-how-it-works.png`, `04a-say-it-all.png`, `01-my-songs.png`, `02-new-song.png`

---

## 0. What this slice is, and how we'll know it works

Tune Toy is the first installable version of **howl**. It does one thing: she says (or types) her lyrics, the app splits them into lines and singable bits (syllables), and she makes a tune for each line by **tapping pads over a looping beat — each tap sings the next glowing bit**. She can play the whole thing back.

It exists to answer one question with a real 11-year-old: **can a non-musician turn one of her own lines into a tune she likes in about five minutes?**

**Success criteria (manual, with her):**
1. From a fresh install she gets from "New song" to hearing a tune for her first line in under 5 minutes, without help.
2. Dictation turns a spoken verse into separate lines, mostly at the right breaks.
3. Pads feel instant (no perceptible lag between touch and sound).
4. Nothing she can do on the pads sounds "wrong".
5. Her song is still there after quitting and reopening the app.

## 1. Scope

**In**

- Installable desktop app: Windows 11 x64 (primary — a touch-screen convertible) and macOS (Apple silicon + Intel).
- Home: list of songs, New song, Open a song file.
- New song sheet: name (type or dictate) + pick a mood.
- Words: **Say it all** (local dictation, pause = new line), **Type a line**, **Your lines** list with read-aloud, edit, reorder, delete, and syllable fixing.
- Tune: Ready → Count-in → Tapping → Has tune states; 10 pads; 5 notes / 7 notes; octave arrows; hold for long notes; slide to bend; edit blocks after; Hear it; Again; Tidy timing; Same tune as…; Next line; mood + speed + sound pickers.
- Play song (whole song, all lines in order) from the top bar.
- Settings sheet: reading voice and speed, text size, note names on/off, keyboard help, dictation status.
- Autosave to a visible folder; `.howl` song file (zip) containing `song.json`, `lyrics.txt`, `tune.mid`.
- Undo/redo for every change.
- Full keyboard + trackpad support (MacBook) alongside touch.

**Out (later slices — do not build, do not show disabled stubs)**

Parts (verse/chorus), Sort your lines drag-to-parts, Scraps, Ideas panel / any AI suggestions, Hum mode, Draw mode, Say-in-time mode, beat editing, backing/chords editing, voice recording, guide voice, mix, cover art, MP3 export, accounts, sync, mobile.

The design-system rail shows only **Words** and **Tune** in this slice.

## 2. Platform and stack (decided — see architecture.md for reasons)

| Concern | Choice |
| --- | --- |
| Shell | Electron (current stable), `contextIsolation: true`, `nodeIntegration: false`, preload bridge |
| Build | electron-vite (or Vite + electron-builder), TypeScript strict |
| UI | React 18+, CSS Modules or plain CSS using `design/tokens.css` variables only |
| State | Zustand + Immer; undo via Immer patches |
| Audio | Tone.js (Web Audio) |
| Dictation | Local Whisper: `@huggingface/transformers` (v3) in a Web Worker, model `whisper-base.en` (quantised), bundled with the app; voice activity detection with `@ricky0123/vad-web` (Silero) to split on pauses |
| Read-aloud | `window.speechSynthesis` |
| Syllables | `hypher` + `hyphenation.en-us` patterns, cross-checked with `syllable`; user can fix |
| MIDI | `@tonejs/midi` |
| Zip | `jszip` (renderer) or `adm-zip` (main) |
| Icons | `lucide-react` + 2 custom SVGs (tune wave, beat ring) from the design system |
| Fonts | Lexend and Fraunces (variable, OFL) bundled in `src/renderer/assets/fonts` |
| Package | electron-builder: NSIS per-user installer (Windows), DMG (macOS) |
| Tests | Vitest (logic), Playwright for Electron (smoke) |

**No network at runtime.** Everything — fonts, model, sounds — ships in the app. Her audio never leaves the computer.

## 3. Data model

```ts
type Mood = 'wolfMoon' | 'snowfall' | 'bonfire' | 'running';
type Feel = 'moody' | 'bright' | 'dreamy';
type SoundId = 'glassBells' | 'softKeys' | 'breathy';

interface Song {
  formatVersion: 1;
  id: string;               // uuid
  name: string;             // shown in Fraunces; default "Untitled song"
  createdAt: string;        // ISO
  updatedAt: string;
  mood: Mood;
  bpm: number;              // 60–140, defaults from mood
  noteMode: 5 | 7;
  octaveShift: -1 | 0 | 1;
  sound: SoundId;           // defaults from mood
  lines: Line[];
}

interface Line {
  id: string;
  text: string;             // exactly as she said/typed it
  syllables: Syllable[];    // derived from text, then hand-fixed
  tune?: Tune;              // absent until she makes one
}

interface Syllable { id: string; text: string; wordIndex: number; }

interface Tune {
  bars: number;             // 2, 4, 6 or 8 (4/4)
  notes: Note[];            // exactly one per syllable, in syllable order
}

interface Note {
  syllableId: string;
  segments: Segment[];      // >1 segment = a bend (melisma)
}

interface Segment {
  start: number;            // in beats from the start of the line's take (0 = bar 1 beat 1)
  duration: number;         // in beats, min 0.125
  midi: number;             // MIDI note number, always in the current scale
}
```

Rules:
- If `text` changes, recompute `syllables`. If the syllable count is unchanged, keep the tune and remap `syllableId`s by index. If it changed, keep the tune only for the unchanged prefix of syllables and drop the rest (undoable), and show the line as "tune needs finishing" (see 6.4).
- A line is "has tune" only when every syllable has a note.
- Changing mood (and therefore root/scale) transposes every note by the root difference and snaps each to the nearest note in the new scale (ties go down).

## 4. Music model

### 4.1 Moods

| Mood | Feel | Root | bpm | Default sound | Drums |
| --- | --- | --- | --- | --- | --- |
| Wolf moon | moody | D | 84 | Glass bells | Big: Boom on 1 and 3, Clap on 2 and 4, Tick 8ths |
| Snowfall | dreamy | E | 72 | Soft keys | Sparse: Boom on 1, soft Tick quarters, Shaker on the "and" of 4 |
| Bonfire | bright | G | 92 | Soft keys | Boom 1 and 3, Clap 4, Shaker 8ths |
| Running | bright | C | 120 | Breathy | Boom every beat, Clap 2 and 4, Tick 16ths (quiet) |

Drum patterns as 16-step strings (`x` = hit, `.` = rest, one bar of 4/4):

```
wolfMoon  boom  x...x...x...x...   clap ....x.......x...   tick x.x.x.x.x.x.x.x.   shaker ......x.......xx
snowfall  boom  x...............   tick x...x...x...x...   shaker ..............x.
bonfire   boom  x.......x.......   clap ............x...   shaker x.x.x.x.x.x.x.x.
running   boom  x...x...x...x...   clap ....x.......x...   tick xxxxxxxxxxxxxxxx
```

Each mood also plays a **soft drone**: root + fifth, very quiet (−24 dB relative to pads), sustained, low-pass filtered. It gives her a tonal anchor so pads feel "in tune with something". Toggle in Settings ("Background hum", default on).

### 4.2 Scales

| Feel | 5 notes (default) | 7 notes |
| --- | --- | --- |
| moody | minor pentatonic (0, 3, 5, 7, 10) | natural minor (0, 2, 3, 5, 7, 8, 10) |
| bright | major pentatonic (0, 2, 4, 7, 9) | major (0, 2, 4, 5, 7, 9, 11) |
| dreamy | major pentatonic (0, 2, 4, 7, 9) | lydian (0, 2, 4, 6, 7, 9, 11) |

### 4.3 Pads

- **10 pads**, left = low, right = high.
- Pad notes are 10 consecutive notes of the current scale. **The lowest pad is the first scale note at or above A3 (MIDI 57)**, then `octaveShift × 12`.
  - Example, Wolf moon, 5 notes: A3 C4 D4 F4 G4 A4 C5 D5 F5 G5.
  - Example, Wolf moon, 7 notes: A3 Bb3 C4 D4 E4 F4 G4 A4 Bb4 C5.
- In 7-note mode, pads whose note is **not** in the 5-note scale show a 1.5px green inner border at rest ("colour notes").
- Arrows `‹ ›` either side shift `octaveShift` (−1…+1). At the limit the arrow is disabled (40% opacity).
- Note names are hidden. If Settings → "Show note names" is on, each pad shows its note name (e.g. "D4") bottom-left in `.t-caption`.

### 4.4 Sounds ("Play it as")

All synthesised with Tone.js so nothing needs downloading. Monophonic with 40ms portamento for bends. Target: pleasant at default volume, no clicks.

| Id | Label | Recipe (starting point, tune by ear) |
| --- | --- | --- |
| `glassBells` | Glass bells | `FMSynth` harmonicity 3.01, modulationIndex 14, envelope a 0.005 d 1.2 s 0.0 r 1.2; reverb wet 0.35 |
| `softKeys` | Soft keys | `Synth` triangle, a 0.01 d 0.6 s 0.35 r 0.8, low-pass 2.4 kHz; reverb wet 0.25 |
| `breathy` | Breathy | `Synth` sawtooth through low-pass 1.4 kHz Q 1 + quiet `NoiseSynth` pink layer, a 0.06 d 0.3 s 0.7 r 0.6; chorus; reverb wet 0.3 |

Held notes sustain while held (for `glassBells`, which has no sustain, retrigger nothing — the decay is the character).

## 5. App shell

### 5.1 Window

- Default 1280 × 800, minimum 1024 × 700, remembers size and position.
- Background `--color-bg-night`. Windows: `titleBarStyle: 'hidden'` with `titleBarOverlay` `{ color: '#07090D', symbolColor: '#B9BFC9', height: 40 }`. macOS: `titleBarStyle: 'hiddenInset'`. The top bar leaves room for window controls.
- App name in the OS: **howl**. App icon: a simple aurora-pink crescent on night (placeholder fine).

### 5.2 Studio shell (any screen inside a song)

As design system §4 "Studio shell", with these slice specifics:

**Top bar (76px)**, left to right:
1. Back (48px icon button, `←`, aria-label "My songs") → Home.
2. Song name (`.t-display-m`). Tap → inline edit field; Enter or blur saves; Escape cancels; empty reverts to previous.
3. Flexible space.
4. **Transport pill**: 52px aurora play button + label "Play song" (`.t-label`). While playing: square stop icon, label "Stop", play button breathes. Disabled (40%) if no line has a tune, with tooltip-free hint: label reads "Play song" still; tapping shows toast "Make a tune first".
5. Flexible space.
6. **Undo** (outline button). Long-press or Shift+click = Redo. Disabled when nothing to undo.
7. **Settings** (outline button) → Settings sheet.

**Rail (96px):** two items, **Words** and **Tune** (icons from the design system). Selected styling per design system.

**No parts strip** in this slice.

## 6. Screens

### 6.1 Home — "My songs"

Reference: `01-my-songs.png` (ignore the Scraps panel and the "New scrap" button — out of scope).

- Logo "howl" (Fraunces italic 32px) top-left; top-right: **Open a song file** (outline) and **Settings** (outline).
- "Hey {name}" is out of scope; show just the title **My songs** (`.t-display-xl`).
- Primary button **+ New song** (aurora, 60px) aligned right of the title.
- Song cards in a wrapping grid (gap 24): 258px square tile + name (`.t-title`) + meta (`.t-caption`, secondary): "{n} lines · {relative date}" (e.g. "4 lines · today", "yesterday", "3 Nov").
  - Tile art (no cover art yet): a generated aurora gradient from the song's mood (use `color.mood.*` gradient behind a horizon; deterministic per song id). Never a grey placeholder.
  - A 48px moonlight play button on the card plays the whole song (if any tune) without opening it.
  - Tap card → opens the song on **Words** if no line has a tune, else **Tune**.
  - Right-click / long-press card → small menu: **Rename**, **Show file** (reveals in Explorer/Finder), **Delete** (moves the file to the OS bin, with a confirm sheet: "Delete {name}? It goes to the bin, so you can get it back." [Delete] [Keep it]).
- Empty state (no songs): centred text "Your songs will live here." (`.t-title`) + the New song button below, plus the one aurora glow.
- One aurora glow field top-right (design system atmosphere).

### 6.2 New song sheet

Reference: `02-new-song.png`. Opens as a **sheet** over Home (design system Sheet), not a full screen.

- Title: **New song** (`.t-display-l`).
- **Song name** field (`.t-heading` label above). Placeholder "Name your song" in Fraunces italic, tertiary. Right side: **Say** (mic icon button, dictates into the field — single utterance, stops after 1.2 s silence) and **Hear** (speaker icon button, reads the field). Name optional: blank → "Untitled song".
- **Pick a mood** (`.t-heading`): four mood cards (Wolf moon "big, wild drums", Snowfall "soft and slow", Bonfire "warm guitar"*, Running "fast and bright"). Default selected: Wolf moon. Tapping a card selects it and plays a 4-second preview (its beat + drone + a short pad phrase). Tapping again stops the preview.
  - *Bonfire's sound in this slice is Soft keys; keep the description "warm and cosy" instead of "warm guitar".
- Primary button **Start writing →** (aurora). Creates the song, saves it, opens **Words** (Say it all, with the mic not yet listening).
- Close × / Escape / scrim tap = cancel (no song created).

### 6.3 Words

Words has two views inside the same rail tab:

- **Say it all** — shown when the song has no lines yet, or when she taps **Say more**.
- **Your lines** — shown otherwise.

#### 6.3.1 Say it all

Reference: `04a-say-it-all.png`.

- Title **Say it all** (`.t-display-l`). Top-right buttons: **Type instead** (tonal) → switches to Your lines with a new empty line in edit mode; **Paste** (tonal) → pastes clipboard text, splitting on newlines (and on `/` if there are no newlines), into new lines.
- Transcript area: lines she has already said this session, `.t-lyric-m`, primary. The line currently being transcribed shows as a **shimmer placeholder** (a 60%-width rounded bar on `surface-control` pulsing opacity 0.4 ↔ 0.8) until its text arrives, then the text fades up (220ms).
- Bottom row: **record button** (88px). Below/beside: status (`.t-title`) and hint (`.t-body`, secondary).

| State | Button | Status | Hint |
| --- | --- | --- | --- |
| idle | mic icon, aurora, no glow | "Ready when you are" | "Tap and say your song. Pause to start a new line." |
| listening | square stop icon, breathing glow | "Listening…" | "Pause to start a new line. Tap to stop." |
| finishing | spinner ring around button, no tap | "Writing it down…" | — |
| model loading (first use) | disabled 40% | "Getting ready to listen…" | "This takes a few seconds the first time." |
| no mic / denied | disabled | "Can't hear the mic" | "Check it's plugged in, or type instead." |

- Live waveform: 8–12 bars to the right of the hint, heights follow mic RMS, aurora when speech is detected, `border-strong` otherwise.
- **Stop** → when all pending segments are transcribed, switch to **Your lines** with the new lines appended and the first new line selected.
- Escape = stop.

#### 6.3.2 Your lines

Reference: `tt-2-your-lines.png`.

Layout: content split into the lines list (flex 1) and a 280px side column.

**Title:** **Your lines** (`.t-display-l`).

**Line row (rest):** 60px tall. Speaker button (52px outline) + text (`.t-lyric-m`) + on the right, a 28px aurora ♪ badge if the line has a tune (complete) or an outlined ♪ badge if partly done. Tap the row (not the speaker) → selects it.

**Line row (selected)** — `surface-control` card, radius 16, padding 16:
1. Speaker button (filled aurora while reading), line text, **Edit** button (outline).
2. **Syllable chips** row (indented to align with the text): each bit is a chip (`surface-sunken`, radius 10, Lexend 18px). Bits of the same word sit with 4px gaps and a **join dot** between them (14px circle, 1.5px `text-tertiary` border, 48px hit area). Different words are separated by 16px. Right-aligned count: "{n} bits to sing" (`.t-caption`, secondary, nowrap).
3. Hint (`.t-caption`, secondary): "Tap a dot to join. Tap a bit to split it."

Syllable fixing:
- **Tap a join dot** → the two bits merge into one (spring pop on the merged chip).
- **Tap a bit** that has 2+ letters → a small popover above it shows the bit's letters with tappable gaps between them ("w a l k"); tapping a gap splits there. Tap outside to close.
- Fixes are stored on the line (they survive restarts) and are undoable.

**Edit mode:** the text becomes an input (`surface-sunken`, 1.5px aurora border, `.t-lyric-m`). Enter = save, Escape = cancel, empty + Enter = delete the line (undoable, toast "Line deleted · Undo"). While editing, a mic icon inside the field dictates and **replaces** the text.

**Reorder:** drag a row by its body (after a 200ms press, for touch) or use **Alt+↑ / Alt+↓** on the selected row. Rows animate into place (`--duration-base`, inOut).

**Delete:** Delete/Backspace key on a selected row (not in edit mode) → deletes with toast "Line deleted · Undo". On touch: swipe left reveals a red-tinted **Delete** button (`state.danger` text on `surface-control`).

**Read-aloud:** the speaker reads the line with karaoke highlight (design system Lyric line "reading" state).

**Side column (280px):**
1. **Say more** card (`surface-raised`, radius 20): 88px record button + "Say more" (`.t-heading`) + "Pause to start a new line" (`.t-caption`). Tapping starts listening **in place**: the record button switches to the listening state inside the card; new lines append to the bottom of the list as they arrive (shimmer placeholder row first). Tap again to stop.
2. **Type a line** (tonal, full width, 52px) → appends an empty line in edit mode.
3. Spacer.
4. **Make the tune →** (moonlight `secondary` button, 60px). Goes to Tune on the selected line (or the first line without a tune). Disabled if there are no lines.

Empty list (all lines deleted) → switches back to Say it all.

### 6.4 Tune

References: `05-tune.png` (layout and tapping), `tt-3-tune-states.png` (state machine), `05b-tune-how-it-works.png` (concept).

#### Layout (inside the studio shell content area, padding 24 / 32, vertical gap 16)

1. **Header row:** title "Line {n}" in `.t-display-l` (e.g. "Line 1"), with `‹` `›` icon buttons (48px outline) to change line, and to the right three outline chips that open small menus: **{Mood name}** (mood orb + name), **Speed**, **Play it as: {sound}**.
2. **Lyric row:** a speaker button (48px) then the line's bits in `.t-lyric-l` with 6px gaps; bits of one word joined visually (no gap, a middle dot `·` in tertiary between them, e.g. "whis·per"). Colours: sung bits primary, the **glowing bit** per design system, bits to come tertiary. Right-aligned hint (`.t-body`, secondary) — see state table.
3. **Roll** (`surface-sunken`, radius 16, height 240px): time left→right, pitch bottom→top. One horizontal row per pad note (10 rows, each 24px); faint row lines are NOT drawn (only beat lines). Vertical beat lines every beat (`border-subtle`), bar lines every 4 beats (`border-strong`). Note blocks per design system. Playhead per design system. Width shows the whole `bars` range; if `bars` grows, the grid rescales (animated 220ms).
4. **Pads row** (height 120px, gap 8): `‹` octave arrow (56px) · 10 pads · `›` octave arrow.
5. **Actions row** (48px buttons, gap 10): contents depend on state (table below). Right end: segmented **5 notes | 7 notes** (moonlight selection) always visible.

#### States

| State | Roll | Lyric hint | Actions row (left → right) |
| --- | --- | --- | --- |
| **Ready** (line has no tune) | Empty; centred **▶ Start** aurora button (52px, glow) with caption "Then tap a pad for each bit" | "Tap Start, then a pad for each bit" | — |
| **Count-in** | Big number 4→1 (Lexend 56 light) + 4 dots filling on each beat | "Get ready…" | **Stop** |
| **Tapping** | Blocks appear as she plays; playhead moving | "Tap a pad to sing the glowing bit" | **Stop** · **Start line again** · (right) "Hold for a long note" caption |
| **Has tune · playing** | All blocks; playhead looping over the line | — | **Again** · **Tidy timing** · **Same tune as…** · spacer · **Next line →** (aurora) |
| **Has tune · stopped** | All blocks; no playhead | — | **▶ Hear it** (moonlight) · **Again** · **Tidy timing** · **Same tune as…** · spacer · **Next line →** (aurora) |
| **Needs finishing** (text edited, tail dropped) | Kept blocks; dashed outline where the rest go | "Finish the tune from the glowing bit" | **▶ Carry on** (aurora) · **Again** |

On the last line, **Next line →** becomes **Play song** (aurora) and plays the whole song.

Pads make sound in **every** state (free play), but only record during Tapping (and Carry on).

#### Tapping engine (the core — implement and test carefully)

Timing model: Tone.Transport at the song bpm, 4/4. A take's time origin (`beat 0`) is the downbeat after the count-in.

1. **Start** (or Space, or Enter): if the transport is stopped, start it. Count-in = 1 bar: four click sounds (soft woodblock: `MembraneSynth` short, −18 dB) and the drums do **not** play during the count-in; the drone fades in over that bar. At beat 0 the drums start and state → Tapping. `bars` = 2 if the line has ≤ 10 bits, else 4.
2. **Pad down** (pointerdown / keydown, not auto-repeat): sound starts **immediately** (`triggerAttack` at `Tone.now()`), pad lights (60ms). If state is Tapping and there are unsung bits: record a new Note for the glowing bit with one Segment `{ start: transportBeats(), duration: provisional, midi }`, create its block (spring-in), hand the glow to the next bit. `transportBeats()` = `Tone.Transport.seconds × bpm / 60 − countInBeats`, minus the measured output latency (`Tone.context.outputLatency || 0`, converted to beats).
3. **Pad up**: `triggerRelease`; the current segment's duration = now − start, clamped to ≥ 0.125 beat.
4. **Slide while held** (pointer moves onto another pad while still down — use `elementFromPoint` on pointermove, not pointerenter, because of pointer capture): end the current segment at now; start a new segment on the new pad for the **same** bit; synth glides (portamento). The new segment block is drawn joined to the previous one at 70% opacity.
5. **Monophonic:** a new pad down while another is held (second finger or second key) ends the held segment at that moment and starts the next bit.
6. **Roll growth:** if the playhead reaches 90% of `bars` and bits remain, `bars += 2` (max 8).
7. **Backspace** during Tapping removes the last recorded note and moves the glow back one bit.
8. **Complete:** when the last bit's pad is released, state → Has tune · playing: play the "done" chime (two soft notes: root then fifth, `softKeys`, −12 dB), shimmer the blocks once, set `bars` to the smallest of 2/4/6/8 that contains the last note end, and loop the line region `[0, bars × 4)` beats, playing her tune back with the drums until Stop.
9. **Stop** during Count-in or Tapping: stop the transport and **discard the partial take** (undoable as one step) → Ready.
10. **Start line again**: discard the partial take (undoable) and restart from Count-in immediately.
11. **Again** (from Has tune): the existing tune is replaced by a new take (the old one stays on the undo stack) → Count-in.

Latency budget: touch → sound < 20ms on her Windows laptop. Use `Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: 0.01 }))`. Do not schedule pad sounds through the transport.

#### Editing a tune (Has tune states)

- **Tap a block:** plays its note (and briefly highlights its bit in the lyric row).
- **Drag a block up/down:** moves it between pad rows (snaps to the current pad notes, plays each new note while dragging). For bends, dragging one segment moves only that segment.
- **Drag a block left/right:** moves its start, snapping to 1/16 beat (1/8 if "Tidy timing" has been applied since the last take). Blocks cannot overlap or change order: they stop at their neighbours.
- **Drag a block's right edge:** changes duration (min 0.125, snaps as above, stops at the next block).
- Keyboard: Tab/Shift+Tab moves a focus ring between blocks; ↑/↓ change pitch by one pad; ←/→ move by 1/8 beat; Shift+←/→ change length.
- All edits undoable; the line keeps playing while she edits.

#### Helpers

- **▶ Hear it:** plays the line once from bar 1 with drums and drone, then stops.
- **Tidy timing:** quantise every segment start to the nearest 1/8 beat and every duration to the nearest 1/8 (min 1/8); if two notes would collide, push the later one forward by 1/8. Toast "Timing tidied · Undo". Undoable.
- **Same tune as…:** opens a small menu listing other lines that have a tune ("Line 2 · the pine trees…"). Choosing one copies it: if the bit counts match, copy notes 1:1; otherwise map target bit `i` to source note `round(i × (nSrc − 1) / (nTgt − 1))`, spacing starts evenly across the source's span and keeping each note's relative length. Undoable. Hidden if no other line has a tune.
- **Next line →:** stops playback, moves to the next line (Ready or Has tune · stopped). Slide transition: content cross-fade 200ms.

#### Header menus

- **Mood** chip → menu with the four mood cards (compact, 64px tall, orb + name). Choosing one: sets mood, bpm (to the mood's default), sound (to the mood's default) and transposes existing tunes (§3). Undoable as one step.
- **Speed** chip → popover with a slider 60–140 bpm labelled "slow" / "fast" (no numbers) and a **Reset** link. Changing speed never changes notes (they're in beats).
- **Play it as** chip → menu: Glass bells / Soft keys / Breathy, each with a 1-second preview on tap.

### 6.5 Play song

From the top bar (or Space on Home card / Shift+Space anywhere in a song): plays every line that has a tune, in order, each for its `bars`, with drums and drone continuous across lines, no gaps. Lines without a tune are skipped.

- If on the Tune screen: the screen follows the playing line (line number, lyric row with karaoke highlight driven by note starts, roll with playhead).
- If on Words: the playing line's row highlights (karaoke on its text).
- Stop: top-bar button, Space, or Escape.

### 6.6 Settings sheet

Sheet, title **Settings**. Sections (`.t-heading` labels), each one row:

| Setting | Control | Default |
| --- | --- | --- |
| Reading voice | menu of installed English voices, each with a "Hear" button | best available (see §8) |
| Reading speed | segmented: Slower / Normal / Faster (rate 0.8 / 0.95 / 1.1) | Normal |
| Text size | segmented: Aa small / medium / large / largest (0.9 / 1 / 1.15 / 1.3 × lyric styles) | medium |
| Show note names | toggle | off |
| Background hum | toggle (the mood drone) | on |
| Listening | status line: "Ready" / "Getting ready…" / "Can't hear the mic" + **Test the mic** button (shows a live level meter for 5s) | — |
| Keys | **Show keys** button → a sheet listing the keyboard map (§10) | — |
| Songs folder | path in `.t-caption` + **Show folder** button | `Documents/howl` |

Version string at the bottom in `.t-caption` tertiary: "howl · Tune Toy · v0.1.0".

### 6.7 First run, loading and errors

- **First run:** no onboarding screens. Home empty state is enough. The first time Tune opens, the lyric hint and the Start button are the onboarding.
- **Model loading:** load the Whisper model in the background as soon as the app starts (after first paint). Until ready, mic buttons show the "model loading" state. Typing always works.
- **Mic permission:** request on first mic tap. Denied → "Can't hear the mic" state everywhere a mic appears; Settings shows **Test the mic**. On macOS, if denied at OS level, show "Allow the mic in System Settings → Privacy → Microphone." with a **Open settings** button (`shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')`). On Windows: `ms-settings:privacy-microphone`.
- **Save failure:** toast "Couldn't save. Trying again…", retry every 5s; after 3 failures show a sheet with **Show folder** and the error text in `.t-caption`.
- **Corrupt or newer song file:** on open, toast "That song file won't open." Never crash; never delete it.
- **Audio context suspended** (autoplay policy): resume on the first pointerdown anywhere.

## 7. Dictation (local Whisper)

- **Pipeline:** `MicVAD` (`@ricky0123/vad-web`, Silero) in the renderer captures 16 kHz mono and emits one Float32Array per utterance. A **pause of ≥ 700ms** ends an utterance (`redemptionFrames` tuned to ~700ms; `minSpeechFrames` ≈ 250ms). Each utterance is posted to a **Web Worker** running `@huggingface/transformers` `automatic-speech-recognition` with `whisper-base.en` (quantised q8). Use WebGPU when available, else WASM.
- **Model files are bundled** with the app (`resources/models/whisper-base.en/…`); set `env.allowRemoteModels = false` and `env.localModelPath` to that folder. Add an npm script `models:fetch` that downloads them at build time (dev machines only).
- **Watch for hidden CDN loads:** both libraries fetch runtime assets from a CDN by default. Bundle and point them at local copies: transformers.js `env.backends.onnx.wasm.wasmPaths`; vad-web `baseAssetPath` (Silero `.onnx` + `vad.worklet.bundle.min.js`) and `onnxWASMBasePath`. Verify with the network disconnected.
- **One utterance → one line.** Post-processing per utterance:
  1. trim; collapse spaces;
  2. drop text in brackets or asterisks (Whisper's "[music]", "(laughs)");
  3. drop known hallucinations when the utterance is < 1.0 s or the text is one of: "Thank you.", "Thanks for watching!", "you", "Bye.", "." (case-insensitive);
  4. remove trailing `. , ; : ! ?`; keep apostrophes and internal commas;
  5. if > 14 words and it contains commas, split at the comma nearest the middle (recursively) into separate lines;
  6. keep Whisper's casing, except lower-case the first letter if the song's existing lines are all lower-case (she writes lower-case; match her).
- Results must be applied **in utterance order**, even if transcriptions finish out of order.
- Show each utterance as a shimmer placeholder from the moment VAD ends it until its text arrives.
- Never send audio anywhere. Never store raw audio in this slice.
- Acceptance: on her laptop, a 5-second utterance becomes text in under 3 seconds (WASM) after the pause.

## 8. Read-aloud

- `speechSynthesis.speak()` with the chosen voice and rate.
- Default voice preference order (first available): any voice whose name contains "Natural" and lang `en-GB`; then `en-GB` Microsoft voices ("Libby", "Sonia", "Hazel", "George"); then macOS "Serena", "Daniel", "Kate"; then any `en-*`.
- Highlight the word being spoken using `boundary` events (`charIndex`). If the voice emits no boundary events within 300ms, fall back to estimating word timing from character count and rate.
- Only one thing reads at a time; starting another stops the first. Escape stops.
- Reading pauses (does not stop) music playback? **No** — keep it simple: reading while music plays is allowed and both continue.

## 9. Syllables

- Split words on spaces; strip punctuation for splitting but keep apostrophes inside words ("don't" = 1 bit).
- Hyphenate each word with `hypher` + `hyphenation.en-us` using `leftmin = 1, rightmin = 2`.
- Cross-check with `syllable(word)`. If hypher's piece count ≠ the syllable count and the word is ≤ 12 letters, use a simple vowel-group heuristic split to reach the `syllable` count; otherwise keep hypher's result.
- Numbers are spoken words: "3" → "three" before splitting.
- Her manual fixes win and are stored per line.
- Unit tests must include at least: walking → walk·ing, whisper → whis·per, forgets → for·gets, river → riv·er, pocket → pock·et, moon → moon, the → the, remember → re·mem·ber, howling → howl·ing, aurora → au·ro·ra, fire → fire (1 bit), every → ev·ery (2 is acceptable), beautiful → beau·ti·ful.

## 10. Keyboard and pointer

Touch is primary; everything must also work with a trackpad and keyboard. Never rely on hover.

| Where | Key | Action |
| --- | --- | --- |
| Anywhere in a song | Shift+Space | Play song / Stop |
| | Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z | Undo / Redo |
| | Ctrl/Cmd+, | Settings |
| | 1 / 2 | Words / Tune |
| Words | M | Start/stop listening |
| | Enter | Edit selected line |
| | ↑ / ↓ | Select previous / next line |
| | Alt+↑ / Alt+↓ | Move line |
| | Delete | Delete line |
| Tune | A S D F G H J K L ; | Pads 1–10 (hold = long note; press another key while holding = next bit) |
| | Z / X | Octave down / up |
| | Space | Start (Ready) · Stop (Count-in/Tapping/playing) · Hear it (stopped) |
| | Backspace | Remove last bit while tapping |
| | R | Again |
| | T | Tidy timing |
| | Enter | Next line |
| | ← / → (no block focused) | Previous / next line |
| | 5 / 7 | 5 notes / 7 notes |

Pointer: pads use `pointerdown`/`pointerup` with `touch-action: none`; multi-touch supported (monophonic behaviour per §6.4). Buttons activate on click. Long-press = 500ms.

## 11. Saving and files

- Songs folder: `app.getPath('documents')/howl` (created if missing). One file per song: `{safe song name}.howl`; on name clash append " 2", " 3"… Rename the file when the song is renamed.
- **Autosave** 1.5s after the last change and on quit/blur. Write to `{name}.howl.tmp` then rename (atomic). Keep the previous file as `{name}.howl.bak`.
- `.howl` = zip containing:
  - `song.json` — the `Song` object (§3), pretty-printed;
  - `lyrics.txt` — one line per lyric line, UTF-8;
  - `tune.mid` — single-track MIDI, the song's bpm, every line's notes laid end to end (each line offset by the sum of previous lines' `bars × 4` beats), lyric meta-events per note with the syllable text;
  - `README.txt` — "This is a howl song. Open it in howl, or unzip it: lyrics.txt has your words, tune.mid opens in any music app."
- Home lists every `.howl` in the folder (read `song.json` only). Watch the folder for changes.
- **Open a song file:** OS file picker (`.howl`); copies it into the songs folder (name-clash rule) and opens it.
- All file I/O happens in the **main process** via a typed preload API (`window.howl.files.*`). The renderer never touches Node APIs.

## 12. Motion (slice-specific, using design-system tokens)

| Moment | Spec |
| --- | --- |
| Pad press / release | fill + `--glow-pad` in 60ms; release fade 220ms `--ease-out` |
| Block landing | scale 0.85 → 1, `--ease-spring`, 160ms; opacity 0 → 1, 80ms |
| Glow hand-off | previous bit colour → primary 140ms; glow background slides to next bit 140ms `--ease-inOut` |
| Waiting bit | glow breathes 0.35 ↔ 0.6 alpha over 2400ms |
| Count-in | number cross-fades each beat (120ms); dot fills with a 140ms spring pop |
| Line complete | blocks shimmer left→right (opacity 1 → 0.6 → 1, 240ms each, 60ms stagger) |
| Playhead | linear, driven by `requestAnimationFrame` from `Tone.Transport.seconds` (never CSS animation) |
| New dictated line | shimmer placeholder → text fades up 220ms |
| Sheets | slide up 360ms `--ease-out`; scrim fades 220ms |
| Screen change (rail) | content cross-fade 200ms; rail highlight slides 220ms |
| Reduced motion | keep colour/opacity; no scale, no translate, no breathing |

## 13. Copy deck (every string in this slice)

Use these exact strings. Sentence case. No exclamation marks.

```
app.name                     howl
home.title                   My songs
home.newSong                 + New song
home.openFile                Open a song file
home.settings                Settings
home.empty                   Your songs will live here.
home.card.meta               {n} lines · {date}
home.card.menu.rename        Rename
home.card.menu.showFile      Show file
home.card.menu.delete        Delete
home.delete.title            Delete {name}?
home.delete.body             It goes to the bin, so you can get it back.
home.delete.confirm          Delete
home.delete.cancel           Keep it
new.title                    New song
new.nameLabel                Song name
new.namePlaceholder          Name your song
new.say                      Say
new.hear                     Hear
new.moodLabel                Pick a mood
mood.wolfMoon                Wolf moon        · big, wild drums
mood.snowfall                Snowfall         · soft and slow
mood.bonfire                 Bonfire          · warm and cosy
mood.running                 Running          · fast and bright
new.start                    Start writing →
song.untitled                Untitled song
bar.back.aria                My songs
bar.play                     Play song
bar.stop                     Stop
bar.undo                     Undo
bar.settings                 Settings
rail.words                   Words
rail.tune                    Tune
say.title                    Say it all
say.typeInstead              Type instead
say.paste                    Paste
say.idle.status              Ready when you are
say.idle.hint                Tap and say your song. Pause to start a new line.
say.listening.status         Listening…
say.listening.hint           Pause to start a new line. Tap to stop.
say.finishing.status         Writing it down…
say.loading.status           Getting ready to listen…
say.loading.hint             This takes a few seconds the first time.
say.nomic.status             Can't hear the mic
say.nomic.hint               Check it's plugged in, or type instead.
lines.title                  Your lines
lines.edit                   Edit
lines.bits                   {n} bits to sing
lines.fixHint                Tap a dot to join. Tap a bit to split it.
lines.sayMore                Say more
lines.sayMoreHint            Pause to start a new line
lines.typeLine               Type a line
lines.makeTune               Make the tune →
lines.deleted                Line deleted · Undo
lines.delete                 Delete
tune.title                   Line {n}
tune.speed                   Speed
tune.speed.slow              slow
tune.speed.fast              fast
tune.speed.reset             Reset
tune.sound                   Play it as: {sound}
sound.glassBells             Glass bells
sound.softKeys               Soft keys
sound.breathy                Breathy
tune.start                   ▶ Start
tune.start.caption           Then tap a pad for each bit
tune.hint.ready              Tap Start, then a pad for each bit
tune.hint.countIn            Get ready…
tune.hint.tapping            Tap a pad to sing the glowing bit
tune.hint.finish             Finish the tune from the glowing bit
tune.holdHint                Hold for a long note
tune.stop                    Stop
tune.startAgain              Start line again
tune.hearIt                  ▶ Hear it
tune.again                   Again
tune.tidy                    Tidy timing
tune.tidied                  Timing tidied · Undo
tune.sameAs                  Same tune as…
tune.sameAs.item             Line {n} · {first words}…
tune.next                    Next line →
tune.carryOn                 ▶ Carry on
tune.playSong                Play song
tune.notes5                  5 notes
tune.notes7                  7 notes
tune.needTune                Make a tune first
settings.title               Settings
settings.voice               Reading voice
settings.speed               Reading speed
settings.speed.slower        Slower
settings.speed.normal        Normal
settings.speed.faster        Faster
settings.textSize            Text size
settings.noteNames           Show note names
settings.hum                 Background hum
settings.listening           Listening
settings.listening.ready     Ready
settings.testMic             Test the mic
settings.keys                Show keys
settings.folder              Songs folder
settings.showFolder          Show folder
settings.version             howl · Tune Toy · v{version}
mic.denied.mac               Allow the mic in System Settings → Privacy → Microphone.
mic.openSettings             Open settings
save.retrying                Couldn't save. Trying again…
file.wontOpen                That song file won't open.
toast.saved                  Saved
```

## 14. Acceptance checklist (Claude Code: tick these before calling the slice done)

Engine and logic (automated, Vitest):
- [ ] Pad note tables for every mood × 5/7 × octave shift match §4.3 (snapshot test).
- [ ] Syllable split tests in §9 pass.
- [ ] Tidy timing, Same tune as (equal and unequal counts), mood transposition, and text-edit remapping have unit tests.
- [ ] `song.json` round-trips through save/load unchanged; `tune.mid` parses back with the right note count and lyrics.

App (manual on Windows touch + macOS trackpad, and a Playwright smoke test that launches the app and makes a song):
- [ ] New song → Say it all → three spoken lines → three lines appear, in order.
- [ ] Type a line, edit a line, delete and undo, reorder.
- [ ] Join and split bits; counts update.
- [ ] Tune: Start → count-in → tap all bits → hear it loop back. Hold makes long notes. Slide makes a bend. Backspace removes the last bit.
- [ ] Two fingers at once behave monophonically.
- [ ] Drag blocks up/down/left/right and resize; can't overlap.
- [ ] Tidy timing, Again, Same tune as…, Next line, Play song all work and undo cleanly.
- [ ] 5/7 notes switch and octave arrows change the pads; colour-note borders show in 7 mode.
- [ ] Mood change transposes tunes and stays in key.
- [ ] Quit and reopen: everything is there. The `.howl` file unzips and contains the 4 files.
- [ ] Open a song file from another folder works.
- [ ] Keyboard map in §10 works on a MacBook.
- [ ] No text under 14px; no all-caps; every button ≥ 48px tall (except chips at 44px).
- [ ] Touch → sound feels instant on the Windows laptop.
- [ ] Windows installer installs per-user without admin; macOS DMG opens (unsigned: right-click → Open).

## 15. Build order (suggested milestones)

Ship something playable early, then deepen. Commit at the end of each.

1. **M1 — Playable core (aim: first hour).** Electron + Vite + React + tokens + fonts; studio shell; Tune screen with hard-coded line "the pine trees whisper my name"; pads + Wolf moon beat + Glass bells; full tapping engine (§6.4 steps 1–11); Hear it.
2. **M2 — Words.** Home, New song sheet, Your lines (type/edit/delete/reorder/syllable fixing), read-aloud, persistence (autosave `.howl`), undo/redo.
3. **M3 — Dictation.** VAD + Whisper worker + bundled model; Say it all and Say more; mic states; New song "Say".
4. **M4 — Depth.** Block editing, Tidy timing, Same tune as…, all moods/sounds/speed, 5/7 notes, octave shift, Play song, Settings sheet, keyboard map, motion polish.
5. **M5 — Ship.** electron-builder installers, app icon, smoke test, acceptance checklist, `RELEASE_NOTES.md` for the slice.

If time is short before a session with her, M1 + M2 (typed lyrics) is a valid thing to test; dictation can follow the same day.
