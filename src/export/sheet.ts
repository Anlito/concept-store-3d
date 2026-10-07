import type { Project, Vec2 } from '../model/types';
import { add, bounds, dot, edges, mul, offsetPolygon, sub } from '../model/geometry';
import { wallSegs } from '../model/project';

/* Mise en page de la feuille A3 paysage (420 × 297 mm), en millimètres, origine en haut à gauche.
   La même liste de tracés sert à l'aperçu (SVG) et au PDF (jsPDF) : ce qu'on voit est ce qu'on imprime.
   Contenu : les murs seulement (deux traits = épaisseur réelle), ouvertures en pointillés, cotes extérieures,
   légende, barre d'échelle, cartouche de l'équipe. Ni mobilier, ni texture, ni cote intérieure.

   Disposition prévue pour la plus grande boutique autorisée (10 × 7 m) à l'échelle 1 m = 3 cm :
   le plan occupe la gauche de la feuille, le titre, le cartouche et la légende une colonne à droite,
   la barre d'échelle une bande en bas. Une boutique plus profonde que large est tournée d'un quart de tour. */

export const SHEET = { w: 420, h: 297 };

/** Échelles proposées, exprimées comme en classe : 1 m dans la boutique = k mm sur la feuille. */
export const SCALES = [
  { k: 30, label: '1 m = 3 cm', ratio: '1:33' },
  { k: 20, label: '1 m = 2 cm', ratio: '1:50' },
  { k: 10, label: '1 m = 1 cm', ratio: '1:100' },
] as const;
export type Scale = (typeof SCALES)[number]['k'];
export const scaleInfo = (k: Scale) => SCALES.find(s => s.k === k)!;

/** Zone réservée au plan (cotes comprises). */
export const ZONE = { x0: 14, y0: 14, x1: 348, y1: 264 };
/** Colonne de droite : titre, cartouche, légende. */
const COL = { x0: 354, x1: 406 };
const COTE_MM = 6;          // décalage des cotes à l'extérieur des murs
const COTE_MARGIN = 10;     // place prise par les cotes autour du plan

export const DASH = { porte: [5, 2.5], fenetre: [0.9, 0.9] } as const;
export const WALL_W = 0.6, THIN_W = 0.25;

export type Prim =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; dash?: readonly number[]; plan?: boolean }
  | { t: 'rect'; x: number; y: number; w: number; h: number; lw: number; fill?: string; stroke?: boolean }
  | { t: 'text'; x: number; y: number; size: number; str: string; bold?: boolean; align?: 'left' | 'center' | 'right'; rot?: number; color?: string; plan?: boolean };

export interface SheetOptions { scale: Scale; cotes: boolean; team: { name: string; members: string; klass: string } }

export interface Layout {
  prims: Prim[];
  /** Taille du plan sur la feuille (mm), cotes comprises si affichées. */
  planW: number; planH: number;
  fits: boolean;
  /** Le plan a été tourné d'un quart de tour pour mieux tenir sur la feuille. */
  rotated: boolean;
  /** Millimètres sur la feuille pour 1 m dans la boutique. */
  k: number;
}

const fmtLen = (m: number) => m.toFixed(2).replace('.', ',') + ' m';
export const ZONE_SIZE = { w: ZONE.x1 - ZONE.x0, h: ZONE.y1 - ZONE.y0 };

/** Une boutique plus profonde que large est tournée d'un quart de tour (les murs et ouvertures restent identiques). */
function oriented(p: Project): { p: Project; rotated: boolean } {
  const b = bounds(p.floor!.points);
  if (b.h <= b.w + 1e-9) return { p, rotated: false };
  const r = (q: Vec2) => ({ x: -q.y, y: q.x });
  return { p: { ...p, floor: { ...p.floor!, points: p.floor!.points.map(r) }, partitions: p.partitions.map(c => ({ ...c, a: r(c.a), b: r(c.b) })) }, rotated: true };
}

/** Taille du plan (murs compris) pour une échelle donnée, et si elle tient dans la zone. */
export function planSize(p0: Project, k: Scale, cotes: boolean) {
  const { p, rotated } = oriented(p0);
  const outer = offsetPolygon(p.floor!.points, p.walls.thickness);
  const b = bounds(outer);
  const m = cotes ? 2 * COTE_MARGIN : 0;
  const w = b.w * k + m, h = b.h * k + m;
  return { w, h, fits: w <= ZONE_SIZE.w + 1e-6 && h <= ZONE_SIZE.h + 1e-6, b, p, rotated };
}
/** La plus grande échelle (plan le plus grand) qui fait tenir la boutique sur la feuille. */
export function bestScale(p: Project, cotes: boolean): Scale {
  for (const s of SCALES) if (planSize(p, s.k, cotes).fits) return s.k;
  return 10;
}

