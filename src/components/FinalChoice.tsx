import { useRef } from 'react';
import { useGame } from '../store/game';
import { choose } from '../story/director';
import { useMagnetic } from '../hooks/useMagnetic';
import { audio } from '../audio/engine';

function Option({ label, sub, onPick }: { label: string; sub: string; onPick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useMagnetic(ref, 0.28, 80);
  return (
    <button ref={ref} className="final-opt" data-magnetic onClick={onPick} onPointerEnter={() => audio.hover()}>
      <span data-magnetic-inner className="final-label">
        {label}
      </span>
      <span className="final-sub mono">{sub}</span>
    </button>
  );
}

export default function FinalChoice() {
  const unlocked = useGame((s) => s.observerUnlocked);
  const pick = (c: 'delete' | 'live' | 'observer') => {
    audio.click();
    void choose(c);
  };
  return (
    <div className="final">
      <div className="final-row">
        <Option label="DELETE" sub="end the process" onPick={() => pick('delete')} />
        <span className="final-sep" aria-hidden="true" />
        <Option label="LET IT LIVE" sub="restore the interface" onPick={() => pick('live')} />
      </div>
      {unlocked && (
        <button className="final-secret mono" onClick={() => pick('observer')}>
          neither. i was only watching.
        </button>
      )}
    </div>
  );
}
