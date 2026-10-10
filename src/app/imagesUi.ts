import type { Ctx } from './state';
import type { ImageAsset, ImageTarget, PlacedImage, Project } from '../model/types';
import { h, icon } from '../ui/dom';
import { type Bound, alert, button, section, segmented, tiles, toast, toggle } from '../ui/components';
import { add, bounds, mul, offsetPolygon, uid } from '../model/geometry';
import { isPartition, wallName, wallSegs, wallShort } from '../model/project';
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

/* ---------- Choix du mur sur un mini-plan ---------- */
/** Plan de la boutique vu de dessus : un clic sur un mur ou une cloison le choisit. La face décorée est soulignée. */
function wallPicker(a: Access): Bound {
  const box = h('div', { class: 'wp', role: 'group', 'aria-label': 'Choisir le mur' });
  const cap = h('div', { class: 'wp-t' });
  box.addEventListener('click', e => {
    const g = (e.target as Element).closest('[data-wall]'); if (!g) return;
    const w = +(g.getAttribute('data-wall') as string);
    if (w !== a.get().wall) { a.set({ wall: w }); a.end(); }
  });
  box.addEventListener('keydown', e => {
    const g = (e.target as Element).closest('[data-wall]');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); (g as SVGElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  const refresh = () => {
    const d = a.doc(); if (!d.floor) return;
    const im = a.get(), S = wallSegs(d), T = d.walls.thickness;
    const b = bounds(offsetPolygon(d.floor.points, T)), m = 0.8;
    const P = (q: { x: number; y: number }) => `${q.x.toFixed(3)} ${q.y.toFixed(3)}`;
    const poly = (pts: { x: number; y: number }[]) => 'M' + pts.map(P).join('L') + 'Z';
    const o: string[] = [`<path d="${poly(d.floor.points)}" fill="#EFE9DF"/>`];
    for (const w of S) {
      const on = w.i === im.wall, rect = [w.a, w.b, add(w.b, mul(w.n, w.T)), add(w.a, mul(w.n, w.T))];
      const mid = add(add(w.a, mul(w.u, w.length / 2)), mul(w.n, w.part >= 0 ? w.T / 2 : -0.62));
      const name = wallName(d, w.i);
      o.push(`<g data-wall="${w.i}" role="button" tabindex="0" aria-label="${name.charAt(0).toUpperCase() + name.slice(1)}" aria-pressed="${on}" class="wp-w${on ? ' on' : ''}">`
        + `<path d="M${P(add(w.a, mul(w.n, w.T / 2)))}L${P(add(w.b, mul(w.n, w.T / 2)))}" class="wp-hit"/>`
        + `<path d="${poly(rect)}" class="wp-r"/>`
        + `<circle cx="${mid.x.toFixed(3)}" cy="${mid.y.toFixed(3)}" r="0.46" class="wp-n"/>`
        + `<text x="${mid.x.toFixed(3)}" y="${(mid.y + 0.01).toFixed(3)}">${wallShort(d, w.i)}</text></g>`);
      if (on) { // face décorée : intérieur (côté 1) ou façade (côté 2)
        const s = im.side === 'ext' ? w.T + 0.16 : -0.16;
        o.push(`<path d="M${P(add(w.a, mul(w.n, s)))}L${P(add(w.b, mul(w.n, s)))}" class="wp-face"/>`);
      }
    }
    box.innerHTML = `<svg viewBox="${(b.x0 - m).toFixed(2)} ${(b.y0 - m).toFixed(2)} ${(b.w + 2 * m).toFixed(2)} ${(b.h + 2 * m).toFixed(2)}" preserveAspectRatio="xMidYMid meet">${o.join('')}</svg>`;
    const w = S[im.wall];
    const part = isPartition(d, im.wall), face = im.side === 'ext' ? (part ? 'côté 2' : 'façade (rue)') : (part ? 'côté 1' : 'intérieur');
    cap.replaceChildren(h('b', null, wallName(d, im.wall).replace(/^./, c => c.toUpperCase())), w ? ` · ${w.length.toFixed(2).replace('.', ',')} m · ${face}` : '');
  };
  refresh();
  return { el: h('div', { class: 'wp-wrap' }, box, cap), refresh };
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
  const picker = wallPicker(a);
  binds.push(picker);
  const isWall = im.target !== 'tapis';
  const maxSize = im.target === 'tapis' ? 400 : im.target === 'tapisserie' ? 200 : 250;
  const rep = toggle('Répéter l’image', 'apps', () => a.get().repeat, v => { a.set({ repeat: v }); a.end(); });
  if (im.target === 'cadre') { rep.el.setAttribute('disabled', ''); rep.el.title = 'Un cadre n’est pas répété'; }
  const tiled = im.repeat;
  // Sur une cloison, les deux faces sont à l'intérieur : côté 1 et côté 2.
  const side = segmented<'int' | 'ext'>(isPartition(d, im.wall) ? [{ value: 'int', label: 'Côté 1' }, { value: 'ext', label: 'Côté 2' }]
    : [{ value: 'int', label: 'Intérieur', icon: 'chair' }, { value: 'ext', label: 'Façade (rue)', icon: 'storefront' }],
    () => a.get().side ?? 'int', v => { a.set({ side: v }); a.end(); });
  return h('div', { class: 'p-sec', style: { gap: '14px' } },
    isWall ? h('div', { class: 'tf' }, 'Sur quel mur ? Clique sur le plan', picker.el) : null,
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
  const e = wallSegs(d)[im.wall];
  const L = e?.length ?? 5, H = e?.H ?? d.walls.height;
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
  if (!d.floor) { toast('Trace d’abord la surface de la boutique.', undefined, 'warning'); return; }
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
    ctx.showImage(im.id); // la caméra se place face à l'image
    toast(`Image placée : ${targetLabel(im.target).toLowerCase()}. Elle se voit en 3D (pas sur le plan A3).`);
  }
  render();
}

/* ---------- Panneaux de l'outil « Images » ---------- */
/** « Ajouter une image », ou « … sur le mur n° 3 » si un mur est choisi sur le plan. */
const selWallLabel = (ctx: Ctx) => (ctx.ui.s.sel?.kind === 'wall' ? `Ajouter une image sur le ${wallName(ctx.store.doc, ctx.ui.s.sel.index).replace('cloison', 'la cloison').replace('le la ', 'la ')}` : 'Ajouter une image');

export function imagesPanel(ctx: Ctx): Panel {
  const d = ctx.store.doc;
  const list = d.images.map(im => {
    const a = d.assets.find(x => x.id === im.asset);
    return h('button', { class: 'im-row', type: 'button', onclick: () => { ctx.ui.set({ sel: { kind: 'image', id: im.id }, view: '3d' }); ctx.showImage(im.id); } },
      h('span', { class: 'im-th', style: { backgroundImage: a ? `url(${a.data})` : '' } }),
      h('span', { class: 'im-t' }, h('b', null, a?.name ?? 'Image'), h('span', null, targetLabel(im.target) + (im.target !== 'tapis' ? ` · ${wallName(d, im.wall)}` : ''))),
      icon('chevron_right'));
  });
  return makePanel('image', 'Images', () => `${ctx.store.doc.images.length} image${ctx.store.doc.images.length > 1 ? 's' : ''} dans la boutique`, [
    h('p', { class: 'p-help' }, 'Cadres, tapisseries, tapis et vitrophanies à partir de tes images ', h('b', null, 'PNG ou JPG'), '.'),
    alert('info', 'Seulement en 3D', 'Les images ne sont pas imprimées sur le plan A3 (il ne montre que les murs).'),
    list.length ? section('Dans la boutique', h('div', { class: 'im-list' }, list)) : null,
    h('p', { class: 'p-help' }, 'Sur le ', h('b', null, 'Plan 2D'), ', chaque image est un repère coloré le long de son mur. Clique sur un mur pour y ajouter une image.'),
  ], h('div', { class: 'pn-f' }, button(selWallLabel(ctx), 'add_photo_alternate', 'btn-primary btn-lg', () => openImageDialog(ctx))));
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
    button('Voir l’image en 3D', 'visibility', 'btn-secondary', () => ctx.showImage(id), 'La caméra se place face à l’image, qui est entourée en orange'),
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
