import * as THREE from 'three';
import type { Matiere } from '../model/types';

/* Matières de l'atelier : peinture mate, laqué, bois, métal, miroir, marbre, terrazzo, béton, tissu, velours,
   cuir, cannage, verre et plexiglas. Les textures sont dessinées par le programme (aucun fichier à charger),
   en gris clair : la couleur choisie par l'élève les teinte (un bois « Noyer », un marbre « Vert sapin »…). */

export interface MatiereInfo { value: Matiere | undefined; label: string }
export const MATIERES: MatiereInfo[] = [
  { value: undefined, label: 'Opaque' }, { value: 'laque', label: 'Laqué' }, { value: 'bois', label: 'Bois' }, { value: 'metal', label: 'Métal' },
  { value: 'miroir', label: 'Miroir' }, { value: 'marbre', label: 'Marbre' }, { value: 'terrazzo', label: 'Terrazzo' }, { value: 'beton', label: 'Béton' },
  { value: 'tissu', label: 'Tissu' }, { value: 'velours', label: 'Velours' }, { value: 'cuir', label: 'Cuir' }, { value: 'cannage', label: 'Cannage' },
  { value: 'verre', label: 'Verre' }, { value: 'plexi', label: 'Plexiglas' },
];
/** Taille (m) d'un motif de texture sur le meuble : le veinage garde la même échelle sur une planche ou un bouton. */
const TILE: Partial<Record<Matiere, number>> = { bois: 0.9, metal: 0.5, marbre: 1.2, terrazzo: 0.5, beton: 1, tissu: 0.12, velours: 0.6, cuir: 0.35, cannage: 0.16 };
export const isTransparent = (m?: Matiere) => m === 'verre' || m === 'plexi';
export const hasTexture = (m?: Matiere) => !!m && m in TILE;

