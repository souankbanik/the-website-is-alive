export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** frame-rate independent damping factor */
export const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T,>(arr: readonly T[]) => arr[(Math.random() * arr.length) | 0];
export const TAU = Math.PI * 2;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** wait until predicate true, polling each frame */
export const until = (pred: () => boolean) =>
  new Promise<void>((resolve) => {
    const tick = () => (pred() ? resolve() : requestAnimationFrame(tick));
    tick();
  });
