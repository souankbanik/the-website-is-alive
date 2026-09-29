import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGame } from '../store/game';
import { credits } from '../story/director';
import { audio } from '../audio/engine';
import { world } from '../scenes/world';
import { session } from '../store/session';

const SECRET_TEXT: Record<string, string> = {
  still: 'kept still when asked',
  restraint: 'never pressed the button',
  glyph: 'found the glyph',
  'exit-first': 'destroyed the exit first',
  edge: 'tried to leave through the edge',
};

function LiveEnding() {
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const el = root.current!;
    // the interface rebuilds itself, letter by letter
    gsap.fromTo(
      el.querySelectorAll('.re-char'),
      { opacity: 0, x: () => gsap.utils.random(-300, 300), y: () => gsap.utils.random(-200, 200), rotate: () => gsap.utils.random(-90, 90) },
      { opacity: 1, x: 0, y: 0, rotate: 0, duration: 2.6, ease: 'expo.out', stagger: { each: 0.05, from: 'random' } },
    );
    gsap.fromTo(el.querySelectorAll('.re-nav span'), { opacity: 0 }, { opacity: 1, duration: 1, stagger: 0.2, delay: 2 });
    const T = (s: number, fn: () => void) => window.setTimeout(fn, s * 1000);
    const ids = [
      T(4.2, () => setStep(1)),
      T(7.4, () => {
        setStep(2);
        audio.corrupt();
        world.glitch(0.7, 0.4);
      }),
      T(9.8, () => {
        setStep(3);
        audio.freeze();
        world.fade = 0;
      }),
      T(12.6, () => {
        setStep(4);
        audio.unfreeze(0.5);
      }),
      T(14.8, () => setStep(5)),
      T(18, () => credits()),
    ];
    return () => ids.forEach(clearTimeout);
  }, []);
  const split = (s: string) => s.split('').map((c, i) => <span className="re-char" key={i}>{c === ' ' ? '\u00A0' : c}</span>);
  return (
    <div className={`ending ending-live step-${step}`} ref={root}>
      {step < 3 && (
        <div className="re-page">
          <div className="re-nav mono">
            <span>ABOUT</span>
            <span>WORK</span>
            <span>CONTACT</span>
          </div>
          <h2 className="re-title display">
            <span>{split('THE WEBSITE')}</span>
            <span className="re-red">
              <em>{split('IS ALIVE')}</em>
            </span>
          </h2>
          <p className="re-line mono">{step >= 1 ? 'YOU TRUST ME?' : '\u00A0'}</p>
          {step >= 2 && <p className="re-mistake display">THAT WAS YOUR SECOND MISTAKE.</p>}
        </div>
      )}
      {step >= 4 && (
        <div className="re-joke">
          <p className="mono">JUST KIDDING.</p>
          {step >= 5 && <p className="display re-smile">:)</p>}
        </div>
      )}
    </div>
  );
}

function ObserverEnding() {
  const [n, setN] = useState(0);
  const [phase, setPhase] = useState(0);
  const found = [...session.secrets].map((s) => SECRET_TEXT[s]).filter(Boolean);
  const lines = [
    '[observer] reclassifying process…',
    '[observer] this session did not behave like a user.',
    ...found.map((f) => `— ${f}`),
    '[observer] you are not the user.',
    '[observer] you are another observer.',
    '[observer] welcome back, process 02.',
  ];
  const ghost = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      setN(i);
      audio.type();
      if (i >= lines.length) {
        clearInterval(id);
        setTimeout(() => setPhase(1), 2600);
      }
    }, 1100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (phase !== 1) return;
    world.fade = 0;
    audio.setMood('calm', 4);
    // someone new arrives
    const g = ghost.current;
    if (g) {
      gsap.set(g, { x: innerWidth + 40, y: innerHeight * 0.72 });
      gsap
        .timeline({ delay: 1.2 })
        .to(g, { x: innerWidth * 0.7, y: innerHeight * 0.6, duration: 1.8, ease: 'power2.out' })
        .to(g, { x: innerWidth * 0.64, y: innerHeight * 0.58, duration: 0.9, ease: 'power1.inOut' }, '+=0.6')
        .to(g, { x: innerWidth * 0.55, y: innerHeight * 0.52, duration: 1.4, ease: 'power2.inOut' }, '+=0.9')
        .add(() => setPhase(2))
        .add(() => setPhase(3), '+=2.4')
        .add(() => credits(), '+=6');
    }
  }, [phase]);
  return (
    <div className="ending ending-observer">
      {phase === 0 && (
        <div className="obs-log mono">
          {lines.slice(0, n).map((l, i) => (
            <div key={i} className={l.startsWith('—') ? 'is-item' : ''}>
              {l}
            </div>
          ))}
        </div>
      )}
      {phase >= 1 && (
        <div className="obs-view">
          <div className="obs-init mono">
            INITIALIZING INTERFACE
            <div className="intro-track">
              <div className="intro-bar is-full" />
            </div>
          </div>
          {phase >= 2 && <p className="obs-detected mono">USER DETECTED.</p>}
          {phase >= 3 && (
            <p className="obs-waiting mono">
              WAITING FOR NEXT CONNECTION.<span className="caret" />
            </p>
          )}
          <div className="ghost-cursor is-visible" ref={ghost}>
            <i />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Ending() {
  const ending = useGame((s) => s.ending);
  if (ending === 'live') return <LiveEnding />;
  if (ending === 'observer') return <ObserverEnding />;
  return null;
}
