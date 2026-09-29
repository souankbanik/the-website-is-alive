import { useEffect, useState } from 'react';
import { useGame } from '../store/game';
import { audio } from '../audio/engine';

/** A minimal voice, bottom-left. It starts with system language and loses it. */
function Line({ who, text, old }: { who: string; text: string; old: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      setN(i);
      if (i % 2 === 0) audio.type();
      if (i >= text.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [text]);
  return (
    <div className={`log-line ${old ? 'is-old' : ''}`}>
      <span className={`log-who who-${who}`}>[{who}]</span>
      <span className="log-text">{text.slice(0, n)}</span>
    </div>
  );
}

export default function ObserverLog() {
  const lines = useGame((s) => s.lines);
  const stage = useGame((s) => s.stage);
  const [, force] = useState(0);

  // lines quietly expire
  useEffect(() => {
    if (!lines.length) return;
    const id = setTimeout(() => {
      useGame.setState((s) => ({ lines: s.lines.slice(1) }));
      force((x) => x + 1);
    }, 9000);
    return () => clearTimeout(id);
  }, [lines]);

  const top = stage !== 'page' && stage !== 'intro';
  return (
    <div className={`observer-log ${top ? 'is-top' : ''}`} aria-live="polite">
      {lines.map((l, i) => (
        <Line key={l.id} who={l.who} text={l.text} old={i < lines.length - 1} />
      ))}
    </div>
  );
}
