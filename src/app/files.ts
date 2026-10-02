import type { Ctx } from './state';
import type { Project } from '../model/types';
import { sanitizeProject } from '../model/project';
import { uid } from '../model/geometry';
import { toast } from '../ui/components';
import { putBackup } from '../storage/backup';

/* Enregistrer / ouvrir un projet (fichier .json unique).
   - Chrome / Edge : l'élève choisit le dossier de son équipe (showSaveFilePicker / showOpenFilePicker).
   - Ailleurs : le projet est téléchargé, et ouvert avec un sélecteur de fichier classique.
   Règle : un fichier modèle (isTemplate) n'est jamais écrasé. Un projet ouvert depuis un modèle
   est toujours enregistré sous un nouveau nom. */

export interface FileState {
  handle: FileSystemFileHandle | null;
  fileName: string | null;
  /** Date du dernier enregistrement (ms), 0 si jamais enregistré. */
  savedAt: number;
  /** Projet ouvert depuis un modèle : « Enregistrer » devient « Enregistrer sous ». */
  fromTemplate: boolean;
}
export const emptyFileState = (): FileState => ({ handle: null, fileName: null, savedAt: 0, fromTemplate: false });

type PickerWindow = Window & {
  showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]>;
};
const W = window as PickerWindow;
const TYPES = [{ description: 'Projet Concept Store 3D', accept: { 'application/json': ['.json'] } }];
export const hasPickers = () => typeof W.showSaveFilePicker === 'function' && typeof W.showOpenFilePicker === 'function';

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
export function suggestedName(p: Project, kind: 'projet' | 'modele') {
  const base = slug(p.name || 'boutique') || 'boutique';
  if (kind === 'modele') return `modele-${base}.json`;
  const team = slug(p.team.name);
  return `${base}${team ? '-' + team : ''}.json`;
}

function serialize(p: Project, template: boolean) {
  const out: Project & { savedAt: string; app: string } = { ...structuredClone(p), isTemplate: template, savedAt: new Date().toISOString(), app: 'Concept Store 3D ' + __APP_VERSION__ };
  if (!template) delete out.isTemplate;
  return JSON.stringify(out);
}

/** Vrai si le fichier visé est un modèle (ou le fichier d'où vient le projet ouvert comme modèle). */
async function isTemplateFile(h: FileSystemFileHandle) {
  try {
    const f = await h.getFile();
    if (!f.size) return false;
    const j = JSON.parse(await f.text());
    return j?.format === 'concept-store-3d' && j.isTemplate === true;
  } catch { return false; }
}

