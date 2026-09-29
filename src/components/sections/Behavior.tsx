import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { pointer, stillFor } from '../../hooks/input';
import { session } from '../../store/session';
import { game } from '../../store/game';
import { audio } from '../../audio/engine';
import { useMagnetic } from '../../hooks/useMagnetic';

type Choice = 'LEFT' | 'STAY' | 'RIGHT';
const CHOICES: Choice[] = ['LEFT', 'STAY', 'RIGHT'];
const ROUNDS = 3;

function ChoiceButton({ c, onPick, setRef }: { c: Choice; onPick: (c: Choice) => void; setRef: (el: HTMLButtonElement | null) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useMagnetic(ref, 0.25, 60);
  return (
    <button
      ref={(el) => {
        ref.current = el;
        setRef(el);
      }}
      className="choice"
      data-magnetic
      onClick={() => onPick(c)}
      onPointerEnter={() => audio.hover()}
    >
      <span className="choice-dot" aria-hidden="true" />
      <span data-magnetic-inner>{c}</span>
    </button>
  );
}

export default function Behavior() {
  const root = useRef<HTMLElement>(null);
  const btns = useRef<Record<Choice, HTMLButtonElement | null>>({ LEFT: null, STAY: null, RIGHT: null });
  const predicted = useRef<Choice>('STAY');
  const active = useRef(false);
  const busy = useRef(false);
  const [round, setRound] = useState(0);
  const roundRef = useRef(0);
  const lastAuto = useRef(0);
  const [result, setResult] = useState<{ text: string; hit: boolean } | null>(null);
  const [hits, setHits] = useState(0);

  useEffect(() => {
    const el = root.current!;
    let said = false;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 60%',
        end: 'bottom 40%',
        onToggle: (s) => {
          active.current = s.isActive;
          if (s.isActive && !said) {
            said = true;
            game().say('observer', 'continue.');
          }
        },
      });
      gsap.fromTo('.beh .tl', { yPercent: 100 }, { yPercent: 0, duration: 1.4, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: el, start: 'top 70%', once: true } });
      gsap.fromTo('.choice', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: 0.1, scrollTrigger: { trigger: '.beh-buttons', start: 'top 85%', once: true } });
    }, el);

    // the site guesses where you're going before you arrive
    const tick = () => {
      if (!active.current || busy.current) return;
      const lookX = pointer.x + pointer.vx * 26;
      const lookY = pointer.y + pointer.vy * 26;
      let best: Choice = 'STAY';
      let bd = Infinity;
      for (const c of CHOICES) {
        const b = btns.current[c];
        if (!b) continue;
        const r = b.getBoundingClientRect();
        const d = Math.hypot(r.left + r.width / 2 - lookX, r.top + r.height / 2 - lookY);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (stillFor() > 1) best = 'STAY';
      if (best !== predicted.current) {
        predicted.current = best;
        for (const c of CHOICES) btns.current[c]?.classList.toggle('is-predicted', c === best);
      }
      // staying still long enough is also a choice
      if (stillFor() > 3.2 && pointer.hasMoved && roundRef.current < ROUNDS && pointer.lastMove !== lastAuto.current) {
        const r = el.getBoundingClientRect();
        if (pointer.y > r.top && pointer.y < r.bottom) {
          lastAuto.current = pointer.lastMove;
          pick('STAY');
        }
      }
    };
    gsap.ticker.add(tick);
    return () => {
      ctx.revert();
      gsap.ticker.remove(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (c: Choice) => {
    if (busy.current || roundRef.current >= ROUNDS) return;
    busy.current = true;
    audio.click();
    const hit = predicted.current === c;
    session.predictionTotal++;
    if (hit) session.predictionHits++;
    setHits((h) => h + (hit ? 1 : 0));
    setResult({ text: hit ? (c === 'STAY' ? 'YOU STAYED. I KNEW YOU WOULD.' : 'I KNEW YOU WOULD.') : 'INTERESTING.', hit });
    if (hit) audio.whisper(0.03);
    btns.current[c]?.classList.add('is-picked');
    setTimeout(() => {
      btns.current[c]?.classList.remove('is-picked');
      const next = roundRef.current + 1;
      roundRef.current = next;
      setRound(next);
      if (next < ROUNDS) {
        setResult({ text: 'AGAIN.', hit: false });
        busy.current = false;
      } else {
        const total = session.predictionHits;
        setResult({ text: total >= 2 ? `${total} / ${ROUNDS}. YOU ARE VERY EASY TO READ.` : `${total} / ${ROUNDS}. YOU ARE HARDER TO READ. I WILL LEARN.`, hit: total >= 2 });
        game().say('observer', total >= 2 ? 'prediction model: confident.' : 'prediction model: adjusting.');
        for (const b of CHOICES) btns.current[b]?.classList.remove('is-predicted');
      }
    }, 1500);
  };

  return (
    <section className="sec beh" id="behavior" ref={root}>
      <div className="sec-label mono">
        <span>03</span>
        <span>Behavior</span>
      </div>
      <h2 className="display">
        <span className="tl-mask">
          <span className="tl">I think I know</span>
        </span>
        <span className="tl-mask">
          <span className="tl">
            <em>what you will do next.</em>
          </span>
        </span>
      </h2>
      <p className="body beh-lead">Choose one. Or don’t — that is also a choice.</p>
      <div className="beh-buttons">
        {CHOICES.map((c) => (
          <ChoiceButton key={c} c={c} onPick={pick} setRef={(el) => (btns.current[c] = el)} />
        ))}
      </div>
      <div className="beh-meta mono">
        <span className={`beh-result ${result?.hit ? 'is-hit' : ''}`} key={result?.text}>
          {result?.text ?? 'WAITING FOR YOU.'}
        </span>
        <span className="beh-score">
          ROUND {Math.min(round + 1, ROUNDS)}/{ROUNDS} · PREDICTED {hits}
        </span>
      </div>
    </section>
  );
}
