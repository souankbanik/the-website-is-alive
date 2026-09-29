import type { Level, Target } from './engine';
import { engine } from './engine';
import { audio } from '../audio/engine';
import { world } from '../scenes/world';
import { session, addSecret } from '../store/session';
import { game } from '../store/game';
import { COLOR, FONT } from '../utils/textures';
import { clamp, damp, rand, TAU } from '../utils/math';

export type NavKind = 'ABOUT' | 'WORK' | 'CONTACT' | 'EXIT';

interface Nav extends Target {
  kind: NavKind;
  label: string;
  vx: number;
  vy: number;
  hp: number;
  max: number;
  w: number;
  flash: number;
  t: number;
  clone: boolean;
  enter: number;
  sx: number;
  sy: number;
  hx: number;
  hy: number;
  cd: number;
  splits: number;
}
interface Card {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  alive: boolean;
  n: number;
}

const NAV_FONT = `500 26px ${FONT.sans}`;

/** The navigation detaches from the header and fights back. */
export class NavBoss implements Level {
  done = false;
  t = 0;
  navs: Nav[] = [];
  cards: Card[] = [];
  private endT = -1;
  private hintShown = new Set<NavKind>();

  constructor(start: Record<NavKind, { x: number; y: number }>) {
    const W = engine.w;
    const H = engine.h;
    const homes: Record<NavKind, [number, number]> = {
      ABOUT: [W * 0.22, H * 0.32],
      WORK: [W * 0.5, H * 0.2],
      CONTACT: [W * 0.78, H * 0.4],
      EXIT: [W * 0.6, H * 0.7],
    };
    (['ABOUT', 'WORK', 'CONTACT', 'EXIT'] as NavKind[]).forEach((k) => {
      const hp = { ABOUT: 6, WORK: 10, CONTACT: 10, EXIT: 6 }[k];
      this.navs.push(this.make(k, start[k].x, start[k].y, homes[k][0], homes[k][1], hp, false));
    });
  }

  private make(kind: NavKind, sx: number, sy: number, hx: number, hy: number, hp: number, clone: boolean): Nav {
    engine.ctx.font = NAV_FONT;
    engine.ctx.letterSpacing = '6px';
    const label = kind === 'EXIT' ? 'EXIT ↗' : kind;
    const w = engine.ctx.measureText(label).width;
    engine.ctx.letterSpacing = '0px';
    const n: Nav = {
      kind,
      label,
      x: sx,
      y: sy,
      sx,
      sy,
      hx,
      hy,
      vx: rand(-60, 60),
      vy: rand(-60, 60),
      r: Math.max(26, w * 0.45),
      alive: true,
      bias: kind === 'EXIT' ? 0.9 : 1,
      hp,
      max: hp,
      w,
      flash: 0,
      t: rand(0, 10),
      clone,
      enter: clone ? 1 : 0,
      cd: rand(1, 2),
      splits: 0,
      hit: (d) => this.damage(n, d),
    };
    return n;
  }

  targets() {
    return this.navs;
  }

  private damage(n: Nav, d: number) {
    if (!n.alive || n.enter < 1) return;
    n.hp -= d;
    n.flash = 1;
    audio.bossHit();
    if (n.kind === 'ABOUT' && !n.clone && n.splits < 3 && n.hp < n.max * (1 - (n.splits + 1) * 0.22)) {
      // ABOUT duplicates itself
      n.splits++;
      const c = this.make('ABOUT', n.x, n.y, n.x, n.y, 3, true);
      c.vx = rand(-260, 260);
      c.vy = rand(-260, 260);
      this.navs.push(c);
      audio.glitch();
      world.glitch(0.25, 0.12);
      if (n.splits === 1) game().say('observer', 'there is more of me than you think.');
    }
    if (n.kind === 'EXIT' && n.hp > 0) {
      // it flinches away from every hit
      n.vx += rand(-500, 500);
      n.vy += rand(-500, 500);
    }
    if (n.hp <= 0) this.kill(n);
  }

