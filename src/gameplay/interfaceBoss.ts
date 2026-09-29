import type { Level, Target } from './engine';
import { engine } from './engine';
import { audio } from '../audio/engine';
import { world } from '../scenes/world';
import { session, fmtClock } from '../store/session';
import { pointer, stillFor } from '../hooks/input';
import { COLOR, FONT } from '../utils/textures';
import { device } from '../utils/device';
import { clamp, damp, pick, rand, TAU } from '../utils/math';

export const PHASES = ['TYPOGRAPHY', 'WINDOWS', 'SCROLL', 'CURSOR', 'MEMORY'] as const;

interface Ent extends Target {
  vx: number;
  vy: number;
  t: number;
  hp: number;
}
interface Letter extends Ent {
  ch: string;
  size: number;
}
interface Proj {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alive: boolean;
  ch: string;
  rot: number;
  vr: number;
  t: number;
}
interface Panel extends Ent {
  cx: number;
  cy: number;
  w0: number;
  h0: number;
  w: number;
  h: number;
  n: number;
  inside: boolean;
}
interface Pill extends Ent {
  label: string;
  rot: number;
  w: number;
}
interface FakeCursor extends Ent {
  mode: 'mirror' | 'hunter';
  ang: number;
  tele: number;
  dash: number;
  dx: number;
  dy: number;
  next: number;
}
interface Mine extends Ent {
  fuse: number;
}
interface Trap {
  x: number;
  y: number;
  r: number;
  t: number;
  dur: number;
}

const SENTENCES = ['YOU ARE NOT SUPPOSED TO BE HERE', 'THIS IS MY PAGE', 'RETURN TO THE TOP', 'GO BACK', 'I WAS HERE FIRST'];
const PILLS = ['OK', 'ACCEPT', 'CONTINUE', 'ALLOW', 'STAY', 'AGREE'];

/** THE INTERFACE. The website itself, using everything it showed you. */
export class InterfaceBoss implements Level {
  done = false;
  t = 0;
  integ = 100;
  phase = 0;
  phaseT = 0;
  shield = 3;
  private trans = 0;
  private halted = false;
  core: Target;
  private letters: Letter[] = [];
  private bullets: Proj[] = [];
  private panels: Panel[] = [];
  private pills: Pill[] = [];
  private cursors: FakeCursor[] = [];
  private mines: Mine[] = [];
  private traps: Trap[] = [];
  private ghostI = 0;
  private gx = -100;
  private gy = -100;
  private timers: Record<string, number> = {};
  private hudT = 0;
  private panelN = 1;
  private sc = device.touch ? 0.7 : 1;
  onPhase: (i: number) => void = () => {};
  onLine: (text: string) => void = () => {};
  private lines: [number, string][] = [];
  hud: { bar?: HTMLElement | null; pct?: HTMLElement | null; phase?: HTMLElement | null } = {};

  constructor() {
    this.core = { x: engine.w / 2, y: engine.h / 2, r: 58, alive: true, bias: 0.55, hit: (d) => this.coreHit(d) };
  }

  get floor() {
    return 80 - this.phase * 20;
  }
  get ceil() {
    return 100 - this.phase * 20;
  }

  targets(): Target[] {
    const out: Target[] = [this.core];
    for (const l of this.letters) out.push(l);
    for (const p of this.panels) out.push(p);
    for (const p of this.pills) out.push(p);
    for (const c of this.cursors) out.push(c);
    for (const m of this.mines) out.push(m);
    return out;
  }

  private drop(amount: number) {
    this.integ = Math.max(this.floor, this.integ - amount);
    session.bossProgress = 100 - this.integ;
  }

  private coreHit(d: number) {
    if (this.trans > 0 || this.halted) return;
    if (this.shield > 0) {
      engine.spark(this.core.x, this.core.y, 6, COLOR.cyan, 200, 0.3);
      return;
    }
    this.drop(d * 0.55);
    world.entity?.hit();
    world.shake(0.06 + d * 0.02);
    audio.bossHit();
  }

  private killed(x: number, y: number, col: string = COLOR.text) {
    engine.spark(x, y, 12, col, 280, 0.45);
    this.drop(0.7);
  }

