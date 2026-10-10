import type { FloorMaterial, Project, RoomStyle, Vec2, WallMaterial } from './types';
import { add, area, centroidOf, cross, dist, edges, mul, norm, pointInPolygon, projectOnSegment, signedArea, sub, v } from './geometry';
import type { WallSeg } from './project';

/* Pièces : zones fermées par le contour de la surface et les cloisons. On les recalcule à chaque changement
   (rien n'est stocké) ; le revêtement d'une pièce est accroché à un point intérieur (RoomStyle.at) :
   il suit la pièce qui contient ce point, même si les cloisons bougent un peu. */

export interface Room {
  /** Contour (sens du sol). */
  poly: Vec2[];
  /** Pièces entièrement contenues dans celle-ci (une cabine au milieu d'une salle) : trous du sol. */
  holes: Vec2[][];
  area: number;
  /** Un point à l'intérieur (pour y accrocher le revêtement et y écrire le numéro). */
  inner: Vec2;
}

const EPS = 0.004; // points confondus (m)
const TOUCH = 0.03; // une extrémité de cloison à moins de 3 cm d'un mur le touche

let cache: { key: string; rooms: Room[] } | null = null;
/** Pièces du projet, numérotées de haut en bas puis de gauche à droite. */
export function rooms(p: Project): Room[] {
  if (!p.floor) return [];
  const key = JSON.stringify([p.floor.points, p.partitions.map(c => [c.a, c.b])]);
  if (cache?.key === key) return cache.rooms;
  const r = computeRooms(p.floor.points, p.partitions.map(c => [c.a, c.b] as [Vec2, Vec2]));
  cache = { key, rooms: r };
  return r;
}

