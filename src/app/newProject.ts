import { h, icon } from '../ui/dom';
import { button } from '../ui/components';
import type { Team } from '../model/types';
import { CONCEPT_FOLDER, dossierEquipe, hasPickers } from './files';

/* Nouveau projet : l'équipe se présente (facultatif : prénoms, classe, nom de l'équipe, comme dans le
   cartouche du plan A3), puis choisit tout de suite le dossier de son équipe, où le projet sera ensuite
   enregistré automatiquement. */

export interface NewProjectInfo { name: string; team: Team }

export function newProjectDialog(): Promise<NewProjectInfo | null> {
  return new Promise(resolve => {
    const field = (label: string, ph: string, value = '') => {
      const input = h('input', { value, placeholder: ph, 'aria-label': label, maxLength: 80, autocomplete: 'off' });
      return { input, el: h('label', { class: 'tf' }, label, input) };
    };
    const shop = field('Nom de la boutique', 'Ma boutique');
    const members = field('Prénoms de l’équipe', 'Léa, Malik');
    const klass = field('Classe', '4e B');
    const team = field('Nom de l’équipe', 'Les Bâtisseurs');
    const folder = h('b');
    const refreshFolder = () => { folder.textContent = dossierEquipe(members.input.value) || 'Prénom_Prénom'; };
    members.input.addEventListener('input', refreshFolder);
    refreshFolder();

    const done = (ok: boolean) => {
      veil.remove(); document.removeEventListener('keydown', onKey, true);
      if (!ok) { resolve(null); return; }
      const v = (f: { input: HTMLInputElement }) => f.input.value.trim();
      resolve({ name: v(shop), team: { name: v(team), members: v(members), klass: v(klass) } });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    const pick = hasPickers();
    const form = h('form', { class: 'np', onsubmit: (e: Event) => { e.preventDefault(); done(true); } },
      h('div', { class: 'np-g' }, shop.el, members.el, klass.el, team.el),
      h('p', { class: 'p-help' }, 'Facultatif : tu pourras compléter plus tard, dans le cartouche du plan A3.'),
      pick ? h('div', { class: 'np-where' }, icon('folder_open'),
        h('span', null, 'Ensuite, choisis le dossier de ton équipe : ', h('span', { class: 'np-path' }, CONCEPT_FOLDER + ' › ', folder), '.',
          h('br'), 'S’il n’existe pas encore, crée-le dans l’explorateur (« Nouveau dossier »). Ton projet y sera enregistré automatiquement.')) : null,
      h('div', { class: 'modal-btns' },
        button('Annuler', null, 'btn-ghost', () => done(false)),
        h('button', { class: 'btn btn-primary', type: 'submit' }, icon(pick ? 'folder_open' : 'arrow_forward'), pick ? 'Choisir le dossier et commencer' : 'Commencer')));
    const veil = h('div', { class: 'modal-veil', onclick: (e: MouseEvent) => { if (e.target === veil) done(false); } },
      h('div', { class: 'modal modal-np', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Nouveau projet' },
        h('h2', null, 'Nouveau projet'), form));
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(veil);
    members.input.focus();
  });
}
