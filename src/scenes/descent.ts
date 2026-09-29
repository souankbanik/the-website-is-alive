import * as THREE from 'three';
import { artPlane, buttonPlane, cardPlane, planeMesh, textPlane, COLOR, PlaneSpec } from '../utils/textures';
import { session, fmtInt } from '../store/session';
import { device } from '../utils/device';
import { input } from '../hooks/input';
import { damp } from '../utils/math';

interface Frag {
  mesh: THREE.Mesh;
  vr: THREE.Vector3;
}

export const DESCENT_DEPTH = 300;

/** Falling through the remains of the website. */
export class Descent {
  group = new THREE.Group();
  private frags: Frag[] = [];
  private memories: THREE.Mesh[] = [];
  private streaks: THREE.LineSegments;
  private specs: PlaneSpec[] = [];
  y = 0;
  speed = 0;
  boost = 0;
  active = false;
  camX = 0;

  constructor() {
    const S = this.specs;
    S.push(textPlane(['THE WEBSITE'], { size: 170 }));
    S.push(textPlane(['IS ALIVE'], { size: 170, italic: true }));
    S.push(textPlane(['EVERY INTERACTION'], { size: 120 }));
    S.push(textPlane(['LEAVES A TRACE.'], { size: 120 }));
    S.push(buttonPlane('LEFT'));
    S.push(buttonPlane('RIGHT'));
    S.push(buttonPlane('STAY'));
    S.push(buttonPlane('EXIT EXPERIENCE', false, '#1a1a1a'));
    S.push(buttonPlane('DO NOT CLICK', true, COLOR.red));
    S.push(textPlane(['ABOUT'], { font: 'sans', size: 90 }));
    S.push(textPlane(['WORK'], { font: 'sans', size: 90 }));
    S.push(textPlane(['CONTACT'], { font: 'sans', size: 90 }));
    S.push(textPlane(['EXIT'], { font: 'sans', size: 90, color: COLOR.red }));
    S.push(cardPlane('CURSOR MOVED', `${fmtInt(session.cursorDistance)} PX`));
    S.push(cardPlane('TOTAL CLICKS', `${session.totalClicks}`));
    S.push(cardPlane('SCROLL DIRECTION', session.scrollDir));
    S.push(artPlane(1));
    S.push(artPlane(4));
    S.push(artPlane(9));
    'ALIVE?'.split('').forEach((ch) => S.push(textPlane([ch], { size: 260 })));
    S.push(textPlane(['observer.core'], { font: 'mono', size: 70, color: COLOR.violet }));
    S.push(textPlane(['You can leave now.'], { size: 130, color: COLOR.text }));

    const n = device.low ? 36 : 64;
    for (let i = 0; i < n; i++) {
      const spec = S[i % S.length];
      const h = spec.aspect > 3 ? 0.5 + Math.random() * 0.6 : 0.9 + Math.random() * 1.6;
      const mesh = planeMesh(spec, h, 0.9);
      this.place(mesh, -Math.random() * 90 - 6);
      this.group.add(mesh);
      this.frags.push({
        mesh,
        vr: new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.2),
      });
    }

    // the visitor's own earlier words, waiting in the dark
    const mem: [string[], number, 'serif' | 'mono', string][] = [
      [['MOVE FREELY.'], -55, 'mono', COLOR.text],
      [['PLEASE KEEP YOUR', 'CURSOR STILL.'], -130, 'serif', COLOR.text],
      [['DO NOT CLICK.'], -205, 'serif', COLOR.red],
      [[session.dontClickPressed ? 'but you did.' : 'and you listened.'], -250, 'mono', COLOR.violet],
    ];
    mem.forEach(([lines, y, font, color], i) => {
      const m = planeMesh(textPlane(lines, { font, size: font === 'mono' ? 80 : 170, color }), font === 'mono' ? 0.9 : 3.2, 1);
      m.position.set(i % 2 ? 2.8 : -2.8, y, -7);
      m.rotation.y = i % 2 ? -0.35 : 0.35;
      this.group.add(m);
      this.memories.push(m);
    });

    // speed streaks
    const sn = device.low ? 160 : 320;
    const pos = new Float32Array(sn * 6);
    for (let i = 0; i < sn; i++) this.setStreak(pos, i, -Math.random() * 60);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.streaks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x8d8d8d, transparent: true, opacity: 0.35, fog: true }));
    this.streaks.frustumCulled = false;
    this.group.add(this.streaks);
  }

  private setStreak(pos: Float32Array, i: number, y: number) {
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 14;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r - 6;
    const len = 0.6 + Math.random() * 2.4;
    pos.set([x, y, z, x, y + len, z], i * 6);
  }

  private place(mesh: THREE.Mesh, y: number) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.4 + Math.random() * 9;
    mesh.position.set(Math.cos(a) * r, y, Math.sin(a) * r - 7);
    mesh.rotation.set((Math.random() - 0.5) * 1.2, Math.random() * 6.28, (Math.random() - 0.5) * 0.8);
  }

  get depth() {
    return -this.y;
  }

  update(dt: number, t: number, cam: THREE.PerspectiveCamera, look: THREE.Vector2) {
    // scrolling nudges the fall; always comfortable, never violent
    if (this.active) {
      const w = Math.max(0, input.wheel);
      input.wheel = 0;
      this.boost = Math.min(14, this.boost + w * 0.02);
    }
    this.boost *= Math.exp(-dt * 1.4);
    const target = this.active ? 7.5 + this.boost : 0;
    this.speed += (target - this.speed) * damp(1.5, dt);
    this.y -= this.speed * dt;
    this.camX += (look.x * 1.2 - this.camX) * damp(2, dt);
    cam.position.set(this.camX + Math.sin(t * 0.3) * 0.2, this.y, 2);
    cam.lookAt(this.camX * 0.5 - look.x * 0.4, this.y - 6, -7 + look.y * 1.5);

    for (const f of this.frags) {
      f.mesh.rotation.x += f.vr.x * dt;
      f.mesh.rotation.y += f.vr.y * dt;
      f.mesh.rotation.z += f.vr.z * dt;
      if (f.mesh.position.y > this.y + 8 && this.depth < DESCENT_DEPTH - 60) this.place(f.mesh, this.y - 70 - Math.random() * 20);
    }
    const pos = this.streaks.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const n = arr.length / 6;
    for (let i = 0; i < n; i++) {
      if (arr[i * 6 + 1] > this.y + 6) this.setStreak(arr, i, this.y - 50 - Math.random() * 10);
    }
    pos.needsUpdate = true;
    (this.streaks.material as THREE.LineBasicMaterial).opacity = Math.min(0.5, 0.1 + this.speed * 0.03);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.MeshBasicMaterial | undefined;
      if (mat) {
        mat.map?.dispose();
        mat.dispose();
      }
    });
  }
}
