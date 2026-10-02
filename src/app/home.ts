import { h, icon } from '../ui/dom';
import { toast } from '../ui/components';
import type { Project } from '../model/types';
import { bounds, offsetPolygon } from '../model/geometry';
import { listBackups, type Backup } from '../storage/backup';

export interface HomeActions {
  newProject(): void;
  openProject(): void;
  template(): void;
  openRecent(b: Backup): void;
  forgetRecent(b: Backup): void;
}

/** Écran d'accueil (maquette 01) avec les projets récents de ce poste. */
export function homeScreen(a: HomeActions) {
  const recents = h('div', { class: 'recents', 'data-testid': 'recents' });
  const recentSec = h('section', { class: 'home-sec', style: { display: 'none' } }, h('h2', null, 'Projets récents'), recents);
  const el = h('div', { class: 'home' },
    h('header', { class: 'home-h' },
      h('div', { class: 'home-brand' }, h('div', { class: 'home-logo' }, icon('storefront')), 'Concept Store 3D'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => toast('Trace le sol, pose les portes et fenêtres, aménage ta boutique, puis imprime le plan A3 !') }, icon('help'), 'Aide')),
    h('main', { class: 'home-m' },
      h('h1', null, 'Que veux-tu faire ?'),
      h('div', { class: 'home-cards' },
        h('button', { class: 'hc primary', type: 'button', 'data-testid': 'new-project', onclick: a.newProject },
          h('span', { class: 'hc-ic' }, icon('add')), h('span', { class: 'hc-t' }, h('b', null, 'Nouveau projet'), h('span', null, 'Une boutique vide à imaginer'))),
        h('button', { class: 'hc', type: 'button', 'data-testid': 'open-project', onclick: a.openProject },
          h('span', { class: 'hc-ic' }, icon('folder_open')), h('span', { class: 'hc-t' }, h('b', null, 'Ouvrir un projet'), h('span', null, 'Fichier .json du dossier de ton équipe'))),
        h('button', { class: 'hc model', type: 'button', 'data-testid': 'template', onclick: a.template },
          h('span', { class: 'hc-img' }, isoThumb()),
          h('span', { class: 'hc-t' }, h('b', null, 'Projet modèle'), h('span', null, 'Partir d’une boutique de départ')))),
      recentSec,
      h('p', { class: 'home-foot' }, 'Concept Store 3D · version ' + __APP_VERSION__ + ' · aucune donnée n’est envoyée sur Internet')));

  void listBackups().then(list => {
    if (!list.length) return;
    recentSec.style.display = '';
    recents.replaceChildren(...list.slice(0, 6).map(b => {
      const img = h('div', { class: 'rc-img' }); img.innerHTML = floorThumb(b.doc);
      return h('button', { class: 'rc', type: 'button', title: b.fileName ? 'Fichier : ' + b.fileName : 'Copie de secours de ce poste', onclick: () => a.openRecent(b) },
        img,
        h('span', { class: 'rc-t' },
          h('span', { class: 'rc-n' }, b.name || 'Sans nom'),
          h('span', { class: 'rc-d' }, when(b.updated) + (b.team ? ' · ' + b.team : '')),
          b.dirty ? h('span', { class: 'rc-w' }, 'Modifications non enregistrées') : null),
        icon('chevron_right'),
        h('span', { class: 'rc-x', role: 'button', title: 'Retirer de la liste', onclick: (e: MouseEvent) => { e.stopPropagation(); a.forgetRecent(b); } }, icon('close')));
    }));
  });
  return el;
}

function when(t: number) {
  const d = new Date(t), now = new Date();
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'Aujourd’hui, ' + hm;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Hier, ' + hm;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

/** Miniature du plan (sol et murs) pour la liste des projets récents. */
export function floorThumb(p: Project): string {
  if (!p.floor) return '<svg viewBox="0 0 10 10"><rect x="2" y="2" width="6" height="6" rx="1" fill="none" stroke="#CFCCC6" stroke-width=".5" stroke-dasharray="1 1"/></svg>';
  const outer = offsetPolygon(p.floor.points, p.walls.thickness), b = bounds(outer), m = Math.max(b.w, b.h) * 0.08;
  const path = (pts: { x: number; y: number }[]) => 'M' + pts.map(q => `${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join('L') + 'Z';
  return `<svg viewBox="${b.x0 - m} ${b.y0 - m} ${b.w + 2 * m} ${b.h + 2 * m}"><path d="${path(p.floor.points)}" fill="#EFE9DF"/>` +
    `<path d="${path(outer)} ${path(p.floor.points)}" fill="#3A3936" fill-rule="evenodd"/></svg>`;
}

/** Petite boutique isométrique (SVG statique) pour la carte « Projet modèle ». */
function isoThumb() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '-120 -70 240 150');
  s.setAttribute('width', '100%'); s.setAttribute('height', '100%');
  s.innerHTML = `
    <path d="M0 -10 L100 40 L0 90 L-100 40Z" fill="#EFE9DF" stroke="rgba(30,30,28,.16)"/>
    <path d="M-100 40 L0 -10 L0 -60 L-100 -10Z" fill="#FCFBF9" stroke="rgba(30,30,28,.16)"/>
    <path d="M0 -10 L100 40 L100 -10 L0 -60Z" fill="#F1EEE9" stroke="rgba(30,30,28,.16)"/>
    <path d="M30 0 L70 20 L70 -10 L30 -30Z" fill="#DCE7EC" stroke="#9FB2BA"/>
    <path d="M-70 10 L-55 3 L-55 -27 L-70 -20Z" fill="#E4DCCF" stroke="#B8AD9C"/>
    <path d="M-20 40 L10 55 L30 45 L0 30Z" fill="#2E2D2B"/><path d="M-20 40 L-20 25 L0 15 L30 30 L30 45 L0 30Z" fill="#3A3936"/>
    <path d="M-20 25 L0 15 L30 30 L10 40Z" fill="#C9A97E"/>
    <ellipse cx="60" cy="50" rx="12" ry="6" fill="#BF4E36"/><circle cx="60" cy="32" r="16" fill="#6E8B6B"/>`;
  return s;
}

declare const __APP_VERSION__: string;
