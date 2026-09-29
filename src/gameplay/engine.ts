import { pointer, input, bus } from '../hooks/input';
import { audio } from '../audio/engine';
import { world } from '../scenes/world';
import { FONT, COLOR } from '../utils/textures';
import { device } from '../utils/device';
import { session } from '../store/session';
import { game } from '../store/game';
import { clamp, damp, rand, TAU } from '../utils/math';

export interface Target {
  x: number;
  y: number;
  r: number;
  alive: boolean;
  /** <1 makes this target preferred by homing pulses */
  bias?: number;
  hit(dmg: number, fx: number, fy: number): void;
}

export interface Level {
  done: boolean;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  targets(): Target[];
  onBurst?(x: number, y: number, r: number): void;
  onFire?(x: number, y: number): void;
  onLost?(): void;
  dispose?(): void;
}

interface Bolt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  target: Target | null;
  px: number;
  py: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  col: string;
  g: number;
  add: boolean;
}
interface Glyph {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  ch: string;
  font: string;
  col: string;
  life: number;
  max: number;
  g: number;
  shrink: boolean;
}
interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  life: number;
  total: number;
  col: string;
  w: number;
}

const MAX_PARTS = device.low ? 450 : 1100;
const MAX_GLYPHS = device.low ? 140 : 320;

