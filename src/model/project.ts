import type { Floor, Opening, OpeningType, Project, Vec2, WallStyle } from './types';
import { bounds, dist, edges, normalizeWinding, projectOnSegment, round3, uid } from './geometry';

export const DEFAULT_WALL: WallStyle = { material: 'peinture', color: '#FCFBF9' };
/** Façade par défaut : enduit clair. */
export const DEFAULT_OUT = { material: 'peinture' as const, color: '#F1EEE8' };
export const WALL_LIMITS = { height: [2, 6], thickness: [0.05, 0.5] } as const;

export const OPENING_DEFAULTS: Record<OpeningType, { width: number; height: number; sill: number; label: string }> = {
  porte: { width: 0.9, height: 2.1, sill: 0, label: 'Porte' },
  fenetre: { width: 1.2, height: 1.2, sill: 1.0, label: 'Fenêtre' },
  vitrine: { width: 2.4, height: 2.2, sill: 0.2, label: 'Vitrine' },
};
/** Distance minimale entre une ouverture et un angle de mur ou une autre ouverture (m). */
export const OPENING_MARGIN = 0.1;

export function newProject(name = 'Ma boutique'): Project {
  return {
    format: 'concept-store-3d', version: 1, id: uid(), name,
    team: { name: '', members: '', klass: '' },
    floor: null,
    walls: { height: 3, thickness: 0.1, styles: [] }, // 10 cm = carton de 3 mm à l'échelle 1 m = 3 cm
    openings: [],
    objects: [],
    creations: [],
    assets: [],
    images: [],
  };
}

/** Boutique d'exemple (10 × 7 m) proche des maquettes. */
export function sampleProject(): Project {
  const p = newProject('Boutique exemple');
  setFloorPoints(p, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 7 }, { x: 0, y: 7 }]);
  p.floor!.material = 'parquet';
  p.openings.push(
    { id: uid(), wall: 0, type: 'fenetre', t: 7.25, width: 2.5, height: 1.4, sill: 0.9 },
    { id: uid(), wall: 2, type: 'vitrine', t: 7.6, width: 2.8, height: 2.2, sill: 0.2 },
    { id: uid(), wall: 2, type: 'porte', t: 5, width: 1.2, height: 2.2, sill: 0 },
    { id: uid(), wall: 2, type: 'vitrine', t: 2.4, width: 2.8, height: 2.2, sill: 0.2 },
    { id: uid(), wall: 3, type: 'porte', t: 1.7, width: 0.9, height: 2.1, sill: 0 },
  );
  return p;
}

export const wallLength = (p: Project, i: number) => {
  const pts = p.floor!.points;
  return dist(pts[i], pts[(i + 1) % pts.length]);
};

/** Pose un nouveau sol (remplace l'ancien) et crée un mur par côté. */
export function setFloorPoints(p: Project, pts: Vec2[]) {
  const points = normalizeWinding(pts.map(q => ({ x: round3(q.x), y: round3(q.y) })));
  const old = p.floor;
  p.floor = { points, material: old?.material ?? 'parquet', color: old?.color ?? '#EFE9DF' } as Floor;
  p.walls.styles = points.map((_, i) => ({ ...(p.walls.styles[i] ?? DEFAULT_WALL) }));
  p.openings = [];
  p.images = p.images.filter(im => im.target === 'tapis'); // les murs changent : on retire les images murales
}

/** Déplace un sommet ; les ouvertures restent sur leur mur et sont recadrées. */
export function moveVertex(p: Project, i: number, to: Vec2) {
  p.floor!.points[i] = { x: round3(to.x), y: round3(to.y) };
  clampAllOpenings(p);
}