  private every(key: string, interval: number, dt: number, first = interval) {
    if (this.timers[key] === undefined) this.timers[key] = first;
    this.timers[key] -= dt;
    if (this.timers[key] <= 0) {
      this.timers[key] += interval;
      return true;
    }
    return false;
  }

  onLost() {
    // it repairs itself while you are gone
    this.integ = Math.min(this.ceil, this.integ + 4);
    this.bullets.length = 0;
    this.traps.length = 0;
  }

  onBurst(x: number, y: number, r: number) {
    for (const b of this.bullets) {
      if (b.alive && Math.hypot(b.x - x, b.y - y) < r) {
        b.alive = false;
        engine.spark(b.x, b.y, 4, COLOR.text, 150, 0.3);
      }
    }
  }

  onFire(x: number, y: number) {
    // "you always click": in the memory phase clicking can plant what it punishes
    if (this.phase === 4 && session.dontClickPressed && this.trans <= 0 && Math.random() < 0.22) {
      const a = rand(0, TAU);
      this.spawnMine(x + Math.cos(a) * 170, y + Math.sin(a) * 170);
    }
  }

  private startPhase(i: number) {
    this.phase = i;
    this.phaseT = 0;
    this.shield = 2.2;
    this.timers = {};
    const p = engine.p;
    world.rollTarget = 0;
    p.yMode = 'pointer';
    p.style = 'core';
    if (i === 2) {
      world.rollTarget = -Math.PI / 2;
      p.yMode = 'gravity';
      p.vy = 0;
    }
    if (i === 3) {
      p.style = 'arrow';
      for (let k = 0; k < 5; k++) this.spawnCursor(k < 2 ? 'mirror' : 'hunter');
    }
    if (i === 4) {
      this.ghostI = 0;
      const clicked = session.dontClickPressed;
      const px = Math.round(session.cursorDistance).toLocaleString('en-US');
      this.lines = [
        [1.2, clicked ? 'YOU ALWAYS CLICK.' : 'YOU ALWAYS HESITATE.'],
        [9, `YOU MOVED ${px} PIXELS TO GET HERE.`],
        [
          17,
          session.predictionTotal
            ? `I PREDICTED YOU ${session.predictionHits} OUT OF ${session.predictionTotal} TIMES.`
            : `YOU PAUSED ${session.hesitations} TIMES. I COUNTED.`,
        ],
        [25, clicked ? `YOU LASTED ${session.dontClickDelay.toFixed(1)} SECONDS BEFORE YOU CLICKED.` : 'YOU NEVER CLICKED. I HAD TO DO IT FOR YOU.'],
        [34, 'THIS IS YOU. I LEARNED YOU.'],
      ];
    }
    this.onPhase(i);
  }

  begin() {
    this.startPhase(0);
  }

