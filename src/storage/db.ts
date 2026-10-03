/* Base IndexedDB de l'outil (sur ce poste uniquement) :
   - backups   : copies de secours des projets
   - creations : meubles créés dans l'atelier, réutilisables dans les autres projets du poste
   - settings  : réglages du poste (dossier « Mobilier » du professeur) */

const NAME = 'concept-store-3d', VERSION = 3;
export type StoreName = 'backups' | 'creations' | 'settings';
let dbp: Promise<IDBDatabase | null> | null = null;

export function db(): Promise<IDBDatabase | null> {
  if (!dbp) dbp = new Promise(resolve => {
    try {
      const r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = () => {
        for (const s of ['backups', 'creations', 'settings']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

/** Exécute une requête ; renvoie undefined si la base est indisponible ou en cas d'erreur. */
export async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const d = await db(); if (!d) return undefined;
  return new Promise(resolve => {
    try {
      const req = fn(d.transaction(store, mode).objectStore(store));
      req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}