class Engine {
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;
  level: Level | null = null;
  ambient: 'none' | 'trace' = 'none';
  ambientAlpha = 0;
  paused = false;
  time = 0;
  p = {
    x: innerWidth / 2,
    y: innerHeight / 2,
    r: 10,
    visible: false,
    armed: false,
    energy: 100,
    signal: 100,
    invuln: 0,
    dashCd: 0,
    dashT: 0,
    charging: false,
    chargeT: 0,
    chargeSound: false,
    combo: 0,
    maxCombo: 0,
    comboT: 0,
    heavy: 0,
    pullX: 0,
    pullY: 0,
    lost: false,
    style: 'core' as 'core' | 'arrow',
    yMode: 'pointer' as 'pointer' | 'gravity',
    vy: 0,
    gravDir: 1,
    alpha: 0,
  };
  private bolts: Bolt[] = [];
  private parts: Part[] = [];
  private glyphs: Glyph[] = [];
  private rings: Ring[] = [];
  private coreSprite!: HTMLCanvasElement;
  redFlash = 0;
  hudEls: { energy?: HTMLElement | null; combo?: HTMLElement | null; signal?: HTMLElement | null } = {};
  private hudT = 0;

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.coreSprite = this.makeCoreSprite();
    bus.on('down', () => this.onDown());
    bus.on('up', () => this.onUp());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, device.low ? 1 : 1.5);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
  }

  private makeCoreSprite() {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.12, 'rgba(244,241,234,0.95)');
    grd.addColorStop(0.3, 'rgba(124,92,255,0.45)');
    grd.addColorStop(0.6, 'rgba(0,240,255,0.08)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return c;
  }

  setLevel(l: Level | null) {
    this.level?.dispose?.();
    this.level = l;
    this.bolts.length = 0;
  }

  /** hand the cursor over: the player becomes an energy core */
  arm(on: boolean) {
    this.p.armed = on;
    input.gameCapture = on;
  }
  show(on: boolean) {
    this.p.visible = on;
    if (on) {
      this.p.x = pointer.x;
      this.p.y = pointer.y;
    }
  }
  resetPlayer() {
    Object.assign(this.p, { energy: 100, signal: 100, invuln: 0, combo: 0, comboT: 0, heavy: 0, pullX: 0, pullY: 0, lost: false, style: 'core', yMode: 'pointer' });
  }

  // ─────────────────────── input ───────────────────────
  private onDown() {
    if (!this.p.armed || this.p.lost || this.paused) return;
    this.p.charging = true;
    this.p.chargeT = 0;
  }
  private onUp() {
    const p = this.p;
    if (!p.charging) return;
    p.charging = false;
    if (p.chargeSound) {
      audio.chargeStop();
      p.chargeSound = false;
    }
    if (!p.armed || p.lost) return;
    if (p.chargeT < 0.22) this.fire();
    else this.burst(clamp((p.chargeT - 0.22) / 1.0, 0, 1));
  }

  private nearestTarget(x: number, y: number, max = 1100) {
    if (!this.level) return null;
    let best: Target | null = null;
    let bd = max;
    for (const t of this.level.targets()) {
      if (!t.alive) continue;
      const d = Math.hypot(t.x - x, t.y - y) * (t.bias ?? 1);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  fire() {
    const p = this.p;
    if (p.energy < 5) {
      audio.hit();
      return;
    }
    p.energy -= 5;
    const target = this.nearestTarget(p.x, p.y);
    let vx = 0;
    let vy = -1400;
    if (target) {
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      vx = Math.cos(a) * 1400;
      vy = Math.sin(a) * 1400;
    }
    this.bolts.push({ x: p.x, y: p.y, vx, vy, life: 1.1, target, px: p.x, py: p.y });
    this.ring(p.x, p.y, 26, 0.25, COLOR.text, 1);
    audio.pulse();
    this.level?.onFire?.(p.x, p.y);
  }

  burst(power: number) {
    const p = this.p;
    const cost = 14 + 26 * power;
    if (p.energy < 8) {
      audio.hit();
      return;
    }
    if (p.energy < cost) power *= p.energy / cost;
    p.energy = Math.max(0, p.energy - cost);
    const r = 110 + 250 * power;
    const dmg = 2 + 7 * power;
    this.ring(p.x, p.y, r, 0.55, COLOR.cyan, 2);
    this.ring(p.x, p.y, r * 0.7, 0.45, COLOR.violet, 1);
    this.spark(p.x, p.y, 30 + power * 40, COLOR.text, 500 + power * 400, 0.7);
    world.shake(0.25 + power * 0.5);
    audio.burst(power);
    if (this.level) {
      for (const t of this.level.targets()) {
        if (!t.alive) continue;
        if (Math.hypot(t.x - p.x, t.y - p.y) - t.r < r) {
          t.hit(dmg, p.x, p.y);
          this.addCombo();
        }
      }
      this.level.onBurst?.(p.x, p.y, r);
      this.level.onFire?.(p.x, p.y);
    }
  }

  addCombo() {
    const p = this.p;
    p.combo++;
    p.comboT = 2.4;
    if (p.combo > p.maxCombo) p.maxCombo = p.combo;
  }

  /** enemy contact. returns true if damage was taken */
  hurt(dmg: number, fx = this.p.x, fy = this.p.y) {
    const p = this.p;
    if (!p.visible || p.invuln > 0 || p.lost || p.dashT > 0) return false;
    p.signal -= dmg;
    p.invuln = 1;
    p.combo = 0;
    this.redFlash = 1;
    const a = Math.atan2(p.y - fy, p.x - fx);
    p.x += Math.cos(a) * 24;
    p.y += Math.sin(a) * 24;
    this.spark(p.x, p.y, 24, COLOR.red, 380, 0.5);
    world.shake(0.55);
    world.glitch(0.35, 0.14);
    audio.hurt();
    if (p.signal <= 0) this.lose();
    return true;
  }

  private lose() {
    const p = this.p;
    p.lost = true;
    p.signal = 0;
    session.deaths++;
    this.level?.onLost?.();
    game().show('SIGNAL LOST — RECONNECTING', 'mono-red', 'low');
    audio.corrupt();
    setTimeout(() => {
      p.lost = false;
      p.signal = 70;
      p.invuln = 1.6;
      p.x = pointer.x;
      p.y = pointer.y;
      const c = game().caption;
      if (c && c.text.startsWith('SIGNAL LOST')) game().hide();
    }, 1900);
  }

  collides(x: number, y: number, r: number) {
    const p = this.p;
    return p.visible && !p.lost && Math.hypot(p.x - x, p.y - y) < r + p.r;
  }

  // ─────────────────────── fx ───────────────────────
  spark(x: number, y: number, n: number, col: string, speed = 300, life = 0.6, g = 0, add = true) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTS) this.parts.shift();
      const a = Math.random() * TAU;
      const s = speed * (0.2 + Math.random() * 0.8);
      const l = life * (0.5 + Math.random() * 0.5);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, size: 1 + Math.random() * 2.2, col, g, add });
    }
  }
  ring(x: number, y: number, max: number, life: number, col: string, w: number) {
    this.rings.push({ x, y, r: 0, max, life, total: life, col, w });
  }
  /** break a word into physical letters */
  shatterText(text: string, x: number, y: number, size: number, rot: number, col: string, opts: { font?: string; force?: number; g?: number; shrink?: boolean; life?: number } = {}) {
    const ctx = this.ctx;
    const font = opts.font ?? `400 ${size}px ${FONT.serif}`;
    ctx.font = font;
    const total = ctx.measureText(text).width;
    let off = -total / 2;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const force = opts.force ?? 260;
    for (const ch of text) {
      const cw = ctx.measureText(ch).width;
      const lx = off + cw / 2;
      off += cw;
      if (ch === ' ') continue;
      if (this.glyphs.length >= MAX_GLYPHS) this.glyphs.shift();
      const gx = x + lx * cos;
      const gy = y + lx * sin;
      const a = Math.atan2(gy - y, gx - x) + rand(-0.8, 0.8);
      const life = (opts.life ?? 1.6) * rand(0.7, 1.2);
      this.glyphs.push({
        x: gx,
        y: gy,
        vx: Math.cos(a) * force * rand(0.4, 1.2),
        vy: Math.sin(a) * force * rand(0.4, 1.2) - force * 0.6,
        rot,
        vr: rand(-6, 6),
        ch,
        font,
        col,
        life,
        max: life,
        g: opts.g ?? 900,
        shrink: !!opts.shrink,
      });
    }
  }

  // ─────────────────────── loop ───────────────────────
  update(dt: number) {
    if (!this.ctx) return;
    if (this.paused) {
      this.draw();
      return;
    }
    this.time += dt;
    const p = this.p;

    // movement: the core follows the pointer with weight
    if (p.visible && !p.lost) {
      if (input.dashQueued) {
        input.dashQueued = false;
        if (p.armed && p.dashCd <= 0) {
          p.dashT = 0.2;
          p.invuln = Math.max(p.invuln, 0.35);
          p.dashCd = 1.1;
          audio.dash();
          this.ring(p.x, p.y, 70, 0.3, COLOR.cyan, 1.5);
        }
      }
      const k = p.dashT > 0 ? 45 : 16 - p.heavy * 11;
      let ty = pointer.y;
      if (p.yMode === 'gravity' && !device.touch) {
        const w = input.wheel;
        input.wheel = 0;
        if (w !== 0) {
          p.gravDir = Math.sign(w);
          p.vy += clamp(w, -120, 120) * 2.6;
        }
        p.vy += p.gravDir * 320 * dt;
        p.vy *= Math.exp(-dt * 2.4);
        p.vy = clamp(p.vy, -620, 620);
        let ny = p.y + p.vy * dt;
        if (ny < 30 || ny > this.h - 30) {
          p.vy *= -0.3;
          ny = clamp(ny, 30, this.h - 30);
        }
        ty = ny;
        p.y = ny;
      }
      const tx = pointer.x + p.pullX;
      p.x += (tx - p.x) * damp(k, dt);
      if (p.yMode === 'pointer' || device.touch) p.y += (ty + p.pullY - p.y) * damp(k, dt);
      p.x = clamp(p.x, 4, this.w - 4);
      p.y = clamp(p.y, 4, this.h - 4);
      if (p.dashT > 0) {
        p.dashT -= dt;
        this.spark(p.x, p.y, 3, COLOR.cyan, 60, 0.35);
      }
    } else {
      input.dashQueued = false;
    }
    p.pullX *= Math.exp(-dt * 6);
    p.pullY *= Math.exp(-dt * 6);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.energy = Math.min(100, p.energy + dt * (p.charging ? 0 : 20));
    p.alpha += ((p.visible ? 1 : 0) - p.alpha) * damp(8, dt);
    if (p.charging) {
      p.chargeT += dt;
      if (p.chargeT > 0.22 && !p.chargeSound) {
        p.chargeSound = true;
        audio.chargeStart();
      }
    }
    if (p.comboT > 0) {
      p.comboT -= dt;
      if (p.comboT <= 0) p.combo = 0;
    }
    this.redFlash *= Math.exp(-dt * 5);

    this.level?.update(dt);
    this.updateBolts(dt);
    this.updateFx(dt);
    this.updateHud(dt);
    this.draw();
  }

  private updateBolts(dt: number) {
    const targets = this.level?.targets() ?? [];
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      if (b.target && b.target.alive) {
        const a = Math.atan2(b.target.y - b.y, b.target.x - b.x);
        const sp = Math.hypot(b.vx, b.vy);
        const ca = Math.atan2(b.vy, b.vx);
        let da = a - ca;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        const na = ca + clamp(da, -12 * dt, 12 * dt);
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
      }
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let hit = false;
      for (const t of targets) {
        if (!t.alive) continue;
        if (Math.hypot(t.x - b.x, t.y - b.y) < t.r + 8) {
          t.hit(1, b.x, b.y);
          this.addCombo();
          this.spark(b.x, b.y, 8, COLOR.text, 240, 0.35);
          audio.hit();
          hit = true;
          break;
        }
      }
      if (hit || b.life <= 0 || b.x < -50 || b.x > this.w + 50 || b.y < -50 || b.y > this.h + 50) this.bolts.splice(i, 1);
    }
  }

  private updateFx(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life -= dt;
      if (q.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      q.vx *= Math.exp(-dt * 2.5);
      q.vy = q.vy * Math.exp(-dt * 2.5) + q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    for (let i = this.glyphs.length - 1; i >= 0; i--) {
      const g = this.glyphs[i];
      g.life -= dt;
      if (g.life <= 0) {
        this.glyphs.splice(i, 1);
        continue;
      }
      g.vy += g.g * dt;
      g.vx *= Math.exp(-dt * 0.8);
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.rot += g.vr * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
      else r.r = r.max * (1 - Math.pow(r.life / r.total, 3));
    }
  }

  private updateHud(dt: number) {
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    const { energy, combo, signal } = this.hudEls;
    if (energy) energy.textContent = `${Math.round(this.p.energy)}%`;
    if (combo) combo.textContent = `x${this.p.combo}`;
    if (signal) signal.textContent = `${Math.max(0, Math.round(this.p.signal))}%`;
  }

  // ─────────────────────── draw ───────────────────────
  private draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.ambientAlpha += ((this.ambient === 'trace' ? 1 : 0) - this.ambientAlpha) * 0.05;
    if (this.ambientAlpha > 0.01) this.drawTrace(ctx);

    this.level?.draw(ctx);

    // rings
    for (const r of this.rings) {
      ctx.globalAlpha = Math.max(0, r.life / r.total);
      ctx.strokeStyle = r.col;
      ctx.lineWidth = r.w;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // glyph debris
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const g of this.glyphs) {
      const a = Math.min(1, g.life / (g.max * 0.5));
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.rot);
      if (g.shrink) ctx.scale(0.3 + 0.7 * a, 0.3 + 0.7 * a);
      ctx.font = g.font;
      ctx.fillStyle = g.col;
      ctx.fillText(g.ch, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // particles
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.parts) {
      ctx.globalAlpha = q.life / q.max;
      ctx.fillStyle = q.col;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    // bolts
    ctx.lineCap = 'round';
    for (const b of this.bolts) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COLOR.cyan;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    this.drawPlayer(ctx);

    if (this.redFlash > 0.02) {
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      g.addColorStop(0, 'rgba(255,46,46,0)');
      g.addColorStop(1, `rgba(255,46,46,${0.35 * this.redFlash})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.p;
    if (p.alpha < 0.02 || p.lost) return;
    const blink = p.invuln > 0 && p.dashT <= 0 ? (Math.sin(this.time * 40) > 0 ? 0.35 : 1) : 1;
    ctx.globalAlpha = p.alpha * blink;
    if (p.style === 'arrow') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = COLOR.text;
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
      ctx.fillStyle = COLOR.violet;
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    const pulse = 1 + Math.sin(this.time * 6) * 0.06;
    const s = (p.armed ? 64 : 44) * pulse * (p.charging && p.chargeT > 0.22 ? 1 + Math.min(1, p.chargeT - 0.22) * 0.8 : 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.coreSprite, p.x - s / 2, p.y - s / 2, s, s);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, TAU);
    ctx.fill();
    if (p.armed) {
      // circular energy meter
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(244,241,234,0.15)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 17, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = p.energy < 20 ? COLOR.red : COLOR.cyan;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * (p.energy / 100));
      ctx.stroke();
      if (p.charging && p.chargeT > 0.22) {
        const c = clamp((p.chargeT - 0.22) / 1.0, 0, 1);
        ctx.strokeStyle = c >= 1 ? '#fff' : COLOR.violet;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 24 + c * 40, this.time * 3, this.time * 3 + TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (p.dashCd > 0) {
        ctx.strokeStyle = 'rgba(0,240,255,0.5)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / 1.1));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** section 01: the site visualises the visitor's own movement history */
  private drawTrace(ctx: CanvasRenderingContext2D) {
    const a = this.ambientAlpha;
    const path = session.path;
    const n = path.length / 2;
    if (n > 2) {
      ctx.strokeStyle = `rgba(141,141,141,${0.22 * a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const start = Math.max(0, n - 700);
      for (let i = start; i < n; i++) {
        const x = path[i * 2] * this.w;
        const y = path[i * 2 + 1] * this.h;
        i === start ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const tr = pointer.trail;
    if (tr.length > 2) {
      const now = performance.now();
      for (let i = 1; i < tr.length; i++) {
        const age = (now - tr[i].t) / 3000;
        ctx.strokeStyle = `rgba(244,241,234,${(1 - age) * 0.8 * a})`;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
        ctx.lineTo(tr[i].x, tr[i].y);
        ctx.stroke();
      }
    }
    ctx.font = `400 10px ${FONT.mono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const ps of pointer.pauses) {
      ctx.strokeStyle = `rgba(124,92,255,${0.7 * a})`;
      ctx.beginPath();
      ctx.arc(ps.x, ps.y, 4 + Math.min(ps.d, 6) * 2.5, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = `rgba(141,141,141,${0.8 * a})`;
      ctx.fillText(`${ps.d.toFixed(1)}s`, ps.x + 10 + ps.d * 2.5, ps.y);
    }
    if (pointer.speed > 6 && Math.random() < 0.5) {
      if (this.parts.length < MAX_PARTS) {
        this.parts.push({ x: pointer.x + rand(-4, 4), y: pointer.y + rand(-4, 4), vx: rand(-20, 20), vy: rand(-40, -10), life: 1.4, max: 1.4, size: 1.2, col: '#8D8D8D', g: 0, add: true });
      }
    }
  }
}

export const engine = new Engine();
