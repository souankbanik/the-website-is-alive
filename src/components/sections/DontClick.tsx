import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useMagnetic } from '../../hooks/useMagnetic';
import { dontClick } from '../../story/director';
import { pointer } from '../../hooks/input';
import { audio } from '../../audio/engine';
import { game } from '../../store/game';

/** One button. One rule. */
export default function DontClick() {
  const root = useRef<HTMLElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState('');
  const seenAt = useRef(0);
  const done = useRef(false);
  useMagnetic(btn, 0.32, 150);

  useEffect(() => {
    const el = root.current!;
    const timers: number[] = [];
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || seenAt.current) return;
        seenAt.current = performance.now();
        const at = (s: number, fn: () => void) => timers.push(window.setTimeout(() => !done.current && fn(), s * 1000));
        at(11, () => setNote('Good.'));
        at(19, () => {
          setNote('You listen better than the others.');
          game().say('observer', 'most of them click within four seconds.');
        });
        at(28, () => setNote('…but I don’t.'));
        at(30.5, () => autoClick());
      },
      { threshold: 0.6 },
    );
    io.observe(el);

    // it presses itself: a second cursor walks over and clicks
    const autoClick = () => {
      const g = ghost.current;
      const b = btn.current;
      if (!g || !b) return;
      done.current = true;
      const r = b.getBoundingClientRect();
      gsap.set(g, { x: pointer.x + 60, y: pointer.y + 40, opacity: 0 });
      gsap
        .timeline()
        .to(g, { opacity: 1, duration: 0.4 })
        .to(g, { x: r.left + r.width / 2, y: r.top + r.height / 2, duration: 2.1, ease: 'power2.inOut' })
        .to(g, { scale: 0.75, duration: 0.12, ease: 'power2.in' })
        .add(() => {
          b.classList.add('is-pressed');
          audio.click();
        })
        .to(g, { scale: 1, duration: 0.3 })
        .add(() => void dontClick(false, (performance.now() - seenAt.current) / 1000), '+=0.5');
    };
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const onClick = () => {
    if (done.current) return;
    done.current = true;
    btn.current?.classList.add('is-pressed');
    const delay = seenAt.current ? (performance.now() - seenAt.current) / 1000 : 0;
    void dontClick(true, delay);
  };

  return (
    <section className="sec dnc" id="dontclick" ref={root}>
      <div className="sec-label mono">
        <span>05</span>
        <span>Restraint</span>
      </div>
      <div className="dnc-center">
        <p className="mono dnc-kicker">One button. One rule.</p>
        <button className="dnc-btn" ref={btn} data-magnetic onClick={onClick} onPointerEnter={() => audio.hover()}>
          <span className="dnc-fill" aria-hidden="true" />
          <span className="dnc-halo" aria-hidden="true" />
          <span className="dnc-label" data-magnetic-inner>
            DO NOT CLICK
          </span>
        </button>
        <p className="dnc-note display" key={note}>
          {note}
        </p>
      </div>
      <div className="ghost-cursor" ref={ghost} aria-hidden="true">
        <i />
      </div>
    </section>
  );
}
