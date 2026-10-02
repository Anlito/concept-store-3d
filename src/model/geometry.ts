import type { Vec2 } from './types';

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2) => v(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2) => v(a.x - b.x, a.y - b.y);
export const mul = (a: Vec2, k: number) => v(a.x * k, a.y * k);
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
export const len = (a: Vec2) => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec2) => { const l = len(a) || 1; return v(a.x / l, a.y / l); };
export const lerp = (a: Vec2, b: Vec2, t: number) => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

/** Arrondi au pas (évite les 4,999999 dus aux flottants). */
export const snapTo = (x: number, step: number) => Math.round(Math.round(x / step) * step * 1000) / 1000;
export const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Aire signée (formule du lacet). Positive = sens horaire à l'écran (y vers le bas). */
export function signedArea(p: Vec2[]) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}
export const area = (p: Vec2[]) => Math.abs(signedArea(p));
export function perimeter(p: Vec2[], closed = true) {
  let s = 0;
  for (let i = 0; i < p.length - (closed ? 0 : 1); i++) s += dist(p[i], p[(i + 1) % p.length]);
  return s;
}
/** Met le polygone dans le sens de référence (aire signée positive). */
export function normalizeWinding(p: Vec2[]) { return signedArea(p) < 0 ? [...p].reverse() : p; }

export interface Edge { i: number; a: Vec2; b: Vec2; u: Vec2; n: Vec2; length: number }
/** Côtés du polygone : u = direction, n = normale vers l'extérieur. */
export function edges(p: Vec2[]): Edge[] {
  return p.map((a, i) => {
    const b = p[(i + 1) % p.length], u = norm(sub(b, a));
    return { i, a, b, u, n: v(u.y, -u.x), length: dist(a, b) };
  });
}

/** Polygone décalé vers l'extérieur de d (raccords en onglet, longueur limitée). */
export function offsetPolygon(p: Vec2[], d: number): Vec2[] {
  const E = edges(p);
  return p.map((pt, i) => {
    const e0 = E[(i - 1 + p.length) % p.length], e1 = E[i];
    const m = norm(add(e0.n, e1.n));
    const c = dot(m, e1.n);
    const k = c > 0.25 ? d / c : d * 4; // limite pour les angles très aigus
    return add(pt, mul(m, k));
  });
}

/** Projection d'un point sur un segment : paramètre t (0..1), point projeté et distance. */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2) {
  const ab = sub(b, a), l2 = dot(ab, ab) || 1;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const q = add(a, mul(ab, t));
  return { t, q, d: dist(p, q) };
}

export function pointInPolygon(pt: Vec2, p: Vec2[]) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Vrai si deux segments [a,b] et [c,d] se coupent (hors extrémités communes). */
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  const d1 = cross(sub(b, a), sub(c, a)), d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c)), d4 = cross(sub(d, c), sub(b, c));
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}
/** Un sol valide : au moins 3 sommets, pas de côté nul, côtés qui ne se croisent pas. */
export function isSimplePolygon(p: Vec2[]) {
  const n = p.length;
  if (n < 3 || area(p) < 1e-4) return false;
  for (let i = 0; i < n; i++) if (dist(p[i], p[(i + 1) % n]) < 1e-3) return false;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (segmentsCross(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return false;
  }
  return true;
}

export function bounds(p: Vec2[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Nombres à la française. */
export const fmtM = (x: number) => x.toFixed(2).replace('.', ',') + ' m';
export const fmtCm = (x: number) => Math.round(x * 100) + ' cm';
export const fmtArea = (a: number) => (a >= 100 ? Math.round(a).toString() : a.toFixed(1).replace('.', ',').replace(/,0$/, '')) + ' m²';
export const parseNum = (s: string) => { const n = parseFloat(s.replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) ? n : NaN; };