/** Ajoute un sommet au milieu du mur i (le mur est coupé en deux). */
export function insertVertex(p: Project, i: number, at: Vec2) {
  const pts = p.floor!.points;
  const a = pts[i], b = pts[(i + 1) % pts.length];
  const { t } = projectOnSegment(at, a, b), cut = t * dist(a, b);
  pts.splice(i + 1, 0, { x: round3(at.x), y: round3(at.y) });
  p.walls.styles.splice(i + 1, 0, { ...p.walls.styles[i] });
  for (const o of p.openings) {
    if (o.wall > i) o.wall++;
    else if (o.wall === i && o.t > cut) { o.wall = i + 1; o.t -= cut; }
  }
  for (const im of p.images) if (im.target !== 'tapis' && im.wall > i) im.wall++;
  clampAllOpenings(p);
}

/** Retire le sommet i (au moins 3 sommets restent). Les murs i-1 et i fusionnent. */
export function deleteVertex(p: Project, i: number) {
  const pts = p.floor!.points, n = pts.length;
  if (n <= 3) return false;
  const prev = (i - 1 + n) % n;
  const a = pts[prev], c = pts[(i + 1) % n];
  // Les ouvertures des deux murs fusionnés sont reprojetées sur le nouveau mur.
  const E = edges(pts);
  const moved = p.openings.filter(o => o.wall === prev || o.wall === i).map(o => {
    const e = E[o.wall], mid = { x: e.a.x + e.u.x * o.t, y: e.a.y + e.u.y * o.t };
    return { o, t: projectOnSegment(mid, a, c).t * dist(a, c) };
  });
  pts.splice(i, 1);
  p.walls.styles.splice(i, 1);
  const newIndex = i === 0 ? n - 2 : prev; // indice du mur fusionné après suppression
  for (const o of p.openings) if (o.wall > i) o.wall--;
  for (const { o, t } of moved) { o.wall = newIndex; o.t = t; }
  for (const im of p.images) if (im.target !== 'tapis') { if (im.wall === i || im.wall === prev) im.wall = newIndex; else if (im.wall > i) im.wall--; }
  clampAllOpenings(p);
  return true;
}

/** Garde chaque ouverture dans son mur ; supprime celles qui ne tiennent plus. */
export function clampAllOpenings(p: Project) {
  if (!p.floor) { p.openings = []; return; }
  const n = p.floor.points.length;
  p.openings = p.openings.filter(o => {
    if (o.wall < 0 || o.wall >= n) return false;
    const L = wallLength(p, o.wall);
    o.width = Math.min(o.width, L - 2 * OPENING_MARGIN);
    if (o.width < 0.3) return false;
    o.height = Math.min(o.height, p.walls.height - o.sill - 0.05);
    if (o.height < 0.3) { o.sill = Math.max(0, p.walls.height - 0.35 - 0.05); o.height = 0.3; }
    o.t = clampT(L, o.width, o.t);
    return true;
  });
}
export const clampT = (L: number, w: number, t: number) => Math.min(L - w / 2 - OPENING_MARGIN, Math.max(w / 2 + OPENING_MARGIN, t));

/** Vrai si l'ouverture (déjà recadrée) chevauche une autre ouverture du même mur. */
export function openingOverlaps(p: Project, o: Opening) {
  return p.openings.some(q => q.id !== o.id && q.wall === o.wall && Math.abs(q.t - o.t) < (q.width + o.width) / 2 + OPENING_MARGIN - 1e-6);
}

/** Cherche une place libre la plus proche de t sur le mur ; renvoie null si le mur est plein. */
export function findFreeT(p: Project, wall: number, width: number, t: number, ignoreId?: string): number | null {
  const L = wallLength(p, wall);
  if (width + 2 * OPENING_MARGIN > L) return null;
  const others = p.openings.filter(q => q.wall === wall && q.id !== ignoreId);
  const ok = (x: number) => others.every(q => Math.abs(q.t - x) >= (q.width + width) / 2 + OPENING_MARGIN - 1e-6);
  const t0 = clampT(L, width, t);
  if (ok(t0)) return t0;
  const cands = others.flatMap(q => [q.t - (q.width + width) / 2 - OPENING_MARGIN, q.t + (q.width + width) / 2 + OPENING_MARGIN])
    .map(x => clampT(L, width, x)).filter(ok).sort((a, b) => Math.abs(a - t) - Math.abs(b - t));
  return cands.length ? cands[0] : null;
}

