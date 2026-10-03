import type { Ctx } from './state';
import { h, icon } from '../ui/dom';
import { CATEGORIES, SOURCE_LABEL, libraryItems, loadProto, onProtoForgotten, type LibItem, type Source } from '../library/library';
import { deleteCreation, importCreations, onCreationsChanged } from './creations';
import { thumbnail } from '../library/thumbs';
import { HEAVY_MB, canPickFolder, corrections, hasRememberedFolder, onProfChanged, pickProfFolder, profStatus, restoreProfFolder, setCorrection } from '../library/profFolder';
import { button, toast } from '../ui/components';
import { addObject } from './objectActions';

/* Tiroir « Bibliothèque de mobilier » (maquette 04) : onglets, catégories, recherche, cartes, « Placer ». */

const fmtDims = (d: { w: number; d: number; h: number }, round = false) => {
  const cm = (x: number) => Math.round(x * 100);
  return round ? `Ø${cm(Math.max(d.w, d.d))} × ${cm(d.h)} cm` : `${cm(d.w)} × ${cm(d.d)} × ${cm(d.h)} cm`;
};

export function libraryDrawer(ctx: Ctx) {
  let tab: Source = 'base', cat = 'tout', query = '', selected: LibItem | null = null;
  const dims = new Map<string, string>();
  onProtoForgotten(id => dims.delete(id));

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
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => ctx.openAtelier() }, icon('handyman'), 'Créer un meuble')),
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
  function profBar() {
    const st = profStatus();
    const load = async (ask: boolean) => {
      const ok = ask ? await restoreProfFolder(true) : false;
      const r = ok ? profStatus() : await pickProfFolder();
      if (r) toast(`${r.count} modèle${r.count > 1 ? 's' : ''} chargé${r.count > 1 ? 's' : ''} depuis « ${r.folder ?? 'Mobilier'} »` + (r.skipped.length ? ` (${r.skipped.length} ignoré(s), trop lourd(s))` : '') + '.');
    };
    const info = st
      ? `${st.count} modèle${st.count > 1 ? 's' : ''} · ${st.source === 'script' ? 'fichier « mobilier-prof.js » lu au démarrage' : `dossier « ${st.folder ?? 'Mobilier'} »`}` + (st.skipped.length ? ` · ${st.skipped.length} ignoré(s) car trop lourd(s)` : '')
      : 'Aucun dossier chargé';
    return h('div', { class: 'lib-tabbar', style: { alignItems: 'center' } },
      canPickFolder() ? h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => void load(remembered) }, icon('folder_open'), remembered && !st ? 'Recharger le dossier du professeur' : 'Charger le dossier du professeur') : null,
      h('span', { class: 'p-help' }, info));
  }
  let remembered = false;
  void hasRememberedFolder().then(v => { remembered = v; });
  function renderGrid() {
    const bar = tab === 'moi' ? h('div', { class: 'lib-tabbar' },
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => void importCreations(ctx) }, icon('upload_file'), 'Importer d’un autre projet'))
      : tab === 'prof' ? profBar() : null;
    const list = items().filter(i => (cat === 'tout' || i.cat === cat) && (!query || i.name.toLowerCase().includes(query)));
    if (!list.length) {
      const msg = tab === 'moi' ? 'Tes meubles créés dans l’Atelier apparaîtront ici.'
        : tab === 'prof' ? 'Ton professeur dépose ses modèles .glb dans le dossier « Mobilier » à côté de l’outil : ils apparaissent ici.' : 'Aucun meuble trouvé';
      grid.replaceChildren(...[bar, h('div', { class: 'lib-empty' }, icon(query ? 'search' : 'category'), msg)].filter(Boolean) as HTMLElement[]);
      return;
    }
    grid.replaceChildren(...[bar, ...list.map(card)].filter(Boolean) as HTMLElement[]);
  }
  function card(it: LibItem) {
    const img = h('img', { alt: '', draggable: false });
    const d = h('div', { class: 'fc-d' }, dims.get(it.id) ?? '…');
    const el = h('button', { type: 'button', class: 'fc' + (selected?.id === it.id ? ' on' : ''), title: it.name, 'data-item': it.id,
      onclick: () => { selected = it; grid.querySelectorAll('.fc.on').forEach(x => x.classList.remove('on')); el.classList.add('on'); updateFoot(); },
      ondblclick: () => doPlace(it) },
      h('div', { class: 'fc-img' }, img), h('div', { class: 'fc-n' }, it.name), d,
      h('span', { class: 'fc-check' }, icon('check')),
      it.source === 'moi' && it.where === 'poste' ? h('span', { class: 'fc-badge', title: 'Créé dans un autre projet sur ce poste' }, 'Poste') : null,
      it.source === 'moi' ? h('span', { class: 'fc-actions' },
        h('span', { role: 'button', title: 'Modifier dans l’atelier', onclick: (e: MouseEvent) => { e.stopPropagation(); ctx.openAtelier(it.id); } }, icon('edit')),
        h('span', { role: 'button', title: 'Supprimer', onclick: (e: MouseEvent) => { e.stopPropagation(); void deleteCreation(ctx, it.id); } }, icon('delete'))) : null,
      it.source === 'prof' ? h('span', { class: 'fc-actions' },
        h('span', { role: 'button', title: 'Corriger la taille ou l’orientation', onclick: (e: MouseEvent) => { e.stopPropagation(); void correctProf(it); } }, icon('tune'))) : null);
    const badge = (txt: string, title: string, warn = false) => { el.querySelector('.fc-badge')?.remove(); el.append(h('span', { class: 'fc-badge' + (warn ? ' warn' : ''), title }, txt)); };
    if (it.source === 'prof') badge('Prof', 'Ajouté par le professeur');
    loadProto(it.id).then(p => {
      const round = Math.abs(p.dims.w - p.dims.d) < 0.02 && /rond|cactus|plante|vase/i.test(it.id + it.name);
      const s = fmtDims(p.dims, round); dims.set(it.id, s); d.textContent = s;
      const heavy = (it.bytes ?? 0) > HEAVY_MB * 1024 * 1024 || (p.triangles ?? 0) > 50_000;
      if (heavy) badge('Lourd', `Modèle lourd (${((it.bytes ?? 0) / 1024 / 1024).toFixed(1).replace('.', ',')} Mo, ${(p.triangles ?? 0).toLocaleString('fr-FR')} triangles) : il peut ralentir les PC du collège.`, true);
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
  onCreationsChanged(() => { if (selected && !libraryItems().some(i => i.id === selected!.id)) selected = null; if (el.isConnected) renderAll(); });
  onProfChanged(() => { if (selected && !libraryItems().some(i => i.id === selected!.id)) selected = null; if (el.isConnected) renderAll(); });

  /** Correction d'un ajout du professeur sur ce poste : hauteur réelle et modèle couché. */
  async function correctProf(it: LibItem) {
    const path = it.profPath!, cur = corrections()[path] ?? {};
    const p = await loadProto(it.id);
    const hIn = h('input', { type: 'text', inputMode: 'decimal', value: String(Math.round(p.dims.h * 100)), 'aria-label': 'Hauteur réelle' });
    hIn.addEventListener('keydown', e => e.stopPropagation());
    const up = h('input', { type: 'checkbox', checked: !!cur.upright });
    const c = await new Promise<boolean>(resolve => {
      const done = (v: boolean) => { veil.remove(); resolve(v); };
      const veil = h('div', { class: 'modal-veil' }, h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Corriger le modèle' },
        h('h2', null, `Corriger « ${it.name} »`),
        h('p', null, 'L’outil a deviné la taille du modèle. Indique sa hauteur réelle, et coche la case s’il apparaît couché. La correction vaut pour ce poste ; pour tous les postes, ajoute la hauteur à la fin du nom du fichier (ex. « ' + path.split('/').pop()!.replace(/\.glb$/i, '') + '_120cm.glb »).'),
        h('label', { class: 'nf' }, h('span', null, 'Hauteur réelle'), h('div', { class: 'nf-box' }, hIn, h('span', { class: 'nf-unit' }, 'cm'))),
        h('label', { class: 'chk' }, up, 'Le modèle est couché : le redresser'),
        h('div', { class: 'modal-btns' },
          button('Annuler', null, 'btn-ghost', () => done(false)),
          button('Taille devinée', 'restart_alt', 'btn-secondary', () => { setCorrection(path, {}); done(false); }),
          button('Appliquer', 'check', 'btn-primary', () => done(true)))));
      document.body.appendChild(veil);
    });
    if (!c) return;
    const hcm = parseFloat(hIn.value.replace(',', '.'));
    setCorrection(path, { h: Number.isFinite(hcm) && hcm > 0 ? hcm / 100 : undefined, upright: up.checked });
    toast(`« ${it.name} » corrigé sur ce poste.`);
  }

  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  /** À l'ouverture : onglet demandé (après l'atelier : « Mes créations ») et listes à jour. */
  const refresh = () => { tab = ctx.ui.s.libraryTab; cat = 'tout'; renderAll(); };
  return { el, refresh };
}
