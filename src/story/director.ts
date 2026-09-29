import gsap from 'gsap';
import { game, CaptionKind, CaptionPos } from '../store/game';
import { session, elapsed, addSecret, SECRET_THRESHOLD } from '../store/session';
import { audio } from '../audio/engine';
import { world } from '../scenes/world';
import { DESCENT_DEPTH } from '../scenes/descent';
import { engine } from '../gameplay/engine';
import { ChaseLevel } from '../gameplay/chase';
import { TypeAttack } from '../gameplay/typeAttack';
import { NavBoss, NavKind } from '../gameplay/navBoss';
import { InterfaceBoss, PHASES } from '../gameplay/interfaceBoss';
import { bus } from '../hooks/input';
import { scroller } from '../utils/scroll';
import { device } from '../utils/device';
import { until, wait } from '../utils/math';
import { navRefs } from '../components/Header';
import { bossHudEls } from '../components/BossHud';

const say = (text: string, who = 'observer') => game().say(who, text);

/** show a directed line, hold it, clear it */
export async function line(text: string, kind: CaptionKind = 'serif', pos: CaptionPos = 'center', ms = 2600) {
  game().show(text, kind, pos);
  await wait(ms);
  if (game().caption?.text === text) game().hide();
  await wait(260);
}

// ───────────────────────────── 00 · ENTRY ─────────────────────────────
export function beginExperience(withSound: boolean) {
  game().set({ sound: withSound });
  audio.init();
  audio.setEnabled(withSound);
  audio.setMood('calm', 4);
  game().setAudioReady();
  game().setStage('page');
  game().set({ headerVisible: true });
}

let warned = false;
/** "PLEASE KEEP YOUR CURSOR STILL." */
export async function firstCursorMoment() {
  if (warned || game().stage !== 'page') return;
  warned = true;
  const text = device.touch ? 'PLEASE DO NOT TOUCH THE SCREEN.' : 'PLEASE KEEP YOUR CURSOR STILL.';
  game().show(text, 'mono', 'low');
  await wait(text.length * 32 + 300);
  let moved = 0;
  const off = bus.on('move', (d: number) => (moved += d));
  const t0 = performance.now();
  await until(() => moved > 14 || performance.now() - t0 > 4200);
  off();
  if (moved > 14) {
    session.firstDisobedience = elapsed();
    session.firstWarningObeyed = false;
    game().show('I ASKED YOU NOT TO.', 'mono', 'low');
    audio.whisper(0.05);
    await wait(2600);
  } else {
    session.firstWarningObeyed = true;
    addSecret('still');
    game().show('thank you.', 'tiny', 'low');
    await wait(2600);
  }
  game().hide();
  audio.setMood('curious', 5);
}

