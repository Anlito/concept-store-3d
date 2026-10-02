import type { Creation } from '../model/types';
import { tx } from './db';

/* Créations de l'atelier gardées sur ce poste : elles réapparaissent dans « Mes créations »
   des autres projets ouverts sur le même ordinateur. */

export async function listLocalCreations(): Promise<Creation[]> {
  return ((await tx<Creation[]>('creations', 'readonly', s => s.getAll() as IDBRequest<Creation[]>)) ?? []).sort((a, b) => b.updated - a.updated);
}
export async function putLocalCreation(c: Creation) { await tx('creations', 'readwrite', s => s.put(structuredClone(c))); }
export async function deleteLocalCreation(id: string) { await tx('creations', 'readwrite', s => s.delete(id)); }
