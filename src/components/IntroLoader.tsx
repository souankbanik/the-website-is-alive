import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { loadFonts } from '../utils/textures';
import { beginExperience } from '../story/director';
import { audio } from '../audio/engine';
import { session } from '../store/session';

const NAME_KEY = 'alive:username';
const NAME_OK = /^[\p{L}\p{N}_. -]{2,20}$/u;
const remembered = () => {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
};

/** INITIALIZING INTERFACE — short, honest, then a choice of how to enter. */
export default function IntroLoader() {
  const [ready, setReady] = useState(false);
  const [name, setName] = useState(remembered);
  const valid = NAME_OK.test(name.trim());
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
    if (!valid) return;
    session.username = name.trim();
    try {
      localStorage.setItem(NAME_KEY, session.username);
    } catch {
      /* ignore */
    }
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
        <form
          className={`intro-name ${ready ? 'is-ready' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            enter(true);
          }}
        >
          <label className="mono" htmlFor="intro-username">
            WHO ARE YOU?
          </label>
          <input
            id="intro-username"
            className="intro-input mono"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="username"
            maxLength={20}
            autoComplete="nickname"
            spellCheck={false}
            required
          />
          <p className="intro-note mono">A username is required to play. Your username, IP address and approximate location are recorded.</p>
        </form>
        <div className={`intro-enter ${ready ? 'is-ready' : ''} ${valid ? '' : 'is-locked'}`}>
          <button className="intro-btn" onClick={() => enter(true)} disabled={!valid} data-magnetic>
            Enter with sound
          </button>
          <span className="intro-sep" />
          <button className="intro-btn is-quiet" onClick={() => enter(false)} disabled={!valid} data-magnetic>
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
