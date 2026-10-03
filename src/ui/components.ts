import { h, icon } from './dom';
import { parseNum } from '../model/geometry';

/* Composants d'interface (voir maquettes/Composants.dc.html).
   Chaque composant « lié » renvoie un élément et une fonction refresh() qui relit la valeur
   sans perdre le focus ni la saisie en cours. */

export interface Bound { el: HTMLElement; refresh: () => void }

export const section = (title: string | Node, ...children: (Node | null | false)[]) =>
  h('div', { class: 'p-sec' }, h('div', { class: 'p-sec-t' }, title), ...children);

export function button(label: string, ic: string | null, cls = 'btn-secondary', onclick?: (e: MouseEvent) => void, title?: string) {
  return h('button', { class: 'btn ' + cls, onclick, title, type: 'button' }, ic ? icon(ic) : null, label);
}

export interface NumberOpts {
  label: string; unit: string; get: () => number; set: (v: number) => void;
  min?: number; max?: number; decimals?: number; title?: string; prefix?: string;
  /** Quitte le champ après Entrée (saisie « au fil de l'eau », ex. longueur du côté suivant). */
  blurOnEnter?: boolean;
}
/** Champ numérique : virgule acceptée, validé sur Entrée ou en quittant le champ, Échap annule. */
export function numberField(o: NumberOpts): Bound {
  const dec = o.decimals ?? 0;
  const fmt = (x: number) => (dec ? x.toFixed(dec).replace('.', ',') : String(Math.round(x)));
  const input = h('input', { type: 'text', inputMode: 'decimal', spellcheck: false, 'aria-label': o.label });
  const box = h('div', { class: 'nf-box' }, o.prefix ? h('span', { class: 'nf-pre' }, o.prefix) : null, input, h('span', { class: 'nf-unit' }, o.unit));
  const el = h('label', { class: 'nf', title: o.title }, o.prefix ? null : h('span', null, o.label), box);
  const refresh = () => { if (document.activeElement !== input) input.value = fmt(o.get()); input.classList.remove('bad'); };
  const commit = () => {
    const x = parseNum(input.value);
    if (!Number.isFinite(x)) { refresh(); return; }
    const c = Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, x));
    if (o.blurOnEnter || Math.abs(c - o.get()) > 1e-9) o.set(c);
    input.value = fmt(o.get());
  };
  input.addEventListener('keydown', e => {
    if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); // pendant la saisie, seuls les raccourcis Ctrl (Ctrl+S…) remontent
    if (e.key === 'Enter') { commit(); if (o.blurOnEnter) { skipBlur = true; input.blur(); } else input.select(); }
    if (e.key === 'Escape') { refresh(); input.blur(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) * (dec ? Math.pow(10, -dec) * 10 : 1);
      input.value = fmt((parseNum(input.value) || 0) + (e.key === 'ArrowUp' ? step : -step)); commit();
    }
  });
  let skipBlur = false;
  input.addEventListener('blur', () => { if (skipBlur) { skipBlur = false; refresh(); return; } if (!o.blurOnEnter) commit(); else refresh(); });
  input.addEventListener('focus', () => {
    // Si la saisie a commencé ailleurs (chiffre tapé sur le plan), on garde le caractère au lieu de tout sélectionner.
    if (input.dataset.typed) { delete input.dataset.typed; return; }
    setTimeout(() => input.select(), 0);
  });
  refresh();
  return { el, refresh };
}

export interface SegOption<T> { value: T; label: string; icon?: string }
export function segmented<T>(opts: SegOption<T>[], get: () => T, set: (v: T) => void, cls = ''): Bound {
  const btns = opts.map(op => h('button', { type: 'button', class: 'seg-b', onclick: () => set(op.value) }, op.icon ? icon(op.icon) : null, op.label));
  const el = h('div', { class: 'seg ' + cls, style: { gridTemplateColumns: `repeat(${opts.length}, minmax(0, 1fr))` } }, btns);
  const refresh = () => btns.forEach((b, i) => b.classList.toggle('on', opts[i].value === get()));
  refresh();
  return { el, refresh };
}

export function toggle(label: string, ic: string, get: () => boolean, set: (v: boolean) => void): Bound {
  const knob = h('span', { class: 'tg-track' }, h('span', { class: 'tg-knob' }));
  const el = h('button', { type: 'button', class: 'tg', onclick: () => set(!get()) }, icon(ic), label, knob);
  const refresh = () => el.classList.toggle('on', get());
  refresh();
  return { el, refresh };
}

export interface Swatch { name: string; hex: string }
/* Couleurs choisies avec la palette, gardées sur ce poste pour être réutilisées. */
const RECENT_KEY = 'cs3d-couleurs', RECENT_MAX = 6;
const recentColors = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
function rememberColor(hex: string) {
  const list = [hex, ...recentColors().filter(c => c.toLowerCase() !== hex.toLowerCase())].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* stockage bloqué */ }
  window.dispatchEvent(new Event('cs3d-couleurs'));
}

/**
 * Pastilles de couleur, suivies des couleurs récentes et de « Autre couleur… » : la palette du navigateur
 * (nuancier, pipette, code exact #RRGGBB), disponible hors ligne.
 */
