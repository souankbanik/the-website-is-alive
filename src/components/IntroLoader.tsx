import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { loadFonts } from '../utils/textures';
import { beginExperience } from '../story/director';
import { audio } from '../audio/engine';

/** INITIALIZING INTERFACE — short, honest, then a choice of how to enter. */
export default function IntroLoader() {
  const [ready, setReady] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const pct = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const state = { p: 0 };
    const fill = gsap.to(state, {
      p: 0.82,
      duration: 1.4,
      ease: 'power2.out',
      onUpdate: () => {
        if (bar.current) bar.current.style.transform = `scaleX(${state.p})`;
        if (pct.current) pct.current.textContent = String(Math.round(state.p * 100)).padStart(3, '0');
      },
    });
    loadFonts().then(() => {
      fill.kill();
      gsap.to(state, {
        p: 1,
        duration: 0.5,
        ease: 'power3.inOut',
        onUpdate: () => {
          if (bar.current) bar.current.style.transform = `scaleX(${state.p})`;
          if (pct.current) pct.current.textContent = String(Math.round(state.p * 100)).padStart(3, '0');
        },
        onComplete: () => setReady(true),
      });
    });
  }, []);

  const enter = (sound: boolean) => {
    audio.init();
    if (sound) audio.click();
    gsap.to(root.current, {
      opacity: 0,
      duration: 1.1,
      ease: 'power2.inOut',
      onComplete: () => beginExperience(sound),
    });
  };

  return (
    <div className="intro" ref={root}>
      <div className="intro-center">
        <div className="intro-label mono">
          {ready ? 'INTERFACE READY' : 'INITIALIZING INTERFACE'}
          <span className="intro-pct" ref={pct}>
            000
          </span>
        </div>
        <div className="intro-track">
          <div className="intro-bar" ref={bar} />
        </div>
        <div className={`intro-enter ${ready ? 'is-ready' : ''}`}>
          <button className="intro-btn" onClick={() => enter(true)} data-magnetic>
            Enter with sound
          </button>
          <span className="intro-sep" />
          <button className="intro-btn is-quiet" onClick={() => enter(false)} data-magnetic>
            Enter in silence
          </button>
        </div>
      </div>
      <div className="intro-foot mono">
        <span>HEADPHONES RECOMMENDED</span>
        <span>DESKTOP · 7–12 MIN</span>
      </div>
    </div>
  );
}
