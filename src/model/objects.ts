import type { PlacedObject, Project, Vec2 } from './types';
import { add, centroidOf, dot, edges, mul, pointInPolygon, snapTo, sub, v } from './geometry';

/* Géométrie des objets posés : emprise au sol, aimantation, accroche aux murs. */

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Convertit un point du repère de l'objet (origine au centre, +y = face avant) vers le plan. */
export function toPlan(o: PlacedObject, lx: number, ly: number): Vec2 {
  const c = Math.cos(rad(o.rot)), s = Math.sin(rad(o.rot));
  return v(o.x + lx * c - ly * s, o.y + lx * s + ly * c);
}
/** Les 4 coins de l'emprise au sol. */
export function footprint(o: PlacedObject): Vec2[] {
  const w = o.size.w / 2, d = o.size.d / 2;
  return [toPlan(o, -w, -d), toPlan(o, w, -d), toPlan(o, w, d), toPlan(o, -w, d)];
}
export const hitObject = (o: PlacedObject, p: Vec2) => pointInPolygon(p, footprint(o));
export const normRot = (r: number) => ((Math.round(r * 100) / 100) % 360 + 360) % 360;

/** Accroche un objet mural contre le mur le plus proche (dos au mur, face vers l'intérieur). */
export function snapToWall(p: Project, o: PlacedObject, maxDist = 0.6): boolean {
  if (!p.floor) return false;
  let best: { d: number; e: ReturnType<typeof edges>[number]; t: number } | null = null;
  for (const e of edges(p.floor.points)) {
    const rel = sub(v(o.x, o.y), e.a), t = dot(rel, e.u), d = -dot(rel, e.n); // d > 0 : à l'intérieur
    if (t < -0.2 || t > e.length + 0.2) continue;
    const dd = Math.abs(d - o.size.d / 2);
    if (dd < maxDist && (!best || dd < best.d)) best = { d: dd, e, t };
  }
  if (!best) return false;
  const { e } = best;
  const t = Math.min(e.length - o.size.w / 2, Math.max(o.size.w / 2, best.t));
  const q = add(add(e.a, mul(e.u, t)), mul(e.n, -(o.size.d / 2 + 0.005)));
  o.x = round(q.x); o.y = round(q.y);
  o.rot = normRot((Math.atan2(e.n.x, -e.n.y) * 180) / Math.PI);
  return true;
}
const round = (x: number) => Math.round(x * 1000) / 1000;

/** Centre de l'objet aimanté sur la grille. */
export function snapCenter(x: number, y: number, step: number) { return v(snapTo(x, step), snapTo(y, step)); }

/** Un emplacement libre près de `near` pour un nouvel objet (évite de poser deux objets l'un sur l'autre). */
export function freeSpot(p: Project, size: { w: number; d: number }, near?: Vec2): Vec2 {
  const c = near ?? (p.floor ? centroidOf(p.floor.points) : v(0, 0));
  const r = Math.max(size.w, size.d) / 2;
  const busy = (q: Vec2) => p.objects.some(o => Math.hypot(o.x - q.x, o.y - q.y) < r + Math.max(o.size.w, o.size.d) / 2 - 0.05);
  const inside = (q: Vec2) => !p.floor || pointInPolygon(q, p.floor.points);
  for (let ring = 0; ring < 12; ring++) {
    const n = Math.max(1, ring * 8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, q = v(snapTo(c.x + Math.cos(a) * ring * 0.5, 0.1), snapTo(c.y + Math.sin(a) * ring * 0.5, 0.1));
      if (inside(q) && !busy(q)) return q;
    }
  }
  return v(snapTo(c.x, 0.1), snapTo(c.y, 0.1));
}