/* ---------- Bruit et textures ---------- */
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
/** Bruit lissé périodique (le motif se raccorde sur les bords de la texture). */
function makeNoise(seed: number, period: number) {
  const r = rng(seed), g = Array.from({ length: period * period }, r);
  const at = (i: number, j: number) => g[((j % period + period) % period) * period + ((i % period + period) % period)];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const X = x * period, Y = y * period, i = Math.floor(X), j = Math.floor(Y), fx = s(X - i), fy = s(Y - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}
function fbm(seed: number, base: number, oct = 4) {
  const ns = Array.from({ length: oct }, (_, k) => makeNoise(seed + k * 97, base << k));
  return (x: number, y: number) => { let v = 0, a = 0.5, t = 0; for (const n of ns) { v += n(x, y) * a; t += a; a /= 2; } return v / t; };
}
function pixels(size: number, f: (x: number, y: number) => number | [number, number, number, number]) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d')!, img = ctx.createImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const v = f(i / size, j / size), k = (j * size + i) * 4;
    if (typeof v === 'number') { const g = Math.max(0, Math.min(255, v * 255)); img.data[k] = img.data[k + 1] = img.data[k + 2] = g; img.data[k + 3] = 255; }
    else { img.data[k] = v[0]; img.data[k + 1] = v[1]; img.data[k + 2] = v[2]; img.data[k + 3] = v[3]; }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
const TAU = Math.PI * 2;
const DRAW: Partial<Record<Matiere, () => HTMLCanvasElement>> = {
  // Veinage dans le sens de la longueur (u) : cernes ondulés et fibres fines
  bois: () => { const w = fbm(11, 2), f = makeNoise(12, 64), k = fbm(13, 4);
    return pixels(512, (x, y) => { const ring = Math.sin((y * 9 + w(x, y) * 2.2) * TAU); return 0.8 + 0.1 * ring + 0.07 * (f(x * 0.25, y * 4) - 0.5) + 0.08 * (k(x, y) - 0.5) + 0.06; }); },
  metal: () => { const f = makeNoise(21, 128), g = fbm(22, 2); return pixels(256, (x, y) => 0.9 + 0.09 * (f(x * 0.06, y) - 0.5) + 0.06 * (g(x, y) - 0.5)); },
  marbre: () => { const t = fbm(31, 2, 5), s = fbm(32, 4);
    return pixels(512, (x, y) => { const v = Math.abs(Math.sin((x * 2 + y * 3 + t(x, y) * 3.2) * Math.PI)); const vein = Math.pow(1 - v, 10), thin = Math.pow(1 - Math.abs(Math.sin((x * 5 - y * 4 + s(x, y) * 4) * Math.PI)), 26);
      return 1 - 0.5 * vein - 0.22 * thin - 0.06 * s(x, y); }); },
  beton: () => { const f = fbm(41, 4, 5), r = rng(42), dots = new Set<number>();
    for (let i = 0; i < 900; i++) dots.add(Math.floor(r() * 256) * 256 + Math.floor(r() * 256));
    return pixels(256, (x, y) => 0.86 + 0.16 * (f(x, y) - 0.5) - (dots.has(Math.floor(y * 256) * 256 + Math.floor(x * 256)) ? 0.14 : 0) + 0.06); },
  tissu: () => { const n = makeNoise(51, 32), T = 48;
    return pixels(256, (x, y) => { const cx = x * T, cy = y * T, over = (Math.floor(cx) + Math.floor(cy)) % 2 === 0;
      const v = over ? Math.sin((cx % 1) * Math.PI) : Math.sin((cy % 1) * Math.PI); return 0.8 + 0.16 * v + 0.06 * (n(x, y) - 0.5); }); },
  velours: () => { const f = fbm(61, 3, 4); return pixels(256, (x, y) => 0.84 + 0.22 * (f(x, y) - 0.5) + 0.06); },
  cuir: () => { const f = fbm(71, 16, 3), g = fbm(72, 2); return pixels(256, (x, y) => 0.9 - 0.25 * Math.pow(Math.abs(f(x, y) - 0.5) * 2, 0.35) * 0.4 + 0.08 * (g(x, y) - 0.5)); },
  terrazzo: () => {
    const c = pixels(512, () => 0.97), ctx = c.getContext('2d')!, r = rng(81);
    const chips = ['#9A9590', '#C46A4A', '#E0B060', '#5E5A55', '#FFFFFF', '#7E9A8A', '#D9CFC4'];
    for (let i = 0; i < 260; i++) {
      const x = r() * 512, y = r() * 512, s = 4 + r() * (i < 40 ? 22 : 10), n = 5 + Math.floor(r() * 3), a0 = r() * TAU;
      ctx.fillStyle = chips[Math.floor(r() * chips.length)];
      for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
        ctx.beginPath();
        for (let k = 0; k < n; k++) { const a = a0 + (k / n) * TAU, d = s * (0.6 + r() * 0.5); ctx.lineTo(x + ox + Math.cos(a) * d, y + oy + Math.sin(a) * d); }
        ctx.fill();
      }
    }
    return c;
  },
  // Cannage : brins droits et en diagonale, trous octogonaux transparents
  cannage: () => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d')!, N = 8, s = 256 / N;
    ctx.lineCap = 'round';
    const line = (x1: number, y1: number, x2: number, y2: number, w: number, col: string) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    for (let k = -N; k <= N; k++) {
      const p = k * s;
      line(p, 256, p + 256, 0, s * 0.16, '#D8D0C4'); // diagonales /
      line(p, 0, p + 256, 256, s * 0.16, '#D8D0C4'); // diagonales \
    }
    for (let k = 0; k <= N; k++) {
      const p = k * s;
      for (const d of [-s * 0.13, s * 0.13]) { line(p + d, 0, p + d, 256, s * 0.12, '#F2EDE6'); line(0, p + d, 256, p + d, s * 0.12, '#ECE6DD'); }
    }
    return c;
  },
};
const canvases = new Map<Matiere, HTMLCanvasElement>();
const canvasOf = (m: Matiere) => { let c = canvases.get(m); if (!c) { c = DRAW[m]!(); canvases.set(m, c); } return c; };
const textures = new Map<Matiere, THREE.CanvasTexture>();
function textureOf(m: Matiere) {
  let t = textures.get(m);
  if (!t) {
    t = new THREE.CanvasTexture(canvasOf(m));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    textures.set(m, t);
  }
  return t;
}
/** Aperçu d'une matière pour le nuancier (image à teinter avec la couleur, en CSS). */
const previews = new Map<Matiere, string>();
export function matierePreview(m: Matiere): string | null {
  if (!DRAW[m]) return null;
  let u = previews.get(m);
  if (!u) {
    const src = canvasOf(m), c = document.createElement('canvas'); c.width = c.height = 64;
    c.getContext('2d')!.drawImage(src, 0, 0, src.width / (m === 'tissu' || m === 'cannage' ? 4 : 2), src.height / (m === 'tissu' || m === 'cannage' ? 4 : 2), 0, 0, 64, 64);
    u = c.toDataURL(); previews.set(m, u);
  }
  return u;
}

