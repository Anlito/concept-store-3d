import { h, icon } from '../../ui/dom';
import { alert } from '../../ui/components';
import type { Ctx } from '../state';
import { startPartitions } from '../actions';
import { closeHelp, closeOffer, currentParts, offerTour, underTest } from './guide';

/* « Étapes du projet » : la démarche de l'équipe, dans l'ordre, du concept validé à la boutique aménagée.
   Les étapes faites sont cochées par l'équipe et gardées dans le fichier projet (champ steps).
   Mise en forme des textes : **gras**. */

interface StepAction { label: string; icon: string; run: (ctx: Ctx) => void }
export interface ProjectStep { id: string; title: string; text: string; icon: string; actions: StepAction[] }

const tool = (t: Ctx['ui']['s']['tool'], extra: Partial<Ctx['ui']['s']> = {}) => (ctx: Ctx) =>
  ctx.ui.set({ tool: t, sel: null, libraryOpen: false, partDraw: false, draft: [], cursor: null, ...extra });

export const PROJECT_STEPS: ProjectStep[] = [
  { id: 'concept', icon: 'lightbulb', title: 'Valider le concept du magasin',
    text: 'Avec ton équipe : le nom du magasin, ce qu’il vend, à qui, son ambiance. Fais **valider ce concept par ton professeur** avant de commencer la boutique.',
    actions: [] },
  { id: 'surface', icon: 'grid_on', title: 'Tracer la surface commerciale, les pièces et les ouvertures',
    text: 'Trace la **surface** (10 × 7 m au plus), puis les **cloisons** des pièces : toilettes ? réserve ? salle du personnel ? atelier ? cabines ? Place ensuite les **portes, fenêtres et vitrines**.',
    actions: [
      { label: 'Surface', icon: 'grid_on', run: tool('sol', { view: '2d' }) },
      { label: 'Cloisons', icon: 'border_outer', run: ctx => { tool('sol', { view: '2d' })(ctx); startPartitions(ctx); } },
      { label: 'Portes / fenêtres', icon: 'door_front', run: tool('ouvertures') },
    ] },
  { id: 'plan', icon: 'print', title: 'Générer le plan A3 et l’enregistrer',
    text: 'Remplis le cartouche et enregistre le PDF dans le **dossier de ton équipe** : ton professeur l’imprime. C’est le gabarit de ta **maquette en carton**.',
    actions: [{ label: 'Plan A3', icon: 'print', run: ctx => ctx.exportPlan() }] },
  { id: 'amenagement', icon: 'route', title: 'Réfléchir à l’aménagement de l’espace',
    text: 'Où placer la caisse, les présentoirs, les cabines ? Par où passent les clients ? Quels meubles faut-il ? Fais un croquis sur le plan imprimé avant de placer les meubles.',
    actions: [{ label: 'Voir la bibliothèque', icon: 'chair', run: tool('mobilier', { libraryOpen: true }) }] },
  { id: 'mobilier', icon: 'handyman', title: 'Créer le mobilier et les accessoires',
    text: 'Les meubles qui manquent : fabrique-les dans l’**Atelier** avec des volumes, ou importe-les de **Tinkercad**.',
    actions: [{ label: 'Ouvrir l’Atelier', icon: 'handyman', run: ctx => ctx.openAtelier() }] },
  { id: 'decoration', icon: 'format_paint', title: 'Décorer les murs, le sol, la façade et la vitrine',
    text: 'Matières et couleurs des murs et du sol, **façade** côté rue, images : affiches, logo sur la **vitrine**, tapis…',
    actions: [
      { label: 'Murs et façade', icon: 'border_outer', run: tool('murs') },
      { label: 'Sol', icon: 'grid_view', run: tool('revetement') },
      { label: 'Images', icon: 'image', run: tool('images') },
    ] },
  { id: 'installation', icon: 'chair', title: 'Installer le mobilier dans la surface commerciale',
    text: 'Place les meubles comme sur ton croquis. Vérifie en **Vue 3D**, puis fais des **photos** du rendu pour ta présentation.',
    actions: [{ label: 'Mobilier', icon: 'chair', run: tool('mobilier', { libraryOpen: true }) }] },
];

const done = (ctx: Ctx) => new Set(ctx.store.doc.steps ?? []);
/** Rang de l'étape en cours (la première non cochée), ou le nombre d'étapes si tout est fait. */
export function currentStep(ctx: Ctx) { const d = done(ctx); const i = PROJECT_STEPS.findIndex(s => !d.has(s.id)); return i < 0 ? PROJECT_STEPS.length : i; }

