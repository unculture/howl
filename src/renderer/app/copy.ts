import type { Mood, SoundId } from '../../shared/song';

// The copy deck from the slice spec, section 13. Every string on screen comes from here.
export const copy = {
  app: { name: 'howl' },
  home: {
    title: 'My songs', newSong: '+ New song', openFile: 'Open a song file', settings: 'Settings',
    empty: 'Your songs will live here.',
    meta: (n: number, date: string) => `${n} lines · ${date}`,
    rename: 'Rename', showFile: 'Show file', delete: 'Delete',
    deleteTitle: (name: string) => `Delete ${name}?`,
    deleteBody: 'It goes to the bin, so you can get it back.', deleteConfirm: 'Delete', deleteCancel: 'Keep it'
  },
  new: {
    title: 'New song', nameLabel: 'Song name', namePlaceholder: 'Name your song', say: 'Say', hear: 'Hear',
    moodLabel: 'Pick a mood', start: 'Start writing →'
  },
  song: { untitled: 'Untitled song' },
  bar: { backAria: 'My songs', play: 'Play song', stop: 'Stop', undo: 'Undo', settings: 'Settings' },
  rail: { words: 'Words', tune: 'Tune' },
  say: {
    title: 'Say it all', typeInstead: 'Type instead', paste: 'Paste',
    idleStatus: 'Ready when you are', idleHint: 'Tap and say your song. Pause to start a new line.',
    listeningStatus: 'Listening…', listeningHint: 'Pause to start a new line. Tap to stop.',
    finishingStatus: 'Writing it down…',
    loadingStatus: 'Getting ready to listen…', loadingHint: 'This takes a few seconds the first time.',
    nomicStatus: "Can't hear the mic", nomicHint: "Check it's plugged in, or type instead."
  },
  lines: {
    title: 'Your lines', edit: 'Edit', bits: (n: number) => `${n} bits to sing`,
    fixHint: 'Tap a dot to join. Tap a bit to split it.',
    sayMore: 'Say more', sayMoreHint: 'Pause to start a new line', typeLine: 'Type a line', makeTune: 'Make the tune →',
    deleted: 'Line deleted · Undo', delete: 'Delete'
  },
  tune: {
    title: (n: number) => `Line ${n}`, speed: 'Speed', slow: 'slow', fast: 'fast', reset: 'Reset',
    sound: (sound: string) => `Play it as: ${sound}`,
    start: '▶ Start', startCaption: 'Then tap a pad for each bit',
    hintReady: 'Tap Start, then a pad for each bit', hintCountIn: 'Get ready…',
    hintTapping: 'Tap a pad to sing the glowing bit', hintFinish: 'Finish the tune from the glowing bit',
    holdHint: 'Hold for a long note', stop: 'Stop', startAgain: 'Start line again', hearIt: '▶ Hear it', again: 'Again',
    tidy: 'Tidy timing', tidied: 'Timing tidied · Undo', sameAs: 'Same tune as…',
    sameAsItem: (n: number, words: string) => `Line ${n} · ${words}…`,
    next: 'Next line →', carryOn: '▶ Carry on', playSong: 'Play song', notes5: '5 notes', notes7: '7 notes',
    needTune: 'Make a tune first'
  },
  settings: {
    title: 'Settings', voice: 'Reading voice', speed: 'Reading speed', slower: 'Slower', normal: 'Normal', faster: 'Faster',
    textSize: 'Text size', noteNames: 'Show note names', hum: 'Background hum', listening: 'Listening',
    listeningReady: 'Ready', testMic: 'Test the mic', keys: 'Show keys', folder: 'Songs folder', showFolder: 'Show folder',
    version: (v: string) => `howl · Tune Toy · v${v}`
  },
  mic: { deniedMac: 'Allow the mic in System Settings → Privacy → Microphone.', openSettings: 'Open settings' },
  save: { retrying: "Couldn't save. Trying again…" },
  file: { wontOpen: "That song file won't open." },
  toast: { saved: 'Saved' }
} as const;

export const MOOD_COPY: Record<Mood, { name: string; description: string }> = {
  wolfMoon: { name: 'Wolf moon', description: 'big, wild drums' },
  snowfall: { name: 'Snowfall', description: 'soft and slow' },
  bonfire: { name: 'Bonfire', description: 'warm and cosy' },
  running: { name: 'Running', description: 'fast and bright' }
};

export const SOUND_COPY: Record<SoundId, string> = {
  glassBells: 'Glass bells', softKeys: 'Soft keys', breathy: 'Breathy'
};