async function writeHandle(h: FileSystemFileHandle, text: string) {
  const w = await (h as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
  await w.write(text); await w.close();
}
function downloadText(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/**
 * Enregistre le projet. `save` réécrit le fichier déjà choisi (sauf modèle) ; `saveAs` propose un nouveau
 * nom ; `template` (professeur) enregistre un projet modèle. Renvoie vrai si l'enregistrement a eu lieu.
 */
export async function saveProject(ctx: Ctx, mode: 'save' | 'saveAs' | 'template'): Promise<boolean> {
  const { store, ui, file } = ctx;
  const doc = store.doc;
  if (mode === 'save' && (!file.handle || file.fromTemplate)) mode = 'saveAs';
  const template = mode === 'template';
  const text = serialize(doc, template);
  const prevStatus = ui.s.saveStatus;
  try {
    let handle = mode === 'save' ? file.handle : null;
    let fileName = file.fileName;
    if (!handle) {
      const name = suggestedName(doc, template ? 'modele' : 'projet');
      if (!hasPickers()) {
        downloadText(name, text);
        fileName = name;
        if (!template) finish(ctx, null, fileName);
        toast(`Projet téléchargé : « ${name} ». Range-le dans le dossier de ton équipe.`);
        return true;
      }
      handle = await W.showSaveFilePicker!({ suggestedName: name, types: TYPES });
      if (await isTemplateFile(handle)) {
        toast('C’est un fichier modèle : choisis un autre nom pour ne pas l’écraser.', undefined, 'warning');
        return false;
      }
      fileName = handle.name;
    }
    ui.set({ saveStatus: 'saving' });
    await writeHandle(handle, text);
    if (template) { ui.set({ saveStatus: prevStatus }); toast(`Modèle enregistré : « ${handle.name} ». Les élèves l’ouvrent avec « Projet modèle ».`); return true; }
    finish(ctx, handle, fileName);
    toast(`Enregistré dans « ${fileName} »`);
    return true;
  } catch (e) {
    ui.set({ saveStatus: prevStatus });
    if ((e as DOMException).name === 'AbortError') return false;
    toast('Enregistrement impossible : ' + ((e as Error).message || 'erreur inconnue') + '. Essaie un autre dossier.', undefined, 'warning');
    return false;
  }
}

function finish(ctx: Ctx, handle: FileSystemFileHandle | null, fileName: string | null) {
  Object.assign(ctx.file, { handle, fileName, savedAt: Date.now(), fromTemplate: false });
  ctx.store.markSaved();
  ctx.ui.set({ saveStatus: 'saved' });
  const d = ctx.store.doc;
  void putBackup({ id: d.id, name: d.name, team: d.team.name, updated: Date.now(), saved: ctx.file.savedAt, dirty: false, doc: structuredClone(d), handle: handle ?? undefined, fileName: fileName ?? undefined });
}

export interface OpenedFile { doc: Project; handle: FileSystemFileHandle | null; fileName: string; template: boolean; savedAt: number }

/** Lit et vérifie un fichier projet. Un modèle reçoit un nouvel identifiant (il ne sera jamais réécrit). */
export async function readProjectFile(f: File, handle: FileSystemFileHandle | null): Promise<OpenedFile> {
  let raw: unknown;
  try { raw = JSON.parse(await f.text()); } catch { throw new Error('Ce fichier n’est pas un projet Concept Store 3D (format illisible).'); }
  const template = (raw as { isTemplate?: boolean })?.isTemplate === true;
  const savedAt = Date.parse((raw as { savedAt?: string })?.savedAt ?? '') || f.lastModified || 0;
  const doc = sanitizeProject(raw);
  if (template) { doc.id = uid(); delete doc.isTemplate; }
  return { doc, handle: template ? null : handle, fileName: f.name, template, savedAt };
}

/** Choisir un fichier projet (sélecteur Chrome / Edge, ou sélecteur classique). */
export async function pickProjectFile(): Promise<OpenedFile | null> {
  try {
    if (typeof W.showOpenFilePicker === 'function') {
      const [h] = await W.showOpenFilePicker({ types: TYPES, multiple: false });
      return await readProjectFile(await h.getFile(), h);
    }
    const f = await new Promise<File | null>(resolve => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json,application/json'; input.style.display = 'none';
      input.addEventListener('change', () => { resolve(input.files?.[0] ?? null); input.remove(); });
      input.addEventListener('cancel', () => { resolve(null); input.remove(); });
      document.body.appendChild(input); input.click();
    });
    return f ? await readProjectFile(f, null) : null;
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null;
    toast((e as Error).message, undefined, 'warning');
    return null;
  }
}

/** Relit un fichier récent à partir de sa poignée (demande l'autorisation au besoin). */
export async function reopenHandle(h: FileSystemFileHandle): Promise<OpenedFile | null> {
  type Perm = FileSystemFileHandle & { queryPermission?(o: object): Promise<string>; requestPermission?(o: object): Promise<string> };
  const p = h as Perm;
  try {
    let st = (await p.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (st !== 'granted') st = (await p.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
    if (st !== 'granted') return null;
    return await readProjectFile(await h.getFile(), h);
  } catch { return null; }
}

declare const __APP_VERSION__: string;