/** Coche une étape (par exemple « plan » quand le PDF est enregistré). */
export function markStep(ctx: Ctx, id: string) {
  if (done(ctx).has(id)) return;
  ctx.store.update(d => { d.steps = [...(d.steps ?? []), id]; });
}
function toggleStep(ctx: Ctx, id: string) {
  ctx.store.update(d => { const s = new Set(d.steps ?? []); if (s.has(id)) s.delete(id); else s.add(id); d.steps = PROJECT_STEPS.map(x => x.id).filter(x => s.has(x)); });
}

const rich = (s: string) => { const el = h('span'); el.innerHTML = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); return el; };

/** Tuile en haut de la barre d'outils : « Étape 2/7 », en couleur pour être vue tout de suite. */
export function stepsButton(ctx: Ctx) {
  const label = h('span', { class: 'tr-steps-n' });
  const el = h('button', { class: 'tr-steps', type: 'button', 'data-tour': 'steps', onclick: () => openStepsPanel(ctx) }, icon('checklist'), label);
  const refresh = () => {
    const i = currentStep(ctx), n = PROJECT_STEPS.length;
    label.textContent = i >= n ? 'Étapes ✓' : `Étape ${i + 1}/${n}`;
    el.title = i >= n ? 'Toutes les étapes sont faites' : `À faire : ${PROJECT_STEPS[i].title}`;
  };
  ctx.store.subscribe(refresh); refresh();
  return el;
}

/* ---------- Panneau « Étapes du projet » ---------- */
let panel: HTMLElement | null = null, unsub: (() => void) | null = null, onKey: ((e: KeyboardEvent) => void) | null = null;
export function closeStepsPanel(reoffer = true) {
  if (!panel) return;
  panel.remove(); panel = null;
  unsub?.(); unsub = null;
  if (onKey) document.removeEventListener('keydown', onKey, true);
  onKey = null;
  // Fermé : la visite de la partie en cours peut être proposée (elle attendait).
  if (reoffer && !document.querySelector('.home')) offerTour(currentParts()[0]);
}
document.addEventListener('cs3d-close-panels', () => closeStepsPanel(false));

export function openStepsPanel(ctx: Ctx) {
  if (panel) { closeStepsPanel(); return; }
  closeHelp(); closeOffer();
  const list = h('ol', { class: 'st-list' });
  const render = () => {
    const d = done(ctx), cur = currentStep(ctx);
    list.replaceChildren(...PROJECT_STEPS.map((s, i) => {
      const ok = d.has(s.id), now = i === cur;
      return h('li', { class: 'st' + (ok ? ' ok' : '') + (now ? ' now' : ''), 'data-step': s.id },
        h('button', { class: 'st-check', type: 'button', role: 'checkbox', 'aria-checked': String(ok), 'aria-label': (ok ? 'Étape faite : ' : 'Marquer comme faite : ') + s.title,
          title: ok ? 'Décocher' : 'Cocher quand l’étape est finie', onclick: () => toggleStep(ctx, s.id) }, ok ? icon('check') : String(i + 1)),
        h('div', { class: 'st-b' },
          h('div', { class: 'st-t' }, icon(s.icon), h('b', null, s.title), now ? h('span', { class: 'st-now' }, 'À faire') : null),
          h('p', null, rich(s.text)),
          s.actions.length ? h('div', { class: 'st-acts' }, ...s.actions.map(a =>
            h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { closeStepsPanel(false); a.run(ctx); } }, icon(a.icon), a.label))) : null));
    }));
  };
  panel = h('aside', { class: 'help-panel steps-panel', role: 'dialog', 'aria-label': 'Étapes du projet' },
    h('div', { class: 'hl-h' }, h('h2', null, icon('checklist'), 'Étapes du projet'),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: 'Fermer', 'aria-label': 'Fermer les étapes', onclick: () => closeStepsPanel() }, icon('close'))),
    h('div', { class: 'st-scroll' },
      alert('warning', 'Maquette 3D = maquette en carton', 'Les deux doivent rester cohérentes : mêmes dimensions, mêmes pièces, mêmes ouvertures. Si tu changes l’une, change l’autre.'),
      list,
      h('p', { class: 'p-help' }, 'Coche chaque étape quand ton équipe l’a finie : elle est enregistrée avec le projet.')));
  unsub = ctx.store.subscribe(render);
  onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal-veil')) { e.stopPropagation(); closeStepsPanel(); } };
  document.addEventListener('keydown', onKey, true);
  render();
  document.body.appendChild(panel);
}

/** Nouveau projet : les étapes s'affichent d'abord, pour savoir par quoi commencer. */
export function showStepsAtStart(ctx: Ctx) { if (!underTest()) openStepsPanel(ctx); }
