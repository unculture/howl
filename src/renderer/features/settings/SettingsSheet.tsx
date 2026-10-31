import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { copy } from '../../app/copy';
import { Segmented, Sheet, Toggle } from '../../app/ui';
import { engine } from '../../audio/engine';
import { MicDeniedHelp } from '../words/Mic';
import { useDictation } from '../../speech/dictation';
import { englishVoices, pickVoice, readAloud } from '../../speech/readAloud';
import { setSetting, useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';

const KEY_MAP: Array<[string, string]> = [
  ['Shift + Space', 'Play song or stop'],
  ['Ctrl or Cmd + Z', 'Undo'],
  ['Ctrl or Cmd + Shift + Z', 'Redo'],
  ['Ctrl or Cmd + ,', 'Settings'],
  ['1, 2', 'Words, Tune'],
  ['M', 'Words: start or stop listening'],
  ['Enter', 'Words: edit the line'],
  ['↑ ↓', 'Words: pick a line'],
  ['Alt + ↑ ↓', 'Words: move a line'],
  ['Delete', 'Words: delete a line'],
  ['A S D F G H J K L ;', 'Tune: the pads'],
  ['Z, X', 'Tune: lower, higher'],
  ['Space', 'Tune: start, stop or hear it'],
  ['Backspace', 'Tune: remove the last bit'],
  ['R', 'Tune: again'],
  ['T', 'Tune: tidy timing'],
  ['Enter', 'Tune: next line'],
  ['← →', 'Tune: last line, next line'],
  ['5, 7', 'Tune: 5 notes, 7 notes']
];

function MicTest() {
  const [level, setLevel] = useState<number | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const test = async () => {
    stop.current?.();
    try {
      await window.howl.system.askMic();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      let raf = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(data);
        setLevel(Math.min(1, Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length) * 5));
        raf = requestAnimationFrame(tick);
      };
      tick();
      const finish = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
        setLevel(null);
        stop.current = null;
      };
      const timer = window.setTimeout(finish, 5000);
      stop.current = () => {
        window.clearTimeout(timer);
        finish();
      };
    } catch {
      useDictation.setState({ status: 'nomic' });
    }
  };
  return (
    <>
      {level !== null && <span className="mic-meter" aria-hidden="true"><span style={{ transform: `scaleX(${level})` }} /></span>}
      <button className="btn btn-outline" onClick={() => void test()}>{copy.settings.testMic}</button>
    </>
  );
}

function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(englishVoices);
  useEffect(() => {
    const update = () => setVoices(englishVoices());
    speechSynthesis.addEventListener('voiceschanged', update);
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}

export function SettingsSheet() {
  const settings = useSettings();
  const status = useDictation((s) => s.status);
  const voices = useVoices();
  const [folder, setFolder] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  useEffect(() => {
    void window.howl.files.folder().then(setFolder);
  }, []);
  const close = () => useUi.setState({ settingsOpen: false });
  const voice = pickVoice(voices, settings.voiceURI);
  const listening = status === 'nomic' ? copy.say.nomicStatus : status === 'loading' ? copy.say.loadingStatus : copy.settings.listeningReady;

  if (showKeys) {
    return (
      <Sheet title={copy.settings.keys} onClose={() => setShowKeys(false)}>
        <dl className="key-map">
          {KEY_MAP.map(([key, action]) => (
            <div key={`${key}${action}`} className="key-row">
              <dt className="t-label">{key}</dt>
              <dd className="t-body text-secondary">{action}</dd>
            </div>
          ))}
        </dl>
      </Sheet>
    );
  }

  return (
    <Sheet title={copy.settings.title} onClose={close}>
      <div className="settings">
        <div className="setting-row">
          <label className="t-heading" htmlFor="voice">{copy.settings.voice}</label>
          <select
            id="voice"
            className="select t-label"
            value={voice?.voiceURI ?? ''}
            onChange={(event) => setSetting('voiceURI', event.target.value)}
          >
            {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
          </select>
          <button className="btn btn-tonal" onClick={() => readAloud(voice?.name.split(' ')[0] ?? copy.app.name, 'voice-test')}>
            <Volume2 size="var(--size-icon-sm)" />{copy.new.hear}
          </button>
        </div>
        <div className="setting-row">
          <span className="t-heading">{copy.settings.speed}</span>
          <Segmented
            tone="moonlight"
            value={settings.readingRate}
            options={[
              { value: 0.8, label: copy.settings.slower },
              { value: 0.95, label: copy.settings.normal },
              { value: 1.1, label: copy.settings.faster }
            ]}
            onChange={(value) => setSetting('readingRate', value)}
          />
        </div>
        <div className="setting-row">
          <span className="t-heading">{copy.settings.textSize}</span>
          <Segmented
            tone="moonlight"
            value={settings.textScale}
            options={[
              { value: 0.9, label: 'small' },
              { value: 1, label: 'medium' },
              { value: 1.15, label: 'large' },
              { value: 1.3, label: 'largest' }
            ]}
            onChange={(value) => setSetting('textScale', value)}
          />
        </div>
        <div className="setting-row">
          <span className="t-heading">{copy.settings.noteNames}</span>
          <Toggle label={copy.settings.noteNames} on={settings.noteNames} onChange={(on) => setSetting('noteNames', on)} />
        </div>
        <div className="setting-row">
          <span className="t-heading">{copy.settings.hum}</span>
          <Toggle
            label={copy.settings.hum}
            on={settings.hum}
            onChange={(on) => {
              setSetting('hum', on);
              engine.setHum(on);
            }}
          />
        </div>
        <div className="setting-row">
          <span className="t-heading">{copy.settings.listening}</span>
          <span className="t-body text-secondary" data-testid="listening-status">{listening}</span>
          <span className="flex-1" />
          <MicTest />
        </div>
        <MicDeniedHelp />
        <div className="setting-row">
          <span className="t-heading">{copy.settings.keys}</span>
          <span className="flex-1" />
          <button className="btn btn-outline" onClick={() => setShowKeys(true)}>{copy.settings.keys}</button>
        </div>
        <div className="setting-row">
          <span className="setting-folder">
            <span className="t-heading">{copy.settings.folder}</span>
            <span className="t-caption text-secondary">{folder}</span>
          </span>
          <span className="flex-1" />
          <button className="btn btn-outline" onClick={() => void window.howl.files.showFolder()}>{copy.settings.showFolder}</button>
        </div>
        <p className="t-caption text-tertiary">{copy.settings.version(window.howl.system.version)}</p>
      </div>
    </Sheet>
  );
}