  private kill(n: Nav) {
    n.alive = false;
    if (!n.clone) {
      session.navKillOrder.push(n.kind);
      if (session.navKillOrder.length === 1 && n.kind === 'EXIT') addSecret('exit-first');
      const remark: Record<NavKind, string> = {
        ABOUT: 'there is nothing left to know about me.',
        WORK: 'that was everything i ever made.',
        CONTACT: 'no one can reach me now.',
        EXIT: 'there is no way out anymore. you did that.',
      };
      game().say('observer', remark[n.kind]);
    }
    // the broken navigation falls into darkness
    engine.shatterText(n.label, n.x, n.y, 26, 0, n.kind === 'EXIT' ? COLOR.red : COLOR.text, { font: NAV_FONT, force: 160, g: 500, shrink: true, life: 2.6 });
    engine.spark(n.x, n.y, 30, COLOR.violet, 380, 0.7);
    engine.addCombo();
    world.shake(0.35);
    audio.kill();
  }

  onBurst(x: number, y: number, r: number) {
    for (const c of this.cards) {
      if (c.alive && Math.hypot(c.x - x, c.y - y) < r) {
        c.alive = false;
        engine.spark(c.x, c.y, 10, COLOR.text, 200, 0.4);
      }
    }
  }

  update(dt: number) {
    this.t += dt;
    const p = engine.p;
    const W = engine.w;
    const H = engine.h;
    for (const n of this.navs) {
      if (!n.alive) continue;
      n.t += dt;
      n.flash *= Math.exp(-dt * 9);
      if (n.enter < 1) {
        n.enter = Math.min(1, n.enter + dt / 1.6);
        const e = 1 - Math.pow(1 - n.enter, 4);
        n.x = n.sx + (n.hx - n.sx) * e;
        n.y = n.sy + (n.hy - n.sy) * e + Math.sin(e * Math.PI) * 60;
        continue;
      }
      const dx = p.x - n.x;
      const dy = p.y - n.y;
      const d = Math.hypot(dx, dy) || 1;
      if (n.kind === 'ABOUT') {
        const ox = n.hx + Math.sin(n.t * 0.7) * W * 0.12;
        const oy = n.hy + Math.cos(n.t * 0.9) * H * 0.1;
        n.vx += ((ox - n.x) * 2 - n.vx) * damp(n.clone ? 0.6 : 2, dt);
        n.vy += ((oy - n.y) * 2 - n.vy) * damp(n.clone ? 0.6 : 2, dt);
        if (n.clone) {
          n.vx += (dx / d) * 120 * dt;
          n.vy += (dy / d) * 120 * dt;
        }
      } else if (n.kind === 'WORK') {
        n.vx += ((n.hx + Math.sin(n.t * 0.5) * W * 0.25 - n.x) * 1.5 - n.vx) * damp(2, dt);
        n.vy += ((n.hy + Math.sin(n.t * 1.3) * 30 - n.y) * 1.5 - n.vy) * damp(2, dt);
        n.cd -= dt;
        if (n.cd <= 0) {
          n.cd = 1.7;
          const base = Math.atan2(dy, dx);
          for (let i = -1; i <= 1; i++) {
            const a = base + i * 0.28;
            this.cards.push({ x: n.x, y: n.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, rot: a, vr: rand(-2, 2), alive: true, n: (Math.random() * 40) | 0 });
          }
          audio.click();
        }
      } else if (n.kind === 'CONTACT') {
        n.vx += ((n.hx + Math.cos(n.t * 0.35) * W * 0.12 - n.x) - n.vx) * damp(1.5, dt);
        n.vy += ((n.hy + Math.sin(n.t * 0.5) * H * 0.18 - n.y) - n.vy) * damp(1.5, dt);
        // magnetic field pulls the cursor in
        if (d < 360 && p.visible) {
          const f = (1 - d / 360) * 520;
          p.pullX -= (dx / d) * f * dt * 1.3;
          p.pullY -= (dy / d) * f * dt * 1.3;
          p.heavy = Math.max(p.heavy, (1 - d / 360) * 0.8);
          if (!this.hintShown.has('CONTACT') && d < 220) {
            this.hintShown.add('CONTACT');
            game().say('observer', 'stay. talk to me.');
          }
        }
        if (d < n.r + p.r) engine.hurt(12, n.x, n.y);
      } else if (n.kind === 'EXIT') {
        // always escaping
        if (d < 340) {
          n.vx -= (dx / d) * 1300 * dt;
          n.vy -= (dy / d) * 1300 * dt;
        } else {
          n.vx += Math.sin(n.t * 2) * 80 * dt;
          n.vy += Math.cos(n.t * 1.7) * 80 * dt;
        }
        const sp = Math.hypot(n.vx, n.vy);
        if (sp > 520) {
          n.vx *= 520 / sp;
          n.vy *= 520 / sp;
        }
        n.vx *= Math.exp(-dt * 0.9);
        n.vy *= Math.exp(-dt * 0.9);
      }
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      if (n.x < n.w / 2 + 10 || n.x > W - n.w / 2 - 10) {
        n.vx *= -0.8;
        n.x = clamp(n.x, n.w / 2 + 10, W - n.w / 2 - 10);
      }
      if (n.y < 70 || n.y > H - 40) {
        n.vy *= -0.8;
        n.y = clamp(n.y, 70, H - 40);
      }
      if (n.kind !== 'CONTACT' && d < n.r * 0.7 + p.r) engine.hurt(10, n.x, n.y);
    }
    p.heavy *= Math.exp(-dt * 3);

    for (const c of this.cards) {
      if (!c.alive) continue;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.x < -80 || c.x > W + 80 || c.y < -80 || c.y > H + 80) c.alive = false;
      else if (engine.collides(c.x, c.y, 22)) {
        engine.hurt(14, c.x, c.y);
        c.alive = false;
      }
    }
    this.cards = this.cards.filter((c) => c.alive);
    if (this.endT < 0 && this.navs.every((n) => !n.alive)) this.endT = this.t;
    if (this.endT >= 0 && this.t - this.endT > 1.6) this.done = true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    // CONTACT field
    for (const n of this.navs) {
      if (!n.alive || n.kind !== 'CONTACT' || n.enter < 1) continue;
      for (let i = 0; i < 4; i++) {
        const r = ((this.t * 70 + i * 90) % 360) + 10;
        ctx.strokeStyle = `rgba(124,92,255,${0.35 * (1 - r / 370)})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 8]);
        ctx.beginPath();
        ctx.arc(n.x, n.y, 370 - r, 0, TAU);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // project cards
    for (const c of this.cards) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = COLOR.bg2;
      ctx.fillRect(-30, -20, 60, 40);
      ctx.strokeStyle = 'rgba(244,241,234,0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-30, -20, 60, 40);
      ctx.fillStyle = 'rgba(124,92,255,0.35)';
      ctx.fillRect(-26, -16, 52, 20);
      ctx.font = `400 7px ${FONT.mono}`;
      ctx.fillStyle = COLOR.muted;
      ctx.textAlign = 'left';
      ctx.fillText(`PROJECT ${String(c.n).padStart(2, '0')}`, -26, 13);
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.navs) {
      if (!n.alive) continue;
      const jitter = n.flash * 4;
      ctx.font = NAV_FONT;
      ctx.letterSpacing = '6px';
      if (n.flash > 0.05) {
        ctx.fillStyle = COLOR.cyan;
        ctx.fillText(n.label, n.x + jitter, n.y);
        ctx.fillStyle = COLOR.red;
        ctx.fillText(n.label, n.x - jitter, n.y);
      }
      ctx.fillStyle = n.kind === 'EXIT' ? COLOR.red : n.clone ? 'rgba(244,241,234,0.6)' : COLOR.text;
      ctx.fillText(n.label, n.x, n.y);
      ctx.letterSpacing = '0px';
      // health is the underline: it shortens as the link breaks
      const f = Math.max(0, n.hp / n.max);
      ctx.strokeStyle = n.kind === 'EXIT' ? COLOR.red : COLOR.text;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const uw = n.w * f;
      ctx.moveTo(n.x - uw / 2, n.y + 22 + Math.sin(this.t * 4 + n.t) * 2);
      ctx.quadraticCurveTo(n.x, n.y + 22 + Math.sin(this.t * 3) * 5, n.x + uw / 2, n.y + 22);
      ctx.stroke();
      if (n.kind === 'WORK' && n.cd < 0.35) {
        ctx.strokeStyle = 'rgba(255,46,46,0.7)';
        ctx.strokeRect(n.x - n.w / 2 - 10, n.y - 22, n.w + 20, 44);
      }
    }
  }
}
