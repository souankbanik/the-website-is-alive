import * as THREE from 'three';
import gsap from 'gsap';
import { device } from '../utils/device';
import { glyphTexture } from '../utils/textures';
import { damp } from '../utils/math';

const IRIS_VERT = /* glsl */ `
attribute vec3 aData; // radius, angle, seed
uniform float uTime, uPix, uSpread, uOpen, uAgit;
varying float vA; varying float vS;
void main(){
  float r = aData.x * (1.0 + uSpread * aData.z * 3.0);
  float a = aData.y + uTime * (0.05 + 0.25 / (aData.x + 0.4)) * (0.6 + uAgit);
  float wob = sin(uTime * 2.0 + aData.z * 30.0) * 0.03 * (1.0 + uAgit * 3.0);
  vec3 p = vec3(cos(a) * (r + wob), sin(a) * (r + wob) * uOpen, sin(aData.z * 40.0 + uTime) * 0.15);
  p += vec3(0.0, 0.0, uSpread * (aData.z - 0.5) * 12.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (1.2 + aData.z * 2.6) * uPix * (8.0 / -mv.z);
  vA = (0.35 + 0.65 * aData.z) * (1.0 - uSpread);
  vS = aData.z;
  gl_Position = projectionMatrix * mv;
}`;
const IRIS_FRAG = /* glsl */ `
uniform vec3 uColA, uColB;
varying float vA; varying float vS;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(mix(uColA, uColB, vS), a * vA);
}`;

interface Ring {
  line: THREE.LineLoop;
  r: number;
  almond: number;
  freq: number;
  amp: number;
  phase: number;
}

/**
 * THE INTERFACE. An abstract digital entity assembled from rings, particles,
 * radial scan lines and typography fragments. Not an eyeball; a watcher.
 */
export class Entity {
  group = new THREE.Group();
  private body = new THREE.Group();
  private pupil = new THREE.Group();
  private rings: Ring[] = [];
  private iris: THREE.Points;
  private irisMat: THREE.ShaderMaterial;
  private radials: THREE.LineSegments;
  private glyphs: { s: THREE.Sprite; r: number; a: number; sp: number; y: number }[] = [];
  private pupilDisc: THREE.Mesh;
  private pupilRing: THREE.LineLoop;
  private ringMat: THREE.LineBasicMaterial;
  private accentMat: THREE.LineBasicMaterial;
  open = 0;
  agitation = 0;
  spread = 0;
  integrity = 1;
  hitFlash = 0;
  private blinkT = 5;
  private lookV = new THREE.Vector2();
  color = new THREE.Color('#7C5CFF');
  accent = new THREE.Color('#F4F1EA');
  pupilWorld = new THREE.Vector3();