/** Reflets des matières brillantes : une pièce claire dessinée (plafond lumineux, sol chaud, deux fenêtres). */
let env: THREE.CanvasTexture | null = null;
function envMap() {
  if (env) return env;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const ctx = c.getContext('2d')!, g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.45, '#E9E7E2'); g.addColorStop(0.55, '#B9B2A8'); g.addColorStop(1, '#6B635A');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(60, 60, 70, 60); ctx.fillRect(300, 50, 110, 70);
  ctx.fillStyle = '#5A6470'; ctx.fillRect(180, 85, 60, 40);
  env = new THREE.CanvasTexture(c);
  env.mapping = THREE.EquirectangularReflectionMapping; env.colorSpace = THREE.SRGBColorSpace;
  return env;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** Matériau d'une couleur et d'une matière (partagé ; la bibliothèque le copie avant de le recolorer). */
export function matiereMaterial(color: string, m?: Matiere, double = false): THREE.MeshStandardMaterial {
  const k = color + '|' + (m ?? '') + (double ? '|2' : '');
  let r = mats.get(k);
  if (r) return r;
  const p: THREE.MeshStandardMaterialParameters = { color, roughness: 0.85, side: double ? THREE.DoubleSide : THREE.FrontSide };
  switch (m) {
    // Verre : presque transparent, à peine teinté ; plexiglas : transparent, teinté de la couleur choisie.
    case 'verre': case 'plexi': Object.assign(p, { roughness: 0.08, transparent: true, opacity: m === 'verre' ? 0.22 : 0.5, depthWrite: false, envMap: envMap(), envMapIntensity: 0.6 }); break;
    case 'laque': Object.assign(p, { roughness: 0.16, envMap: envMap(), envMapIntensity: 0.35 }); break;
    case 'bois': Object.assign(p, { roughness: 0.7 }); break;
    case 'metal': Object.assign(p, { roughness: 0.32, metalness: 0.85, envMap: envMap(), envMapIntensity: 1 }); break;
    case 'miroir': Object.assign(p, { roughness: 0.03, metalness: 1, envMap: envMap(), envMapIntensity: 1.1 }); break;
    case 'marbre': Object.assign(p, { roughness: 0.22, envMap: envMap(), envMapIntensity: 0.3 }); break;
    case 'terrazzo': Object.assign(p, { roughness: 0.45, envMap: envMap(), envMapIntensity: 0.2 }); break;
    case 'beton': Object.assign(p, { roughness: 0.95 }); break;
    case 'tissu': case 'velours': Object.assign(p, { roughness: 1 }); break;
    case 'cuir': Object.assign(p, { roughness: 0.5, envMap: envMap(), envMapIntensity: 0.2 }); break;
    case 'cannage': Object.assign(p, { roughness: 0.8, alphaTest: 0.5, side: THREE.DoubleSide }); break;
  }
  if (hasTexture(m)) p.map = textureOf(m!);
  r = new THREE.MeshStandardMaterial(p);
  r.name = color; r.userData.atelier = true; // la bibliothèque garde ces réglages (brillance, texture…)
  mats.set(k, r);
  return r;
}

/** Coordonnées de texture « à plat » en mètres (projection sur la face la plus proche),
    le veinage suivant le plus grand côté de la pièce. */
export function projectUV(g: THREE.BufferGeometry, m?: Matiere) {
  const tile = m ? TILE[m] : undefined;
  if (!tile) return;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.computeBoundingBox();
  const s = g.boundingBox!.getSize(new THREE.Vector3()), ext = [s.x, s.y, s.z];
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const a = n[0] >= n[1] && n[0] >= n[2] ? 0 : n[1] >= n[2] ? 1 : 2;
    let [b, c] = [0, 1, 2].filter(k => k !== a);
    if (ext[c] > ext[b]) [b, c] = [c, b];
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    uv[i * 2] = p[b] / tile; uv[i * 2 + 1] = p[c] / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
