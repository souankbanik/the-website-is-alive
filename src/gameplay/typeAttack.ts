import type { Level, Target } from './engine';
import { engine } from './engine';
import { audio } from '../audio/engine';
import { world } from '../scenes/world';
import { COLOR, FONT } from '../utils/textures';
import { device } from '../utils/device';
import { clamp, lerp, pick, rand } from '../utils/math';

const WORDS = ['STOP', 'LEAVE', 'NO', "DON'T", 'BACK', 'WAIT', 'STAY', 'NO'];

interface Word extends Target {
  text: string;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  w: number;
  h: number;
  hp: number;
  col: string;
  flash: number;
  italic: boolean;
}

/** Words with weight, falling on you. */
export class TypeAttack implements Level {
  done = false;
  t = 0;
  dur = 28;
  armAt = 7;
  private words: Word[] = [];
  private spawnT = 0.6;
  private armed = false;
  onArm: (() => void) | null = null;
  private scale = device.touch ? 0.6 : 1;

  targets() {
    return this.words;
  }

  private spawn(text = pick(WORDS), x?: number, sizeOverride?: number) {
    const size = (sizeOverride ?? rand(90, 210)) * this.scale;
    const italic = Math.random() < 0.25;
    const ctx = engine.ctx;
    ctx.font = `${italic ? 'italic ' : ''}400 ${size}px ${FONT.serif}`;
    const w = ctx.measureText(text).width;
    const h = size * 0.72;
    const late = this.t > 15;
    const word: Word = {
      text,
      x: x ?? rand(w / 2, engine.w - w / 2),
      y: -h,
      vx: rand(-20, 20),
      vy: rand(60, 140) + this.t * 6,
      rot: rand(-0.25, 0.25),
      vr: rand(-0.5, 0.5),
      size,
      w,
      h,
      r: Math.min(w, h) * 0.5,
      hp: Math.ceil(size / 55),
      alive: true,
      col: late && Math.random() < 0.3 ? COLOR.red : COLOR.text,
      flash: 0,
      italic,
      hit: (d, fx, fy) => {
        word.hp -= d;
        word.flash = 1;
        word.vy -= 40;
        word.vr += (fx < word.x ? 1 : -1) * 0.8;
        if (word.hp <= 0) this.kill(word, true);
        void fy;
      },
    };
    this.words.push(word);
  }

  private kill(w: Word, shot: boolean) {
    if (!w.alive) return;
    w.alive = false;
    const font = `${w.italic ? 'italic ' : ''}400 ${w.size}px ${FONT.serif}`;
    if (shot) {
      engine.shatterText(w.text, w.x, w.y, w.size, w.rot, w.col, { font, force: 420, g: 700 });
      engine.spark(w.x, w.y, 26, COLOR.text, 420, 0.6);
      audio.shatter();
      world.shake(0.2);
    } else {
      // hits the floor: heavy, with debris
      engine.shatterText(w.text, w.x, engine.h - w.h * 0.3, w.size, w.rot, w.col, { font, force: 200 + w.size, g: 1400, life: 1.2 });
      engine.spark(w.x, engine.h - 4, 18, COLOR.muted, 260, 0.6, 600, false);
      world.shake(0.08 + w.size / 1400);
      audio.impact(clamp(w.size / 180, 0.4, 1));
    }
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    if (!this.armed && t >= this.armAt) {
      this.armed = true;
      this.onArm?.();
    }
    if (t < this.dur) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        const k = t / this.dur;
        this.spawnT = lerp(1.3, 0.42, k) * (device.touch ? 1.25 : 1);
        if (t > 19 && Math.random() < 0.18) {
          // a sentence of refusals, with one way through
          const gap = (rand(0.15, 0.85) * engine.w) | 0;
          for (let x = 70; x < engine.w; x += 150 * this.scale) if (Math.abs(x - gap) > 120) this.spawn('NO', x, 110);
        } else this.spawn();
      }
    } else if (!this.done) {
      if (this.words.every((w) => !w.alive)) this.done = true;
      else if (t > this.dur + 0.6) this.words.forEach((w) => this.kill(w, true));
    }

    for (const w of this.words) {
      if (!w.alive) continue;
      w.vy = Math.min(w.vy + 260 * dt, 900);
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.rot += w.vr * dt;
      w.flash *= Math.exp(-dt * 10);
      if (w.y > engine.h - w.h * 0.3) {
        this.kill(w, false);
        continue;
      }
      // rotated-rect vs circle
      const p = engine.p;
      const dx = p.x - w.x;
      const dy = p.y - w.y;
      const c = Math.cos(-w.rot);
      const s = Math.sin(-w.rot);
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      if (Math.abs(lx) < w.w / 2 + p.r - 6 && Math.abs(ly) < w.h / 2 + p.r - 4) engine.hurt(16, w.x, w.y);
    }
    this.words = this.words.filter((w) => w.alive);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const w of this.words) {
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.rot);
      // weight: stretch along the fall
      const st = 1 + Math.min(0.18, w.vy / 4500);
      ctx.scale(1 / Math.sqrt(st), st);
      ctx.font = `${w.italic ? 'italic ' : ''}400 ${w.size}px ${FONT.serif}`;
      if (w.flash > 0.05) {
        ctx.fillStyle = COLOR.cyan;
        ctx.globalAlpha = w.flash * 0.8;
        ctx.fillText(w.text, 4 * w.flash, 0);
        ctx.fillStyle = COLOR.red;
        ctx.fillText(w.text, -4 * w.flash, 0);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = w.col;
      ctx.fillText(w.text, 0, 0);
      ctx.restore();
    }
    // survival timer
    if (this.t < this.dur) {
      ctx.font = `400 11px ${FONT.mono}`;
      ctx.fillStyle = COLOR.muted;
      ctx.textAlign = 'center';
      ctx.fillText(`HOLD  ${String(Math.ceil(this.dur - this.t)).padStart(2, '0')}`, engine.w / 2, engine.h - 28);
    }
  }
}