export function computeRooms(floor: Vec2[], walls: [Vec2, Vec2][]): Room[] {
  const whole = (): Room[] => [{ poly: floor, holes: [], area: area(floor), inner: innerPoint(floor, []) }];
  if (!walls.length) return whole();
  const segs: [Vec2, Vec2][] = [...edges(floor).map(e => [e.a, e.b] as [Vec2, Vec2]), ...walls.filter(([a, b]) => dist(a, b) > EPS)];
  // 1. Points de coupe de chaque segment : croisements et extrémités qui touchent un autre segment.
  const cuts: number[][] = segs.map(() => [0, 1]);
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const [p, p2] = segs[i], [q, q2] = segs[j], r = sub(p2, p), s = sub(q2, q), den = cross(r, s);
    const li = dist(p, p2), lj = dist(q, q2);
    if (Math.abs(den) > 1e-12) {
      const t = cross(sub(q, p), s) / den, u = cross(sub(q, p), r) / den;
      const ti = TOUCH / li, tj = TOUCH / lj;
      if (t >= -ti && t <= 1 + ti && u >= -tj && u <= 1 + tj) { cuts[i].push(clamp01(t)); cuts[j].push(clamp01(u)); }
    }
    // extrémités posées sur l'autre segment (parallèles compris)
    for (const e of [q, q2]) { const pr = projectOnSegment(e, p, p2); if (pr.d < TOUCH) cuts[i].push(pr.t); }
    for (const e of [p, p2]) { const pr = projectOnSegment(e, q, q2); if (pr.d < TOUCH) cuts[j].push(pr.t); }
  }
  // 2. Graphe : nœuds fusionnés, arêtes entre coupes successives.
  const nodes: Vec2[] = [];
  const node = (q: Vec2) => { const k = nodes.findIndex(n => dist(n, q) < EPS * 3); if (k >= 0) return k; nodes.push(q); return nodes.length - 1; };
  const adj = new Map<number, Set<number>>();
  const link = (a: number, b: number) => { if (a === b) return; (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b); (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a); };
  segs.forEach(([a, b], i) => {
    const ts = [...new Set(cuts[i].map(t => Math.round(t * 1e6) / 1e6))].sort((x, y) => x - y);
    let prev = node(a);
    for (const t of ts.slice(1)) { const cur = node(t >= 1 ? b : add(a, mul(sub(b, a), t))); link(prev, cur); prev = cur; }
  });
  // 3. Bouts de cloisons libres (qui ne ferment rien) : retirés.
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [k, s] of adj) if (s.size <= 1) { for (const o of s) adj.get(o)?.delete(k); adj.delete(k); pruned = true; }
  }
  // 4. Faces : on tourne toujours du même côté à chaque nœud.
  const order = new Map<number, number[]>();
  for (const [k, s] of adj) order.set(k, [...s].sort((a, b) => ang(nodes[k], nodes[a]) - ang(nodes[k], nodes[b])));
  const seen = new Set<string>(), faces: Vec2[][] = [];
  for (const [u, s] of adj) for (const w of s) {
    if (seen.has(u + '>' + w)) continue;
    const poly: Vec2[] = []; let a = u, b = w, guard = 0;
    while (!seen.has(a + '>' + b) && guard++ < 10000) {
      seen.add(a + '>' + b); poly.push(nodes[a]);
      const ns = order.get(b)!, k = ns.indexOf(a), c = ns[(k + 1) % ns.length];
      a = b; b = c;
    }
    if (poly.length >= 3) faces.push(poly);
  }
  if (faces.length <= 2) return whole(); // seul le contour reste
  // 5. La face la plus grande est l'extérieur ; les pièces ont le signe opposé.
  const outer = faces.reduce((m, f) => (Math.abs(signedArea(f)) > Math.abs(signedArea(m)) ? f : m));
  const sgn = -Math.sign(signedArea(outer));
  const polys = faces.filter(f => Math.sign(signedArea(f)) === sgn && Math.abs(signedArea(f)) > 0.01)
    .map(f => (signedArea(f) < 0 ? [...f].reverse() : f));
  // Trous : une pièce entièrement à l'intérieur d'une autre (sans la toucher)
  const out: Room[] = polys.map(poly => ({ poly, holes: [] as Vec2[][], area: area(poly), inner: poly[0] }));
  for (const r of out) for (const o of out) if (o !== r && o.area < r.area && o.poly.every(q => pointInPolygon(q, r.poly))
    && !o.poly.some(q => r.poly.some(w => dist(q, w) < EPS * 3))) r.holes.push(o.poly);
  for (const r of out) { r.area = area(r.poly) - r.holes.reduce((s, h) => s + area(h), 0); r.inner = innerPoint(r.poly, r.holes); }
  out.sort((a, b) => Math.round(a.inner.y * 2) - Math.round(b.inner.y * 2) || a.inner.x - b.inner.x);
  return out;
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const ang = (o: Vec2, q: Vec2) => Math.atan2(q.y - o.y, q.x - o.x);

/** Un point bien à l'intérieur du polygone (hors des trous) : centre de gravité, sinon le meilleur point d'une grille. */
function innerPoint(poly: Vec2[], holes: Vec2[][]): Vec2 {
  const ok = (q: Vec2) => pointInPolygon(q, poly) && !holes.some(h => pointInPolygon(q, h));
  const margin = (q: Vec2) => Math.min(...[poly, ...holes].flatMap(pl => edges(pl).map(e => projectOnSegment(q, e.a, e.b).d)));
  const c = centroidOf(poly);
  if (ok(c) && margin(c) > 0.3) return c;
  let best = c, bm = -1;
  const xs = poly.map(q => q.x), ys = poly.map(q => q.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
    const q = v(x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * j) / 12);
    if (!ok(q)) continue;
    const m = margin(q); if (m > bm) { bm = m; best = q; }
  }
  return best;
}

/** Rang de la pièce qui contient le point (la plus petite, pour une cabine dans une salle), ou −1. */
export function roomAt(p: Project, q: Vec2): number {
  const rs = rooms(p);
  let best = -1, ba = Infinity;
  rs.forEach((r, i) => { if (pointInPolygon(q, r.poly) && !r.holes.some(h => pointInPolygon(q, h)) && r.area < ba) { ba = r.area; best = i; } });
  return best;
}

/** Réglages de chaque pièce (le premier point d'accroche trouvé dans la pièce). */
export function roomStyles(p: Project): (RoomStyle | undefined)[] {
  const rs = rooms(p), out: (RoomStyle | undefined)[] = rs.map(() => undefined);
  for (const st of p.rooms ?? []) { const i = roomAt(p, st.at); if (i >= 0 && !out[i]) out[i] = st; }
  return out;
}

