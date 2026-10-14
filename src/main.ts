import './ui/base.css';
import './app/app.css';
import { Store } from './model/store';
import { newProject, sampleProject } from './model/project';
import type { Project } from './model/types';
import { UIStore, bindSnapSteps, defaultUI, type Ctx } from './app/state';
import { closeHelp, closeOffer, initGuide, offerTour, startTour } from './app/guide/guide';
import { rooms } from './model/rooms';
import { closeStepsPanel, openStepsPanel, showStepsAtStart } from './app/guide/steps';
import { Editor } from './app/editor';
import { homeScreen } from './app/home';
import { exportScreen } from './app/exportScreen';
import { choose, toast } from './ui/components';
import { canWrite, emptyFileState, hasPickers, pickProjectFile, reopenHandle, saveProject, type OpenedFile } from './app/files';
import { newProjectDialog } from './app/newProject';
import { deleteBackup, putBackup, type Backup } from './storage/backup';
import { atelierScreen } from './app/atelier';
import { findCreation, refreshCreations } from './app/creations';
import { loadProfScript, restoreProfFolder } from './library/profFolder';

/* Point d'entrée : accueil puis éditeur. Un seul fichier HTML, aucun accès réseau. */

const app = document.getElementById('app')!;
const store = new Store(newProject());
const ui = new UIStore(defaultUI());
bindSnapSteps(ui);
let editor: Editor | null = null;
let inEditor = false;

const ctx: Ctx = {
  store, ui, file: emptyFileState(),
  home: () => void leaveToHome(),
  exportPlan: () => { leaveScreen(); app.replaceChildren(exportScreen(ctx, backToEditor)); },
  showImage: id => { if (editor) requestAnimationFrame(() => editor!.view3d.lookAtImage(id)); },
  openAtelier: id => {
    leaveScreen();
    const creation = id ? findCreation(ctx, id) : undefined;
    app.replaceChildren(atelierScreen(ctx, {
      creation, back: backToEditor,
      done: () => { backToEditor(); ui.set({ tool: 'mobilier', sel: null, libraryTab: 'moi', libraryOpen: false }); ui.set({ libraryOpen: true }); },
    }));
  },
};
initGuide(ctx);
/** Changement d'écran : la carte de visite et le panneau d'aide de l'écran précédent se ferment. */
function leaveScreen() { closeOffer(); closeHelp(); closeStepsPanel(false); }
function backToEditor() { leaveScreen(); if (editor) app.replaceChildren(editor.el); }

function showHome() {
  inEditor = false;
  leaveScreen();
  app.replaceChildren(homeScreen({
    newProject: () => void createProject(),
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
  void refreshCreations(ctx, true);
  // Les pas d'aimantation choisis par l'élève sont gardés d'un projet à l'autre.
  const tool = p.floor ? 'murs' : 'sol', { stepSol, stepOther } = ui.s;
  ui.set({ ...defaultUI(), view: o.view, tool, stepSol, stepOther, step: tool === 'sol' ? stepSol : stepOther, saveStatus: ctx.file.savedAt ? 'saved' : 'new' });
  if (!editor) editor = new Editor(ctx);
  leaveScreen();
  app.replaceChildren(editor.el);
  inEditor = true;
  offerTour(tool);
  if (o.view === '3d') requestAnimationFrame(() => editor!.view3d.frame());
  else requestAnimationFrame(() => editor!.plan.fit());
}

/** Nouveau projet : l'équipe se présente, choisit son dossier, et le projet y est enregistré (puis automatiquement). */
async function createProject() {
  const info = await newProjectDialog();
  if (!info) return;
  const p = newProject(info.name || undefined);
  p.team = info.team;
  start(p, { view: '2d' });
  if (hasPickers() && !(await saveProject(ctx, 'saveAs')))
    toast('Pas de dossier choisi : enregistre ton projet avec Ctrl+S, dans le dossier de ton équipe.', undefined, 'warning');
  showStepsAtStart(ctx);
}

function openFile(f: OpenedFile) {
  start(f.doc, { view: f.doc.floor ? '3d' : '2d', file: f.template ? { fromTemplate: true } : { handle: f.handle, fileName: f.fileName, savedAt: f.savedAt || Date.now() } });
  if (f.template) toast('Projet modèle ouvert : à la première sauvegarde, choisis un nouveau nom dans le dossier de ton équipe.');
  else void checkAutoSave();
}
/** Fichier rouvert : l'enregistrement automatique marche si le navigateur permet déjà d'y écrire (sinon, après un premier Ctrl+S). */
async function checkAutoSave() {
  const h = ctx.file.handle;
  ctx.file.auto = !!h && !ctx.file.fromTemplate && (await canWrite(h));
  ui.set({});
  if (store.dirty) scheduleAutoSave();
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
  void checkAutoSave();
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
store.subscribe(r => { if (r !== 'load') { clearTimeout(backupTimer); backupTimer = window.setTimeout(() => void backupNow(), 1500); scheduleAutoSave(); } });

/* ---------- Enregistrement automatique dans le fichier de l'équipe ----------
   10 s après la dernière modification (au plus 1 min après la première), et quand on quitte la fenêtre. */
const AUTO_DELAY = 10_000, AUTO_MAX = 60_000;
let autoTimer = 0, autoFirst = 0;
function scheduleAutoSave() {
  if (!inEditor || !ctx.file.auto) return;
  const now = Date.now();
  if (!autoFirst) autoFirst = now;
  clearTimeout(autoTimer);
  autoTimer = window.setTimeout(() => void autoSaveNow(), Math.max(0, Math.min(AUTO_DELAY, autoFirst + AUTO_MAX - now)));
}
async function autoSaveNow() {
  clearTimeout(autoTimer); autoFirst = 0;
  if (!inEditor || !store.dirty || ui.s.saveStatus === 'saving') return;
  await saveProject(ctx, 'auto');
  if (store.dirty) scheduleAutoSave(); // modifié pendant l'écriture
}
// « Mes créations » suit le projet (ajout, modification, annuler…)
let creationsKey = '';
store.subscribe(() => { const k = store.doc.creations.map(c => c.id + ':' + c.updated).join(); if (k !== creationsKey) { creationsKey = k; void refreshCreations(ctx); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { void backupNow(); void autoSaveNow(); } });
window.addEventListener('beforeunload', e => {
  if (inEditor && store.dirty > 0) { void backupNow(); e.preventDefault(); e.returnValue = ''; }
});

// Accès pour les tests automatisés et le débogage.
(window as unknown as { cs3d: unknown }).cs3d = {
  store, ui, ctx, get editor() { return editor; }, backupNow, autoSaveNow, startTour, rooms: () => rooms(store.doc).map(r => ({ area: Math.round(r.area * 100) / 100, holes: r.holes.length })), openStepsPanel: () => openStepsPanel(ctx),
  start: (which: 'new' | 'sample') => start(which === 'new' ? newProject() : sampleProject(), { view: which === 'new' ? '2d' : '3d' }),
};

(async () => {
  try { await Promise.all([600, 700, 800].map(w => document.fonts.load(`${w} 16px Nunito`))); } catch { /* police de secours */ }
  showHome();
  // Ajouts du professeur : fichier « Mobilier/mobilier-prof.js » s'il existe, sinon dossier mémorisé (Chrome / Edge).
  if (!(await loadProfScript())) void restoreProfFolder(false);
})();
