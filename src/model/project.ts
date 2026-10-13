import type { Floor, LevelData, Opening, OpeningType, Partition, PlacedImage, Project, Vec2, WallStyle } from './types';
import { add, bounds, dist, edges, mul, norm, normalizeWinding, pointInPolygon, projectOnSegment, round3, sub, uid, v, type Edge } from './geometry';

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
    partitions: [],
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

/* ---------- Murs et cloisons ----------
   Les murs du contour (n° 0 à n − 1, un par côté du sol) et les cloisons (n° n et suivants) se manipulent
   de la même façon : un segment avec une face de départ (a → b, direction u), et l'épaisseur T vers n.
   Pour un mur du contour, la face de départ est la face intérieure et n pointe vers la rue ; pour une cloison,
   c'est le côté 1, décalé d'une demi-épaisseur depuis son axe. */
export interface WallSeg extends Edge {
  T: number;
  H: number;
  /** Rang de la cloison, ou −1 pour un mur du contour. */
  part: number;
}
export const contourCount = (p: Project) => p.floor?.points.length ?? 0;
export function wallSegs(p: Project): WallSeg[] {
  if (!p.floor) return [];
  const T = p.walls.thickness, H = p.walls.height, n = p.floor.points.length;
  const segs: WallSeg[] = edges(p.floor.points).map(e => ({ ...e, T, H, part: -1 }));
  p.partitions.forEach((c, j) => {
    const u = norm(sub(c.b, c.a)), nn = v(u.y, -u.x), off = mul(nn, -T / 2);
    segs.push({ i: n + j, a: add(c.a, off), b: add(c.b, off), u, n: nn, length: dist(c.a, c.b), T, H: c.height ?? H, part: j });
  });
  return segs;
}
export const wallSeg = (p: Project, i: number): WallSeg | undefined => wallSegs(p)[i];
export const wallLength = (p: Project, i: number) => wallSeg(p, i)?.length ?? 0;
export const wallHeight = (p: Project, i: number) => wallSeg(p, i)?.H ?? p.walls.height;
export const isPartition = (p: Project, i: number) => i >= contourCount(p);
/** Revêtement d'un mur ou d'une cloison (objet du document, modifiable). */
export const wallStyleOf = (p: Project, i: number): WallStyle | undefined => (i < contourCount(p) ? p.walls.styles[i] : p.partitions[i - contourCount(p)]?.style);
/** Repère court sur les plans : « 3 » pour le mur n° 3, « C1 » pour la cloison n° 1. */
export const wallShort = (p: Project, i: number) => (isPartition(p, i) ? `C${i - contourCount(p) + 1}` : String(i + 1));
/** « mur n° 3 » ou « cloison n° 1 ». */
export const wallName = (p: Project, i: number) => (isPartition(p, i) ? `cloison n° ${i - contourCount(p) + 1}` : `mur n° ${i + 1}`);

/** Bouts d'une cloison. Quand ils rejoignent le bout d'une autre cloison (angle, cloisons en enfilade), ils sont
    prolongés d'une demi-épaisseur pour fermer l'angle ; un bout « libre » (qui ne touche rien) montre son chant. */
export function partitionEnds(p: Project, j: number) {
  const c = p.partitions[j], T = p.walls.thickness, near = 0.03;
  const end = (q: Vec2) => {
    const joins = p.partitions.some((o, k) => k !== j && (dist(o.a, q) < 0.01 || dist(o.b, q) < 0.01));
    const touches = joins || p.partitions.some((o, k) => k !== j && projectOnSegment(q, o.a, o.b).d < T / 2 + near)
      || (!!p.floor && edges(p.floor.points).some(e => projectOnSegment(q, e.a, e.b).d < near));
    return { ext: joins ? T / 2 : 0, free: !touches };
  };
  const a = end(c.a), b = end(c.b);
  return { ext0: a.ext, ext1: b.ext, free0: a.free, free1: b.free };
}

