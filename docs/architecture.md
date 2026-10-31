# Architecture

**Status:** decided for slice 1; revisit at the start of each slice.

## Goals that drive the choices

1. **Installable desktop app**, Windows 11 first (her touch-screen convertible), macOS second. iOS/Android later.
2. **Dictation is essential**, must be reliable, and should keep a child's voice on the device.
3. **Audio must feel instant** on touch (pad → sound under ~20ms).
4. **Files she owns**: songs are ordinary files in a visible folder, survive reinstalls, and open elsewhere.
5. **Fast iteration** in slices with an AI coding agent.

## Decisions

### Electron + React + TypeScript (not Tauri, not a web page)

- Electron bundles one Chromium everywhere, so Web Audio timing, `speechSynthesis`, WebGPU/WASM and pointer events behave the same on her Windows laptop and a MacBook. Tauri uses the OS webview (WebView2 / WKWebView), which differs in audio latency and mic handling and adds a Rust toolchain.
- The trade-off is a ~150 MB installer. Acceptable.
- **Mobile later:** keep all UI and music logic in plain React/TypeScript modules with no Electron imports outside `src/main` and `src/preload`. That code can later be wrapped with Capacitor for iOS/Android, with a different dictation backend behind the same interface.

### Dictation: local Whisper, not the Web Speech API

- Chromium's `webkitSpeechRecognition` does **not** work in Electron (it relies on Google's cloud service and API keys that Electron doesn't ship). Windows' own voice typing (Win+H) can't give us pause-based line breaks or work inside our custom UI reliably.
- So: **Silero VAD** (`@ricky0123/vad-web`) splits speech at pauses, and **Whisper base.en** via `@huggingface/transformers` transcribes each utterance in a Web Worker (WebGPU when available, WASM otherwise).
- The model (~80 MB quantised) is **bundled** with the app. No network, no account, and her voice never leaves the computer.
- Behind an interface (`DictationEngine` with `start()`, `stop()`, `onUtterance`, `onText`, `onLevel`, `state`) so a mobile or cloud engine can be swapped in later.

### Audio: Tone.js

- Mature scheduling (Transport), synths, effects and MIDI helpers. Pads trigger synths directly at `Tone.now()` (never via the Transport) for minimum latency; drums and playback run on the Transport.
- Context created with `latencyHint: 'interactive'` and a small `lookAhead`.
- All sounds are synthesised in slice 1 (no sample downloads). Sampled instruments can come later as bundled files.

### State: Zustand + Immer, undo via patches

- One store per open song; every user action is a named command that produces Immer patches; undo/redo replays inverse patches. Transient state (playback position, pad pressed, dictation level) lives outside the undo history.

### Files: `.howl` zip of open formats

- See `docs/file-format.md`. All file I/O in the main process behind a typed preload API. Atomic writes with a backup.

## Process layout

```
src/
  main/            Electron main: windows, file I/O, permissions, menus
  preload/         contextBridge API: window.howl.files, window.howl.system
  renderer/
    app/           App shell, routing (Home / Song: Words | Tune), sheets, toasts
    design/        tokens.css import, base styles, components (Button, Pad, NoteBlock…)
    features/
      home/
      words/       Say it all, Your lines, syllable editor
      tune/        roll, pads, tapping engine UI, helpers
      settings/
    music/         pure TS: scales, pad tables, moods, tidy, sameAs, transpose, midi export
    audio/         Tone.js engine: context, synths, drums, drone, transport, playback
    speech/        dictation engine (VAD + worker), read-aloud, syllables
    store/         zustand stores, commands, undo
  workers/
    whisper.worker.ts
resources/
  models/whisper-base.en/   (fetched by `npm run models:fetch`, git-ignored)
  icons/
design/
  tokens.json · tokens.css
```

`music/` and `speech/syllables` must be pure and unit-tested; they hold the logic most likely to have subtle bugs.

## Security and privacy

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for the renderer; a minimal preload API.
- Permission handler allows only `media` (microphone) for the app's own origin.
- No telemetry, no network calls, no auto-update in slice 1.

## Packaging

- `electron-builder`: Windows NSIS (per-user, no admin, x64), macOS DMG (universal or arm64 + x64).
- Unsigned for now. Windows SmartScreen will warn: "More info → Run anyway". macOS: right-click the app → Open the first time. Code signing can be added before sharing with anyone else.
- macOS needs `NSMicrophoneUsageDescription` ("howl listens when you say your song.") in `extendInfo`, and `systemPreferences.askForMediaAccess('microphone')`.