  constructor() {
    this.ringMat = new THREE.LineBasicMaterial({ color: 0xf4f1ea, transparent: true, opacity: 0.55 });
    this.accentMat = new THREE.LineBasicMaterial({ color: 0x7c5cff, transparent: true, opacity: 0.9 });
    const defs = [
      { r: 4.4, almond: 1, freq: 3, amp: 0.05, accent: false },
      { r: 4.0, almond: 1, freq: 5, amp: 0.04, accent: true },
      { r: 3.4, almond: 0.7, freq: 7, amp: 0.05, accent: false },
      { r: 2.2, almond: 0, freq: 9, amp: 0.03, accent: false },
      { r: 1.95, almond: 0, freq: 12, amp: 0.02, accent: true },
      { r: 1.35, almond: 0, freq: 6, amp: 0.02, accent: false },
      { r: 5.3, almond: 1, freq: 2, amp: 0.12, accent: false },
    ];
    defs.forEach((d, i) => {
      const seg = 200;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg * 3), 3));
      const line = new THREE.LineLoop(g, d.accent ? this.accentMat : this.ringMat);
      line.frustumCulled = false;
      this.body.add(line);
      this.rings.push({ line, r: d.r, almond: d.almond, freq: d.freq, amp: d.amp, phase: i * 1.3 });
    });

    // iris particles
    const n = device.low ? 1400 : 3200;
    const data = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 0.55 + Math.pow(Math.random(), 0.7) * 1.35;
      data.set([r, Math.random() * Math.PI * 2, Math.random()], i * 3);
    }
    const ig = new THREE.BufferGeometry();
    ig.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    ig.setAttribute('aData', new THREE.BufferAttribute(data, 3));
    this.irisMat = new THREE.ShaderMaterial({
      vertexShader: IRIS_VERT,
      fragmentShader: IRIS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPix: { value: device.dpr },
        uSpread: { value: 0 },
        uOpen: { value: 1 },
        uAgit: { value: 0 },
        uColA: { value: new THREE.Color('#7C5CFF') },
        uColB: { value: new THREE.Color('#F4F1EA') },
      },
    });
    this.iris = new THREE.Points(ig, this.irisMat);
    this.iris.frustumCulled = false;
    this.pupil.add(this.iris);

    // radial scan lines
    const rn = 140;
    const rp = new Float32Array(rn * 6);
    for (let i = 0; i < rn; i++) {
      const a = (i / rn) * Math.PI * 2;
      const r0 = 2.3 + Math.random() * 0.2;
      const r1 = r0 + 0.2 + Math.random() * (i % 7 === 0 ? 1.4 : 0.5);
      rp.set([Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.radials = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xf4f1ea, transparent: true, opacity: 0.3 }));
    this.body.add(this.radials);

    this.pupilDisc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    this.pupilDisc.position.z = 0.05;
    const pr = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * 6.283) * 0.52, Math.sin((i / 96) * 6.283) * 0.52, 0.06)),
    );
    this.pupilRing = new THREE.LineLoop(pr, new THREE.LineBasicMaterial({ color: 0xff2e2e, transparent: true, opacity: 0.9 }));
    this.pupil.add(this.pupilDisc, this.pupilRing);
    this.body.add(this.pupil);

    // orbiting typography fragments
    const chars = 'IWATCHYOU01<>/{}#%ALIVE';
    const gn = device.low ? 26 : 44;
    for (let i = 0; i < gn; i++) {
      const ch = chars[i % chars.length];
      const mat = new THREE.SpriteMaterial({ map: glyphTexture(ch, '#F4F1EA', i % 3 ? 'mono' : 'serif'), transparent: true, opacity: 0.5, depthWrite: false });
      const s = new THREE.Sprite(mat);
      const sc = 0.18 + Math.random() * 0.35;
      s.scale.set(sc, sc, sc);
      this.body.add(s);
      this.glyphs.push({ s, r: 3 + Math.random() * 3.2, a: Math.random() * 6.28, sp: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.9 });
    }
    this.group.add(this.body);
    this.body.scale.y = 0.001;
  }

  openEye(duration = 3.5) {
    return gsap.to(this, { open: 1, duration, ease: 'expo.inOut' });
  }

  setPalette(main: string, accent = '#F4F1EA') {
    this.color.set(main);
    this.accent.set(accent);
  }

  hit() {
    this.hitFlash = 1;
  }

  /** boss defeated / deleted: dissolve particles outward */
  dissolve(duration = 6) {
    return gsap.to(this, { spread: 1, duration, ease: 'power2.in' });
  }

  update(dt: number, t: number, cam: THREE.PerspectiveCamera, look: THREE.Vector2) {
    cam.position.set(look.x * 0.4, -look.y * 0.3, 11);
    cam.lookAt(0, 0, 0);

    // blinking: rare, deliberate
    this.blinkT -= dt;
    let lid = this.open;
    if (this.blinkT < 0.18 && this.blinkT > 0) lid *= Math.abs(this.blinkT - 0.09) / 0.09;
    if (this.blinkT <= 0) this.blinkT = 4 + Math.random() * 6;
    this.body.scale.y = Math.max(0.001, lid);

    // follows the visitor
    this.lookV.x += (look.x - this.lookV.x) * damp(4 + this.agitation * 4, dt);
    this.lookV.y += (look.y - this.lookV.y) * damp(4 + this.agitation * 4, dt);
    this.pupil.position.set(this.lookV.x * 1.1, -this.lookV.y * 0.6, 0.1);
    this.body.rotation.y = this.lookV.x * 0.22;
    this.body.rotation.x = this.lookV.y * 0.16;

    this.hitFlash *= Math.exp(-dt * 7);
    const ag = this.agitation + (1 - this.integrity) * 0.8;
    for (const r of this.rings) {
      const arr = (r.line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const seg = arr.length / 3;
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const noise = Math.sin(a * r.freq + t * (0.6 + ag * 2) + r.phase) * r.amp * (1 + ag * 3) + Math.sin(a * 23 + t * 3) * 0.01 * ag;
        const rr = r.r * (1 + noise) * (1 + this.spread * (1 + r.phase));
        // almond silhouette for the outer rings
        const ay = r.almond ? Math.sin(a) * (0.42 + 0.1 * Math.cos(2 * a)) : Math.sin(a);
        const ax = Math.cos(a) * (r.almond ? 1.25 : 1);
        arr[i * 3] = ax * rr;
        arr[i * 3 + 1] = ay * rr;
        arr[i * 3 + 2] = Math.sin(a * 2 + t) * 0.05 * r.phase;
      }
      r.line.geometry.attributes.position.needsUpdate = true;
      r.line.rotation.z = r.almond ? 0 : t * 0.02 * (r.phase - 3);
    }
    this.radials.rotation.z = t * 0.03 * (1 + ag);
    const u = this.irisMat.uniforms;
    u.uTime.value = t;
    u.uSpread.value = this.spread;
    u.uAgit.value = ag;
    (u.uColA.value as THREE.Color).copy(this.color).lerp(new THREE.Color('#FFFFFF'), this.hitFlash * 0.7);
    (u.uColB.value as THREE.Color).copy(this.accent);
    this.accentMat.color.copy(this.color);
    this.ringMat.opacity = 0.5 * (1 - this.spread) + this.hitFlash * 0.5;
    this.accentMat.opacity = 0.9 * (1 - this.spread);
    (this.radials.material as THREE.LineBasicMaterial).opacity = 0.3 * (1 - this.spread);
    (this.pupilRing.material as THREE.LineBasicMaterial).opacity = (1 - this.spread) * (0.7 + this.hitFlash * 0.3);
    const ps = 1 + this.hitFlash * 0.25 + Math.sin(t * 2) * 0.03;
    this.pupilDisc.scale.setScalar(ps);
    this.pupilRing.scale.setScalar(ps);
    for (const g of this.glyphs) {
      g.a += g.sp * dt * (1 + ag * 2);
      const r = g.r * (1 + this.spread * 3);
      g.s.position.set(Math.cos(g.a) * r * 1.2, Math.sin(g.a) * r * 0.5 + g.y, Math.sin(g.a) * 1.5);
      (g.s.material as THREE.SpriteMaterial).opacity = 0.45 * (1 - this.spread);
    }
    this.pupil.getWorldPosition(this.pupilWorld);
  }
}
