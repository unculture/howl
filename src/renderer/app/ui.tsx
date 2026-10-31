import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';

export function Segmented<T extends string | number>({ value, options, onChange, tone = 'aurora' }: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  tone?: 'aurora' | 'moonlight';
}) {
  return (
    <div className={`segmented segmented-${tone}`} role="radiogroup">
      {options.map((option) => (
        <button
          key={String(option.value)}
          role="radio"
          aria-checked={value === option.value}
          className={`segment t-label${value === option.value ? ' segment-on' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ title, onClose, children, closeLabel = 'Close' }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
}) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return (
    <div className="sheet-wrap">
      <div className="scrim" onPointerDown={onClose} />
      <div className="sheet" role="dialog" aria-label={title}>
        <header className="sheet-head">
          <h2 className="t-display-l">{title}</h2>
          <button className="btn-icon" aria-label={closeLabel} onClick={onClose}><X /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button className={`toggle${on ? ' toggle-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span className="toggle-knob" />
    </button>
  );
}
