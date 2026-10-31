# CLAUDE.md — howl

howl is a desktop songwriting app for an 11-year-old dyslexic girl with no musical training. She writes lyrics; the app helps her turn them into songs **without ever taking the song away from her**. Built slice by slice; she tests each slice.

## Read before doing anything

1. `docs/product.md` — who it's for and the non-negotiables.
2. `docs/design-system/README.md` + `design/tokens.json` — the visual, motion and writing rules. **Use tokens only; never hard-code colours, sizes, radii, durations or fonts.**
3. `docs/architecture.md` — stack and structure (Electron + React + TS, Tone.js, local Whisper).
4. The current slice spec: `docs/specs/slice-1-tune-toy.md`. It is the source of truth for behaviour and copy.
5. Visual references: `docs/wireframes/*.png`.

## Rules

- **The song is hers.** Never add features that generate lyrics or melodies for her. Help may only offer, transform or play back her own material, and only when she taps.
- **Copy:** use the exact strings in the spec's copy deck. Sentence case, no ALL CAPS, no exclamation marks, no emoji. If you need a new string, keep it to 1–2 words for labels and one short sentence for hints, and add it to the copy deck.
- **Accessibility floors:** text ≥ 14px (lyrics ≥ 20px), contrast ≥ 4.5:1 (`--color-text-tertiary` is the dimmest text allowed), touch targets ≥ 48px, every piece of her text has read-aloud, everything works by keyboard, nothing depends on hover, respect `prefers-reduced-motion`.
- **Scope:** build only what the current slice spec lists. Don't add disabled stubs for later features.
- **No network at runtime.** Fonts, models and sounds are bundled.
- **Pure logic is tested:** `src/renderer/music/**` and syllable splitting need Vitest tests.
- **Design changes:** if the spec or design system is wrong or missing something, make the smallest sensible choice, then record it in `docs/decisions.md` (date, what, why) so the designer can review it.
- Commit at the end of each milestone (spec §15) with a clear message.

## Commands (to be filled in by the first coding session)

```
npm install
npm run models:fetch     # downloads Whisper base.en into resources/models (not committed)
npm run dev              # run the app
npm test                 # vitest
npm run build:win        # Windows installer
npm run build:mac        # macOS dmg
node scripts/build-tokens.mjs   # regenerate design/tokens.css from tokens.json
```

## Repo map

```
CLAUDE.md                 this file
README.md                 for humans
design/tokens.json        design tokens (source of truth)
design/tokens.css         generated CSS variables + text classes
docs/product.md           product brief and notes
docs/roadmap.md           slices, first test, open questions, session notes
docs/architecture.md      stack and structure
docs/file-format.md       the .howl song file
docs/design-system/       design system
docs/specs/               one spec per slice
docs/wireframes/          PNG exports from the Paper file
scripts/                  build-tokens.mjs
```