export interface FloorLook { material: FloorMaterial; color: string }
export interface WallLook { material: WallMaterial; color: string }
export const floorOfRoom = (p: Project, i: number): FloorLook => roomStyles(p)[i]?.floor ?? { material: p.floor!.material, color: p.floor!.color };

/** Change le revêtement d'une pièce (sol ou murs). Les points d'accroche de la pièce sont fusionnés en un seul. */
export function setRoomStyle(p: Project, i: number, patch: { floor?: FloorLook; wall?: WallLook }) {
  const r = rooms(p)[i]; if (!r) return;
  const mine = (p.rooms ?? []).filter(st => roomAt(p, st.at) === i);
  const merged: RoomStyle = { at: mine[0]?.at ?? r.inner };
  for (const st of mine) { if (st.floor) merged.floor = st.floor; if (st.wall) merged.wall = st.wall; }
  Object.assign(merged, patch);
  p.rooms = [...(p.rooms ?? []).filter(st => !mine.includes(st)), merged];
}
/** « Toutes les pièces » : on efface les revêtements propres aux pièces (sol ou murs). */
export function clearRoomStyles(p: Project, what: 'floor' | 'wall') {
  p.rooms = (p.rooms ?? []).map(st => { const c = { ...st }; delete c[what]; return c; }).filter(st => st.floor || st.wall);
}

/* ---------- Pans de mur : une face coupée par les cloisons qui la touchent ---------- */
export interface FacePiece { u0: number; u1: number; room: number }
/** Morceaux de la face intérieure d'un mur (side 'int') ou des côtés d'une cloison ('int' = côté 1, 'ext' = côté 2),
    chacun avec la pièce qu'il regarde. La façade (côté rue d'un mur du contour) n'est jamais coupée. */
export function facePieces(p: Project, e: WallSeg, side: 'int' | 'ext'): FacePiece[] {
  const s = side === 'ext' ? e.T : 0; // position de la face le long de n (repère de la face de départ)
  const at = (u: number, off = 0) => add(add(e.a, mul(e.u, u)), mul(e.n, s + off));
  const fa = at(0), fb = at(e.length);
  const us = [0, e.length];
  p.partitions.forEach((c, j) => {
    if (e.part === j) return;
    // La cloison prolongée de quelques cm (elle s'arrête contre la face, ou contre l'axe d'une autre cloison)
    const d = norm(sub(c.b, c.a)), a = sub(c.a, mul(d, e.T / 2 + TOUCH)), b = add(c.b, mul(d, e.T / 2 + TOUCH));
    const r = sub(b, a), q = sub(fb, fa), den = cross(r, q);
    if (Math.abs(den) < 1e-12) return;
    const t = cross(sub(fa, a), q) / den, u = cross(sub(fa, a), r) / den;
    if (t >= 0 && t <= 1 && u > 0 && u < 1) us.push(u * e.length);
  });
  const cuts = [...new Set(us.map(u => Math.round(u * 1000) / 1000))].sort((x, y) => x - y);
  const out: FacePiece[] = [];
  const inward = side === 'ext' ? 0.06 : -0.06; // vers la pièce regardée par cette face
  for (let k = 0; k < cuts.length - 1; k++) {
    const u0 = cuts[k], u1 = cuts[k + 1]; if (u1 - u0 < 0.01) continue;
    out.push({ u0, u1, room: roomAt(p, at((u0 + u1) / 2, inward)) });
  }
  return out;
}

/** Revêtement d'un pan de mur : celui des murs de sa pièce, sinon celui du mur (ou du côté de la cloison). */
export function wallLookOf(p: Project, e: WallSeg, side: 'int' | 'ext', room: number): WallLook {
  const own = room >= 0 ? roomStyles(p)[room]?.wall : undefined;
  if (own) return own;
  if (e.part < 0) { const st = p.walls.styles[e.i]; return { material: st.material, color: st.color }; }
  const st = p.partitions[e.part].style;
  return side === 'ext' ? { material: st.outMaterial ?? st.material, color: st.outColor ?? st.color } : { material: st.material, color: st.color };
}

