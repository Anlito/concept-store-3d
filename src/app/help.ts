import { h, icon } from '../ui/dom';
import inventaire from '../../library/inventaire.json';
import { PACKS } from '../library/library';

/* Aide intégrée et page « Crédits » (obligatoire pour tout modèle CC-BY, bonne pratique pour le CC0). */

function modal(title: string, body: (Node | null)[], wide = false) {
  const close = () => { veil.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const veil = h('div', { class: 'modal-veil', onclick: (e: MouseEvent) => { if (e.target === veil) close(); } },
    h('div', { class: 'imd hp' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'imd-h' }, h('h2', null, title), h('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: 'Fermer', onclick: close }, icon('close'))),
      h('div', { class: 'hp-b' }, ...body)));
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(veil);
  return close;
}

const STEPS: [string, string, string][] = [
  ['grid_on', 'Trace le sol', 'Outil Sol, en Plan 2D : un clic par coin, puis clic sur « Départ » (ou un rectangle). Maximum 10 × 7 m. Tu peux taper une longueur au clavier.'],
  ['border_outer', 'Règle les murs', 'Outil Murs : hauteur, épaisseur, matière et couleur, à l’intérieur et sur la façade.'],
  ['door_front', 'Pose portes et vitrines', 'Outil Portes / fenêtres : choisis le type et le style, puis clique sur un mur. Glisse-les pour les déplacer.'],
  ['chair', 'Aménage ta boutique', 'Outil Mobilier : bibliothèque, puis glisse, tourne (R) et règle les meubles. Crée les tiens dans l’atelier.'],
  ['image', 'Ajoute tes images', 'Outil Images : cadres, tapisserie, tapis, vitrophanie… (PNG ou JPG faits par toi ou libres de droits).'],
  ['print', 'Imprime le plan A3', 'Bouton Plan A3 : choisis l’échelle (1 m = 3 cm), remplis le cartouche, télécharge le PDF et imprime en taille réelle.'],
  ['save', 'Enregistre', 'Ctrl+S : dans le dossier de ton équipe. Une copie de secours est aussi gardée sur le poste.'],
];
const KEYS: [string, string][] = [
  ['Ctrl+Z / Ctrl+Y', 'Annuler / rétablir'], ['Ctrl+S', 'Enregistrer'], ['Suppr', 'Supprimer l’élément choisi'], ['Échap', 'Désélectionner / annuler le tracé'],
  ['Ctrl+C / Ctrl+V', 'Copier / coller des meubles'], ['Ctrl+D', 'Dupliquer'], ['R', 'Tourner un meuble de 15°'], ['Flèches', 'Déplacer un meuble'],
  ['Maj', 'Pendant un glisser : sans pas de 15° ou plus fin'], ['Molette', 'Zoomer'], ['Clic droit + glisser', 'Tourner la vue 3D'], ['Maj + glisser', 'Déplacer la vue'],
];

export function openHelp() {
  const close = modal('Aide · Concept Store 3D', [
    h('ol', { class: 'hp-steps' }, ...STEPS.map(([ic, t, d], i) => h('li', null,
      h('span', { class: 'hp-n' }, String(i + 1)), h('span', { class: 'hp-ic' }, icon(ic)), h('span', null, h('b', null, t), h('span', null, d))))),
    h('h3', null, 'Raccourcis clavier'),
    h('div', { class: 'hp-keys' }, ...KEYS.flatMap(([k, d]) => [h('kbd', null, k), h('span', null, d)])),
    h('p', { class: 'p-help' }, 'Aucune donnée n’est envoyée sur Internet : tes projets restent dans le dossier de ton équipe. ',
      h('button', { class: 'linkbtn', type: 'button', onclick: () => { close(); openCredits(); } }, 'Crédits et licences')),
  ]);
}

interface Inv { id: string; nom: string; pack: string; auteur: string; licence: string; source: string }
export function openCredits() {
  const models = (inventaire as { modeles: Inv[] }).modeles;
  const packs = Object.values(PACKS).filter(p => p.nom !== 'Volumes de Concept Store 3D');
  const SOFT: [string, string, string][] = [
    ['Three.js', 'moteur 3D', 'MIT'], ['jsPDF', 'création du PDF', 'MIT'], ['fflate', 'fichiers .zip', 'MIT'],
    ['Nunito', 'police de caractères (Vernon Adams, Cyreal, Jacques Le Bailly)', 'SIL Open Font License 1.1'],
    ['Material Symbols', 'icônes (Google)', 'Apache 2.0'],
  ];
  modal('Crédits et licences', [
    h('p', { class: 'p-help' }, 'Concept Store 3D a été réalisé pour le projet « Concept Store » de technologie (cycle 4). Il n’utilise que des modèles 3D sous licence CC0 (domaine public) ou CC-BY ; leur source est notée dans l’inventaire ci-dessous.'),
    h('h3', null, 'Modèles 3D de la bibliothèque'),
    h('div', { class: 'cr-packs' }, ...packs.map(p => h('div', { class: 'cr-pack' },
      h('b', null, p.nom), h('span', null, p.auteur), h('span', { class: 'cr-lic' }, p.licence), h('span', { class: 'cr-src' }, p.source),
      h('span', null, `${models.filter(m => m.pack === p.nom).length} modèles`)))),
    h('p', { class: 'p-help' }, 'Meubles en volumes simples (comptoirs, portants, mannequin, décor extérieur…) : dessinés pour l’outil, libres de droits (CC0).'),
    h('details', { class: 'cr-det' }, h('summary', null, `Inventaire détaillé (${models.length} modèles)`),
      h('table', { class: 'cr-tab' }, h('thead', null, h('tr', null, h('th', null, 'Modèle'), h('th', null, 'Pack'), h('th', null, 'Licence'))),
        h('tbody', null, ...models.map(m => h('tr', null, h('td', null, m.nom), h('td', null, m.pack), h('td', null, m.licence)))))),
    h('h3', null, 'Logiciels et polices'),
    h('div', { class: 'cr-soft' }, ...SOFT.flatMap(([n, r, l]) => [h('b', null, n), h('span', null, r), h('span', { class: 'cr-lic' }, l)])),
    h('p', { class: 'p-help' }, 'Ajouts du professeur et images des élèves : chaque auteur est responsable de leurs droits (modèles CC0 ou CC-BY, images faites par les élèves ou libres de droits).'),
  ], true);
}
