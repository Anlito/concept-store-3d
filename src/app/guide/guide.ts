import { h, icon } from '../../ui/dom';
import type { Ctx } from '../state';
import { openCredits } from '../help';
import { FAQ, type FaqGroup } from './faq';
import { PART_ICON, PART_LABEL, tourSteps, type Part, type TourStep } from './tours';

/* Aide intégrée :
   - visite guidée d'une partie : chaque zone est éclairée à son tour, avec une bulle (Précédent / Suivant / Passer) ;
   - carte qui propose la visite la première fois qu'une partie est ouverte sur ce poste (l'élève peut refuser) ;
   - panneau « Aide » : questions fréquentes (la partie en cours d'abord), recherche, relance de la visite. */

let ctx: Ctx | null = null;
export function initGuide(c: Ctx) { ctx = c; }

/* ---------- Mise en forme des textes : **gras**, [[touche]] ---------- */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function rich(s: string) {
  const el = h('span');
  el.innerHTML = esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[\[(.+?)\]\]/g, '<kbd>$1</kbd>');
  return el;
}

/* ---------- Partie en cours (déduite de l'écran affiché) ---------- */
export function currentParts(): Part[] {
  if (document.querySelector('[data-testid=atelier]')) return ['atelier'];
  if (document.querySelector('[data-testid=export]')) return ['plan'];
  if (document.querySelector('.home') || !ctx) return ['accueil'];
  const s = ctx.ui.s;
  return s.view === '3d' && s.tool !== 'images' ? [s.tool, 'vue3d'] : [s.tool];
}

/* ---------- Mémoire du poste : visites faites ou refusées ---------- */
const SEEN_KEY = 'cs3d-visites', OFF_KEY = 'cs3d-visites-off';
function seen(): Record<string, string> { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } }
function markSeen(p: Part, how: 'faite' | 'refusee') { const s = seen(); s[p] = how; try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch { /* stockage bloqué */ } }
/** Sous pilotage automatisé (tests) : pas d'aide qui s'ouvre toute seule, sauf si un test la demande. */
export function underTest() { try { return navigator.webdriver && localStorage.getItem('cs3d-visites-test') !== '1'; } catch { return false; } }
function offersOff() {
  try {
    if (localStorage.getItem(OFF_KEY) === '1') return true;
    // Tests automatisés : pas de proposition, sauf si un test la demande.
    return navigator.webdriver && localStorage.getItem('cs3d-visites-test') !== '1';
  } catch { return false; }
}
function resetOffers() { try { localStorage.removeItem(SEEN_KEY); localStorage.removeItem(OFF_KEY); } catch { /* ignoré */ } }

/* ---------- Carte de proposition ---------- */
let offerEl: HTMLElement | null = null, offerPart: Part | null = null, offerTimer = 0;
export function closeOffer() { clearTimeout(offerTimer); offerEl?.remove(); offerEl = null; offerPart = null; }

/** Propose la visite d'une partie ouverte pour la première fois sur ce poste. */
export function offerTour(part: Part) {
  if (offerPart === part || tourOn || offersOff() || seen()[part]) return;
  closeOffer();
  offerPart = part;
  offerTimer = window.setTimeout(() => {
    // Une fenêtre est ouverte ou la partie a déjà changé : on proposera une autre fois.
    // Une fenêtre ou les étapes du projet sont ouvertes, ou la partie a changé : on proposera une autre fois.
    if (document.querySelector('.modal-veil, .steps-panel') || !currentParts().includes(part)) { offerPart = null; return; }
    const no = () => { markSeen(part, 'refusee'); closeOffer(); };
    offerEl = h('div', { class: 'tour-offer', role: 'dialog', 'aria-label': 'Visite guidée' },
      h('div', { class: 'to-ic' }, icon(PART_ICON[part])),
      h('div', { class: 'to-t' },
        h('b', null, `Première fois dans « ${PART_LABEL[part]} » ?`),
        h('span', null, 'Une visite guidée te montre chaque zone de l’écran, en une minute.'),
        h('div', { class: 'to-btns' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { closeOffer(); startTour(part); } }, icon('tour'), 'Faire la visite'),
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: no }, 'Non merci')),
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { try { localStorage.setItem(OFF_KEY, '1'); } catch { /* ignoré */ } closeOffer(); } },
          'Ne plus me proposer de visites')),
      h('button', { class: 'to-x', type: 'button', title: 'Fermer', 'aria-label': 'Fermer', onclick: no }, icon('close')));
    document.body.appendChild(offerEl);
  }, 600);
}

