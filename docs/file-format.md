# The `.howl` song file

A `.howl` file is a **zip** of open formats, so a song survives the app being deleted and can be opened by hand.

| Inside | Format | Since | Contents |
| --- | --- | --- | --- |
| `song.json` | JSON (`formatVersion`) | slice 1 | The whole project (see the `Song` type in `docs/specs/slice-1-tune-toy.md` §3) |
| `lyrics.txt` | UTF-8 text | slice 1 | One lyric line per line |
| `tune.mid` | Standard MIDI file, type 0 | slice 1 | Her melody with lyric events; opens in GarageBand or any music app |
| `README.txt` | text | slice 1 | A note explaining the file |
| `takes/*.flac` | FLAC | later | Her recorded vocals and hums |
| `cover.png` | PNG 3000×3000 | later | Cover art |
| `mix.mp3` | MP3 | later | A playable copy of the latest mix |

## Rules

- Songs live in `Documents/howl/` — visible, not hidden app storage.
- Writes are atomic (`.tmp` then rename) and the previous version is kept as `.howl.bak`.
- `formatVersion` increases when the schema changes. The app must open every older version (migrate on load) and refuse newer versions politely without touching the file.
- Unknown files inside the zip are preserved on save (forward compatibility).
- "Save a version" (later slice) writes dated copies beside the song: `{name} · 2026-10-31 14.05.howl`.
- No accounts are needed. Sync can be layered on later using the same files.
