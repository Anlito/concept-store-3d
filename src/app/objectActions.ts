import type { Ctx } from './state';
import type { PlacedObject } from '../model/types';
import { edges, uid, snapTo } from '../model/geometry';
import { freeSpot, normRot, snapToWall } from '../model/objects';
import { getItem, loadProto } from '../library/library';
import { toast } from '../ui/components';
import { findCreation } from './creations';

/* Actions sur les objets posés : ajout, sélection, duplication, copier-coller, rotation, couleur… */

export const selectedIds = (ctx: Ctx): string[] => (ctx.ui.s.sel?.kind === 'objects' ? ctx.ui.s.sel.ids : []);
export const selectedObjects = (ctx: Ctx): PlacedObject[] => {
  const ids = selectedIds(ctx);
  return ctx.store.doc.objects.filter(o => ids.includes(o.id));
};
export function selectObjects(ctx: Ctx, ids: string[], additive = false) {
  let next = ids;
  if (additive) {
    const cur = selectedIds(ctx);
    next = [...cur.filter(i => !ids.includes(i)), ...ids.filter(i => !cur.includes(i))];
  }
  ctx.ui.set({ sel: next.length ? { kind: 'objects', ids: next } : null, tool: 'mobilier', libraryOpen: false });
}

/** Ajoute un meuble de la bibliothèque dans la boutique, à un endroit libre, et le sélectionne. */
export async function addObject(ctx: Ctx, model: string) {
  const item = getItem(model); if (!item) return;
  const proto = await loadProto(model);
  const { store } = ctx;
  const id = uid();
  const spot = freeSpot(store.doc, proto.dims);
  const o: PlacedObject = { id, model, x: spot.x, y: spot.y, z: 0, rot: 0, size: { ...proto.dims }, color: null, locked: false };
  if (item.plafond) o.z = Math.max(0, store.doc.walls.height - o.size.h);
  if (item.elev !== undefined) o.z = item.elev;
  // Décor extérieur : devant la porte d'entrée (ou la vitrine), côté rue.
  if (item.cat === 'exterieur') {
    const door = store.doc.openings.find(q => q.type === 'porte') ?? store.doc.openings.find(q => q.type === 'vitrine');
    if (door && store.doc.floor) {
      const e = edges(store.doc.floor.points)[door.wall], off = item.mural ? 0.3 : store.doc.walls.thickness + 1;
      const side = item.mural ? 0 : door.width / 2 + 0.6; // un chevalet se pose à côté de la porte, pas devant
      o.x = e.a.x + e.u.x * (door.t + side) + e.n.x * off; o.y = e.a.y + e.u.y * (door.t + side) + e.n.y * off;
      o.rot = normRot(Math.atan2(-e.n.x, e.n.y) * 180 / Math.PI);
    }
  }
  if (item.mural) {
    snapToWall(store.doc, o, 100, item.outside ? 'out' : 'in');
  }
  // Une création gardée sur ce poste est copiée dans le projet (le fichier reste complet).
  const creation = item.source === 'moi' && !store.doc.creations.some(c => c.id === model) ? findCreation(ctx, model) : undefined;
  store.update(d => { if (creation) d.creations.push(structuredClone(creation)); d.objects.push(o); });
  selectObjects(ctx, [id]);
  toast(`« ${item.name} » posé dans la boutique : glisse-le pour le placer.`);
}

export function deleteObjects(ctx: Ctx) {
  const ids = selectedIds(ctx); if (!ids.length) return;
  const locked = ctx.store.doc.objects.filter(o => ids.includes(o.id) && o.locked).length;
  const del = ids.filter(id => !ctx.store.doc.objects.find(o => o.id === id)?.locked);
  if (!del.length) { toast('Objet verrouillé : déverrouille-le d’abord.', undefined, 'warning'); return; }
  ctx.store.update(d => { d.objects = d.objects.filter(o => !del.includes(o.id)); });
  ctx.ui.set({ sel: null });
  toast(del.length > 1 ? `${del.length} objets supprimés` : 'Objet supprimé', { label: 'Annuler', run: () => ctx.store.undo() });
  if (locked) toast(`${locked} objet(s) verrouillé(s) conservé(s).`);
}

let clipboard: PlacedObject[] = [];
export function copyObjects(ctx: Ctx) {
  const objs = selectedObjects(ctx); if (!objs.length) return;
  clipboard = structuredClone(objs);
  toast(objs.length > 1 ? `${objs.length} objets copiés` : 'Objet copié');
}
export function pasteObjects(ctx: Ctx, from: PlacedObject[] = clipboard, offset = 0.3) {
  if (!from.length) return;
  const copies = from.map(o => ({ ...structuredClone(o), id: uid(), x: o.x + offset, y: o.y + offset, locked: false }));
  ctx.store.update(d => { d.objects.push(...copies); });
  selectObjects(ctx, copies.map(c => c.id));
  if (from === clipboard) clipboard = copies; // collages successifs en escalier
}
export const duplicateObjects = (ctx: Ctx) => pasteObjects(ctx, selectedObjects(ctx));

/** Modifie les objets sélectionnés non verrouillés. */
export function editObjects(ctx: Ctx, fn: (o: PlacedObject) => void, includeLocked = false) {
  const ids = selectedIds(ctx);
  const target = ctx.store.doc.objects.filter(o => ids.includes(o.id));
  if (!includeLocked && target.length && target.every(o => o.locked)) { toast('Objet verrouillé : déverrouille-le d’abord.', undefined, 'warning'); return; }
  ctx.store.update(d => { for (const o of d.objects) if (ids.includes(o.id) && (includeLocked || !o.locked)) fn(o); });
}

export const rotateObjects = (ctx: Ctx, delta: number) => editObjects(ctx, o => { o.rot = normRot(Math.round((o.rot + delta) / 15) * 15); });
export const nudgeObjects = (ctx: Ctx, dx: number, dy: number) => editObjects(ctx, o => { o.x = Math.round((o.x + dx) * 1000) / 1000; o.y = Math.round((o.y + dy) * 1000) / 1000; });
export function alignObjects(ctx: Ctx) {
  editObjects(ctx, o => {
    o.rot = normRot(Math.round(o.rot / 15) * 15);
    if (!(getItem(o.model)?.mural && snapToWall(ctx.store.doc, o))) { o.x = snapTo(o.x, 0.1); o.y = snapTo(o.y, 0.1); }
  });
  toast('Aligné sur la grille.');
}
export function toggleLock(ctx: Ctx) {
  const objs = selectedObjects(ctx); if (!objs.length) return;
  const lock = !objs.every(o => o.locked);
  editObjects(ctx, o => { o.locked = lock; }, true);
  toast(lock ? 'Verrouillé : il ne bougera plus.' : 'Déverrouillé.');
}