/* ---------- Visite guidée ---------- */
let tourOn = false;
const visible = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find(e => {
  const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
}) ?? null;
const frame = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export function startTour(part: Part) {
  if (!ctx || tourOn) return;
  closeOffer(); closeHelp();
  const steps = tourSteps(part, ctx).filter(s => !s.optional || visible(s.at));
  tourOn = true;
  let i = 0, target: HTMLElement | null = null;

  const veil = h('div', { class: 'tour-veil' });
  const spot = h('div', { class: 'tour-spot' });
  const count = h('span', { class: 'tour-count' });
  const title = h('h3'), text = h('p');
  const prev = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => go(i - 1) }, icon('arrow_back'), 'Précédent');
  const next = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go(i + 1) });
  const skip = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => end(false) }, 'Passer');
  const bubble = h('div', { class: 'tour-bub', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Visite guidée · ' + PART_LABEL[part] },
    h('div', { class: 'tour-top' }, h('span', { class: 'tour-part' }, icon(PART_ICON[part]), PART_LABEL[part]), count),
    title, text, h('div', { class: 'tour-btns' }, skip, h('span', { class: 'sp' }), prev, next));
  const root = h('div', { class: 'tour' }, veil, spot, bubble);
  document.body.appendChild(root);

  async function go(n: number) {
    if (n >= steps.length) { end(true); return; }
    if (n < 0) return;
    i = n;
    const s: TourStep = steps[i];
    s.prepare?.();
    await frame();
    target = visible(s.at);
    count.textContent = `${i + 1} / ${steps.length}`;
    title.textContent = s.title;
    text.replaceChildren(rich(s.text));
    prev.disabled = i === 0;
    next.replaceChildren(...(i === steps.length - 1 ? [icon('check'), 'Terminer'] : ['Suivant', icon('arrow_forward')]));
    place();
    next.focus();
  }

  function place() {
    const W = window.innerWidth, H = window.innerHeight, m = 8, gap = 14;
    const bw = Math.min(360, W - 32);
    bubble.style.width = bw + 'px';
    const bh = bubble.offsetHeight;
    if (!target) {
      spot.style.display = 'none'; veil.classList.add('dark');
      Object.assign(bubble.style, { left: (W - bw) / 2 + 'px', top: (H - bh) / 2 + 'px' });
      return;
    }
    const r = target.getBoundingClientRect();
    // Grande zone (la vue entière) : on la resserre un peu pour garder le voile visible autour.
    const box = { x: Math.max(m, r.left - 6), y: Math.max(m, r.top - 6), r: Math.min(W - m, r.right + 6), b: Math.min(H - m, r.bottom + 6) };
    spot.style.display = ''; veil.classList.remove('dark');
    Object.assign(spot.style, { left: box.x + 'px', top: box.y + 'px', width: box.r - box.x + 'px', height: box.b - box.y + 'px' });
    // Bulle : à droite, à gauche, en dessous, au-dessus… ou à l'intérieur de la zone si elle remplit l'écran.
    const clampX = (x: number) => Math.max(16, Math.min(W - bw - 16, x));
    const clampY = (y: number) => Math.max(16, Math.min(H - bh - 16, y));
    let x: number, y: number;
    if (W - box.r >= bw + gap + 16) { x = box.r + gap; y = clampY(box.y); }
    else if (box.x >= bw + gap + 16) { x = box.x - gap - bw; y = clampY(box.y); }
    else if (H - box.b >= bh + gap + 16) { x = clampX(box.x); y = box.b + gap; }
    else if (box.y >= bh + gap + 16) { x = clampX(box.x); y = box.y - gap - bh; }
    else { x = clampX(box.x + 24); y = clampY(box.b - bh - 24); }
    Object.assign(bubble.style, { left: x + 'px', top: y + 'px' });
  }

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); end(false); }
    else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement))) { e.preventDefault(); void go(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); void go(i - 1); }
    else if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== ' ') e.preventDefault();
  };
  const onResize = () => { if (target && !target.isConnected) target = visible(steps[i].at); place(); };
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);

  function end(done: boolean) {
    root.remove(); tourOn = false;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    markSeen(part, done ? 'faite' : 'refusee');
  }
  void go(0);
}