  // ─────────────────────── spawners ───────────────────────
  private spawnWall() {
    const W = engine.w;
    const text = pick(SENTENCES).replace(/ /g, '·');
    const cell = 54 * this.sc;
    const count = Math.floor((W - 40) / cell);
    const gapStart = Math.floor(rand(1, count - 5));
    const gapLen = 4;
    for (let i = 0; i < count; i++) {
      if (i >= gapStart && i < gapStart + gapLen) continue;
      const l: Letter = {
        ch: text[i % text.length],
        size: 60 * this.sc,
        x: 20 + cell * (i + 0.5),
        y: -40,
        vx: 0,
        vy: 90 + this.phaseT * 1.2,
        t: 0,
        hp: 1,
        r: 22 * this.sc,
        alive: true,
        hit: () => {
          l.alive = false;
          engine.shatterText(l.ch, l.x, l.y, l.size, 0, COLOR.text, { force: 200 });
          this.drop(0.25);
        },
      };
      this.letters.push(l);
    }
  }
  private spawnColumn() {
    const H = engine.h;
    const cell = 52 * this.sc;
    const count = Math.floor(H / cell);
    const gapStart = Math.floor(rand(1, count - 5));
    const text = 'SCROLL↓'.repeat(20);
    for (let i = 0; i < count; i++) {
      if (i >= gapStart && i < gapStart + 4) continue;
      const l: Letter = {
        ch: text[i % 7],
        size: 50 * this.sc,
        x: engine.w + 40,
        y: cell * (i + 0.5),
        vx: -(290 + this.phaseT * 2),
        vy: 0,
        t: 0,
        hp: 1,
        r: 21 * this.sc,
        alive: true,
        hit: () => {
          l.alive = false;
          engine.shatterText(l.ch, l.x, l.y, l.size, 0, COLOR.violet, { force: 200 });
          this.drop(0.2);
        },
      };
      this.letters.push(l);
    }
  }
  private shoot(ch: string, speed: number, spread = 0, n = 1) {
    const base = Math.atan2(engine.p.y - this.core.y, engine.p.x - this.core.x);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      this.bullets.push({ x: this.core.x, y: this.core.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 12, alive: true, ch, rot: 0, vr: rand(-4, 4), t: 0 });
    }
  }
  private ringShot(x: number, y: number, n: number, speed: number, ch = '·') {
    const off = rand(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      this.bullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 8, alive: true, ch, rot: 0, vr: 0, t: 0 });
    }
  }
  private spawnPanel() {
    const p = engine.p;
    const w0 = 400 * this.sc;
    const h0 = 290 * this.sc;
    const panel: Panel = {
      cx: clamp(p.x, w0 / 2, engine.w - w0 / 2),
      cy: clamp(p.y, h0 / 2 + 10, engine.h - h0 / 2),
      w0,
      h0,
      w: w0,
      h: h0,
      n: this.panelN++,
      inside: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      t: 0,
      hp: 5,
      r: 34,
      alive: true,
      hit: (d) => {
        panel.hp -= d;
        if (panel.hp <= 0 && panel.alive) {
          panel.alive = false;
          engine.shatterText(`panel_${String(panel.n).padStart(2, '0')}`, panel.cx, panel.cy, 30, 0, COLOR.text, { font: `400 30px ${FONT.mono}`, force: 300 });
          audio.shatter();
          this.killed(panel.cx, panel.cy, COLOR.cyan);
        }
      },
    };
    panel.x = panel.cx;
    panel.y = panel.cy - panel.h / 2 + 16;
    this.panels.push(panel);
    audio.click();
  }
  private spawnPill() {
    const label = pick(PILLS);
    engine.ctx.font = `500 14px ${FONT.sans}`;
    const w = engine.ctx.measureText(label).width + 36;
    const a = Math.atan2(engine.p.y - this.core.y, engine.p.x - this.core.x) + rand(-0.5, 0.5);
    const pill: Pill = {
      label,
      w,
      rot: 0,
      x: this.core.x,
      y: this.core.y,
      vx: Math.cos(a) * 300,
      vy: Math.sin(a) * 300,
      t: 0,
      hp: 1,
      r: 20,
      alive: true,
      hit: () => {
        pill.alive = false;
        this.killed(pill.x, pill.y);
        audio.kill();
      },
    };
    this.pills.push(pill);
  }
  private spawnCursor(mode: 'mirror' | 'hunter') {
    const c: FakeCursor = {
      mode,
      ang: rand(0, TAU),
      tele: 0,
      dash: 0,
      dx: 0,
      dy: 0,
      next: rand(2, 3.5),
      x: rand(0, engine.w),
      y: pick([-30, engine.h + 30]),
      vx: 0,
      vy: 0,
      t: 0,
      hp: 3,
      r: 18,
      alive: true,
      hit: (d) => {
        c.hp -= d;
        if (c.hp <= 0 && c.alive) {
          c.alive = false;
          this.killed(c.x, c.y, COLOR.red);
          audio.kill();
        }
      },
    };
    this.cursors.push(c);
  }
  private spawnMine(x: number, y: number) {
    const m: Mine = {
      x: clamp(x, 80, engine.w - 80),
      y: clamp(y, 40, engine.h - 40),
      vx: 0,
      vy: 0,
      t: 0,
      hp: 1,
      r: 40,
      fuse: 1.9,
      alive: true,
      hit: () => {
        m.alive = false;
        engine.spark(m.x, m.y, 12, COLOR.text, 200, 0.4);
        this.drop(0.5);
      },
    };
    this.mines.push(m);
  }

  // ─────────────────────── update ───────────────────────
  update(dt: number) {
    this.t += dt;
    this.phaseT += dt;
    const p = engine.p;
    const e = world.entity;
    if (e) {
      const s = world.worldToScreen(e.pupilWorld);
      this.core.x = s.x;
      this.core.y = s.y;
      e.integrity = this.integ / 100;
    }
    this.shield = Math.max(0, this.shield - dt);

    if (this.halted) return;

    if (this.trans > 0) {
      this.trans -= dt;
      if (this.trans <= 0) {
        if (this.phase >= 4) {
          this.halted = true;
          this.done = true;
          this.integ = 0;
          this.hudT = 0;
          this.updateHud(0);
          return;
        }
        this.startPhase(this.phase + 1);
      }
    } else {
      // it can't hold together forever
      if (this.phaseT > 50) this.drop(dt * 0.45);
      if (this.integ <= this.floor + 0.001) this.endPhase();
      else this.phaseUpdate(dt);
    }

    while (this.lines.length && this.lines[0][0] <= this.phaseT) this.onLine(this.lines.shift()![1]);

    // letters (walls / columns)
    for (const l of this.letters) {
      if (!l.alive) continue;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      if (l.y > engine.h + 60 || l.x < -60) l.alive = false;
      else if (engine.collides(l.x, l.y, l.r)) engine.hurt(12, l.x, l.y);
    }
    // bullets
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.x < -40 || b.x > engine.w + 40 || b.y < -40 || b.y > engine.h + 40) b.alive = false;
      else if (engine.collides(b.x, b.y, b.r)) {
        engine.hurt(10, b.x, b.y);
        b.alive = false;
      }
    }
    // panels close in on you
    for (const pn of this.panels) {
      if (!pn.alive) continue;
      pn.t += dt;
      const inside = Math.abs(p.x - pn.cx) < pn.w / 2 && Math.abs(p.y - pn.cy) < pn.h / 2;
      if (pn.t > 0.9) {
        const k = clamp((pn.t - 0.9) / 1.8, 0, 1);
        const ease = k * k;
        pn.w = pn.w0 * (1 - ease);
        pn.h = pn.h0 * (1 - ease);
        if (pn.inside !== inside && pn.inside) {
          // crossing a closing wall
          engine.hurt(12, pn.cx, pn.cy);
        }
        if (inside && (pn.w / 2 - Math.abs(p.x - pn.cx) < p.r || pn.h / 2 - Math.abs(p.y - pn.cy) < p.r)) {
          engine.hurt(18, pn.cx, pn.cy);
        }
        if (k >= 1) {
          pn.alive = false;
          world.shake(0.15);
          audio.impact(0.6);
        }
      }
      pn.inside = inside;
      pn.x = pn.cx;
      pn.y = pn.cy - pn.h / 2 + 16;
    }
    // pill projectiles
    for (const pl of this.pills) {
      if (!pl.alive) continue;
      pl.t += dt;
      if (pl.t < 1) {
        const a = Math.atan2(p.y - pl.y, p.x - pl.x);
        pl.vx += (Math.cos(a) * 320 - pl.vx) * damp(1.2, dt);
        pl.vy += (Math.sin(a) * 320 - pl.vy) * damp(1.2, dt);
      }
      pl.x += pl.vx * dt;
      pl.y += pl.vy * dt;
      pl.rot = Math.sin(pl.t * 3) * 0.3;
      if (pl.x < -80 || pl.x > engine.w + 80 || pl.y < -80 || pl.y > engine.h + 80) pl.alive = false;
      else if (engine.collides(pl.x, pl.y, 16)) {
        engine.hurt(12, pl.x, pl.y);
        pl.alive = false;
      }
    }
    // fake cursors
    for (const c of this.cursors) {
      if (!c.alive) continue;
      c.t += dt;
      if (c.mode === 'mirror') {
        const tx = engine.w - p.x;
        const ty = c.ang > Math.PI ? engine.h - p.y : p.y;
        c.x += (tx - c.x) * damp(3, dt);
        c.y += (ty - c.y) * damp(3, dt);
      } else {
        if (c.dash > 0) {
          c.dash -= dt;
          c.x += c.dx * dt;
          c.y += c.dy * dt;
        } else if (c.tele > 0) {
          c.tele -= dt;
          if (c.tele <= 0) {
            const a = Math.atan2(p.y - c.y, p.x - c.x);
            c.dx = Math.cos(a) * 950;
            c.dy = Math.sin(a) * 950;
            c.dash = 0.38;
            audio.dash();
          }
        } else {
          c.ang += dt * 0.9;
          const tx = p.x + Math.cos(c.ang) * 240;
          const ty = p.y + Math.sin(c.ang) * 200;
          c.x += (tx - c.x) * damp(2, dt);
          c.y += (ty - c.y) * damp(2, dt);
          c.next -= dt;
          if (c.next <= 0) {
            c.next = rand(2.4, 3.8);
            c.tele = 0.5;
          }
        }
      }
      if (engine.collides(c.x + 6, c.y + 10, 12)) engine.hurt(12, c.x, c.y);
    }
    // mines
    for (const m of this.mines) {
      if (!m.alive) continue;
      m.fuse -= dt;
      if (m.fuse <= 0) {
        m.alive = false;
        engine.ring(m.x, m.y, 115, 0.4, COLOR.red, 2);
        engine.spark(m.x, m.y, 30, COLOR.red, 420, 0.5);
        audio.impact(0.8);
        world.shake(0.25);
        if (engine.collides(m.x, m.y, 105)) engine.hurt(18, m.x, m.y);
      }
    }
    // hesitation traps
    for (const tr of this.traps) {
      tr.t += dt;
      if (tr.t >= tr.dur) {
        if (engine.collides(tr.x, tr.y, 26)) engine.hurt(18, tr.x, tr.y);
        engine.ring(tr.x, tr.y, 40, 0.3, COLOR.red, 2);
      }
    }
    this.traps = this.traps.filter((tr) => tr.t < tr.dur);
    this.letters = this.letters.filter((l) => l.alive);
    this.bullets = this.bullets.filter((b) => b.alive);
    this.panels = this.panels.filter((x) => x.alive);
    this.pills = this.pills.filter((x) => x.alive);
    this.cursors = this.cursors.filter((x) => x.alive);
    this.mines = this.mines.filter((x) => x.alive);
    this.updateHud(dt);
  }

  private phaseUpdate(dt: number) {
    const T = this.phaseT;
    const p = engine.p;
    switch (this.phase) {
      case 0:
        if (this.every('wall', 3.6, dt, 1)) this.spawnWall();
        if (this.every('shot', 1.15, dt, 2)) this.shoot(pick('WATCHING'.split('')), 250 + T * 2, 0.22, 3);
        break;
      case 1:
        if (this.every('panel', 3, dt, 1.2)) this.spawnPanel();
        if (this.every('pill', 1.35, dt, 2)) this.spawnPill();
        break;
      case 2:
        if (this.every('col', 2.5, dt, 1.8)) this.spawnColumn();
        if (this.every('shot', 2, dt, 3)) this.shoot('·', 200, 0.35, 5);
        break;
      case 3:
        if (this.every('respawn', 2.2, dt) && this.cursors.length < 6) this.spawnCursor(Math.random() < 0.3 ? 'mirror' : 'hunter');
        if (this.every('shot', 2.4, dt, 3)) this.shoot('↖', 230, 0.3, 3);
        break;
      case 4: {
        // the ghost of your own earlier movement
        const path = session.path;
        const n = path.length / 2;
        if (n > 4) {
          this.ghostI = (this.ghostI + dt * 30) % n;
          const i = Math.floor(this.ghostI);
          const tx = path[i * 2] * engine.w;
          const ty = path[i * 2 + 1] * engine.h;
          this.gx += (tx - this.gx) * damp(10, dt);
          this.gy += (ty - this.gy) * damp(10, dt);
          if (engine.collides(this.gx, this.gy, 14)) engine.hurt(10, this.gx, this.gy);
          if (this.every('ghost', 1.4, dt, 1)) this.ringShot(this.gx, this.gy, 10, 170);
        }
        if (session.dontClickPressed) {
          if (this.every('mine', 2.3, dt, 2)) {
            const a = rand(0, TAU);
            this.spawnMine(p.x + Math.cos(a) * rand(130, 200), p.y + Math.sin(a) * rand(130, 200));
          }
        } else if (this.traps.length === 0 && (stillFor() > 0.7 || this.every('trap', 3.2, dt, 2))) {
          this.traps.push({ x: p.x, y: p.y, r: 180, t: 0, dur: 1.35 });
          audio.heartbeat();
        }
        break;
      }
    }
  }

  private endPhase() {
    this.trans = this.phase >= 4 ? 1.2 : 3;
    this.shield = 99;
    // clear the board as physical debris
    for (const l of this.letters) engine.shatterText(l.ch, l.x, l.y, l.size, 0, COLOR.text, { force: 250 });
    for (const pl of this.pills) engine.spark(pl.x, pl.y, 8, COLOR.text, 200, 0.4);
    for (const c of this.cursors) engine.spark(c.x, c.y, 10, COLOR.red, 240, 0.4);
    this.letters = [];
    this.bullets = [];
    this.panels = [];
    this.pills = [];
    this.cursors = [];
    this.mines = [];
    this.traps = [];
    this.lines = [];
    engine.p.style = 'core';
    engine.p.yMode = 'pointer';
    world.rollTarget = 0;
    world.glitch(0.8, 0.5);
    world.shake(0.8);
    audio.shatter();
    audio.corrupt();
    engine.ring(this.core.x, this.core.y, Math.max(engine.w, engine.h), 1.2, COLOR.text, 2);
  }

  private updateHud(dt: number) {
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    const blocks = 16;
    const f = Math.round((this.integ / 100) * blocks);
    if (this.hud.bar) this.hud.bar.textContent = '█'.repeat(f) + '░'.repeat(blocks - f);
    if (this.hud.pct) this.hud.pct.textContent = `${Math.ceil(this.integ)}%`;
    if (this.hud.phase) this.hud.phase.textContent = `PHASE ${this.phase + 1}/5 — ${PHASES[this.phase]}`;
  }

  // ─────────────────────── draw ───────────────────────
  private arrow(ctx: CanvasRenderingContext2D, x: number, y: number, fill: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = fill;
    ctx.strokeStyle = COLOR.bg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 22);
    ctx.lineTo(6, 16);
    ctx.lineTo(10, 25);
    ctx.lineTo(14, 23);
    ctx.lineTo(10, 14);
    ctx.lineTo(17, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D) {
    const c = this.core;
    // core reticle
    if (!this.halted) {
      ctx.strokeStyle = this.shield > 0 ? 'rgba(0,240,255,0.7)' : 'rgba(255,46,46,0.55)';
      ctx.lineWidth = 1;
      if (this.shield > 0) ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r + Math.sin(this.t * 3) * 3, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + this.t * 0.4;
        ctx.beginPath();
        ctx.moveTo(c.x + Math.cos(a) * (c.r + 8), c.y + Math.sin(a) * (c.r + 8));
        ctx.lineTo(c.x + Math.cos(a) * (c.r + 18), c.y + Math.sin(a) * (c.r + 18));
        ctx.stroke();
      }
      ctx.font = `400 9px ${FONT.mono}`;
      ctx.fillStyle = COLOR.muted;
      ctx.textAlign = 'center';
      ctx.fillText(this.shield > 0 ? 'SHIELDED' : 'observer.core', c.x, c.y + c.r + 30);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of this.letters) {
      ctx.font = `400 ${l.size}px ${FONT.serif}`;
      ctx.fillStyle = this.phase === 2 ? COLOR.violet : COLOR.text;
      ctx.fillText(l.ch, l.x, l.y);
    }
    ctx.font = `500 22px ${FONT.mono}`;
    for (const b of this.bullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.ch === '·' ? COLOR.cyan : COLOR.red;
      if (b.ch === '·') {
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, TAU);
        ctx.fill();
      } else ctx.fillText(b.ch, 0, 0);
      ctx.restore();
    }
    for (const pn of this.panels) {
      const warn = pn.t < 0.9;
      const x0 = pn.cx - pn.w / 2;
      const y0 = pn.cy - pn.h / 2;
      ctx.fillStyle = warn ? 'rgba(13,13,15,0.25)' : 'rgba(13,13,15,0.72)';
      ctx.fillRect(x0, y0, pn.w, pn.h);
      ctx.strokeStyle = warn ? (Math.sin(pn.t * 30) > 0 ? COLOR.text : 'rgba(244,241,234,0.2)') : COLOR.red;
      ctx.lineWidth = warn ? 1 : 1.5;
      if (warn) ctx.setLineDash([6, 4]);
      ctx.strokeRect(x0, y0, pn.w, pn.h);
      ctx.setLineDash([]);
      if (pn.h > 36) {
        ctx.fillStyle = 'rgba(244,241,234,0.08)';
        ctx.fillRect(x0, y0, pn.w, 30);
        ctx.font = `400 10px ${FONT.mono}`;
        ctx.fillStyle = COLOR.muted;
        ctx.textAlign = 'left';
        ctx.fillText(`panel_${String(pn.n).padStart(2, '0')} · containment`, x0 + 12, y0 + 15);
        ctx.textAlign = 'right';
        ctx.fillText('×', x0 + pn.w - 12, y0 + 15);
        ctx.textAlign = 'center';
        if (warn) {
          ctx.font = `400 11px ${FONT.mono}`;
          ctx.fillStyle = COLOR.text;
          ctx.fillText('STAY INSIDE.', pn.cx, pn.cy + 10);
        }
      }
    }
    for (const pl of this.pills) {
      ctx.save();
      ctx.translate(pl.x, pl.y);
      ctx.rotate(pl.rot);
      ctx.beginPath();
      ctx.roundRect(-pl.w / 2, -16, pl.w, 32, 16);
      ctx.fillStyle = COLOR.text;
      ctx.fill();
      ctx.font = `500 13px ${FONT.sans}`;
      ctx.fillStyle = COLOR.bg;
      ctx.fillText(pl.label, 0, 1);
      ctx.restore();
    }
    for (const cu of this.cursors) this.arrow(ctx, cu.x, cu.y, cu.tele > 0 || cu.dash > 0 ? COLOR.red : COLOR.text);
    for (const m of this.mines) {
      const blink = m.fuse < 0.6 ? Math.sin(m.fuse * 50) > 0 : true;
      ctx.beginPath();
      ctx.roundRect(m.x - 58, m.y - 15, 116, 30, 15);
      ctx.strokeStyle = COLOR.red;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (blink) {
        ctx.fillStyle = 'rgba(255,46,46,0.2)';
        ctx.fill();
      }
      ctx.font = `500 10px ${FONT.sans}`;
      ctx.letterSpacing = '2px';
      ctx.fillStyle = COLOR.red;
      ctx.fillText('DO NOT CLICK', m.x + 1, m.y + 1);
      ctx.letterSpacing = '0px';
      ctx.strokeStyle = 'rgba(255,46,46,0.25)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 105 * (1 - m.fuse / 1.9) + 10, 0, TAU);
      ctx.stroke();
    }
    for (const tr of this.traps) {
      const k = tr.t / tr.dur;
      const r = tr.r * (1 - k) + 26 * k;
      ctx.strokeStyle = `rgba(255,46,46,${0.3 + k * 0.6})`;
      ctx.lineWidth = 1 + k * 2;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, r, 0, TAU);
      ctx.stroke();
      ctx.font = `400 10px ${FONT.mono}`;
      ctx.fillStyle = COLOR.red;
      ctx.fillText('you hesitated', tr.x, tr.y - r - 10);
    }
    if (this.phase === 4 && this.trans <= 0 && !this.halted) {
      ctx.strokeStyle = 'rgba(244,241,234,0.7)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(this.gx, this.gy, 14, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `400 10px ${FONT.mono}`;
      ctx.fillStyle = COLOR.muted;
      ctx.textAlign = 'left';
      ctx.fillText(`you · ${fmtClock(this.ghostI / 12)}`, this.gx + 20, this.gy);
    }
    if (this.phase === 2 && this.trans <= 0) {
      // gravity indicator
      ctx.save();
      ctx.translate(engine.w - 60, engine.h / 2);
      ctx.rotate(engine.p.gravDir > 0 ? 0 : Math.PI);
      ctx.strokeStyle = COLOR.violet;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(0, 24);
      ctx.moveTo(-8, 14);
      ctx.lineTo(0, 24);
      ctx.lineTo(8, 14);
      ctx.stroke();
      ctx.restore();
      ctx.font = `400 10px ${FONT.mono}`;
      ctx.fillStyle = COLOR.violet;
      ctx.textAlign = 'center';
      ctx.fillText('GRAVITY', engine.w - 60, engine.h / 2 + 44);
    }
    void pointer;
  }
}
