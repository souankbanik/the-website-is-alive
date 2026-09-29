import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store/game';
import { audio } from '../audio/engine';

/** Big directed lines. Serif for emotion, mono when the site speaks. */
export default function Captions() {
  const caption = useGame((s) => s.caption);
  const [shown, setShown] = useState('');
  const timer = useRef(0);

  useEffect(() => {
    clearInterval(timer.current);
    if (!caption) return;
    if (caption.kind.startsWith('mono') || caption.kind === 'tiny') {
      // the site types
      let i = 0;
      setShown('');
      timer.current = window.setInterval(() => {
        i++;
        setShown(caption.text.slice(0, i));
        if (caption.text[i - 1] !== ' ') audio.type();
        if (i >= caption.text.length) clearInterval(timer.current);
      }, caption.kind === 'tiny' ? 70 : 32);
    } else setShown(caption.text);
    return () => clearInterval(timer.current);
  }, [caption]);

  if (!caption) return null;
  const serif = !caption.kind.startsWith('mono') && caption.kind !== 'tiny';
  return (
    <div className={`caption caption-${caption.kind} caption-pos-${caption.pos}`} key={caption.id} role="status" aria-live="polite">
      {serif ? (
        <span className="caption-inner">
          {caption.text.split(' ').map((w, i) => (
            <span className="cw" key={i} style={{ animationDelay: `${i * 0.07}s` }}>
              {w}&nbsp;
            </span>
          ))}
        </span>
      ) : (
        <span className="caption-inner">
          {shown}
          <span className="caret" />
        </span>
      )}
    </div>
  );
}