/* ---------- Panneau « Aide » ---------- */
let helpEl: HTMLElement | null = null;
let helpKey: ((e: KeyboardEvent) => void) | null = null;
export function closeHelp() {
  helpEl?.remove(); helpEl = null;
  if (helpKey) document.removeEventListener('keydown', helpKey, true);
  helpKey = null;
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const GROUP_LABEL = (g: FaqGroup) => (g === 'general' ? 'Questions générales' : PART_LABEL[g]);

export function openHelpPanel() {
  if (helpEl) { closeHelp(); return; }
  document.dispatchEvent(new Event('cs3d-close-panels')); // un seul panneau à droite
  closeOffer();
  const parts = currentParts();
  const order: FaqGroup[] = [...parts, 'general', ...(Object.keys(FAQ) as FaqGroup[]).filter(g => g !== 'general' && !parts.includes(g as Part))];

  const search = h('input', { type: 'search', placeholder: 'Rechercher une question…', 'aria-label': 'Rechercher dans l’aide', spellcheck: false });
  const list = h('div', { class: 'hl-list' });
  const tours = h('div', { class: 'hl-tours' }, ...parts.map(p =>
    h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => startTour(p) }, icon('tour'), `Visite guidée : ${PART_LABEL[p]}`)));

  const render = () => {
    const q = norm(search.value.trim());
    const words = q.split(/\s+/).filter(Boolean);
    const match = (f: { q: string; a: string }) => words.every(w => norm(f.q + ' ' + f.a).includes(w));
    let total = 0;
    const blocks = order.map((g, gi) => {
      const items = FAQ[g].filter(match);
      total += items.length;
      if (!items.length) return null;
      const here = !q && gi < parts.length;
      return h('section', { class: 'hl-sec' + (here ? ' here' : '') },
        h('h3', null, g === 'general' ? icon('help') : icon(PART_ICON[g as Part]), GROUP_LABEL(g), here ? h('span', { class: 'hl-here' }, 'Tu es ici') : null),
        ...items.map(f => {
          const d = h('details', { class: 'hl-q' }, h('summary', null, f.q, icon('keyboard_arrow_down')), h('div', { class: 'hl-a' }, rich(f.a)));
          if (q && total <= 3) d.open = true;
          return d;
        }));
    });
    list.replaceChildren(...blocks.filter((b): b is HTMLElement => !!b),
      ...(total ? [] : [h('div', { class: 'hl-none' }, icon('search_off'), h('b', null, 'Aucune réponse trouvée'), h('span', null, 'Essaie un autre mot, ou demande à ton professeur.'))]));
  };
  search.addEventListener('input', render);

  helpEl = h('aside', { class: 'help-panel', role: 'dialog', 'aria-label': 'Aide' },
    h('div', { class: 'hl-h' }, h('h2', null, icon('help'), 'Aide'),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: 'Fermer', 'aria-label': 'Fermer l’aide', onclick: closeHelp }, icon('close'))),
    h('div', { class: 'hl-top' }, h('label', { class: 'lib-search' }, icon('search'), search), tours),
    list,
    h('div', { class: 'hl-f' },
      h('span', null, 'Pas de réponse ? Demande à ton professeur.'),
      h('span', { class: 'hl-links' },
        h('button', { class: 'linkbtn', type: 'button', title: 'Les cartes de visite guidée réapparaîtront dans chaque partie', onclick: (e: MouseEvent) => {
          resetOffers(); (e.currentTarget as HTMLElement).textContent = 'Visites de nouveau proposées ✓'; } }, 'Proposer de nouveau les visites'),
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { closeHelp(); openCredits(); } }, 'Crédits et licences'))));
  helpKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !document.querySelector('.modal-veil')) { e.stopPropagation(); closeHelp(); return; }
    // Pendant la recherche, les raccourcis de l'éditeur (Suppr, R…) ne doivent pas agir.
    if (e.target === search && !e.ctrlKey && !e.metaKey) e.stopPropagation();
  };
  document.addEventListener('keydown', helpKey, true);
  render();
  document.body.appendChild(helpEl);
  search.focus();
}

/** Bouton « Aide » de la barre du haut. */
export const helpButton = () => h('button', { class: 'btn btn-ghost', type: 'button', 'data-tour': 'help', title: 'Questions fréquentes et visites guidées', onclick: () => openHelpPanel() }, icon('help'), 'Aide');