/** Contrôle et répare un projet chargé depuis un fichier. */
export function sanitizeProject(raw: unknown): Project {
  const r = raw as Partial<Project>;
  if (!r || r.format !== 'concept-store-3d') throw new Error('Ce fichier n’est pas un projet Concept Store 3D.');
  const p = { ...newProject(), ...r } as Project;
  p.team = { ...newProject().team, ...(r.team || {}) };
  p.walls = { ...newProject().walls, ...(r.walls || {}) };
  if (p.floor) {
    p.floor.points = p.floor.points.map(q => ({ x: +q.x || 0, y: +q.y || 0 }));
    p.walls.styles = p.floor.points.map((_, i) => ({ ...DEFAULT_WALL, ...(p.walls.styles[i] || {}) }));
  }
  p.openings = (p.openings || []).map(o => ({ ...o }));
  p.objects = (p.objects || []).map(o => ({ ...o, size: { ...o.size }, color: o.color ?? null, locked: !!o.locked, z: +o.z || 0 }));
  p.creations = (p.creations || []).filter(c => c && Array.isArray(c.volumes)).map(c => ({ ...c, volumes: c.volumes.map(v => ({ ...v })) }));
  p.assets = (p.assets || []).filter(a => a && typeof a.data === 'string' && a.data.startsWith('data:image/'));
  p.images = (p.images || []).filter(i => p.assets.some(a => a.id === i.asset)).map(i => ({ ...i }));
  clampAllOpenings(p);
  return p;
}

/** Plus grande boutique autorisée (surface au sol) : 10 m × 7 m, dans un sens ou dans l'autre.
    C'est ce qui permet d'imprimer le plan à 1 m = 3 cm sur une feuille A3. */
export const MAX_SHOP = { long: 10, short: 7 };
export function shopExtent(pts: Vec2[]) {
  const b = bounds(pts);
  return { w: b.w, h: b.h, ok: Math.max(b.w, b.h) <= MAX_SHOP.long + 1e-6 && Math.min(b.w, b.h) <= MAX_SHOP.short + 1e-6 };
}
export const MAX_SHOP_MSG = 'La boutique ne doit pas dépasser 10 × 7 m.';

/** Styles de menuiseries proposés pour chaque type d'ouverture (le premier est celui par défaut). */
export const OPENING_STYLES: Record<OpeningType, { value: string; label: string; color: string }[]> = {
  porte: [
    { value: 'pleine', label: 'Pleine', color: '#E4DCCF' },
    { value: 'vitree', label: 'Vitrée', color: '#2E2D2B' },
    { value: 'double', label: 'Double vitrée', color: '#2E2D2B' },
    { value: 'coulissante', label: 'Coulissante', color: '#B8B4AD' },
    { value: 'atelier', label: 'Atelier', color: '#2E2D2B' },
  ],
  fenetre: [
    { value: 'classique', label: 'Classique', color: '#ECE9E3' },
    { value: 'atelier', label: 'Atelier', color: '#2E2D2B' },
    { value: 'fixe', label: 'Fixe', color: '#5B6B7A' },
  ],
  vitrine: [
    { value: 'moderne', label: 'Moderne', color: '#2E2D2B' },
    { value: 'sans-cadre', label: 'Sans cadre', color: '#B8B4AD' },
    { value: 'atelier', label: 'Atelier', color: '#2E2D2B' },
    { value: 'bois', label: 'Bois', color: '#8A5A3B' },
  ],
};
export const openingStyle = (o: Opening) => OPENING_STYLES[o.type].find(s => s.value === o.style) ?? OPENING_STYLES[o.type][0];
export const openingColor = (o: Opening) => o.color ?? openingStyle(o).color;
