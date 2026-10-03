import * as THREE from 'three';
import type { FloorMaterial, WallMaterial } from '../model/types';

/* Matières dessinées à la volée dans un <canvas> (aucun fichier image : fonctionne en file://).
   Chaque texture représente un carreau de `size` mètres ; les UV des surfaces sont en mètres. */

interface TexDef { label: string; size: number; draw: (c: CanvasRenderingContext2D, s: number) => void; tint: boolean }

let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16), m = (x: number) => Math.max(0, Math.min(255, Math.round(x * f)));
  return `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`;
};
function speckle(c: CanvasRenderingContext2D, s: number, n: number, alpha: number, r = 1.2) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = rnd() > .5 ? `rgba(0,0,0,${alpha * rnd()})` : `rgba(255,255,255,${alpha * rnd()})`;
    c.beginPath(); c.arc(rnd() * s, rnd() * s, rnd() * r + .3, 0, 7); c.fill();
  }
}

const FLOORS: Record<FloorMaterial, TexDef> = {
  parquet: { label: 'Parquet clair', size: 1.2, tint: false, draw: (c, s) => {
    const rows = 8, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -((r * 0.37) % 1) * s;
      while (x < s) {
        const w = s * (0.45 + rnd() * 0.4);
        c.fillStyle = shade('#E9DCC6', 0.95 + rnd() * 0.08);
        c.fillRect(x, r * rh, w, rh);
        for (let k = 0; k < 6; k++) { c.fillStyle = `rgba(150,110,60,${0.03 + rnd() * 0.04})`; c.fillRect(x, r * rh + rnd() * rh, w, 1 + rnd() * 2); }
        c.fillStyle = 'rgba(120,90,50,.28)'; c.fillRect(x, r * rh, 2, rh);
        x += w;
      }
      c.fillStyle = 'rgba(120,90,50,.25)'; c.fillRect(0, r * rh, s, 2);
    }
  } },
  beton: { label: 'Béton ciré', size: 2, tint: false, draw: (c, s) => {
    c.fillStyle = '#CBC8C2'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      const g = c.createRadialGradient(rnd() * s, rnd() * s, 0, rnd() * s, rnd() * s, 40 + rnd() * 120);
      const a = 0.05 + rnd() * 0.06;
      g.addColorStop(0, rnd() > .5 ? `rgba(255,255,255,${a})` : `rgba(80,75,70,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, s, s);
    }
    speckle(c, s, 2500, 0.12);
  } },
  carrelage: { label: 'Carrelage', size: 0.6, tint: false, draw: (c, s) => {
    const n = 2, t = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = (i + j) % 2 ? '#2E2D2B' : '#F6F4F0'; c.fillRect(i * t, j * t, t, t); }
    c.strokeStyle = 'rgba(160,155,148,.6)'; c.lineWidth = 2;
    for (let i = 0; i <= n; i++) { c.beginPath(); c.moveTo(i * t, 0); c.lineTo(i * t, s); c.moveTo(0, i * t); c.lineTo(s, i * t); c.stroke(); }
  } },
  terrazzo: { label: 'Terrazzo', size: 1, tint: false, draw: (c, s) => {
    c.fillStyle = '#EDE8E0'; c.fillRect(0, 0, s, s);
    const cols = ['#BF4E36', '#6E8B6B', '#2E2D2B', '#C9A97E', '#9C9A95', '#FFFFFF'];
    for (let i = 0; i < 420; i++) {
      c.fillStyle = cols[Math.floor(rnd() * cols.length)];
      const x = rnd() * s, y = rnd() * s, r = 1.5 + rnd() * 5;
      c.beginPath();
      for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283 + rnd(), rr = r * (0.6 + rnd() * 0.6); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      c.fill();
    }
  } },
  peinture: { label: 'Résine unie', size: 1, tint: true, draw: (c, s) => { c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, s, s); speckle(c, s, 600, 0.03); } },
};

const WALLS: Record<WallMaterial, TexDef> = {
  peinture: { label: 'Peinture', size: 1, tint: true, draw: (c, s) => { c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, s, s); speckle(c, s, 800, 0.025); } },
  beton: { label: 'Béton', size: 1.5, tint: false, draw: (c, s) => {
    FLOORS.beton.draw(c, s);
    c.fillStyle = 'rgba(90,85,80,.18)';
    for (const x of [0.25, 0.75]) for (const y of [0.25, 0.75]) { c.beginPath(); c.arc(x * s, y * s, 5, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(90,85,80,.12)'; c.fillRect(0, 0, s, 2); c.fillRect(0, 0, 2, s);
  } },
  carrelage: { label: 'Carrelage', size: 0.6, tint: true, draw: (c, s) => {
    c.fillStyle = '#C9C6C0'; c.fillRect(0, 0, s, s);
    const rows = 8, cols = 3, th = s / rows, tw = s / cols;
    for (let r = 0; r < rows; r++) for (let k = -1; k < cols + 1; k++) {
      const x = k * tw + (r % 2 ? tw / 2 : 0);
      c.fillStyle = shade('#FFFFFF', 0.97 + rnd() * 0.03); c.fillRect(x + 1.5, r * th + 1.5, tw - 3, th - 3);
    }
  } },
  brique: { label: 'Brique', size: 1, tint: false, draw: (c, s) => {
    c.fillStyle = '#D9CFC3'; c.fillRect(0, 0, s, s);
    const rows = 13, cols = 4, bh = s / rows, bw = s / cols;
    for (let r = 0; r < rows; r++) for (let k = -1; k < cols + 1; k++) {
      const x = k * bw + (r % 2 ? bw / 2 : 0);
      c.fillStyle = shade('#B5654A', 0.85 + rnd() * 0.25); c.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
    }
    speckle(c, s, 1500, 0.1);
  } },
  bois: { label: 'Lambris bois', size: 1.2, tint: false, draw: (c, s) => {
    const n = 10, w = s / n;
    for (let i = 0; i < n; i++) {
      c.fillStyle = shade('#C9A97E', 0.92 + rnd() * 0.12); c.fillRect(i * w, 0, w, s);
      for (let k = 0; k < 8; k++) { c.fillStyle = `rgba(110,75,40,${0.04 + rnd() * 0.05})`; c.fillRect(i * w + rnd() * w, 0, 1 + rnd() * 2, s); }
      c.fillStyle = 'rgba(90,60,30,.35)'; c.fillRect(i * w, 0, 2, s);
    }
  } },
  // Bardage : lames horizontales à recouvrement (façades), teintable
  bardage: { label: 'Bardage bois', size: 1.2, tint: true, draw: (c, s) => {
    const n = 8, hh = s / n;
    for (let i = 0; i < n; i++) {
      const g = c.createLinearGradient(0, i * hh, 0, (i + 1) * hh);
      g.addColorStop(0, shade('#FFFFFF', 0.86)); g.addColorStop(0.15, shade('#FFFFFF', 0.99)); g.addColorStop(1, shade('#FFFFFF', 0.93));
      c.fillStyle = g; c.fillRect(0, i * hh, s, hh);
      for (let k = 0; k < 10; k++) { c.fillStyle = `rgba(90,70,50,${0.03 + rnd() * 0.04})`; c.fillRect(0, i * hh + rnd() * hh, s, 1 + rnd() * 1.5); }
      c.fillStyle = 'rgba(40,30,20,.35)'; c.fillRect(0, i * hh, s, 2);
    }
  } },
  // Pierre : moellons irréguliers
  pierre: { label: 'Pierre', size: 1.4, tint: false, draw: (c, s) => {
    c.fillStyle = '#B9B1A4'; c.fillRect(0, 0, s, s);
    const rows = 7, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * rh;
      while (x < s) {
        const w = rh * (1.1 + rnd() * 1.4);
        c.fillStyle = shade('#D8D0C2', 0.86 + rnd() * 0.2);
        const p = 3;
        c.beginPath();
        c.roundRect(x + p, r * rh + p, w - 2 * p, rh - 2 * p, 6);
        c.fill();
        x += w;
      }
    }
    speckle(c, s, 3000, 0.12);
  } },
};

export const FLOOR_LABELS = Object.fromEntries(Object.entries(FLOORS).map(([k, d]) => [k, d.label])) as Record<FloorMaterial, string>;
export const WALL_LABELS = Object.fromEntries(Object.entries(WALLS).map(([k, d]) => [k, d.label])) as Record<WallMaterial, string>;
export const floorTints = (m: FloorMaterial) => FLOORS[m].tint;
export const wallTints = (m: WallMaterial) => WALLS[m].tint;

const PX = 512;
const canvases = new Map<string, HTMLCanvasElement>();
function canvasFor(key: string, def: TexDef) {
  let cv = canvases.get(key);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = cv.height = PX;
    seed = 12345; def.draw(cv.getContext('2d')!, PX);
    canvases.set(key, cv);
  }
  return cv;
}

const textures = new Map<string, THREE.Texture>();
function texture(key: string, def: TexDef) {
  let t = textures.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(canvasFor(key, def));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / def.size, 1 / def.size);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textures.set(key, t);
  }
  return t;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
function material(key: string, def: TexDef, color: string) {
  const k = key + (def.tint ? color : '');
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: texture(key, def), color: def.tint ? color : '#FFFFFF', roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    mats.set(k, m);
  }
  return m;
}
export const floorMaterial = (m: FloorMaterial, color: string) => material('f-' + m, FLOORS[m], color);
export const wallMaterial = (m: WallMaterial, color: string) => material('w-' + m, WALLS[m], color);

const thumbUrls = new Map<string, string>();
/** Vignette (image de fond CSS) d'une matière, teintée si besoin. */
export function thumbCss(kind: 'f' | 'w', m: string, color: string) {
  const def = kind === 'f' ? FLOORS[m as FloorMaterial] : WALLS[m as WallMaterial];
  const key = kind + '-' + m;
  let url = thumbUrls.get(key);
  if (!url) { url = `url(${canvasFor(key, def).toDataURL('image/jpeg', 0.8)})`; thumbUrls.set(key, url); }
  const tex = `${url} center / ${Math.round(160 / def.size)}px`;
  return def.tint ? `${tex}, ${color}` : tex; // à utiliser avec background-blend-mode: multiply
}
