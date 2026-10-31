import { Mic, Square } from 'lucide-react';
import { copy } from '../../app/copy';
import { useDictation } from '../../speech/dictation';

export function RecordButton({ onClick }: { onClick: () => void }) {
  const status = useDictation((s) => s.status);
  const listening = status === 'listening';
  const disabled = status === 'loading' || status === 'nomic' || status === 'finishing';
  return (
    <div className={`record-wrap${status === 'finishing' ? ' record-finishing' : ''}`}>
      <button
        className={`record${listening ? ' record-on' : ''}`}
        disabled={disabled}
        data-testid="record"
        aria-label={listening ? copy.bar.stop : copy.say.title}
        onClick={onClick}
      >
        {listening ? <Square fill="currentColor" /> : <Mic />}
      </button>
    </div>
  );
}

const BARS = [0.5, 0.8, 1, 0.7, 0.9, 0.6, 1, 0.75, 0.55, 0.85];

export function Waveform() {
  const level = useDictation((s) => s.level);
  const speaking = useDictation((s) => s.speaking);
  return (
    <div className={`wave${speaking ? ' wave-on' : ''}`} aria-hidden="true">
      {BARS.map((scale, i) => (
        <span key={i} className="wave-bar" style={{ transform: `scaleY(${Math.max(0.08, Math.min(1, level * 4 * scale))})` }} />
      ))}
    </div>
  );
}

export function statusCopy(status: string): { status: string; hint: string } {
  switch (status) {
    case 'listening': return { status: copy.say.listeningStatus, hint: copy.say.listeningHint };
    case 'finishing': return { status: copy.say.finishingStatus, hint: '' };
    case 'loading': return { status: copy.say.loadingStatus, hint: copy.say.loadingHint };
    case 'nomic': return { status: copy.say.nomicStatus, hint: copy.say.nomicHint };
    default: return { status: copy.say.idleStatus, hint: copy.say.idleHint };
  }
}

export function MicDeniedHelp() {
  const denied = useDictation((s) => s.micDeniedByOs);
  if (!denied) return null;
  return (
    <div className="mic-help">
      {window.howl.system.platform === 'darwin' && <p className="t-caption text-secondary">{copy.mic.deniedMac}</p>}
      <button className="btn btn-outline" onClick={() => void window.howl.system.openMicSettings()}>{copy.mic.openSettings}</button>
    </div>
  );
}
