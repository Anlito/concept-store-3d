import type { Project, Vec2 } from '../model/types';
import { add, bounds, dot, edges, mul, offsetPolygon, sub } from '../model/geometry';

/* Mise en page de la feuille A3 paysage (420 × 297 mm), en millimètres, origine en haut à gauche.
   La même liste de tracés sert à l'aperçu (SVG) et au PDF (jsPDF) : ce qu'on voit est ce qu'on imprime.
   Contenu : les murs seulement (deux traits = épaisseur réelle), ouvertures en pointillés, cotes extérieures,
   légende, barre d'échelle de 10 cm, cartouche de l'équipe. Ni mobilier, ni texture, ni cote intérieure. */

export const SHEET = { w: 420, h: 297 };
export const SCALES = [20, 50, 100] as const;
export type Scale = (typeof SCALES)[number];
/** Zone réservée au plan (hors titre, légende et cartouche). */
export const ZONE = { x0: 14, y0: 26, x1: 406, y1: 250 };
const COTE_MM = 7;          // décalage des cotes à l'extérieur des murs
const COTE_MARGIN = 12;     // place prise par les cotes autour du plan

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
  /** Millimètres sur la feuille pour 1 m dans la boutique. */
  k: number;
}

const fmtLen = (m: number) => m.toFixed(2).replace('.', ',') + ' m';

/** Taille du plan (murs compris) pour une échelle donnée, et si elle tient dans la zone. */
export function planSize(p: Project, scale: Scale, cotes: boolean) {
  const k = 1000 / scale;
  const outer = offsetPolygon(p.floor!.points, p.walls.thickness);
  const b = bounds(outer);
  const m = cotes ? 2 * COTE_MARGIN : 0;
  const w = b.w * k + m, h = b.h * k + m;
  return { w, h, fits: w <= ZONE.x1 - ZONE.x0 && h <= ZONE.y1 - ZONE.y0, b, k };
}
/** La plus grande échelle (plan le plus grand) qui fait tenir la boutique sur la feuille. */
export function bestScale(p: Project, cotes: boolean): Scale {
  for (const s of SCALES) if (planSize(p, s, cotes).fits) return s;
  return 100;
}

export function layoutSheet(p: Project, o: SheetOptions): Layout {
  const prims: Prim[] = [];
  const L = (x1: number, y1: number, x2: number, y2: number, w = WALL_W, dash?: readonly number[], plan = false) => prims.push({ t: 'line', x1, y1, x2, y2, w, dash, plan });
  const T = (x: number, y: number, size: number, str: string, extra: Partial<Extract<Prim, { t: 'text' }>> = {}) => prims.push({ t: 'text', x, y, size, str, ...extra });

  const { w: planW, h: planH, fits, b, k } = planSize(p, o.scale, o.cotes);
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
    // Ligne le long du mur, de u0 à u1, à la distance s vers l'extérieur
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
      // petits traits obliques aux extrémités
      for (const q of [A, B]) {
        const d = 1.2, ux = e.u.x + e.n.x, uy = e.u.y + e.n.y, l = Math.hypot(ux, uy) || 1;
        L(q.x - (ux / l) * d, q.y - (uy / l) * d, q.x + (ux / l) * d, q.y + (uy / l) * d, 0.35, undefined, true);
      }
      let rot = (Math.atan2(e.u.y, e.u.x) * 180) / Math.PI;
      if (rot > 90) rot -= 180; if (rot <= -90) rot += 180;
      const M = P(at(e.length / 2, s + 2.2 / k));
      T(M.x, M.y, 3.2, fmtLen(e.length), { align: 'center', rot, plan: true, bold: true });
    }
  });

  // ---- Cadre, titre
  prims.push({ t: 'rect', x: 10, y: 10, w: 400, h: 277, lw: 0.35, stroke: true });
  T(16, 18.5, 5.2, `${p.name || 'Ma boutique'} · plan des murs`, { bold: true });

  // ---- Légende (en bas à gauche)
  const ly = 258;
  T(16, ly - 6, 3.4, 'Légende', { bold: true });
  ([['Mur', undefined], ['Porte', DASH.porte], ['Fenêtre ou vitrine', DASH.fenetre]] as const).forEach(([lab, dash], j) => {
    const x = 16 + j * 42;
    L(x, ly, x + 14, ly, WALL_W, dash);
    T(x + 17, ly, 3.6, lab);
  });

  // ---- Barre d'échelle : exactement 10 cm sur la feuille
  const sx = 16, sy = 270, real = (100 / k);
  for (let j = 0; j < 10; j++) prims.push({ t: 'rect', x: sx + j * 10, y: sy, w: 10, h: 2.4, lw: 0.25, fill: j % 2 ? '#FFFFFF' : '#111111', stroke: true });
  T(sx, sy + 6, 3, '0', { align: 'center' });
  T(sx + 50, sy + 6, 3, '5 cm', { align: 'center' });
  T(sx + 100, sy + 6, 3, '10 cm', { align: 'center' });
  T(sx + 106, sy + 1.2, 3.6, `Échelle 1:${o.scale} · 10 cm sur la feuille = ${fmtLen(real).replace(',00', '')} dans la boutique`, { bold: true });
  T(sx + 106, sy + 6.5, 3, 'Vérifie à la règle : la barre doit mesurer exactement 10 cm.', { color: '#444444' });

  // ---- Cartouche (en bas à droite)
  const kx = 286, ky = 256;
  prims.push({ t: 'rect', x: kx, y: ky, w: 124, h: 31, lw: 0.35, stroke: true, fill: '#FFFFFF' });
  L(kx, ky + 11, kx + 124, ky + 11, THIN_W);
  T(kx + 4, ky + 5.5, 4.4, 'Équipe : ' + (o.team.name || '…'), { bold: true });
  T(kx + 4, ky + 17, 3.8, o.team.members || 'Prénoms des élèves');
  const date = new Date().toLocaleDateString('fr-FR');
  T(kx + 4, ky + 25, 3.2, [o.team.klass, 'Concept Store 3D', `échelle 1:${o.scale}`, date].filter(Boolean).join(' · '), { color: '#444444' });

  return { prims, planW, planH, fits, k };
}
