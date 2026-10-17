import { h, icon } from '../ui/dom';
import { alert, button } from '../ui/components';
import type { Team } from '../model/types';
import { dossierEquipe, hasPickers } from './files';
import { cheminProjet, classesProposees, DOSSIER_PROJET, surCollege } from './college';

/* Nouveau projet : l'équipe se présente (prénoms et classe obligatoires : ils donnent le nom et la place du
   dossier de l'équipe ; boutique et nom de l'équipe facultatifs, comme dans le cartouche du plan A3), puis
   choisit tout de suite le dossier CONCEPT STORE de sa classe : l'outil y crée le dossier de l'équipe, où le
   projet est ensuite enregistré automatiquement. La classe se choisit dans la liste des réglages du collège. */

export interface NewProjectInfo { name: string; team: Team }

export function newProjectDialog(): Promise<NewProjectInfo | null> {
  return new Promise(resolve => {
    const field = (label: string, ph: string, value = '') => {
      const input = h('input', { value, placeholder: ph, 'aria-label': label, maxLength: 80, autocomplete: 'off' });
      return { input, el: h('label', { class: 'tf' }, label, input) };
    };
    const shop = field('Nom de la boutique', 'Ma boutique');
    const members = field('Prénoms de l’équipe', 'Léa, Malik');
    const klassSelect = h('select', { 'aria-label': 'Classe' }) as HTMLSelectElement;
    const klass = { input: klassSelect, el: h('label', { class: 'tf' }, 'Classe', klassSelect) };
    // Classes des réglages du collège, redessinées si la version en ligne arrive pendant que la fenêtre est ouverte.
    const refreshClasses = () => {
      const before = klassSelect.value;
      klassSelect.replaceChildren(h('option', { value: '' }, 'Choisis ta classe'), ...classesProposees().map(c => h('option', { value: c }, c)));
      klassSelect.value = classesProposees().includes(before) ? before : '';
      refreshFolder();
    };
    const team = field('Nom de l’équipe', 'Les Bâtisseurs');
    const path = h('span'), folder = h('b');
    const refreshFolder = () => {
      path.textContent = cheminProjet(klassSelect.value) + ' › ';
      folder.textContent = dossierEquipe(members.input.value) || 'Prénom_Prénom';
    };
    members.input.addEventListener('input', () => { members.input.classList.remove('missing'); refreshFolder(); });
    klassSelect.addEventListener('change', () => { klassSelect.classList.remove('missing'); refreshFolder(); });
    const stopCollege = surCollege(refreshClasses);
    refreshClasses();
    const err = h('div', { role: 'alert' });

    const done = (ok: boolean) => {
      const v = (f: { input: HTMLInputElement | HTMLSelectElement }) => f.input.value.trim();
      if (ok) {
        // Prénoms et classe : obligatoires, ils donnent le nom et la place du dossier de l'équipe.
        const missing = [!dossierEquipe(v(members)) && members.input, !v(klass) && klassSelect].filter(Boolean) as HTMLElement[];
        for (const el of [members.input, klassSelect]) el.classList.toggle('missing', missing.includes(el));
        if (missing.length) {
          err.replaceChildren(alert('warning', missing.length === 2 ? 'Écris vos prénoms et choisis ta classe' : missing[0] === klassSelect ? 'Choisis ta classe' : 'Écris vos prénoms',
            'Ils donnent le nom et la place du dossier de ton équipe.'));
          missing[0].focus();
          return;
        }
      }
      veil.remove(); document.removeEventListener('keydown', onKey, true); stopCollege();
      if (!ok) { resolve(null); return; }
      resolve({ name: v(shop), team: { name: v(team), members: v(members), klass: v(klass) } });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    const pick = hasPickers();
    const form = h('form', { class: 'np', onsubmit: (e: Event) => { e.preventDefault(); done(true); } },
      h('div', { class: 'np-g' }, shop.el, members.el, klass.el, team.el),
      h('p', { class: 'p-help' }, 'Prénoms et classe obligatoires. La boutique et le nom de l’équipe peuvent attendre le cartouche du plan A3.'),
      err,
      h('div', { class: 'np-where' }, icon('folder_open'),
        pick ? h('span', null, `Ensuite, choisis le dossier « ${DOSSIER_PROJET} » de ta classe : `, h('span', { class: 'np-path' }, path, folder), '.',
          h('br'), 'L’outil y crée lui-même le dossier de ton équipe. Ton projet y sera enregistré automatiquement.')
          : h('span', null, 'Ton projet sera téléchargé : range-le dans ', h('span', { class: 'np-path' }, path, folder), '.')),
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
