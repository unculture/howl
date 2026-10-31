# howl — product brief and design notes

howl is a songwriting app for one particular 11-year-old: she writes lyrics, loves artists like Aurora ("Run With the Wolves"), has no musical training, and is dyslexic (a good reader for whom reading costs effort). Her main device is a Windows touch-screen convertible; it should also work on a MacBook with keyboard and trackpad. iOS and Android may follow.

This file collects the product decisions made so far. The live, commentable version of these notes is the Claude doc "howl — design notes"; this file is the copy that travels with the code.

## Non-negotiables

1. **The song stays hers.** The app never writes lyrics or melodies for her. Presets give her good-sounding building blocks (sounds, drum grooves, chords in a key); words and tune only ever come from her — typed, said, tapped or hummed. AI helps by offering, transforming or playing back *her* material, always optionally.
2. **Not a toy, not kidsy.** "Cool 13-year-old", grown-up dark aesthetic (Midnight Fjord). No cartoon art, no butterflies or bunnies unless she asks.
3. **Simpler than GarageBand**, but deep enough to make something she's proud of.
4. **Dyslexia-friendly everywhere.** Lexend, read-aloud on all text, dictation on all text input, few words, no all-caps.
5. **Words first.** She starts from words and impressions; tune and rhythm come after and need support.
6. **Portable, recoverable files.** Songs are files she owns (see `file-format.md`).

## How the full app fits together

```
My songs → New song → Studio (tabs in any order) → Share
                       ├─ Song (map of parts × layers)
                       ├─ Words: Say it all → Sort your lines → Write
                       ├─ Tune   (tap / say / hum / draw)
                       ├─ Beat   (grooves → step grid)
                       ├─ Backing (chords named by feeling, sounds, background)
                       ├─ Voice  (sing it myself / guide voice / none)
                       ├─ Mix    (one slider per layer, "sound like…")
                       └─ Cover  (her drawing or photo, styled)
```

Wireframes for all of it are in `docs/wireframes/` and in the Paper file *Songwriting App — Mood Directions* (page **Wireframes**). Slice 1 screens are on the page **Tune Toy (slice 1)**.

## The key interaction: each tap sings the next bit

Her words set the order, so she only decides **when** each bit (syllable) lands and **how high** it is — one tap answers both.

- Each line is split into bits automatically ("whis·per"); she can fix splits.
- A beat loops. Each tap on a pad sings the glowing bit: the pad sets the pitch, the moment sets the rhythm. Notes appear as blocks with the bit written inside.
- Hold = long note. Slide while holding = one bit bends over several notes. Same pad twice = repeated note.
- Fix by dragging blocks. Helpers transform her material only: Hear it, Tidy timing, Same tune as line N.
- Later modes for when the tune isn't in her head yet: **Say** (speak the line in time → rhythm), **Hum** (→ rhythm + pitch), **Draw** (finger curve → shape).
- 10 pads on a 5-note scale (nothing can clash), two octaves; a **5 notes / 7 notes** switch right on the pad row unlocks the full scale.

## Words first

- **Say it all:** one big record button; speech streams in; a pause starts a new line.
- **Sort your lines** (later slice): app groups lines into parts by repeats ("These lines come back 3 times. Make them the chorus?"); drag between parts; tap between words to split; unwanted lines go to **Spare lines**, never deleted.
- **Write:** line-by-line with read-aloud and a mic for the next line. Ideas offers rhymes and other words only — never lines.

## Screen notes (moved off the wireframes)

| Screen | Note |
| --- | --- |
| My songs | Scraps are quick lines or hums caught outside a song. "Open a song file" imports from another computer. |
| New song | Mood sets starting sounds, speed and scale. "Feel" (moody/bright/dreamy) stands in for key. Mood cards preview on tap. |
| Song map | Grid of layers × parts instead of a timeline: no zooming, no bar numbers. |
| Write | Read-aloud highlights each word. Spelling help is quiet, never red squiggles. Aa sets text size. |
| Beat | Grooves are starting points. Drums named by sound (Boom, Clap, Tick, Shaker). Busy = density; Bounce = swing. |
| Backing | Chords named by feeling (Home, Hopeful, Lonely, Lifting); real names only if enabled. Background sounds carry the atmosphere. |
| Voice | The guide voice is the only place the app sings, and only her words on her tune, labelled as a stand-in. Pitch help off by default; always a count-in. |
| Mix | One slider per layer, no EQ. "Even it out" balances; "Sound like…" adds space in one tap. |
| Cover | Style filters transform her drawing or photo; nothing drawn from scratch by AI. Grown-up styles only. |
| Share | MP3 with title/artist/cover, printable lyric sheet, and the song file. |

## How we're building it

Slice by slice, with her testing each one and helping shape the next. See `roadmap.md`.
