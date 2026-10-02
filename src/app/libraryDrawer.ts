import type { Ctx } from './state';
import { h, icon } from '../ui/dom';
import { toast } from '../ui/components';
import { CATEGORIES, SOURCE_LABEL, libraryItems, loadProto, type LibItem, type Source } from '../library/library';
import { thumbnail } from '../library/thumbs';
import { addObject } from './objectActions';

/* Tiroir « Bibliothèque de mobilier » (maquette 04) : onglets, catégories, recherche, cartes, « Placer ». */

const fmtDims = (d: { w: number; d: number; h: number }, round = false) => {
  const cm = (x: number) => Math.round(x * 100);
  return round ? `Ø${cm(Math.max(d.w, d.d))} × ${cm(d.h)} cm` : `${cm(d.w)} × ${cm(d.d)} × ${cm(d.h)} cm`;
};

export function libraryDrawer(ctx: Ctx) {
  let tab: Source = 'base', cat = 'tout', query = '', selected: LibItem | null = null;
  const dims = new Map<string, string>();

  const search = h('input', { type: 'search', placeholder: 'Rechercher un meuble…', 'aria-label': 'Rechercher un meuble' });
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); renderGrid(); });
  search.addEventListener('keydown', e => e.stopPropagation());
  const tabsEl = h('div', { class: 'lib-tabs', role: 'tablist' });
  const catsEl = h('div', { class: 'lib-cats' });
  const grid = h('div', { class: 'lib-grid', 'data-testid': 'library-grid' });
  const footName = h('div', { class: 'lib-sel-n' }), footDims = h('div', { class: 'lib-sel-d' });
  const place = h('button', { class: 'btn btn-primary btn-lg', type: 'button', disabled: true, onclick: () => selected && doPlace(selected) }, icon('add_location_alt'), 'Placer dans la boutique');
  const close = () => ctx.ui.set({ libraryOpen: false });

  const el = h('section', { class: 'lib', 'data-testid': 'library', 'aria-label': 'Bibliothèque de mobilier' },
    h('div', { class: 'lib-h' },
      h('h2', null, 'Bibliothèque de mobilier'),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: 'Fermer', onclick: close }, icon('close'))),
    h('div', { class: 'lib-tools' },
      h('label', { class: 'lib-search' }, icon('search'), search),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => toast('L’atelier de création arrive à une prochaine étape.') }, icon('handyman'), 'Créer un meuble')),
    tabsEl,
    h('div', { class: 'lib-body' }, catsEl, grid),
    h('div', { class: 'lib-foot' }, h('div', { class: 'lib-sel' }, footName, footDims), place));

  async function doPlace(it: LibItem) { await addObject(ctx, it.id); }

  const items = () => libraryItems().filter(i => i.source === tab);
  function renderTabs() {
    tabsEl.replaceChildren(...(['base', 'moi', 'prof'] as Source[]).map(s => {
      const n = libraryItems().filter(i => i.source === s).length;
      return h('button', { type: 'button', role: 'tab', class: 'lib-tab' + (s === tab ? ' on' : ''), 'aria-selected': String(s === tab),
        onclick: () => { tab = s; cat = 'tout'; renderAll(); } }, SOURCE_LABEL[s], h('span', { class: 'cnt' }, String(n)));
    }));
  }
  function renderCats() {
    catsEl.replaceChildren(...CATEGORIES.map(c => {
      const n = c.id === 'tout' ? items().length : items().filter(i => i.cat === c.id).length;
      return h('button', { type: 'button', class: 'lib-cat' + (c.id === cat ? ' on' : ''), onclick: () => { cat = c.id; renderCats(); renderGrid(); } },
        icon(c.icon, c.id === cat), h('span', null, c.label), h('span', { class: 'cnt' }, String(n)));
    }));
  }
  function renderGrid() {
    const list = items().filter(i => (cat === 'tout' || i.cat === cat) && (!query || i.name.toLowerCase().includes(query)));
    if (!list.length) {
      const msg = tab === 'moi' ? 'Tes meubles créés dans l’Atelier apparaîtront ici.' : tab === 'prof' ? 'Les modèles ajoutés par ton professeur apparaîtront ici.' : 'Aucun meuble trouvé';
      grid.replaceChildren(h('div', { class: 'lib-empty' }, icon(query ? 'search' : 'category'), msg));
      return;
    }
    grid.replaceChildren(...list.map(card));
  }
  function card(it: LibItem) {
    const img = h('img', { alt: '', draggable: false });
    const d = h('div', { class: 'fc-d' }, dims.get(it.id) ?? '…');
    const el = h('button', { type: 'button', class: 'fc' + (selected?.id === it.id ? ' on' : ''), title: it.name, 'data-item': it.id,
      onclick: () => { selected = it; grid.querySelectorAll('.fc.on').forEach(x => x.classList.remove('on')); el.classList.add('on'); updateFoot(); },
      ondblclick: () => doPlace(it) },
      h('div', { class: 'fc-img' }, img), h('div', { class: 'fc-n' }, it.name), d,
      h('span', { class: 'fc-check' }, icon('check')));
    loadProto(it.id).then(p => {
      const round = Math.abs(p.dims.w - p.dims.d) < 0.02 && /rond|cactus|plante|vase/i.test(it.id + it.name);
      const s = fmtDims(p.dims, round); dims.set(it.id, s); d.textContent = s;
      if (selected?.id === it.id) updateFoot();
    }).catch(() => { d.textContent = 'Modèle illisible'; });
    thumbnail(it.id).then(u => { img.src = u; }).catch(() => { /* miniature indisponible */ });
    return el;
  }
  function updateFoot() {
    footName.textContent = selected ? selected.name : 'Choisis un meuble';
    footDims.textContent = selected ? (dims.get(selected.id) ?? '') : 'Double-clic sur une carte pour la placer directement';
    place.disabled = !selected;
  }
  function renderAll() { renderTabs(); renderCats(); renderGrid(); updateFoot(); }
  renderAll();

  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  return el;
}