export function swatches(list: Swatch[], get: () => string, set: (hex: string) => void, cls = ''): Bound {
  const btns = list.map(s => h('button', { type: 'button', class: 'sw', title: s.name, 'aria-label': s.name, style: { background: s.hex }, onclick: () => set(s.hex) }));
  const recentBox = h('span', { class: 'sws-recent' });
  const picker = h('input', { type: 'color', class: 'sw-input', 'aria-label': 'Autre couleur', tabIndex: -1 });
  picker.addEventListener('change', () => { const hex = picker.value.toUpperCase(); rememberColor(hex); set(hex); });
  const custom = h('button', { type: 'button', class: 'sw sw-custom', title: 'Autre couleur… (palette, code exact)', 'aria-label': 'Autre couleur…',
    onclick: () => { const c = get(); if (/^#[0-9a-f]{6}$/i.test(c)) picker.value = c.toLowerCase(); picker.click(); } }, icon('add'));
  const el = h('div', { class: 'sws ' + cls }, btns, recentBox, h('span', { class: 'sw-wrap' }, custom, picker));
  const isPreset = (c: string) => list.some(s => s.hex.toLowerCase() === c.toLowerCase());
  const renderRecent = () => recentBox.replaceChildren(...recentColors().filter(c => !isPreset(c)).map(c =>
    h('button', { type: 'button', class: 'sw sw-recent', title: `Couleur récente ${c}`, 'aria-label': `Couleur ${c}`, style: { background: c }, onclick: () => set(c) })));
  const refresh = () => {
    const cur = (get() || '').toLowerCase();
    btns.forEach((b, i) => b.classList.toggle('on', list[i].hex.toLowerCase() === cur));
    recentBox.querySelectorAll<HTMLElement>('.sw').forEach(b => b.classList.toggle('on', (b.title.split(' ').pop() ?? '').toLowerCase() === cur));
    // Couleur actuelle hors nuancier et hors couleurs récentes : la pastille « Autre » la montre.
    const other = /^#[0-9a-f]{6}$/.test(cur) && !isPreset(cur) && !recentColors().some(c => c.toLowerCase() === cur);
    custom.classList.toggle('on', other);
    custom.style.background = other ? cur : '';
  };
  window.addEventListener('cs3d-couleurs', () => { if (el.isConnected) { renderRecent(); refresh(); } });
  renderRecent(); refresh();
  return { el, refresh };
}

/** Grille de vignettes (revêtements, types d'ouverture…). */
export function tiles<T>(opts: { value: T; label: string; thumb: HTMLElement }[], get: () => T, set: (v: T) => void, cols = 2): Bound {
  const btns = opts.map(op => h('button', { type: 'button', class: 'tile', onclick: () => set(op.value) }, op.thumb, h('span', null, op.label)));
  const el = h('div', { class: 'tiles', style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } }, btns);
  const refresh = () => btns.forEach((b, i) => b.classList.toggle('on', opts[i].value === get()));
  refresh();
  return { el, refresh };
}

export function alert(kind: 'warning' | 'success' | 'info', title: string, detail?: string) {
  const ic = kind === 'warning' ? 'warning' : kind === 'success' ? 'check_circle' : 'info';
  return h('div', { class: 'alert alert-' + kind }, icon(ic, true), h('div', { class: 'alert-txt' }, h('b', null, title), detail ? h('span', null, detail) : null));
}

/** Ligne de mesure (libellé à gauche, valeur à droite). */
export function measureRow(label: string, get: () => string, hl = false): Bound {
  const val = h('span', { class: 'mr-v' });
  const el = h('div', { class: 'mr' + (hl ? ' hl' : '') }, h('span', { class: 'mr-k' }, label), val);
  const refresh = () => { val.textContent = get(); };
  refresh();
  return { el, refresh };
}

let toastTimer = 0;
/** Message éphémère en bas de l'écran, avec action facultative (ex. « Annuler »). */
export function toast(msg: string, action?: { label: string; run: () => void }, kind: 'info' | 'warning' = 'info') {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, icon(kind === 'warning' ? 'warning' : 'info', kind === 'warning'), h('span', null, msg),
    action ? h('button', { type: 'button', onclick: () => { action.run(); t.remove(); } }, action.label) : null);
  document.body.appendChild(t);
  toastTimer = window.setTimeout(() => t.remove(), action ? 5000 : 3200);
}

/** Fenêtre de choix (Échap ou clic sur le voile = première option « discrète », ou null). */
export function choose<T extends string>(title: string, text: string, buttons: { label: string; value: T; cls?: string; icon?: string }[]): Promise<T | null> {
  return new Promise(resolve => {
    const done = (v: T | null) => { veil.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    const veil = h('div', { class: 'modal-veil', onclick: (e: MouseEvent) => { if (e.target === veil) done(null); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', null, title), h('p', null, text),
        h('div', { class: 'modal-btns' }, buttons.map(b => button(b.label, b.icon ?? null, b.cls ?? 'btn-secondary', () => done(b.value))))));
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(veil);
    (veil.querySelector('.btn-primary') as HTMLElement | null)?.focus();
  });
}
