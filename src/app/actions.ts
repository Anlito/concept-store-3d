import type { Ctx } from './state';
import type { Pick } from '../view3d/build';
import type { Vec2 } from '../model/types';
import { MAX_SHOP_MSG, MIN_PARTITION, OPENING_DEFAULTS, addPartition, contourCount, deletePartition, deleteVertex, findFreeT, setFloorPoints, shopExtent, wallHeight, wallLength } from '../model/project';
import { deleteObjects } from './objectActions';
import { dist, isSimplePolygon, norm, sub, uid, v } from '../model/geometry';
import { toast } from '../ui/components';
import { roomAt } from '../model/rooms';

/* Actions de l'éditeur partagées par la vue 3D, le plan 2D, les panneaux et les raccourcis clavier. */

export function selectPick(ctx: Ctx, p: Pick | null) {
  if (!p || p.kind === 'floor') { ctx.ui.set({ sel: null }); return; }
  if (p.kind === 'image') { ctx.ui.set({ sel: { kind: 'image', id: p.id }, tool: 'images', libraryOpen: false }); return; }
  if (p.kind === 'object') return;
  if (p.kind === 'wall') {
    // Une cloison choisie avec l'outil Surface reste dans cet outil (on y trace aussi les cloisons).
    // Avec l'outil Images, un clic sur un mur le choisit pour la prochaine image.
    const t = ctx.ui.s.tool, keep = t === 'ouvertures' || t === 'images' || (t === 'sol' && p.index >= contourCount(ctx.store.doc));
    ctx.ui.set({ sel: { kind: 'wall', index: p.index }, tool: keep ? t : 'murs' });
  }
  else ctx.ui.set({ sel: { kind: 'opening', id: p.id }, tool: 'ouvertures' });
}

/** Choisit la pièce qui contient le point (outils Sol et Murs). Faux s'il n'y a pas de pièce à cet endroit. */
export function selectRoomAt(ctx: Ctx, q: Vec2) {
  const i = roomAt(ctx.store.doc, q);
  if (i < 0) return false;
  ctx.ui.set({ sel: { kind: 'room', index: i } });
  return true;
}

/** Pose une ouverture du type choisi sur le mur, au plus près de la position t. Elle n'est pas sélectionnée :
    on reste en mode « pose » (changer de type ne transforme pas l'ouverture qu'on vient de poser). */
export function placeOpening(ctx: Ctx, wall: number, t: number) {
  const { store, ui } = ctx;
  const type = ui.s.placeType, def = OPENING_DEFAULTS[type];
  const L = wallLength(store.doc, wall);
  const width = Math.min(def.width, L - 0.2);
  if (width < 0.4) { toast('Ce mur est trop court pour une ouverture.', undefined, 'warning'); return; }
  const at = findFreeT(store.doc, wall, width, t);
  if (at === null) { toast('Plus de place sur ce mur.', undefined, 'warning'); return; }
  const id = uid();
  store.update(d => {
    const height = Math.min(def.height, wallHeight(d, wall) - def.sill - 0.05);
    d.openings.push({ id, wall, type, t: Math.round(at * 100) / 100, width, height, sill: def.sill, style: ui.s.placeStyles[type] });
  });
  ui.set({ sel: null });
}

export function duplicateOpening(ctx: Ctx, id: string) {
  const { store, ui } = ctx;
  const o = store.doc.openings.find(q => q.id === id); if (!o) return;
  const t = findFreeT(store.doc, o.wall, o.width, o.t + o.width + 0.3);
  if (t === null) { toast('Plus de place sur ce mur.', undefined, 'warning'); return; }
  const nid = uid();
  store.update(d => { d.openings.push({ ...o, id: nid, t }); });
  ui.set({ sel: { kind: 'opening', id: nid } });
}

/** Supprime l'élément choisi (ouverture ou sommet du sol). */
export function deleteSelection(ctx: Ctx) {
  const { store, ui } = ctx, sel = ui.s.sel;
  if (!sel) return;
  if (sel.kind === 'objects') { deleteObjects(ctx); return; }
  if (sel.kind === 'image') { deleteImage(ctx, sel.id); return; }
  if (sel.kind === 'opening') {
    const o = store.doc.openings.find(q => q.id === sel.id);
    store.update(d => { d.openings = d.openings.filter(q => q.id !== sel.id); });
    ui.set({ sel: null });
    if (o) toast(`${OPENING_DEFAULTS[o.type].label} supprimée`, { label: 'Annuler', run: () => store.undo() });
  } else if (sel.kind === 'vertex') {
    let ok = true;
    store.update(d => { ok = deleteVertex(d, sel.index) && isSimplePolygon(d.floor!.points); return ok; });
    if (!ok) toast(store.doc.floor!.points.length <= 3 ? 'La surface doit garder au moins 3 points.' : 'Impossible : les côtés se croiseraient.', undefined, 'warning');
    ui.set({ sel: null });
  } else if (sel.kind === 'wall' && sel.index >= contourCount(store.doc)) {
    const j = sel.index - contourCount(store.doc);
    store.update(d => deletePartition(d, j));
    ui.set({ sel: null });
    toast('Cloison supprimée', { label: 'Annuler', run: () => store.undo() });
  } else if (sel.kind === 'wall') {
    toast('Les murs suivent le contour de la surface : modifie la surface pour retirer un mur.', undefined, 'warning');
  }
}