/** Longueur minimale d'une cloison (m). */
export const MIN_PARTITION = 0.3;
/** Point dans le sol (ou sur son bord, contre la face intérieure d'un mur). */
export function insideFloor(p: Project, q: Vec2) {
  if (!p.floor) return false;
  return pointInPolygon(q, p.floor.points) || edges(p.floor.points).some(e => projectOnSegment(q, e.a, e.b).d < 0.02);
}
export function addPartition(p: Project, a: Vec2, b: Vec2): Partition | null {
  if (dist(a, b) < MIN_PARTITION || !insideFloor(p, a) || !insideFloor(p, b)) return null;
  const c: Partition = { id: uid(), a: { x: round3(a.x), y: round3(a.y) }, b: { x: round3(b.x), y: round3(b.y) }, style: { ...DEFAULT_WALL } };
  p.partitions.push(c);
  return c;
}
/** Retire la cloison j, avec ses ouvertures et ses images ; renumérote les suivantes. */
export function deletePartition(p: Project, j: number) {
  const w = contourCount(p) + j;
  p.partitions.splice(j, 1);
  p.openings = p.openings.filter(o => o.wall !== w);
  p.images = p.images.filter(im => im.target === 'tapis' || im.wall !== w);
  for (const o of p.openings) if (o.wall > w) o.wall--;
  for (const im of p.images) if (im.target !== 'tapis' && im.wall > w) im.wall--;
  p.assets = p.assets.filter(a => p.images.some(im => im.asset === a.id));
}

