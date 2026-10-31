# Decisions log

Small design or implementation decisions made while building, for the designer to review. Newest first.

| Date | Decision | Why | Status |
| --- | --- | --- | --- |
| 2026-10-31 | The installed app gets 10 plain launches to Home in CI, not the full flow. The full flow runs on the unpacked build | Playwright's launch hung 5 times in 5 against the installed app, cause not found. Plain launches show what she would see | For review |
| 2026-10-31 | The launch check retries Playwright's Electron launch, up to 5 tries of 30 seconds | On Windows, Playwright's launch hung 2 times in 8 while plain launches of the same build hung 0 times in 30, so it is a harness race. The check still reopens the app with a plain launch and no retries | For review |
| 2026-10-31 | Has tune · playing shows a Stop button where Hear it sits when stopped, using the deck's `tune.stop` | The spec's row has no Stop for this state and the loop runs "until Stop", so on touch she could only stop it by leaving the line | For review |
| 2026-10-31 | The launch check reopens the app as a plain launch, driven from outside over the DevTools protocol | The in-app test harness hung on a second launch on Windows, which can't tell a harness problem from a hang she would see | For review |
| 2026-10-31 | Dictation runs on WASM only for now, not WebGPU | Spec says WebGPU when available. Whisper's q8 models are poorly supported on WebGPU and a GPU driver crash is the bigger risk for a first test. WASM met the 3 second target in testing. Revisit with fp32 models | For review |
| 2026-10-31 | Whisper uses at most half the CPU cores (max 4) | Leaves room for the beat and pads while a line is being written down | For review |
| 2026-10-31 | Known mishearings ("Thank you.", "you", etc.) are dropped whenever the whole utterance matches, at any length, and short utterances are otherwise kept | The spec's "< 1.0 s or the text is one of" read literally would drop any short real line such as "the moon" | For review |
| 2026-10-31 | Any request to the network is refused by the app itself, and the launch check fails if one is attempted | The strongest way to keep "no network at runtime" true, and to catch hidden CDN loads on every build | For review |
| 2026-10-31 | "1 line" and "1 bit to sing" are singular, beyond the deck's "{n} lines" and "{n} bits to sing" | "1 lines" reads as a mistake, which costs a dyslexic reader extra | For review |
| 2026-10-31 | Tapping outside an edit field saves the text; only Escape cancels | Spec covers Enter and Escape but not blur; losing typed words would be worse | For review |
| 2026-10-31 | Text size labels are small / medium / large / largest without "Aa", and aren't in the copy deck | Spec lists "Aa small / medium / large / largest" in §6.6 only; "Aa" adds nothing when read aloud | For review |
| 2026-10-31 | Settings uses a native select for the reading voice | Spec asks for a menu; native handles long voice lists, keyboard and touch without new UI | For review |
| 2026-10-31 | Importing a song whose id is already in the folder keeps both, with a new id for the copy | Spec's name-clash rule doesn't cover the same song arriving twice; overwriting could lose work | For review |
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