/** Coupe un texte en lignes d'au plus `max` caractères (approximation suffisante pour le cartouche). */
function wrap(s: string, max: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of s.split(/\s+/).filter(Boolean)) {
    if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out;
}

export function layoutSheet(p0: Project, o: SheetOptions): Layout {
  const prims: Prim[] = [];
  const L = (x1: number, y1: number, x2: number, y2: number, w = WALL_W, dash?: readonly number[], plan = false) => prims.push({ t: 'line', x1, y1, x2, y2, w, dash, plan });
  const T = (x: number, y: number, size: number, str: string, extra: Partial<Extract<Prim, { t: 'text' }>> = {}) => prims.push({ t: 'text', x, y, size, str, ...extra });
  const k = o.scale, sc = scaleInfo(k);

  const { w: planW, h: planH, fits, b, p, rotated } = planSize(p0, k, o.cotes);
  // Centre du plan dans la zone
  const cx = (ZONE.x0 + ZONE.x1) / 2, cy = (ZONE.y0 + ZONE.y1) / 2;
  const ox = cx - ((b.x0 + b.x1) / 2) * k, oy = cy - ((b.y0 + b.y1) / 2) * k;
  const P = (q: Vec2) => ({ x: ox + q.x * k, y: oy + q.y * k });
  const seg = (a: Vec2, bb: Vec2, w = WALL_W, dash?: readonly number[]) => { const A = P(a), B = P(bb); L(A.x, A.y, B.x, B.y, w, dash, true); };

  // ---- Murs : trait intérieur et trait extérieur, coupés en pointillés aux ouvertures
  const pts = p.floor!.points, Tk = p.walls.thickness, outer = offsetPolygon(pts, Tk);
  edges(pts).forEach((e, i) => {
    const ops = p.openings.filter(q => q.wall === i).sort((a, c) => a.t - c.t);
    const oa = outer[i], ob = outer[(i + 1) % pts.length];
    const uOa = dot(sub(oa, e.a), e.u), uOb = dot(sub(ob, e.a), e.u);
    // Point du mur à la position u (le long du mur) et à la distance s vers l'extérieur
    const at = (u: number, s: number) => add(add(e.a, mul(e.u, u)), mul(e.n, s));
    const run = (u0: number, u1: number, s: number) => {
      let cur = u0;
      for (const op of ops) {
        const lo = op.t - op.width / 2, hi = op.t + op.width / 2;
        if (lo > cur) seg(at(cur, s), at(lo, s));
        seg(at(lo, s), at(hi, s), WALL_W, op.type === 'porte' ? DASH.porte : DASH.fenetre);
        cur = hi;
      }
      if (u1 > cur) seg(at(cur, s), at(u1, s));
    };
    run(0, e.length, 0);
    run(uOa, uOb, Tk);
    // Tableaux : petits traits qui marquent la largeur exacte de chaque ouverture
    for (const op of ops) for (const u of [op.t - op.width / 2, op.t + op.width / 2]) seg(at(u, 0), at(u, Tk), THIN_W);

    // ---- Cotes extérieures (longueur intérieure du mur)
    if (o.cotes && e.length * k > 12) {
      const s = Tk + COTE_MM / k;
      const A = P(at(0, s)), B = P(at(e.length, s));
      L(A.x, A.y, B.x, B.y, THIN_W, undefined, true);
      for (const u of [0, e.length]) { const q0 = P(at(u, Tk + 1.2 / k)), q1 = P(at(u, s + 1.5 / k)); L(q0.x, q0.y, q1.x, q1.y, THIN_W, undefined, true); }
      for (const q of [A, B]) { // petits traits obliques aux extrémités
        const d = 1.2, ux = e.u.x + e.n.x, uy = e.u.y + e.n.y, l = Math.hypot(ux, uy) || 1;
        L(q.x - (ux / l) * d, q.y - (uy / l) * d, q.x + (ux / l) * d, q.y + (uy / l) * d, 0.35, undefined, true);
      }
      let rot = (Math.atan2(e.u.y, e.u.x) * 180) / Math.PI;
      if (rot > 90) rot -= 180; if (rot <= -90) rot += 180;
      const M = P(at(e.length / 2, s + 2.2 / k));
      T(M.x, M.y, 3.2, fmtLen(e.length), { align: 'center', rot, plan: true, bold: true });
    }
  });

  // ---- Cloisons : deux faces et deux chants, coupés aux ouvertures comme les murs
  for (const e of wallSegs(p).filter(w => w.part >= 0)) {
    const ops = p.openings.filter(q => q.wall === e.i).sort((a, c) => a.t - c.t);
    const at = (u: number, s: number) => add(add(e.a, mul(e.u, u)), mul(e.n, s));
    for (const s of [0, Tk]) {
      let cur = 0;
      for (const op of ops) {
        const lo = op.t - op.width / 2, hi = op.t + op.width / 2;
        if (lo > cur) seg(at(cur, s), at(lo, s));
        seg(at(lo, s), at(hi, s), WALL_W, op.type === 'porte' ? DASH.porte : DASH.fenetre);
        cur = hi;
      }
      if (e.length > cur) seg(at(cur, s), at(e.length, s));
    }
    for (const u of [0, e.length]) seg(at(u, 0), at(u, Tk));
    for (const op of ops) for (const u of [op.t - op.width / 2, op.t + op.width / 2]) seg(at(u, 0), at(u, Tk), THIN_W);
    if (o.cotes && e.length * k > 12) { // longueur de la cloison, écrite le long de son côté 1
      let rot = (Math.atan2(e.u.y, e.u.x) * 180) / Math.PI;
      if (rot > 90) rot -= 180; if (rot <= -90) rot += 180;
      const M = P(at(e.length / 2, -4 / k));
      T(M.x, M.y, 2.8, fmtLen(e.length), { align: 'center', rot, plan: true });
    }
  }

  // ---- Cadre et séparations
  prims.push({ t: 'rect', x: 10, y: 10, w: 400, h: 277, lw: 0.35, stroke: true });
  L(351, 10, 351, 287, THIN_W);
  L(10, 268, 351, 268, THIN_W);

  // ---- Colonne de droite : titre, cartouche, légende
  let y = 18;
  for (const line of wrap(p0.name || 'Ma boutique', 18)) { T(COL.x0, y, 4.6, line, { bold: true }); y += 5.6; }
  T(COL.x0, y, 3.4, 'Plan des murs', { color: '#444444' }); y += 9;

  L(COL.x0, y, COL.x1, y, THIN_W); y += 6;
  T(COL.x0, y, 3, 'ÉQUIPE', { bold: true, color: '#444444' }); y += 5.2;
  for (const line of wrap(o.team.name || '…', 20)) { T(COL.x0, y, 4, line, { bold: true }); y += 5; }
  y += 2;
  T(COL.x0, y, 3, 'ÉLÈVES', { bold: true, color: '#444444' }); y += 5;
  for (const line of wrap(o.team.members || '…', 26)) { T(COL.x0, y, 3.4, line); y += 4.4; }
  y += 2;
  if (o.team.klass) { T(COL.x0, y, 3, 'CLASSE', { bold: true, color: '#444444' }); y += 5; T(COL.x0, y, 3.4, o.team.klass); y += 6.4; }
  T(COL.x0, y, 3, 'ÉCHELLE', { bold: true, color: '#444444' }); y += 5;
  T(COL.x0, y, 3.8, sc.label, { bold: true }); y += 4.6;
  T(COL.x0, y, 3, `soit ${sc.ratio}`, { color: '#444444' }); y += 6.4;
  T(COL.x0, y, 3, new Date().toLocaleDateString('fr-FR') + ' · Concept Store 3D', { color: '#444444' }); y += 6;
  L(COL.x0, y, COL.x1, y, THIN_W);

  // Légende (bas de la colonne)
  let ly = 236;
  T(COL.x0, ly, 3, 'LÉGENDE', { bold: true, color: '#444444' }); ly += 7;
  ([['Mur', undefined], ['Porte', DASH.porte], ['Fenêtre, vitrine', DASH.fenetre]] as const).forEach(([lab, dash]) => {
    L(COL.x0, ly, COL.x0 + 12, ly, WALL_W, dash);
    T(COL.x0 + 15, ly, 3.2, lab);
    ly += 6.5;
  });
  if (rotated) T(COL.x0, 276, 2.8, 'Plan tourné d’un quart de tour', { color: '#444444' });

  // ---- Barre d'échelle (bande du bas) : un nombre entier de mètres, environ 10 cm sur la feuille
  const n = Math.max(1, Math.floor(100 / k)), sx = 16, sy = 274;
  for (let j = 0; j < n; j++) prims.push({ t: 'rect', x: sx + j * k, y: sy, w: k, h: 2.6, lw: 0.25, fill: j % 2 ? '#FFFFFF' : '#111111', stroke: true });
  for (let j = 0; j <= n; j++) T(sx + j * k, sy + 6.6, 3, j === n ? `${j} m` : String(j), { align: 'center' });
  const bx = sx + n * k + 10;
  T(bx, sy + 0.4, 3.6, `Échelle : ${sc.label} (${sc.ratio})`, { bold: true });
  T(bx, sy + 6, 3, `Vérifie à la règle : cette barre mesure exactement ${((n * k) / 10).toString().replace('.', ',')} cm (= ${n} m dans la boutique).`, { color: '#444444' });

  return { prims, planW, planH, fits, rotated, k };
}
