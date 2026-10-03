import type { Ctx } from './state';
import type { ImageAsset, ImageTarget, PlacedImage, Project } from '../model/types';
import { h, icon } from '../ui/dom';
import { type Bound, alert, button, section, segmented, tiles, toast, toggle } from '../ui/components';
import { bounds, edges, uid } from '../model/geometry';
import { fmtBytes, readImageFile, MAX_IMAGE_MB } from '../library/images';
import { type Panel, makePanel } from './panels';
import { deleteImage } from './actions';

/* Images (maquette 06) : fenêtre « Ajouter une image », réglages, panneaux de l'outil « Images ».
   Les images sont visibles en 3D seulement : elles ne figurent jamais sur le plan A3. */

export const TARGETS: { value: ImageTarget; label: string; icon: string; help: string }[] = [
  { value: 'cadre', label: 'Cadre', icon: 'filter_frames', help: 'Un tableau encadré, accroché au mur.' },
  { value: 'tapisserie', label: 'Tapisserie murale', icon: 'wallpaper', help: 'Sur tout le mur (motif répété) ou sur une partie.' },
  { value: 'tapis', label: 'Tapis au sol', icon: 'texture', help: 'À plat sur le sol : tapis d’accueil, logo au sol…' },
  { value: 'vitrine', label: 'Vitrine', icon: 'storefront', help: 'Un PNG à fond transparent collé sur une vitre ou un mur (lettrage, logo).' },
];
const targetLabel = (t: ImageTarget) => TARGETS.find(x => x.value === t)!.label;

/** Réglages par défaut quand on choisit une destination. */
function defaults(t: ImageTarget): Partial<PlacedImage> {
  switch (t) {
    case 'cadre': return { size: 0.6, x: 0.5, y: 0.5, rot: 0, repeat: false };
    case 'tapisserie': return { size: 0.5, x: 0, y: 0, rot: 0, repeat: true };
    case 'tapis': return { size: 1.6, x: 0.5, y: 0.5, rot: 0, repeat: false };
    case 'vitrine': return { size: 0.8, x: 0.5, y: 0.45, rot: 0, repeat: false };
  }
}

/* ---------- Réglages partagés (fenêtre et panneau) ---------- */
interface Access { get(): PlacedImage; set(patch: Partial<PlacedImage>, live?: boolean): void; end(): void; doc(): Project }

function slider(label: string, unit: string, min: number, max: number, step: number, get: () => number, set: (v: number, live: boolean) => void, end: () => void): Bound {
  const val = h('span', { class: 'sl-v' });
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), 'aria-label': label });
  input.addEventListener('input', () => set(+input.value, true));
  input.addEventListener('change', () => { set(+input.value, false); end(); });
  const el = h('label', { class: 'sl' }, h('span', { class: 'sl-t' }, label, val), input);
  const refresh = () => { const v = get(); if (document.activeElement !== input) input.value = String(v); val.textContent = `${Math.round(v)} ${unit}`; };
  refresh();
  return { el, refresh };
}

