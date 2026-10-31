import { useEffect, useRef, useState } from 'react';
import { copy } from '../../app/copy';
import { lineState } from '../../music/tune';
import { applyHerCasing, startDictation, stopDictation, useDictation } from '../../speech/dictation';
import { useSong } from '../../store/song';
import { useUi } from '../../store/ui';
import { goToLine, stopAll } from '../tune/controller';
import { LineRow, NewLineRow } from './LineRow';
import { MicDeniedHelp, RecordButton, Waveform, statusCopy } from './Mic';
import { addLine, addLines, deleteLine, moveLine, splitPasted } from './lineActions';

function useListening(onFinished?: (firstNew: string | null) => void) {
  const status = useDictation((s) => s.status);
  const firstNew = useRef<string | null>(null);
  const toggle = async () => {
    if (status === 'listening') {
      await stopDictation();
      onFinished?.(firstNew.current);
      firstNew.current = null;
      return;
    }
    stopAll();
    firstNew.current = null;
    await startDictation({
      onLine: (text) => {
        const lines = useSong.getState().song?.lines.map((line) => line.text) ?? [];
        const id = addLine(applyHerCasing(text, lines));
        firstNew.current ??= id;
      }
    });
  };
  return toggle;
}

function PendingRows() {
  const pending = useDictation((s) => s.pending);
  return (
    <>
      {Array.from({ length: pending }, (_, i) => (
        <div key={i} className="line-pending" data-testid="pending"><span className="shimmer" /></div>
      ))}
    </>
  );
}

function SayItAll({ onType, onDone }: { onType: () => void; onDone: (firstNew: string | null) => void }) {
  const status = useDictation((s) => s.status);
  const lines = useSong((s) => s.song!.lines);
  const toggle = useListening(onDone);
  const words = statusCopy(status);
  const paste = async () => {
    const text = await navigator.clipboard.readText().catch(() => '');
    const parts = splitPasted(text);
    if (parts.length > 0) onDone(addLines(parts)[0]);
  };
  return (
    <div className="say">
      <header className="words-head">
        <h1 className="t-display-l">{copy.say.title}</h1>
        <span className="flex-1" />
        <button className="btn btn-tonal" data-testid="type-instead" onClick={onType}>{copy.say.typeInstead}</button>
        <button className="btn btn-tonal" onClick={() => void paste()}>{copy.say.paste}</button>
      </header>
      <div className="say-transcript">
        {lines.map((line) => <p key={line.id} className="t-lyric-m say-line">{line.text}</p>)}
        <PendingRows />
      </div>
      <div className="say-bottom">
        <RecordButton onClick={() => void toggle()} />
        <div className="say-status">
          <p className="t-title">{words.status}</p>
          {words.hint && <p className="t-body text-secondary">{words.hint}</p>}
          <MicDeniedHelp />
        </div>
        {status === 'listening' && <Waveform />}
      </div>
    </div>
  );
}

function YourLines({ startNew, onDraftClosed }: { startNew: boolean; onDraftClosed: () => void }) {
  const lines = useSong((s) => s.song!.lines);
  const selectedId = useUi((s) => s.selectedLineId);
  const status = useDictation((s) => s.status);
  const [drafting, setDrafting] = useState(startNew);
  const [editingId, setEditingId] = useState<string | null>(null);
  const toggleListening = useListening();
  const list = useRef<HTMLDivElement>(null);

  const selectedIndex = lines.findIndex((line) => line.id === selectedId);
  const select = (id: string | null) => useUi.setState({ selectedLineId: id });

  const makeTune = () => {
    const target = lines.find((line) => line.id === selectedId) ?? lines.find((line) => lineState(line) !== 'complete') ?? lines[0];
    if (!target) return;
    goToLine(target.id);
    useUi.setState({ tab: 'tune' });
  };

  const keys = useRef({ selectedIndex, lines, editingId, drafting, toggleListening });
  keys.current = { selectedIndex, lines, editingId, drafting, toggleListening };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const k = keys.current;
      if (target.closest('input, textarea, .sheet, [role="menu"]') || k.editingId || k.drafting) return;
      if (event.metaKey || event.ctrlKey) return;
      const at = k.selectedIndex;
      if (event.code === 'KeyM') {
        void k.toggleListening();
      } else if (event.code === 'Enter' && at >= 0) {
        event.preventDefault();
        setEditingId(k.lines[at].id);
      } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        event.preventDefault();
        const delta = event.code === 'ArrowUp' ? -1 : 1;
        if (event.altKey && at >= 0) moveLine(at, Math.max(0, Math.min(k.lines.length - 1, at + delta)));
        else {
          const next = k.lines[Math.max(0, Math.min(k.lines.length - 1, at + delta))];
          if (next) select(next.id);
        }
      } else if ((event.code === 'Delete' || event.code === 'Backspace') && at >= 0) {
        event.preventDefault();
        deleteLine(k.lines[at].id);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  useEffect(() => {
    list.current?.querySelector('.line-selected')?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const listening = status === 'listening';
  return (
    <div className="lines-screen">
      <h1 className="t-display-l">{copy.lines.title}</h1>
      <div className="lines-columns">
        <div className="lines-list" ref={list} data-testid="lines">
          {lines.map((line, index) => (
            <LineRow
              key={line.id}
              line={line}
              index={index}
              count={lines.length}
              selected={line.id === selectedId}
              editing={line.id === editingId}
              onSelect={() => select(line.id)}
              onEdit={() => setEditingId(line.id)}
              onEditDone={() => setEditingId(null)}
              listRef={list}
            />
          ))}
          {drafting && <NewLineRow onDone={(id) => { setDrafting(false); onDraftClosed(); if (id) select(id); }} />}
          <PendingRows />
        </div>
        <aside className="lines-side">
          <div className="say-more">
            <RecordButton onClick={() => void toggleListening()} />
            <p className="t-heading">{listening ? copy.say.listeningStatus : copy.lines.sayMore}</p>
            <p className="t-caption text-secondary">{status === 'nomic' ? copy.say.nomicStatus : status === 'loading' ? copy.say.loadingStatus : copy.lines.sayMoreHint}</p>
          </div>
          <button className="btn btn-tonal btn-tall btn-wide" data-testid="type-line" onClick={() => setDrafting(true)}>
            {copy.lines.typeLine}
          </button>
          <span className="flex-1" />
          <button className="btn btn-secondary btn-large btn-wide" data-testid="make-tune" disabled={lines.length === 0} onClick={makeTune}>
            {copy.lines.makeTune}
          </button>
        </aside>
      </div>
    </div>
  );
}

export function WordsScreen() {
  const count = useSong((s) => s.song!.lines.length);
  const [typing, setTyping] = useState(false);
  const [saying, setSaying] = useState(count === 0);
  useEffect(() => {
    if (count === 0 && !typing) setSaying(true);
  }, [count, typing]);

  if (saying) {
    return (
      <SayItAll
        onType={() => { setTyping(true); setSaying(false); }}
        onDone={(firstNew) => {
          if (useSong.getState().song?.lines.length) {
            setSaying(false);
            if (firstNew) useUi.setState({ selectedLineId: firstNew });
          }
        }}
      />
    );
  }
  return <YourLines startNew={typing} onDraftClosed={() => setTyping(false)} />;
}