// ───────────────────────── 04 · CORRUPTED SCROLL ─────────────────────────
let corrupted = false;
export async function corruptScroll() {
  const lenis = scroller.lenis;
  if (!lenis || corrupted) return;
  corrupted = true;
  lenis.stop();
  scroller.rogue = true;
  audio.corrupt();
  world.glitch(0.3, 0.25);
  say('no.');
  let attempts = 0;
  const push = (dy: number) => {
    if (dy <= 0) return;
    attempts++;
    // you scroll down; the page goes up
    lenis.scrollTo(Math.max(0, lenis.scroll - dy * 1.8 - 60), { force: true, duration: 0.9 });
    audio.glitch();
    world.glitch(0.12, 0.08);
  };
  const offWheel = bus.on('wheel', push);
  let ty = 0;
  const ts = (e: TouchEvent) => (ty = e.touches[0].clientY);
  const tm = (e: TouchEvent) => {
    const dy = ty - e.touches[0].clientY;
    if (dy > 30) {
      ty = e.touches[0].clientY;
      push(dy * 3);
    }
  };
  window.addEventListener('touchstart', ts, { passive: true });
  window.addEventListener('touchmove', tm, { passive: true });
  const t0 = performance.now();
  await until(() => attempts >= 5 || performance.now() - t0 > 6000);
  offWheel();
  window.removeEventListener('touchstart', ts);
  window.removeEventListener('touchmove', tm);

  // control is taken away, visibly
  game().set({ scrollLocked: true });
  audio.scrollLock();
  audio.setMood('hostile', 0.4);
  world.shake(0.6);
  world.glitch(0.6, 0.3);
  game().show('STOP TRYING TO LEAVE.', 'giant-red');
  await wait(2900);
  game().hide();
  await wait(700);

  // the cursor chase
  game().set({ cursorMode: 'lag' });
  const chase = new ChaseLevel();
  engine.setLevel(chase);
  let edged = false;
  const offLeave = bus.on('leave', () => {
    session.leftWindowDuringLock++;
    if (!edged) {
      edged = true;
      addSecret('edge');
      say('you cannot leave through the edge either.');
    }
  });
  await until(() => chase.done);
  offLeave();
  engine.setLevel(null);
  game().set({ cursorMode: 'normal' });
  say(session.chaseCaught === 0 ? 'fast. fine.' : '...fine.');
  audio.setMood('curious', 3);
  await wait(1800);
  say('one more test.');
  game().set({ chaseDone: true });
  await wait(250);
  scroller.rogue = false;
  lenis.start();
  game().set({ scrollLocked: false });
  lenis.scrollTo('#dontclick', { duration: 2.6, force: true });
}

// ───────────────────────────── 05 · DO NOT CLICK ─────────────────────────────
let transformed = false;
export async function dontClick(pressed: boolean, delay: number) {
  if (transformed) return;
  transformed = true;
  session.dontClickPressed = pressed;
  session.dontClickDelay = delay;
  scroller.lenis?.stop();
  if (pressed) {
    // total freeze. no sound. no movement.
    audio.freeze();
    engine.paused = true;
    world.paused = true;
    game().set({ cursorMode: 'hidden' });
    game().clearLog();
    document.body.classList.add('frozen');
    await wait(2000);
    game().show('why?', 'tiny', 'center');
    await wait(2400);
    game().hide();
    document.body.classList.remove('frozen');
    engine.paused = false;
    world.paused = false;
  } else {
    addSecret('restraint');
    await line("then i'll do it myself.", 'mono', 'low', 2400);
  }
  await transformation();
}

// ─────────────────────────── TRANSFORMATION #1 ───────────────────────────
async function transformation() {
  const shell = document.querySelector<HTMLElement>('.page-filter');
  const root = document.querySelector<HTMLElement>('.page-root');
  audio.unfreeze(0.05);
  audio.setMood('silence', 0.1);
  game().set({ cursorMode: 'normal' });
  if (shell && root) {
    const y = scroller.lenis?.scroll ?? window.scrollY;
    shell.classList.add('is-detached');
    root.style.top = `${-y}px`;
    root.style.transformOrigin = `50% ${y + innerHeight / 2}px`;
    // the lights go out
    audio.boom();
    const lights = gsap.timeline();
    lights
      .to(shell, { filter: 'brightness(0.08)', duration: 0.06 })
      .to(shell, { filter: 'brightness(0.7)', duration: 0.05 })
      .to(shell, { filter: 'brightness(0.02)', duration: 0.08 })
      .to(shell, { filter: 'brightness(0.45)', duration: 0.04 })
      .to(shell, { filter: 'brightness(0)', duration: 0.35 });
    await wait(1400);
    world.ensureArch();
    world.setMode('void');
    world.baseAberr = 0.25;
    // violet emergency light; sections detach and the page becomes an object
    gsap.to(shell, { filter: 'brightness(0.85) sepia(0.5) hue-rotate(215deg) saturate(2.6)', duration: 1.4, ease: 'power2.out' });
    if (!device.low) {
      gsap.to(root.querySelectorAll('.display'), { scaleY: 1.7, duration: 2.8, ease: 'expo.inOut', transformOrigin: '50% 100%' });
      root.querySelectorAll<HTMLElement>('section').forEach((s, i) => {
        gsap.to(s, { z: -i * 170 - 80, rotateY: i % 2 ? 9 : -9, x: (i % 2 ? 1 : -1) * innerWidth * 0.07, duration: 3.6, delay: 0.08 * i, ease: 'expo.inOut' });
      });
    }
    gsap.to(root, { scale: 0.34, rotateX: 24, rotateZ: -5, duration: 3.8, ease: 'expo.inOut' });
    audio.swell(3.6);
    await wait(2700);
    world.arch?.reveal(4.5);
    gsap.to(shell, { opacity: 0, duration: 1.5, ease: 'power2.in' });
    await wait(1600);
  } else {
    world.ensureArch();
    world.setMode('void');
    world.arch?.reveal(3);
  }
  game().setStage('transform');
  window.scrollTo(0, 0);
  audio.setMood('hostile', 4);
  say('containment breached.');
  await wait(2600);
  await line('You wanted to see what is inside.', 'serif', 'center', 3000);
  await line('Then come closer.', 'serif', 'center', 2400);
  await typographyAttack();
}