/** Pose un nouveau sol (remplace l'ancien) et crée un mur par côté. */
export function setFloorPoints(p: Project, pts: Vec2[]) {
  const points = normalizeWinding(pts.map(q => ({ x: round3(q.x), y: round3(q.y) })));
  const old = p.floor;
  p.floor = { points, material: old?.material ?? 'parquet', color: old?.color ?? '#EFE9DF' } as Floor;
  p.walls.styles = points.map((_, i) => ({ ...(p.walls.styles[i] ?? DEFAULT_WALL) }));
  p.openings = [];
  p.partitions = [];
  p.rooms = [];
  p.pans = [];
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
  const segs = wallSegs(p);
  p.openings = p.openings.filter(o => {
    const s = segs[o.wall];
    if (!s) return false;
    const L = s.length;
    o.width = Math.min(o.width, L - 2 * OPENING_MARGIN);
    if (o.width < 0.3) return false;
    o.height = Math.min(o.height, s.H - o.sill - 0.05);
    if (o.height < 0.3) { o.sill = Math.max(0, s.H - 0.35 - 0.05); o.height = 0.3; }
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
  let r = raw as Partial<Project>;
  if (!r || r.format !== 'concept-store-3d') throw new Error('Ce fichier n’est pas un projet Concept Store 3D.');
  // Projet enregistré avec l'étage au premier plan (copie de secours) : on remet le rez-de-chaussée devant.
  if (r.niveau === 1 && r.autreNiveau) {
    const devant = Object.fromEntries(NIVEAU_KEYS.map(k => [k, r[k]]));
    r = { ...r, ...r.autreNiveau, autreNiveau: devant as unknown as LevelData, niveau: 0 };
  }
  const etage = r.autreNiveau ? sanitizeProject({ ...r, ...r.autreNiveau, autreNiveau: undefined, niveau: 0 }) : null;
  const p = { ...newProject(), ...r } as Project;
  p.team = { ...newProject().team, ...(r.team || {}) };
  p.walls = { ...newProject().walls, ...(r.walls || {}) };
  if (p.floor) {
    p.floor.points = p.floor.points.map(q => ({ x: +q.x || 0, y: +q.y || 0 }));
    p.walls.styles = p.floor.points.map((_, i) => ({ ...DEFAULT_WALL, ...(p.walls.styles[i] || {}) }));
  }
  p.partitions = (Array.isArray(r.partitions) ? r.partitions : [])
    .filter(c => c && c.a && c.b && Number.isFinite(+c.a.x) && Number.isFinite(+c.a.y) && Number.isFinite(+c.b.x) && Number.isFinite(+c.b.y))
    .map(c => ({ id: c.id || uid(), a: { x: +c.a.x, y: +c.a.y }, b: { x: +c.b.x, y: +c.b.y }, ...(c.height ? { height: +c.height } : {}), style: { ...DEFAULT_WALL, ...(c.style || {}) } }));
  if (!p.floor) p.partitions = [];
  p.rooms = (Array.isArray(r.rooms) ? r.rooms : []).filter(st => st && st.at && Number.isFinite(+st.at.x) && Number.isFinite(+st.at.y))
    .map(st => ({ at: { x: +st.at.x, y: +st.at.y }, ...(st.floor ? { floor: { ...st.floor } } : {}), ...(st.wall ? { wall: { ...st.wall } } : {}) }));
  p.pans = (Array.isArray(r.pans) ? r.pans : []).filter(st => st && st.at && st.material).map(st => ({ at: { x: +st.at.x, y: +st.at.y }, material: st.material, color: st.color }));
  p.steps = Array.isArray(r.steps) ? r.steps.filter(x => typeof x === 'string') : [];
  p.openings = (p.openings || []).map(o => ({ ...o }));
  p.objects = (p.objects || []).map(o => ({ ...o, size: { ...o.size }, color: o.color ?? null, locked: !!o.locked, z: +o.z || 0 }));
  p.creations = (p.creations || []).filter(c => c && Array.isArray(c.volumes)).map(c => ({ ...c, volumes: c.volumes.map(v => ({ ...v })) }));
  p.assets = (p.assets || []).filter(a => a && typeof a.data === 'string' && a.data.startsWith('data:image/'));
  p.images = (p.images || []).filter(i => p.assets.some(a => a.id === i.asset)).map(i => ({ ...i }));
  clampAllOpenings(p);
  delete p.autreNiveau; delete p.niveau;
  if (etage) p.autreNiveau = Object.fromEntries(NIVEAU_KEYS.map(k => [k, etage[k]])) as unknown as LevelData;
  return p;
}
/** Champs propres à un niveau (même liste que model/levels.ts). */
const NIVEAU_KEYS = ['floor', 'walls', 'partitions', 'openings', 'objects', 'images', 'rooms', 'pans'] as const;

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
    { value: 'passage', label: 'Passage (sans porte)', color: '#D8D2C8' },
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

/* ---------- Emplacement des images ---------- */
/** Où se trouve une image murale : mur, face, et rectangle [u0, u1] × [h0, h1] dans le repère de sa face de départ
    (u le long du mur, h en hauteur ; boîte englobante si l'image est tournée ; tout le mur pour une tapisserie répétée). */
export function imageExtent(p: Project, im: PlacedImage) {
  const e = wallSegs(p)[im.wall], a = p.assets.find(x => x.id === im.asset);
  if (!e || !a || im.target === 'tapis') return null;
  const ext = im.side === 'ext';
  if (im.repeat) return { e, ext, u0: 0, u1: e.length, h0: 0, h1: e.H };
  const w = im.size, hh = im.size * (a.h / a.w), r = (im.rot * Math.PI) / 180;
  const bw = Math.abs(w * Math.cos(r)) + Math.abs(hh * Math.sin(r)), bh = Math.abs(w * Math.sin(r)) + Math.abs(hh * Math.cos(r));
  const u = (ext ? 1 - im.x : im.x) * e.length, h = im.y * e.H;
  return { e, ext, u0: u - bw / 2, u1: u + bw / 2, h0: h - bh / 2, h1: h + bh / 2 };
}
/** Coins d'un tapis au sol (tout le sol s'il est répété). */
export function rugCorners(p: Project, im: PlacedImage): Vec2[] | null {
  const a = p.assets.find(x => x.id === im.asset);
  if (!p.floor || !a || im.target !== 'tapis') return null;
  if (im.repeat) return p.floor.points;
  const b = bounds(p.floor.points), c = v(b.x0 + im.x * b.w, b.y0 + im.y * b.h);
  const w = im.size / 2, hh = (im.size * (a.h / a.w)) / 2, r = (im.rot * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
  return [[-w, -hh], [w, -hh], [w, hh], [-w, hh]].map(([x, y]) => v(c.x + x * cs - y * sn, c.y + x * sn + y * cs));
}
