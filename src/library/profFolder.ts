import { setProfItems, type Category, type LibItem } from './library';
import { tx } from '../storage/db';

/* Niveau C : modèles .glb ajoutés par l'enseignant dans le dossier « Mobilier », à côté de l'outil.
   Deux façons de les lire :
   1. Chrome / Edge : bouton « Charger le dossier du professeur » (le navigateur lit le dossier choisi).
   2. Partout, automatiquement au démarrage : le script « Mettre-a-jour-le-mobilier.bat » du dossier
      génère « mobilier-prof.js », que l'outil charge (un .js voisin reste lisible en double-clic, pas un .json).
   Les sous-dossiers donnent la catégorie (Assises, Rangements, Plantes…). Un nom finissant par « _170cm »
   fixe la hauteur réelle. Sinon, l'échelle est devinée (fichier fait en cm ou en mm). */

export const PROF_DIR = 'Mobilier';
export const PROF_SCRIPT = 'mobilier-prof.js';
/** Poids au-delà duquel un modèle est signalé comme lourd, et au-delà duquel il est ignoré. */
export const HEAVY_MB = 5, MAX_MB = 25;

export interface ProfFile { path: string; bytes: number; data: ArrayBuffer }
export interface ProfLoad { source: 'dossier' | 'script'; count: number; skipped: string[]; folder?: string }

let last: ProfLoad | null = null;
const listeners = new Set<(l: ProfLoad | null) => void>();
export const profStatus = () => last;
export const onProfChanged = (f: (l: ProfLoad | null) => void) => { listeners.add(f); return () => listeners.delete(f); };

const CAT_WORDS: [Category, RegExp][] = [
  ['assises', /assise|chaise|fauteuil|tabouret|banc|canap/i], ['rangements', /rangement|etagere|étagère|meuble|armoire/i],
  ['comptoirs', /comptoir|caisse|bureau/i], ['tables', /table/i], ['portants', /portant|mannequin|vetement|vêtement/i],
  ['plantes', /plante|cactus|fleur/i], ['luminaires', /lumin|lampe|suspension|applique/i], ['decor', /deco|décor|signal/i],
];
const catOf = (path: string): Category => {
  const folder = path.includes('/') ? path.split('/')[0] : '';
  for (const [c, re] of CAT_WORDS) if (folder && re.test(folder)) return c;
  return 'decor';
};
function nameOf(path: string) {
  const base = path.split('/').pop()!.replace(/\.glb$/i, '').replace(/[_\- ]\d{1,4}\s?cm$/i, '').replace(/[_\-]+/g, ' ').trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}
const heightOf = (path: string) => { const m = path.replace(/\.glb$/i, '').match(/[_\- ](\d{1,4})\s?cm$/i); return m ? +m[1] / 100 : undefined; };

/* Corrections faites sur ce poste (hauteur réelle, modèle couché) */
export interface Correction { h?: number; upright?: boolean }
const CORR = 'cs3d-prof-corrections';
export function corrections(): Record<string, Correction> { try { return JSON.parse(localStorage.getItem(CORR) || '{}'); } catch { return {}; } }
export function setCorrection(path: string, c: Correction) {
  const all = corrections(); all[path] = c;
  try { localStorage.setItem(CORR, JSON.stringify(all)); } catch { /* stockage bloqué */ }
  if (files.length) publish(files, last?.source ?? 'dossier', last?.folder);
}

let files: ProfFile[] = [];
function publish(list: ProfFile[], source: ProfLoad['source'], folder?: string) {
  files = list;
  const corr = corrections(), skipped: string[] = [];
  const items: LibItem[] = [];
  for (const f of list) {
    if (f.bytes > MAX_MB * 1024 * 1024) { skipped.push(`${f.path} (${(f.bytes / 1024 / 1024).toFixed(0)} Mo)`); continue; }
    const c = corr[f.path] ?? {};
    const h = c.h ?? heightOf(f.path);
    items.push({ id: 'prof:' + f.path, name: nameOf(f.path), cat: catOf(f.path), source: 'prof', pack: 'prof', glbBuffer: f.data,
      profPath: f.path, bytes: f.bytes, upright: !!c.upright, autoScale: true, target: h ? { h } : undefined });
  }
  setProfItems(items);
  last = { source, count: items.length, skipped, folder };
  listeners.forEach(fn => fn(last));
}

/* ---------- 1. Dossier choisi dans Chrome / Edge ---------- */
type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
  queryPermission?(o: object): Promise<string>; requestPermission?(o: object): Promise<string>;
};
async function readDir(dir: DirHandle, prefix = '', depth = 0): Promise<ProfFile[]> {
  const out: ProfFile[] = [];
  for await (const e of dir.values()) {
    if (e.kind === 'file' && /\.glb$/i.test(e.name)) {
      const f = await (e as FileSystemFileHandle).getFile();
      out.push({ path: prefix + e.name, bytes: f.size, data: await f.arrayBuffer() });
    } else if (e.kind === 'directory' && depth < 1) out.push(...await readDir(e as DirHandle, prefix + e.name + '/', depth + 1));
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, 'fr'));
}
export const canPickFolder = () => typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

/** Bouton « Charger le dossier du professeur ». Le dossier est mémorisé sur ce poste. */
export async function pickProfFolder(): Promise<ProfLoad | null> {
  const w = window as Window & { showDirectoryPicker?: (o: object) => Promise<DirHandle> };
  if (!w.showDirectoryPicker) return null;
  let dir: DirHandle;
  try { dir = await w.showDirectoryPicker({ id: 'mobilier-prof', mode: 'read' }); } catch { return null; }
  publish(await readDir(dir), 'dossier', dir.name);
  await tx('settings', 'readwrite', s => s.put({ id: 'profDir', handle: dir })).catch(() => undefined);
  return last;
}

/** Au démarrage : relit le dossier mémorisé si le navigateur l'autorise encore sans demander. */
export async function restoreProfFolder(ask = false): Promise<boolean> {
  const rec = await tx<{ id: string; handle: DirHandle }>('settings', 'readonly', s => s.get('profDir'));
  const dir = rec?.handle; if (!dir) return false;
  try {
    let st = (await dir.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (st !== 'granted' && ask) st = (await dir.requestPermission?.({ mode: 'read' })) ?? 'denied';
    if (st !== 'granted') return false;
    publish(await readDir(dir), 'dossier', dir.name);
    return true;
  } catch { return false; }
}
export async function hasRememberedFolder() { return !!(await tx<{ id: string }>('settings', 'readonly', s => s.get('profDir'))); }

/* ---------- 2. Script généré « mobilier-prof.js » (fonctionne aussi en double-clic) ---------- */
interface ScriptEntry { path: string; size: number; data: string }
/** Charge « Mobilier/mobilier-prof.js » s'il existe (balise <script>, permise en file://). */
export function loadProfScript(): Promise<boolean> {
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.src = `./${PROF_DIR}/${PROF_SCRIPT}?t=${Date.now()}`;
    s.onload = () => {
      const list = (window as Window & { CS3D_MOBILIER?: ScriptEntry[] }).CS3D_MOBILIER;
      if (Array.isArray(list) && list.length && (!last || last.source === 'script')) {
        publish(list.map(e => ({ path: e.path, bytes: e.size, data: b64ToBuffer(e.data) })), 'script');
        resolve(true);
      } else resolve(false);
      s.remove();
    };
    s.onerror = () => { s.remove(); resolve(false); };
    document.head.appendChild(s);
  });
}
function b64ToBuffer(b64: string) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}