// ─────────────────────────── TYPOGRAPHY ATTACK ───────────────────────────
async function typographyAttack() {
  game().setStage('typeattack');
  engine.resetPlayer();
  engine.show(true);
  game().set({ cursorMode: 'game' });
  world.arch?.dim(0.3, 3);
  const lvl = new TypeAttack();
  lvl.onArm = () => {
    engine.arm(true);
    game().set({ hud: true });
    say('error: [user] has acquired write access.');
    audio.chime();
    engine.ring(engine.p.x, engine.p.y, 160, 0.8, '#00F0FF', 1.5);
  };
  engine.setLevel(lvl);
  say('stay where you are.');
  // taunts follow game time, not wall time, so slow machines keep the order
  void until(() => lvl.t > 13).then(() => say('i said stay.'));
  void until(() => lvl.t > 21).then(() => say('why are you still moving.'));
  await until(() => lvl.done);
  engine.setLevel(null);
  await line('Stop breaking my words.', 'serif', 'center', 2400);
  await navigationBoss();
}

// ───────────────────────────── NAVIGATION ─────────────────────────────
async function navigationBoss() {
  game().setStage('navboss');
  say('fine. if you want to break something —');
  document.querySelector('.site-header')?.classList.add('is-glitching');
  audio.glitch();
  world.glitch(0.5, 0.4);
  await wait(1500);
  const starts = {} as Record<NavKind, { x: number; y: number }>;
  (['ABOUT', 'WORK', 'CONTACT', 'EXIT'] as NavKind[]).forEach((k, i) => {
    const r = navRefs[k]?.getBoundingClientRect();
    starts[k] = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth - 300 + i * 70, y: 30 };
  });
  game().set({ navDetached: true, hud: true, cursorMode: 'game' });
  if (!engine.p.visible) engine.show(true);
  engine.arm(true);
  audio.setMood('chaos', 1);
  const lvl = new NavBoss(starts);
  engine.setLevel(lvl);
  say('— break my navigation.');
  await until(() => lvl.done);
  engine.setLevel(null);
  game().set({ headerVisible: false });
  await line('YOU BROKE IT.', 'giant', 'center', 2200);
  await line('THAT WAS MINE.', 'giant-red', 'center', 2300);
  await falseCrash();
}

// ───────────────────────────── FALSE CRASH ─────────────────────────────
async function falseCrash() {
  game().setStage('crash');
  engine.paused = true;
  world.glitch(1, 0.25);
  await wait(120);
  world.paused = true;
  audio.freeze();
  game().set({ hud: false });
  game().clearLog();
  await wait(900);
  game().setOverlay('crash');
}

