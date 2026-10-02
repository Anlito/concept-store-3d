import './ui/base.css';
import './app/app.css';
import { Store } from './model/store';
import { newProject, sampleProject } from './model/project';
import { UIStore, defaultUI, type Ctx } from './app/state';
import { Editor } from './app/editor';
import { homeScreen } from './app/home';
import { exportScreen } from './app/exportScreen';
import { toast } from './ui/components';

/* Point d'entrée : accueil puis éditeur. Un seul fichier HTML, aucun accès réseau. */

const app = document.getElementById('app')!;
const store = new Store(newProject());
const ui = new UIStore(defaultUI());
let editor: Editor | null = null;

const ctx: Ctx = {
  store, ui,
  home: () => showHome(),
  exportPlan: () => app.replaceChildren(exportScreen(ctx, () => { if (editor) app.replaceChildren(editor.el); })),
};

function showHome() {
  app.replaceChildren(homeScreen({
    newProject: () => start(newProject(), '2d'),
    openProject: () => toast('L’ouverture de fichiers arrive à une prochaine étape.'),
    template: () => start(sampleProject(), '3d'),
  }));
}

function start(p: ReturnType<typeof newProject>, view: '2d' | '3d') {
  store.load(p);
  ui.set({ ...defaultUI(), view, tool: p.floor ? 'murs' : 'sol' });
  if (!editor) editor = new Editor(ctx);
  app.replaceChildren(editor.el);
  if (view === '3d') requestAnimationFrame(() => editor!.view3d.frame());
  else requestAnimationFrame(() => editor!.plan.fit());
}

// Accès pour les tests automatisés et le débogage.
(window as unknown as { cs3d: unknown }).cs3d = { store, ui, get editor() { return editor; }, start: (which: 'new' | 'sample') => start(which === 'new' ? newProject() : sampleProject(), which === 'new' ? '2d' : '3d') };

(async () => {
  try { await Promise.all([600, 700, 800].map(w => document.fonts.load(`${w} 16px Nunito`))); } catch { /* police de secours */ }
  showHome();
})();