function settings(a: Access, binds: Bound[]): HTMLElement {
  const b = <T extends Bound>(x: T) => { binds.push(x); return x.el; };
  const im = a.get(), d = a.doc();
  const wallSel = h('select', { class: 'at-select', 'aria-label': 'Mur', onchange: (e: Event) => { a.set({ wall: +(e.target as HTMLSelectElement).value }); a.end(); } },
    ...(d.floor ? edges(d.floor.points).map(e => h('option', { value: String(e.i) }, `Mur n° ${e.i + 1} · ${e.length.toFixed(2).replace('.', ',')} m`)) : []));
  binds.push({ el: wallSel, refresh: () => { wallSel.value = String(a.get().wall); } });
  const isWall = im.target !== 'tapis';
  const maxSize = im.target === 'tapis' ? 400 : im.target === 'tapisserie' ? 200 : 250;
  const rep = toggle('Répéter l’image', 'apps', () => a.get().repeat, v => { a.set({ repeat: v }); a.end(); });
  if (im.target === 'cadre') { rep.el.setAttribute('disabled', ''); rep.el.title = 'Un cadre n’est pas répété'; }
  const tiled = im.repeat;
  const side = segmented<'int' | 'ext'>([{ value: 'int', label: 'Intérieur', icon: 'chair' }, { value: 'ext', label: 'Façade (rue)', icon: 'storefront' }],
    () => a.get().side ?? 'int', v => { a.set({ side: v }); a.end(); });
  return h('div', { class: 'p-sec', style: { gap: '14px' } },
    isWall ? h('label', { class: 'tf' }, 'Sur le mur', wallSel) : null,
    isWall ? b(side) : null,
    b(slider(tiled ? 'Taille du motif' : 'Largeur', 'cm', 20, maxSize, 5, () => a.get().size * 100, (v, l) => a.set({ size: v / 100 }, l), a.end)),
    tiled ? null : b(slider(isWall ? 'Position horizontale' : 'Position gauche-droite', '%', 0, 100, 1, () => a.get().x * 100, (v, l) => a.set({ x: v / 100 }, l), a.end)),
    tiled ? null : b(slider(isWall ? 'Position verticale' : 'Position avant-arrière', '%', 0, 100, 1, () => a.get().y * 100, (v, l) => a.set({ y: v / 100 }, l), a.end)),
    b(slider('Rotation', '°', -180, 180, 5, () => a.get().rot, (v, l) => a.set({ rot: v }, l), a.end)),
    b(rep));
}

/* ---------- Aperçu (fenêtre) ---------- */
function preview(d: Project, im: PlacedImage, asset: ImageAsset | null): HTMLElement {
  const box = h('div', { class: 'pv' });
  if (!asset) { box.append(h('div', { class: 'pv-empty' }, icon('image'), 'Choisis une image')); return box; }
  const ratio = asset.h / asset.w;
  if (im.target === 'tapis') {
    const b = d.floor ? bounds(d.floor.points) : { w: 6, h: 4 };
    const floor = h('div', { class: 'pv-floor', style: { aspectRatio: `${b.w} / ${b.h}` } });
    place(floor, b.w, false);
    box.append(h('div', { class: 'pv-persp' }, floor));
    return box;
  }
  const e = d.floor ? edges(d.floor.points)[im.wall] : null;
  const L = e?.length ?? 5, H = d.walls.height;
  const wall = h('div', { class: 'pv-wall' + (im.target === 'vitrine' ? ' glassy' : ''), style: { aspectRatio: `${L} / ${H}` } });
  // Ouvertures du mur
  for (const o of d.openings.filter(o => o.wall === im.wall)) wall.append(h('div', { class: 'pv-op ' + o.type, style: {
    left: `${((o.t - o.width / 2) / L) * 100}%`, width: `${(o.width / L) * 100}%`, bottom: `${(o.sill / H) * 100}%`, height: `${(o.height / H) * 100}%` } }));
  place(wall, L, true);
  box.append(wall);
  return box;

  function place(surface: HTMLElement, W: number, fromBottom: boolean) {
    if (im.repeat) {
      Object.assign(surface.style, { backgroundImage: `url(${asset!.data})`, backgroundRepeat: 'repeat',
        backgroundSize: `${(im.size / W) * 100}% auto`, backgroundPosition: `${im.x * 100}% ${im.y * 100}%` });
      return;
    }
    const img = h('div', { class: 'pv-img' + (im.target === 'cadre' ? ' framed' : ''), style: {
      left: `${im.x * 100}%`, [fromBottom ? 'bottom' : 'top']: `${im.y * 100}%`, width: `${(im.size / W) * 100}%`, aspectRatio: `${1} / ${ratio}`,
      transform: `translate(-50%, ${fromBottom ? '50%' : '-50%'}) rotate(${im.rot}deg)`, backgroundImage: `url(${asset!.data})` } });
    surface.append(img);
  }
}

