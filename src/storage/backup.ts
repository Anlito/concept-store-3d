import type { Project } from '../model/types';

/* Copies de secours dans le navigateur (IndexedDB), une par projet, et « poignées » des fichiers
   enregistrés (Chrome / Edge) pour rouvrir un projet récent. Tout reste sur ce poste.
   Si IndexedDB est indisponible, on se replie sur localStorage (sans poignées de fichiers). */

export interface Backup {
  id: string;
  name: string;
  team: string;
  /** Dernière modification (ms). */
  updated: number;
  /** Date du dernier enregistrement dans un fichier (ms), ou 0. */
  saved: number;
  /** Il reste des modifications non enregistrées dans un fichier. */
  dirty: boolean;
  doc: Project;
  handle?: FileSystemFileHandle;
  fileName?: string;
}

const DB = 'concept-store-3d', STORE = 'backups', MAX = 12;
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (!dbp) dbp = new Promise(resolve => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> => {
  const d = await db(); if (!d) return undefined;
  return new Promise(resolve => {
    try {
      const req = fn(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
};

const LS = 'cs3d-backups';
function lsAll(): Backup[] { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } }
function lsSave(list: Backup[]) { try { localStorage.setItem(LS, JSON.stringify(list.map(b => ({ ...b, handle: undefined })))); } catch { /* plein ou bloqué */ } }

export async function listBackups(): Promise<Backup[]> {
  const all = (await tx<Backup[]>('readonly', s => s.getAll() as IDBRequest<Backup[]>)) ?? lsAll();
  return all.sort((a, b) => b.updated - a.updated);
}
export async function getBackup(id: string): Promise<Backup | undefined> {
  return (await db()) ? tx<Backup>('readonly', s => s.get(id)) : lsAll().find(b => b.id === id);
}
export async function putBackup(b: Backup) {
  if (await db()) {
    // Une poignée de fichier ne peut pas toujours être clonée : on réessaie sans elle.
    const ok = await tx('readwrite', s => s.put(b));
    if (ok === undefined && b.handle) await tx('readwrite', s => s.put({ ...b, handle: undefined }));
    const all = await listBackups();
    for (const old of all.slice(MAX)) await tx('readwrite', s => s.delete(old.id));
  } else {
    lsSave([b, ...lsAll().filter(x => x.id !== b.id)].slice(0, MAX));
  }
}
export async function deleteBackup(id: string) {
  if (await db()) await tx('readwrite', s => s.delete(id));
  else lsSave(lsAll().filter(x => x.id !== id));
}
