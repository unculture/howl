# Decisions log

Small design or implementation decisions made while building, for the designer to review. Newest first.

| Date | Decision | Why | Status |
| --- | --- | --- | --- |
| 2026-10-31 | Syllables are called "bits" in the UI ("9 bits to sing", "the glowing bit") | Shorter and friendlier than "syllables"; consistent everywhere | Agreed |
| 2026-10-31 | 5 notes / 7 notes switch lives on the pad row, not in Settings | Requested: keep it close to the pads | Agreed |
| 2026-10-31 | Dictation uses local Whisper, not the Web Speech API | Web Speech recognition doesn't work in Electron; keeps her voice on the device | Agreed |
