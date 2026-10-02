import './ui/base.css';
import './app/app.css';
import { Store } from './model/store';
import { newProject, sampleProject } from './model/project';
import type { Project } from './model/types';
import { UIStore, defaultUI, type Ctx } from './app/state';
import { Editor } from './app/editor';
import { homeScreen } from './app/home';
import { exportScreen } from './app/exportScreen';
import { choose, toast } from './ui/components';
import { emptyFileState, pickProjectFile, reopenHandle, saveProject, type OpenedFile } from './app/files';
import { deleteBackup, putBackup, type Backup } from './storage/backup';

/* Point d'entrée : accueil puis éditeur. Un seul fichier HTML, aucun accès réseau. */

const app = document.getElementById('app')!;
const store = new Store(newProject());
const ui = new UIStore(defaultUI());
let editor: Editor | null = null;
let inEditor = false;

const ctx: Ctx = {
  store, ui, file: emptyFileState(),
  home: () => void leaveToHome(),
  exportPlan: () => app.replaceChildren(exportScreen(ctx, () => { if (editor) app.replaceChildren(editor.el); })),
};

function showHome() {
  inEditor = false;
  app.replaceChildren(homeScreen({
    newProject: () => start(newProject(), { view: '2d' }),
    openProject: async () => { const f = await pickProjectFile(); if (f) openFile(f); },
    template: () => void chooseTemplate(),
    openRecent: b => void openRecent(b),
    forgetRecent: async b => { await deleteBackup(b.id); showHome(); },
  }));
}

interface StartOpts { view: '2d' | '3d'; dirty?: number; file?: Partial<typeof ctx.file> }
function start(p: Project, o: StartOpts) {
  Object.assign(ctx.file, emptyFileState(), o.file ?? {});
  store.load(p, o.dirty ?? 0);
  ui.set({ ...defaultUI(), view: o.view, tool: p.floor ? 'murs' : 'sol', saveStatus: ctx.file.savedAt ? 'saved' : 'new' });
  if (!editor) editor = new Editor(ctx);
  app.replaceChildren(editor.el);
  inEditor = true;
  if (o.view === '3d') requestAnimationFrame(() => editor!.view3d.frame());
  else requestAnimationFrame(() => editor!.plan.fit());
}

function openFile(f: OpenedFile) {
  start(f.doc, { view: f.doc.floor ? '3d' : '2d', file: f.template ? { fromTemplate: true } : { handle: f.handle, fileName: f.fileName, savedAt: f.savedAt || Date.now() } });
  if (f.template) toast('Projet modèle ouvert : à la première sauvegarde, choisis un nouveau nom dans le dossier de ton équipe.');
}

async function chooseTemplate() {
  const c = await choose('Projet modèle', 'Pars de la boutique exemple de l’outil, ou ouvre le modèle préparé par ton professeur (fichier « modele-….json »).', [
    { label: 'Boutique exemple', value: 'exemple', icon: 'storefront' },
    { label: 'Modèle du professeur', value: 'prof', icon: 'folder_open', cls: 'btn-primary' },
  ]);
  if (c === 'exemple') start(sampleProject(), { view: '3d', file: { fromTemplate: true } });
  if (c === 'prof') {
    const f = await pickProjectFile();
    if (!f) return;
    if (!f.template) toast('Ce fichier n’est pas un modèle : il s’ouvre comme un projet normal.');
    openFile(f);
  }
}

/** Projet récent : on relit le fichier si possible ; la copie de secours, si elle est plus récente, l'emporte. */
async function openRecent(b: Backup) {
  let f: OpenedFile | null = null;
  if (b.handle) f = await reopenHandle(b.handle);
  if (f && !(b.dirty && b.updated > b.saved)) { openFile(f); return; }
  start(structuredClone(b.doc), {
    view: b.doc.floor ? '3d' : '2d', dirty: b.dirty ? 1 : 0,
    file: { handle: f?.handle ?? b.handle ?? null, fileName: b.fileName ?? null, savedAt: b.saved },
  });
  if (b.dirty) toast(b.saved ? 'Copie de secours reprise : elle contient des modifications plus récentes que le fichier. Pense à enregistrer.' : 'Copie de secours reprise. Pense à enregistrer ton projet.');
}

/** Retour à l'accueil : on propose d'enregistrer si besoin (la copie de secours reste de toute façon). */
async function leaveToHome() {
  if (store.dirty > 0) {
    const c = await choose('Ton projet n’est pas enregistré', 'Une copie de secours est gardée sur ce poste, mais seul un fichier dans le dossier de ton équipe est en sécurité.', [
      { label: 'Annuler', value: 'cancel', cls: 'btn-ghost' },
      { label: 'Quitter sans enregistrer', value: 'quit', cls: 'btn-danger' },
      { label: 'Enregistrer', value: 'save', cls: 'btn-primary', icon: 'save' },
    ]);
    if (c === null || c === 'cancel') return;
    if (c === 'save' && !(await saveProject(ctx, 'save'))) return;
  }
  await backupNow();
  showHome();
}

/* ---------- Copie de secours automatique ---------- */
let backupTimer = 0;
async function backupNow() {
  clearTimeout(backupTimer);
  if (!inEditor) return;
  const d = store.doc;
  if (!d.floor && !store.dirty) return; // projet vide jamais modifié : rien à garder
  await putBackup({
    id: d.id, name: d.name, team: d.team.name, updated: Date.now(), saved: ctx.file.savedAt, dirty: store.dirty > 0,
    doc: structuredClone(d), handle: ctx.file.handle ?? undefined, fileName: ctx.file.fileName ?? undefined,
  });
}
store.subscribe(r => { if (r !== 'load') { clearTimeout(backupTimer); backupTimer = window.setTimeout(() => void backupNow(), 1500); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) void backupNow(); });
window.addEventListener('beforeunload', e => {
  if (inEditor && store.dirty > 0) { void backupNow(); e.preventDefault(); e.returnValue = ''; }
});

// Accès pour les tests automatisés et le débogage.
(window as unknown as { cs3d: unknown }).cs3d = {
  store, ui, ctx, get editor() { return editor; }, backupNow,
  start: (which: 'new' | 'sample') => start(which === 'new' ? newProject() : sampleProject(), { view: which === 'new' ? '2d' : '3d' }),
};

(async () => {
  try { await Promise.all([600, 700, 800].map(w => document.fonts.load(`${w} 16px Nunito`))); } catch { /* police de secours */ }
  showHome();
})();
