import { session, elapsed } from '../store/session';

type Fn = (...a: any[]) => void;
const listeners = new Map<string, Set<Fn>>();
export const bus = {
  on(evt: string, fn: Fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt)!.add(fn);
    return () => listeners.get(evt)!.delete(fn);
  },
  emit(evt: string, ...a: any[]) {
    listeners.get(evt)?.forEach((f) => f(...a));
  },
};

/** Live pointer state. Mutated in place; read every frame by the systems that need it. */
export const pointer = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  vx: 0,
  vy: 0,
  speed: 0,
  down: false,
  downAt: 0,
  lastMove: performance.now(),
  inside: true,
  hasMoved: false,
  stillCounted: false,
  /** recent trail (screen px), newest last */
  trail: [] as { x: number; y: number; t: number }[],
  /** stillness points for the trace visualisation */
  pauses: [] as { x: number; y: number; d: number }[],
};

export const input = {
  dashQueued: false,
  wheel: 0, // accumulated wheel delta consumed by gameplay systems
  wheelRaw: 0,
  /** set by gameplay to swallow Space and wheel defaults */
  gameCapture: false,
};

let lastSample = 0;
let px = pointer.x;
let py = pointer.y;
let lastT = performance.now();

function onMove(e: PointerEvent) {
  const now = performance.now();
  const dx = e.clientX - px;
  const dy = e.clientY - py;
  const d = Math.hypot(dx, dy);
  const dt = Math.max(1, now - lastT);
  if (pointer.hasMoved) session.cursorDistance += d;
  pointer.vx = (dx / dt) * 16.67;
  pointer.vy = (dy / dt) * 16.67;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  px = e.clientX;
  py = e.clientY;
  lastT = now;
  if (d > 0.5) {
    // record the pause that just ended
    const still = (now - pointer.lastMove) / 1000;
    if (still > 0.9 && pointer.hasMoved) {
      pointer.pauses.push({ x: pointer.x, y: pointer.y, d: still });
      if (pointer.pauses.length > 40) pointer.pauses.shift();
    }
    pointer.lastMove = now;
    pointer.stillCounted = false;
    pointer.hasMoved = true;
  }
  pointer.trail.push({ x: e.clientX, y: e.clientY, t: now });
  if (pointer.trail.length > 180) pointer.trail.shift();
  if (now - lastSample > 80) {
    lastSample = now;
    session.path.push(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    if (session.path.length > 2400) session.path.splice(0, 2);
  }
  bus.emit('move', d);
}

function onDown(e: PointerEvent) {
  pointer.down = true;
  pointer.downAt = performance.now();
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  px = e.clientX;
  py = e.clientY;
  session.totalClicks++;
  bus.emit('down', e);
}
function onUp(e: PointerEvent) {
  pointer.down = false;
  bus.emit('up', e);
}

let lastTap = 0;
function onTouchStart(e: TouchEvent) {
  // two-finger tap or double-tap = dash on touch devices
  const now = performance.now();
  if (e.touches.length >= 2 || now - lastTap < 260) input.dashQueued = true;
  lastTap = now;
}

function onKey(e: KeyboardEvent) {
  if (e.code === 'Space') {
    if (input.gameCapture) e.preventDefault();
    if (!e.repeat) input.dashQueued = true;
  }
  bus.emit('key', e);
}

function onWheel(e: WheelEvent) {
  input.wheel += e.deltaY;
  input.wheelRaw = e.deltaY;
  bus.emit('wheel', e.deltaY);
}

export function initInput() {
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('keydown', onKey);
  window.addEventListener('wheel', onWheel, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    pointer.inside = false;
    bus.emit('leave');
  });
  document.documentElement.addEventListener('mouseenter', () => {
    pointer.inside = true;
  });
}

/** called once per frame */
export function tickInput() {
  const now = performance.now();
  pointer.vx *= 0.85;
  pointer.vy *= 0.85;
  pointer.speed = Math.hypot(pointer.vx, pointer.vy);
  const still = (now - pointer.lastMove) / 1000;
  if (pointer.hasMoved && still > 1.2 && !pointer.stillCounted) {
    pointer.stillCounted = true;
    session.hesitations++;
  }
  if (pointer.hasMoved && still > session.longestStill) session.longestStill = still;
  while (pointer.trail.length && now - pointer.trail[0].t > 3000) pointer.trail.shift();
}

export const stillFor = () => (performance.now() - pointer.lastMove) / 1000;
export const sessionSeconds = elapsed;
