import { h, icon } from '../ui/dom';
import { toast } from '../ui/components';

export interface HomeActions { newProject(): void; openProject(): void; template(): void }

/** Écran d'accueil (maquette 01). */
export function homeScreen(a: HomeActions) {
  return h('div', { class: 'home' },
    h('header', { class: 'home-h' },
      h('div', { class: 'home-brand' }, h('div', { class: 'home-logo' }, icon('storefront')), 'Concept Store 3D'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => toast('Trace le sol, pose les portes et fenêtres, puis aménage ta boutique !') }, icon('help'), 'Aide')),
    h('main', { class: 'home-m' },
      h('h1', null, 'Que veux-tu faire ?'),
      h('div', { class: 'home-cards' },
        h('button', { class: 'hc primary', type: 'button', 'data-testid': 'new-project', onclick: a.newProject },
          h('span', { class: 'hc-ic' }, icon('add')), h('span', { class: 'hc-t' }, h('b', null, 'Nouveau projet'), h('span', null, 'Une boutique vide à imaginer'))),
        h('button', { class: 'hc', type: 'button', onclick: a.openProject },
          h('span', { class: 'hc-ic' }, icon('folder_open')), h('span', { class: 'hc-t' }, h('b', null, 'Ouvrir un projet'), h('span', null, 'Fichier .json sur l’ordinateur'))),
        h('button', { class: 'hc model', type: 'button', 'data-testid': 'template', onclick: a.template },
          h('span', { class: 'hc-img' }, isoThumb()),
          h('span', { class: 'hc-t' }, h('b', null, 'Projet modèle'), h('span', null, 'Partir d’une boutique exemple')))),
      h('p', { class: 'home-foot' }, 'Concept Store 3D · version ' + __APP_VERSION__ + ' · aucune donnée n’est envoyée sur Internet')));
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