/** called by the crash overlay once "RESTORING..." completes */
export function falsePeace() {
  engine.paused = false;
  world.paused = false;
  engine.setLevel(null);
  engine.show(false);
  engine.arm(false);
  game().set({ hud: false, cursorMode: 'normal' });
  world.disposeArch();
  world.setMode('black');
  world.baseAberr = 0;
  audio.unfreeze(1.5);
  audio.setMood('peace', 2.5);
  game().setStage('peace');
  game().setOverlay('peace');
}

/** the white page tears: prepare the void underneath */
export function tearPeace() {
  world.ensureDescent();
  world.setMode('descent');
  world.fade = 1;
  audio.setMood('descent', 1.2);
  audio.tear();
  world.shake(0.4);
}

// ───────────────────────────── DESCENT ─────────────────────────────
export async function descend() {
  game().setOverlay(null);
  game().setStage('descent');
  engine.resetPlayer();
  engine.show(true);
  game().set({ cursorMode: 'game' });
  const d = world.ensureDescent();
  d.active = true;
  say('fall with me.');
  setTimeout(() => say('these were my rooms.'), 9000);
  setTimeout(() => say('you walked through all of them.'), 20000);
  await until(() => d.depth >= DESCENT_DEPTH);
  d.active = false;
  engine.show(false);
  game().clearLog();
  audio.setMood('silence', 2.5);
  gsap.to(world, { fade: 0, duration: 2.4, ease: 'power2.in' });
  await wait(3400);
  world.disposeDescent();
  await theEye();
}

// ───────────────────────────── THE EYE ─────────────────────────────
async function theEye() {
  game().setStage('eye');
  game().set({ cursorMode: 'hidden', headerVisible: false });
  engine.show(false);
  const e = world.ensureEntity();
  world.setMode('eye');
  world.fade = 1;
  audio.setMood('eye', 3);
  await wait(1600);
  audio.heartbeat();
  e.openEye(4.5);
  audio.swell(4);
  await wait(5200);
  await line('I HAVE BEEN WATCHING YOU.', 'serif', 'high', 3300);
  await line('SINCE THE FIRST PIXEL MOVED.', 'serif', 'high', 3100);
  e.agitation = 0.35;
  audio.heartbeat();
  await line('LET ME SHOW YOU WHAT I LEARNED.', 'serif-red', 'high', 3300);
  await finalBoss();
}

// ─────────────────────────── FINAL BOSS: THE INTERFACE ───────────────────────────
const PALETTES: [string, string][] = [
  ['#7C5CFF', '#F4F1EA'],
  ['#00F0FF', '#7C5CFF'],
  ['#7C5CFF', '#00F0FF'],
  ['#FF2E2E', '#F4F1EA'],
  ['#FF2E2E', '#7C5CFF'],
];
const TAUNTS = [
  'words were the first thing i made. watch.',
  'let me make you comfortable. stay inside.',
  device.touch ? 'drag. gravity is yours now.' : 'scroll. gravity is yours now.',
  'which one of these is you?',
  'i kept everything you did.',
];

async function finalBoss() {
  game().setStage('boss');
  const e = world.entity!;
  audio.setMood('boss', 1.5);
  audio.intensity = 1;
  game().set({ bossHud: true, hud: true, cursorMode: 'game' });
  engine.resetPlayer();
  engine.show(true);
  engine.arm(true);
  const b = new InterfaceBoss();
  b.hud = bossHudEls;
  b.onPhase = (i) => {
    e.setPalette(...PALETTES[i]);
    e.agitation = 0.25 + i * 0.18;
    audio.intensity = i + 1;
    world.baseAberr = i >= 2 ? 0.55 : 0.15;
    void line(`PHASE ${i + 1} — ${PHASES[i]}`, 'mono', 'low', 1900);
    say(TAUNTS[i]);
    if (i === 2) setTimeout(() => void line(device.touch ? 'DRAG TO MOVE.' : 'SCROLL UP OR DOWN TO CHANGE GRAVITY.', 'mono', 'low', 3200), 2300);
  };
  b.onLine = (t) => {
    game().show(t, 'serif-red', 'high');
    setTimeout(() => {
      if (game().caption?.text === t) game().hide();
    }, 3200);
  };
  engine.setLevel(b);
  b.begin();
  await until(() => b.done);
  await finalMoment();
}

