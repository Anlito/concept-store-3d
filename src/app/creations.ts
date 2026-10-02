import type { Ctx } from './state';
import type { Creation } from '../model/types';
import { setCreations, getItem } from '../library/library';
import { totalSize } from '../library/volumes3d';
import { deleteLocalCreation, listLocalCreations, putLocalCreation } from '../storage/creations';
import { choose, toast } from '../ui/components';
import { pickProjectFile } from './files';

/* « Mes créations » : les meubles de l'atelier sont enregistrés dans le projet (le fichier .json les
   contient) et gardés aussi sur ce poste pour être réutilisés dans les autres projets. */

let local: Creation[] = [];
const listeners = new Set<() => void>();
export const onCreationsChanged = (f: () => void) => { listeners.add(f); return () => listeners.delete(f); };

/** Recalcule la liste des créations (projet ouvert + poste) dans la bibliothèque. */
export async function refreshCreations(ctx: Ctx, reloadLocal = false) {
  if (reloadLocal || !local.length) local = await listLocalCreations();
  setCreations(ctx.store.doc.creations, local);
  listeners.forEach(f => f());
}

/** Enregistre une création (nouvelle ou modifiée) dans le projet et sur ce poste. */
export async function saveCreation(ctx: Ctx, c: Creation) {
  const size = totalSize(c.volumes);
  const saved: Creation = { ...structuredClone(c), updated: Date.now() };
  ctx.store.update(d => {
    const i = d.creations.findIndex(x => x.id === c.id);
    if (i >= 0) d.creations[i] = saved; else d.creations.push(saved);
    // Les objets déjà posés reprennent les nouvelles dimensions du meuble
    for (const o of d.objects) if (o.model === c.id) o.size = { w: round(size.w), d: round(size.d), h: round(size.h) };
  });
  await putLocalCreation(saved);
  await refreshCreations(ctx, true);
}
const round = (x: number) => Math.max(0.01, Math.round(x * 1000) / 1000);

/** Retourne la création (projet ou poste) pour l'atelier. */
export function findCreation(ctx: Ctx, id: string): Creation | undefined {
  return ctx.store.doc.creations.find(c => c.id === id) ?? local.find(c => c.id === id);
}

export async function deleteCreation(ctx: Ctx, id: string) {
  const it = getItem(id); if (!it) return;
  const used = ctx.store.doc.objects.filter(o => o.model === id).length;
  const c = await choose(`Supprimer « ${it.name} » ?`, used
    ? `Ce meuble est posé ${used} fois dans la boutique : ces objets seront retirés aussi.`
    : 'Il disparaîtra de « Mes créations » sur ce poste et dans ce projet.', [
    { label: 'Annuler', value: 'non', cls: 'btn-ghost' },
    { label: 'Supprimer', value: 'oui', cls: 'btn-danger', icon: 'delete' },
  ]);
  if (c !== 'oui') return;
  ctx.store.update(d => { d.creations = d.creations.filter(x => x.id !== id); d.objects = d.objects.filter(o => o.model !== id); });
  await deleteLocalCreation(id);
  await refreshCreations(ctx, true);
  toast(`« ${it.name} » supprimé.`, { label: 'Annuler', run: () => { ctx.store.undo(); void refreshCreations(ctx); } });
}

/** Importe les créations d'un autre projet de l'équipe (fichier .json). */
export async function importCreations(ctx: Ctx) {
  const f = await pickProjectFile(); if (!f) return;
  const fresh = f.doc.creations.filter(c => !ctx.store.doc.creations.some(x => x.id === c.id));
  if (!f.doc.creations.length) { toast('Ce projet ne contient aucune création.', undefined, 'warning'); return; }
  if (!fresh.length) { toast('Ces créations sont déjà dans ton projet.'); return; }
  ctx.store.update(d => { d.creations.push(...structuredClone(fresh)); });
  for (const c of fresh) await putLocalCreation(c);
  await refreshCreations(ctx, true);
  toast(`${fresh.length} création${fresh.length > 1 ? 's' : ''} importée${fresh.length > 1 ? 's' : ''} depuis « ${f.fileName} ».`);
}