/* ---------- Fenêtre « Ajouter une image » ---------- */
export function openImageDialog(ctx: Ctx) {
  const { store, ui } = ctx;
  const d = store.doc;
  if (!d.floor) { toast('Trace d’abord le sol de la boutique.', undefined, 'warning'); return; }
  const startWall = ui.s.sel?.kind === 'wall' ? ui.s.sel.index : 0;
  let asset: ImageAsset | null = null, info = '';
  const draft: PlacedImage = { id: uid(), asset: '', target: 'cadre', wall: startWall, x: 0.5, y: 0.5, size: 0.6, rot: 0, repeat: false };
  const fileCol = h('div', { class: 'imd-col' }), whereCol = h('div', { class: 'imd-col' }), pvCol = h('div', { class: 'imd-col imd-pv' });
  const placeBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button', disabled: true, onclick: () => commit() }, icon('add_photo_alternate'), 'Placer l’image');
  const close = () => { veil.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const veil = h('div', { class: 'modal-veil' },
    h('div', { class: 'imd', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ajouter une image', 'data-testid': 'image-dialog' },
      h('div', { class: 'imd-h' }, h('h2', null, 'Ajouter une image'), h('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: 'Fermer', onclick: close }, icon('close'))),
      h('div', { class: 'imd-b' }, fileCol, whereCol, pvCol),
      h('div', { class: 'imd-f' }, button('Annuler', null, 'btn-ghost', close), placeBtn)));
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(veil);

  let error = '';
  function pick() {
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,.png,.jpg,.jpeg', style: { display: 'none' } });
    input.addEventListener('change', async () => {
      const f = input.files?.[0]; input.remove(); if (!f) return;
      try {
        const r = await readImageFile(f);
        asset = r.asset; error = '';
        info = `${fmtBytes(r.bytes)} · ${r.originalW} × ${r.originalH} px` + (r.reduced ? ` (réduite à ${r.asset.w} × ${r.asset.h} px)` : '');
      } catch (e) { error = (e as Error).message; }
      render();
    });
    document.body.appendChild(input); input.click();
  }
  const access: Access = { get: () => draft, set: p => { Object.assign(draft, p); if (p.side === 'ext') ui.set({ cutaway: false }); renderPreview(); renderSettingsValues(); }, end: () => render(), doc: () => store.doc };
  let binds: Bound[] = [];
  function renderSettingsValues() { binds.forEach(b => b.refresh()); }
  function renderPreview() { pvCol.replaceChildren(h('div', { class: 'p-sec-t' }, 'Aperçu'), preview(store.doc, draft, asset)); }
  function render() {
    fileCol.replaceChildren(h('div', { class: 'p-sec', style: { gap: '12px' } },
      h('div', { class: 'p-sec-t' }, 'Fichier'),
      asset ? h('div', { class: 'imd-file' }, h('div', { class: 'imd-thumb', style: { backgroundImage: `url(${asset.data})` } }),
        h('div', { class: 'imd-meta' }, h('b', null, asset.name), h('span', null, info)), icon('check_circle', true)) : null,
      button(asset ? 'Choisir une autre image' : 'Choisir une image', 'upload_file', asset ? 'btn-secondary' : 'btn-primary', pick),
      error ? alert('warning', error.includes('Mo') ? 'Fichier trop lourd' : 'Fichier refusé', error) : null,
      h('p', { class: 'p-help' }, `PNG ou JPG · ${MAX_IMAGE_MB} Mo maximum. Les grandes images sont réduites à 2048 px.`),
      alert('info', 'Droits des images', 'Utilise des images faites par toi (par exemple sur Canva) ou libres de droits.')));
    binds = [];
    const t = tiles(TARGETS.map(x => ({ value: x.value, label: x.label, thumb: h('div', { class: 'thumb-ic' }, icon(x.icon)) })), () => draft.target,
      v => { Object.assign(draft, { target: v }, defaults(v)); render(); }, 2);
    whereCol.replaceChildren(h('div', { class: 'p-sec-t' }, 'Où la placer ?'), t.el,
      h('p', { class: 'p-help' }, TARGETS.find(x => x.value === draft.target)!.help),
      h('div', { class: 'p-sec-t' }, 'Réglages'), settings(access, binds));
    renderPreview();
    placeBtn.disabled = !asset;
  }
  function commit() {
    if (!asset) return;
    // Même image déjà importée : on la réutilise (le fichier projet ne la stocke qu'une fois).
    const same = store.doc.assets.find(x => x.data === asset!.data);
    const a = same ?? asset, im = { ...draft, asset: a.id };
    store.update(doc => { if (!doc.assets.some(x => x.id === a.id)) doc.assets.push(a); doc.images.push(im); });
    ui.set({ view: '3d', tool: 'images', sel: { kind: 'image', id: im.id } });
    close();
    toast(`Image placée : ${targetLabel(im.target).toLowerCase()}. Elle se voit en 3D (pas sur le plan A3).`);
  }
  render();
}

/* ---------- Panneaux de l'outil « Images » ---------- */
export function imagesPanel(ctx: Ctx): Panel {
  const d = ctx.store.doc;
  const list = d.images.map(im => {
    const a = d.assets.find(x => x.id === im.asset);
    return h('button', { class: 'im-row', type: 'button', onclick: () => ctx.ui.set({ sel: { kind: 'image', id: im.id }, view: '3d' }) },
      h('span', { class: 'im-th', style: { backgroundImage: a ? `url(${a.data})` : '' } }),
      h('span', { class: 'im-t' }, h('b', null, a?.name ?? 'Image'), h('span', null, targetLabel(im.target) + (im.target !== 'tapis' ? ` · mur n° ${im.wall + 1}` : ''))),
      icon('chevron_right'));
  });
  return makePanel('image', 'Images', () => `${ctx.store.doc.images.length} image${ctx.store.doc.images.length > 1 ? 's' : ''} dans la boutique`, [
    h('p', { class: 'p-help' }, 'Cadres, tapisseries, tapis et vitrophanies à partir de tes images ', h('b', null, 'PNG ou JPG'), '.'),
    alert('info', 'Seulement en 3D', 'Les images ne sont pas imprimées sur le plan A3 (il ne montre que les murs).'),
    list.length ? section('Dans la boutique', h('div', { class: 'im-list' }, list)) : null,
  ], h('div', { class: 'pn-f' }, button('Ajouter une image', 'add_photo_alternate', 'btn-primary btn-lg', () => openImageDialog(ctx))));
}

export function imagePanel(ctx: Ctx): Panel {
  const { store, ui } = ctx;
  const id = ui.s.sel?.kind === 'image' ? ui.s.sel.id : '';
  const cur = () => store.doc.images.find(i => i.id === id)!;
  const a = store.doc.assets.find(x => x.id === cur().asset);
  const binds: Bound[] = [];
  const access: Access = {
    get: cur,
    set: (patch, live) => { if (patch.side === 'ext') ui.set({ cutaway: false }); if (live) { store.begin(); store.live(d => { Object.assign(d.images.find(i => i.id === id)!, patch); }); } else store.update(d => { Object.assign(d.images.find(i => i.id === id)!, patch); }); },
    end: () => store.end(),
    doc: () => store.doc,
  };
  const t = tiles(TARGETS.map(x => ({ value: x.value, label: x.label, thumb: h('div', { class: 'thumb-ic' }, icon(x.icon)) })), () => cur().target,
    v => store.update(d => { Object.assign(d.images.find(i => i.id === id)!, { target: v }, defaults(v)); }), 2);
  binds.push(t);
  const p = makePanel('image', a?.name ?? 'Image', () => targetLabel(cur().target), [
    section('Type', t.el),
    section('Réglages', settings(access, binds)),
  ], h('div', { class: 'pn-f two' },
    button('Dupliquer', 'content_copy', 'btn-secondary', () => {
      const c = { ...structuredClone(cur()), id: uid(), x: Math.min(1, cur().x + 0.08) };
      store.update(d => { d.images.push(c); }); ui.set({ sel: { kind: 'image', id: c.id } });
    }),
    button('Supprimer', 'delete', 'btn-danger', () => deleteImage(ctx, id))));
  const base = p.refresh;
  p.refresh = () => { if (store.doc.images.some(i => i.id === id)) { base(); binds.forEach(b => b.refresh()); } };
  p.refresh();
  return p;
}