/** Ferme le tracé en cours et crée le sol (et donc les murs). */
export function closeDraft(ctx: Ctx, pts?: Vec2[]) {
  const { store, ui } = ctx;
  const raw = pts ?? ui.s.draft;
  // Supprime les points doublés (double-clic) et un dernier point posé sur le départ.
  const clean = raw.filter((p, i) => i === 0 || dist(p, raw[i - 1]) > 0.005);
  if (clean.length > 3 && dist(clean[0], clean[clean.length - 1]) < 0.005) clean.pop();
  if (clean.length < 3) { toast('Il faut au moins 3 points pour fermer la surface.', undefined, 'warning'); return false; }
  if (!isSimplePolygon(clean)) { toast('Les côtés se croisent : retire ou déplace un point.', undefined, 'warning'); return false; }
  const ext = shopExtent(clean);
  if (!ext.ok) {
    toast(`${MAX_SHOP_MSG} Ici : ${ext.w.toFixed(2).replace('.', ',')} × ${ext.h.toFixed(2).replace('.', ',')} m.`, undefined, 'warning');
    return false;
  }
  store.update(d => setFloorPoints(d, clean));
  ui.set({ draft: [], cursor: null, sel: null });
  toast('Surface fermée : les murs sont créés.');
  return true;
}

export function clearFloor(ctx: Ctx) {
  ctx.store.update(d => { d.floor = null; d.walls.styles = []; d.openings = []; d.partitions = []; });
  ctx.ui.set({ sel: null, draft: [], tool: 'sol', view: '2d' });
  toast('Surface effacée : trace une nouvelle surface.', { label: 'Annuler', run: () => ctx.store.undo() });
}

/** Passe en tracé de cloisons : plan 2D, un clic au départ, un clic à l'arrivée (on peut enchaîner). */
export function startPartitions(ctx: Ctx) {
  if (!ctx.store.doc.floor) { toast('Trace d’abord la surface de la boutique.', undefined, 'warning'); return; }
  ctx.ui.set({ view: '2d', tool: ctx.ui.s.tool === 'sol' ? 'sol' : 'murs', libraryOpen: false, sel: null, draft: [], cursor: null, partDraw: true });
}
export function stopPartitions(ctx: Ctx) { ctx.ui.set({ partDraw: false, draft: [], cursor: null }); }

/** Crée une cloison de a à b ; faux (avec un message) si elle sort du sol ou si elle est trop courte. */
export function createPartition(ctx: Ctx, a: Vec2, b: Vec2) {
  if (dist(a, b) < MIN_PARTITION) return false;
  let ok = false;
  ctx.store.update(d => { ok = !!addPartition(d, a, b); return ok; });
  if (!ok) toast('Une cloison se trace à l’intérieur de la boutique.', undefined, 'warning');
  return ok;
}

/** Cloison de longueur l (m) depuis le point de départ, dans la direction du curseur (presque droite → droite). */
export function partitionByLength(ctx: Ctx, l: number) {
  const s = ctx.ui.s, a = s.draft[0];
  if (!a) { toast('Clique d’abord le point de départ de la cloison sur le plan.', undefined, 'warning'); return; }
  let dir = s.cursor && dist(s.cursor, a) > 1e-3 ? norm(sub(s.cursor, a)) : v(1, 0);
  const ang = Math.atan2(dir.y, dir.x), snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
  if (Math.abs(ang - snap) < 0.14) dir = v(Math.cos(snap), Math.sin(snap));
  const b = v(Math.round((a.x + dir.x * l) * 1000) / 1000, Math.round((a.y + dir.y * l) * 1000) / 1000);
  if (createPartition(ctx, a, b)) ctx.ui.set({ draft: [b] });
}

/** Supprime une image posée ; l'image importée est retirée du projet si plus rien ne l'utilise. */
export function deleteImage(ctx: Ctx, id: string) {
  ctx.store.update(d => {
    d.images = d.images.filter(i => i.id !== id);
    d.assets = d.assets.filter(a => d.images.some(i => i.asset === a.id));
  });
  ctx.ui.set({ sel: null });
  toast('Image supprimée', { label: 'Annuler', run: () => ctx.store.undo() });
}
