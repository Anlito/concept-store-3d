import type { Ctx } from './state';
import type { Pick } from '../view3d/build';
import type { Vec2 } from '../model/types';
import { MAX_SHOP_MSG, OPENING_DEFAULTS, deleteVertex, findFreeT, setFloorPoints, shopExtent, wallLength } from '../model/project';
import { deleteObjects } from './objectActions';
import { dist, isSimplePolygon, uid } from '../model/geometry';
import { toast } from '../ui/components';

/* Actions de l'éditeur partagées par la vue 3D, le plan 2D, les panneaux et les raccourcis clavier. */

export function selectPick(ctx: Ctx, p: Pick | null) {
  if (!p || p.kind === 'floor') { ctx.ui.set({ sel: null }); return; }
  if (p.kind === 'image') { ctx.ui.set({ sel: { kind: 'image', id: p.id }, tool: 'images', libraryOpen: false }); return; }
  if (p.kind === 'object') return;
  if (p.kind === 'wall') ctx.ui.set({ sel: { kind: 'wall', index: p.index }, tool: ctx.ui.s.tool === 'ouvertures' ? 'ouvertures' : 'murs' });
  else ctx.ui.set({ sel: { kind: 'opening', id: p.id }, tool: 'ouvertures' });
}

/** Pose une ouverture du type choisi sur le mur, au plus près de la position t. */
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
    const height = Math.min(def.height, d.walls.height - def.sill - 0.05);
    d.openings.push({ id, wall, type, t: Math.round(at * 100) / 100, width, height, sill: def.sill, style: ui.s.placeStyles[type] });
  });
  ui.set({ sel: { kind: 'opening', id } });
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
    if (!ok) toast(store.doc.floor!.points.length <= 3 ? 'Le sol doit garder au moins 3 points.' : 'Impossible : les côtés se croiseraient.', undefined, 'warning');
    ui.set({ sel: null });
  } else if (sel.kind === 'wall') {
    toast('Les murs suivent le sol : modifie le sol pour retirer un mur.', undefined, 'warning');
  }
}

/** Ferme le tracé en cours et crée le sol (et donc les murs). */
export function closeDraft(ctx: Ctx, pts?: Vec2[]) {
  const { store, ui } = ctx;
  const raw = pts ?? ui.s.draft;
  // Supprime les points doublés (double-clic) et un dernier point posé sur le départ.
  const clean = raw.filter((p, i) => i === 0 || dist(p, raw[i - 1]) > 0.005);
  if (clean.length > 3 && dist(clean[0], clean[clean.length - 1]) < 0.005) clean.pop();
  if (clean.length < 3) { toast('Il faut au moins 3 points pour fermer le sol.', undefined, 'warning'); return false; }
  if (!isSimplePolygon(clean)) { toast('Les côtés se croisent : retire ou déplace un point.', undefined, 'warning'); return false; }
  const ext = shopExtent(clean);
  if (!ext.ok) {
    toast(`${MAX_SHOP_MSG} Ici : ${ext.w.toFixed(2).replace('.', ',')} × ${ext.h.toFixed(2).replace('.', ',')} m.`, undefined, 'warning');
    return false;
  }
  store.update(d => setFloorPoints(d, clean));
  ui.set({ draft: [], cursor: null, sel: null });
  toast('Sol fermé : les murs sont créés.');
  return true;
}

export function clearFloor(ctx: Ctx) {
  ctx.store.update(d => { d.floor = null; d.walls.styles = []; d.openings = []; });
  ctx.ui.set({ sel: null, draft: [], tool: 'sol', view: '2d' });
  toast('Sol effacé : trace un nouveau sol.', { label: 'Annuler', run: () => ctx.store.undo() });
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