async function finalMoment() {
  const e = world.entity!;
  engine.arm(false);
  engine.show(false);
  engine.setLevel(null);
  game().set({ hud: false });
  game().hide();
  game().clearLog();
  audio.freeze();
  world.baseAberr = 0;
  e.agitation = 0;
  e.setPalette('#8D8D8D', '#F4F1EA');
  await wait(2600);
  game().set({ bossHud: false });
  game().show('...', 'mono', 'center');
  await wait(3200);
  audio.unfreeze(2.5);
  audio.setMood('end', 3);
  game().show('WHAT HAPPENS TO ME NOW?', 'serif', 'high');
  await wait(1800);
  game().set({ cursorMode: 'normal', observerUnlocked: session.secrets.size >= SECRET_THRESHOLD });
  game().setStage('final');
  game().setOverlay('choice');
}

// ───────────────────────────── ENDINGS ─────────────────────────────
export async function choose(c: 'delete' | 'live' | 'observer') {
  session.endingChoice = c;
  game().setOverlay(null);
  game().hide();
  game().setStage('ending');
  game().set({ ending: c });
  const e = world.entity;
  if (c === 'delete') {
    game().set({ cursorMode: 'hidden' });
    audio.setMood('end', 6);
    e?.dissolve(8);
    // only the cursor remains
    engine.show(true);
    await wait(8600);
    gsap.to(world, { fade: 0, duration: 2 });
    await wait(2400);
    await line('PROCESS TERMINATED.', 'mono', 'center', 3400);
    audio.setMood('silence', 4);
    await wait(3200);
    game().show('thank you.', 'tiny', 'center');
    await wait(3800);
    game().hide();
    engine.show(false);
    game().set({ blackout: 1 });
    await wait(3200);
    credits();
    return;
  }
  // "live" and "observer" are staged by the Ending overlay
  if (c === 'live' && e) {
    e.setPalette('#7C5CFF', '#F4F1EA');
    e.agitation = 0.1;
  }
  if (c === 'observer') {
    audio.setMood('silence', 3);
    e?.dissolve(4);
  }
  game().set({ cursorMode: c === 'observer' ? 'hidden' : 'normal' });
  game().setOverlay('ending');
}

export function credits() {
  engine.show(false);
  engine.setLevel(null);
  world.setMode('black');
  world.fade = 1;
  audio.unfreeze(2);
  audio.setMood('end', 3);
  game().set({ blackout: 0, cursorMode: 'normal' });
  game().setStage('credits');
  game().setOverlay('credits');
}


// ───────────────────────────── dev only: jump to a scene for QA ─────────────────────────────
export async function devJump(to: string) {
  const { loadFonts } = await import('../utils/textures');
  await loadFonts();
  audio.init();
  game().set({ headerVisible: true });
  const voidWorld = () => {
    world.ensureArch();
    world.setMode('void');
    world.arch?.reveal(0.5);
  };
  const eyeWorld = () => {
    const e = world.ensureEntity();
    world.setMode('eye');
    e.open = 1;
    return e;
  };
  switch (to) {
    case 'dontclick':
      game().set({ chaseDone: true });
      game().setStage('page');
      setTimeout(() => scroller.lenis?.scrollTo('#dontclick', { immediate: true, force: true }), 600);
      return;
    case 'typeattack':
      game().setStage('transform');
      voidWorld();
      return typographyAttack();
    case 'navboss':
      game().setStage('transform');
      voidWorld();
      return navigationBoss();
    case 'crash':
      game().setStage('transform');
      voidWorld();
      return falseCrash();
    case 'peace':
      return falsePeace();
    case 'descent':
      tearPeace();
      return descend();
    case 'eye':
      return theEye();
    case 'boss':
      eyeWorld();
      return finalBoss();
    case 'final':
      eyeWorld();
      return finalMoment();
    case 'credits':
      return credits();
  }
}
