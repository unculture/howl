# Decisions log

Small design or implementation decisions made while building, for the designer to review. Newest first.

| Date | Decision | Why | Status |
| --- | --- | --- | --- |
| 2026-10-31 | Pads start sound at the audio clock's current time (`Tone.immediate()`), not `Tone.now()`. Context `lookAhead` is 0.05 rather than the spec's 0.01 | `Tone.now()` adds the look-ahead to every press. With pads bypassing it, the beat can keep a safe look-ahead (0.01 with a 0.02 update interval would make drums jitter) and pads still get zero added delay | For review |
| 2026-10-31 | Reverb is `Tone.Reverb` shared per sound; Chromium's autoplay policy is switched off | Sharing saves CPU on her laptop, and the first tap should never be silent | For review |
| 2026-10-31 | A tap up to a quarter beat before the downbeat counts as on it | Children anticipate the first beat; losing that tap feels broken. Other count-in taps sound but don't record | For review |
| 2026-10-31 | If a take reaches the end of bar 8 with bits left, what she has is kept and the line becomes Needs finishing. Carry on resumes at the next bar line, growing past 8 bars if it must | Spec caps growth at 8 bars but doesn't say what happens next. Her notes should never be thrown away by a timer | For review |
| 2026-10-31 | Pads shrink below the 72px minimum width at the smallest window (about 66px at 1024 wide), roll and pads flex down on short screens (min 180 / 88px), and the window minimum is clamped to the screen's work area | 10 × 72 plus arrows doesn't fit 1024. A 1080p convertible at 150% scale has only about 672px of height, under the 700 minimum, and controls must not fall off screen | For review |
| 2026-10-31 | Added size and opacity tokens (0.1.1) for values the spec names but tokens lacked | Tokens-only rule; nothing is hard-coded in CSS | For review |
| 2026-10-31 | Switching 7 notes → 5 notes leaves existing notes as they are, drawn on the nearest row | They're still in key, and changing her tune unasked breaks "the song is hers" | For review |
| 2026-10-31 | CI also launches the packaged Windows app and taps a tune before publishing (extra step beyond the brief), with screenshots uploaded | Nobody can test on Windows before she does; a build that can't start must not replace the last good one | For review |
| 2026-10-31 | Own small MIDI writer rather than `@tonejs/midi` for `tune.mid` (`@tonejs/midi` still parses it in tests) | The file format requires type 0 with lyric events | For review |
| 2026-10-31 | Syllables are called "bits" in the UI ("9 bits to sing", "the glowing bit") | Shorter and friendlier than "syllables"; consistent everywhere | Agreed |
| 2026-10-31 | 5 notes / 7 notes switch lives on the pad row, not in Settings | Requested: keep it close to the pads | Agreed |
| 2026-10-31 | Dictation uses local Whisper, not the Web Speech API | Web Speech recognition doesn't work in Electron; keeps her voice on the device | Agreed |
