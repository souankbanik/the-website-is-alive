import { useEffect, useRef } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGame } from '../store/game';
import { session } from '../store/session';
import { scroller } from '../utils/scroll';
import { engine } from '../gameplay/engine';
import Hero from './sections/Hero';
import Observation from './sections/Observation';
import Memory from './sections/Memory';
import Behavior from './sections/Behavior';
import Corrupted from './sections/Corrupted';
import DontClick from './sections/DontClick';

const INDEX = [
  ['00', 'Entry', '#hero'],
  ['01', 'Observation', '#observation'],
  ['02', 'Memory', '#memory'],
  ['03', 'Behavior', '#behavior'],
  ['04', '—', '#corrupted'],
  ['05', 'Restraint', '#dontclick'],
];

function Scrollbar() {
  const thumb = useRef<HTMLDivElement>(null);
  const locked = useGame((s) => s.scrollLocked);
  useEffect(() => {
    let rogue = 0;
    let rv = 0;
    const tick = () => {
      const l = scroller.lenis;
      const el = thumb.current;
      if (!l || !el) return;
      const vh = innerHeight;
      const doc = document.documentElement.scrollHeight;
      const h = Math.max(40, (vh / doc) * (vh - 32));
      let p = l.progress || 0;
      if (scroller.rogue) {
        // the scrollbar stops telling the truth
        rv += (Math.random() - 0.5) * 0.02;
        rv *= 0.94;
        rogue = Math.max(-p, Math.min(1 - p, rogue + rv));
      } else rogue *= 0.9;
      p += rogue;
      el.style.height = `${h}px`;
      el.style.transform = `translate3d(0, ${p * (vh - 32 - h)}px, 0)`;
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);
  return (
    <div className={`scrollbar ${locked ? 'is-locked' : ''}`} aria-hidden="true">
      <div className="scrollbar-thumb" ref={thumb} />
      <div className="scroll-lock-badge mono">SCROLL LOCKED</div>
    </div>
  );
}

function SectionIndex() {
  const refs = useRef<HTMLButtonElement[]>([]);
  const chaseDone = useGame((s) => s.chaseDone);
  useEffect(() => {
    const id = setInterval(() => {
      let best = 0;
      let bd = Infinity;
      INDEX.forEach(([, , sel], i) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + Math.min(r.height, innerHeight) / 2 - innerHeight / 2);
        if (r.top < innerHeight * 0.6 && d < bd) {
          bd = d;
          best = i;
        }
      });
      refs.current.forEach((b, i) => b?.classList.toggle('is-active', i === best));
    }, 150);
    return () => clearInterval(id);
  }, []);
  return (
    <nav className="section-index" aria-label="Sections">
      {INDEX.filter((_, i) => i < 5 || chaseDone).map(([n, label, sel], i) => (
        <button
          key={n}
          ref={(el) => void (el && (refs.current[i] = el))}
          onClick={() => !useGame.getState().scrollLocked && scroller.lenis?.scrollTo(sel, { duration: 1.6 })}
        >
          <span className="mono">{n}</span>
          <span className="si-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function ScrollPage() {
  const chaseDone = useGame((s) => s.chaseDone);

  useEffect(() => {
    window.scrollTo(0, 0);
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.95, touchMultiplier: 1.2 });
    scroller.lenis = lenis;
    lenis.on('scroll', (l: Lenis) => {
      ScrollTrigger.update();
      session.scrollDistance += Math.abs(l.velocity);
      if (l.direction === 1) session.scrollDir = 'DOWN';
      else if (l.direction === -1) session.scrollDir = 'UP';
    });
    const raf = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(raf);
    requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
      scroller.lenis = null;
      ScrollTrigger.getAll().forEach((t) => t.kill());
      engine.ambient = 'none';
    };
  }, []);

  useEffect(() => {
    if (chaseDone) requestAnimationFrame(() => ScrollTrigger.refresh());
  }, [chaseDone]);

  return (
    <>
      <div className="page-filter">
        <div className="page-stage">
          <main className="page-root">
            <Hero />
            <Observation />
            <Memory />
            <Behavior />
            <Corrupted />
            {chaseDone && <DontClick />}
          </main>
        </div>
      </div>
      <Scrollbar />
      <SectionIndex />
    </>
  );
}
