import type { Ctx } from './state';
import type { FloorMaterial, OpeningType, WallMaterial } from '../model/types';
import { h, icon } from '../ui/dom';
import { type Bound, alert, button, measureRow, numberField, section, segmented, swatches, tiles, toast } from '../ui/components';
import { area, edges, fmtArea, fmtM, isSimplePolygon, perimeter } from '../model/geometry';
import { MAX_SHOP_MSG, OPENING_DEFAULTS, WALL_LIMITS, clampAllOpenings, clampT, findFreeT, moveVertex, shopExtent, wallLength } from '../model/project';
import { FLOOR_LABELS, WALL_LABELS, floorTints, thumbCss, wallTints } from '../view3d/materials';
import { clearFloor, closeDraft, deleteSelection, duplicateOpening } from './actions';
import type { Plan2D } from '../view2d/plan';
import { getItem, categoryLabel, SOURCE_LABEL } from '../library/library';
import { thumbnail } from '../library/thumbs';
import { alignObjects, deleteObjects, duplicateObjects, editObjects, rotateObjects, toggleLock } from './objectActions';

/* Panneau de propriétés (à droite). Il est reconstruit quand l'outil ou la sélection change,
   et simplement rafraîchi (refresh) à chaque modification du projet. */

export const WALL_COLORS = [
  { name: 'Blanc cassé', hex: '#FCFBF9' }, { name: 'Sable', hex: '#E9E3D8' }, { name: 'Lin', hex: '#D9D2C6' }, { name: 'Rose poudré', hex: '#E8C8BC' },
  { name: 'Terracotta', hex: '#BF4E36' }, { name: 'Ocre', hex: '#D9A54A' }, { name: 'Sauge', hex: '#6E8B6B' }, { name: 'Bleu ciel', hex: '#BCD3DF' },
  { name: 'Bleu ardoise', hex: '#5B6B7A' }, { name: 'Noir', hex: '#2E2D2B' },
];
const FLOOR_COLORS = [
  { name: 'Blanc cassé', hex: '#F6F4F0' }, { name: 'Gris clair', hex: '#D6D3CD' }, { name: 'Sable', hex: '#E3D7C3' }, { name: 'Terracotta', hex: '#C97B62' },
  { name: 'Sauge', hex: '#9DB09A' }, { name: 'Bleu ardoise', hex: '#6F7E8C' }, { name: 'Noir', hex: '#3A3936' },
];

export interface Panel { el: HTMLElement; refresh: () => void }

function shell(ic: string, title: string, sub: () => string, body: (Node | null | false)[], foot?: HTMLElement): Panel & { binds: Bound[] } {
  const subEl = h('div', { class: 'pn-t2' });
  const el = h('aside', { class: 'pn', 'data-testid': 'panel' },
    h('div', { class: 'pn-h' }, h('div', { class: 'pn-ic' }, icon(ic)), h('div', { class: 'pn-t' }, h('div', { class: 'pn-t1' }, title), subEl)),
    h('div', { class: 'pn-b' }, ...body),
    foot ?? null);
  const binds: Bound[] = [];
  return { el, binds, refresh: () => { subEl.textContent = sub(); binds.forEach(b => b.refresh()); } };
}
function finish(p: Panel & { binds: Bound[] }, binds: Bound[]): Panel { p.binds.push(...binds); p.refresh(); return p; }

/* ---------- Sol ---------- */
export function floorPanel(ctx: Ctx, plan: Plan2D): Panel {
  const { store, ui } = ctx;
  const binds: Bound[] = [];
  const b = <T extends Bound>(x: T) => { binds.push(x); return x.el; };
  const floorTiles = (): Bound => tiles(
    (Object.keys(FLOOR_LABELS) as FloorMaterial[]).map(m => ({ value: m, label: FLOOR_LABELS[m], thumb: h('div', { class: 'thumb', style: { background: thumbCss('f', m, '#D6D3CD'), backgroundBlendMode: 'multiply' } }) })),
    () => store.doc.floor?.material ?? 'parquet',
    m => store.update(d => { if (d.floor) d.floor.material = m; }));

  if (!store.doc.floor) {
    // Tracé
    const libre = ui.s.floorShape === 'libre';
    const stats = () => plan.draftStats();
    const rect = { w: 10, d: 7 };
    const close = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => closeDraft(ctx) }, icon('check'), 'Fermer le sol');
    const undoPt = button('Retirer le dernier point', 'backspace', 'btn-ghost', () => ui.set({ draft: ui.s.draft.slice(0, -1) }));
    const foot = libre ? h('div', { class: 'pn-f' }, close, undoPt) : undefined;
    const lenField = numberField({ label: 'Longueur du côté suivant', unit: 'm', decimals: 2, min: 0.1, max: 100,
      get: () => stats().seg, set: l => { const q = plan.pointAtLength(l); if (q) ui.set({ draft: [...ui.s.draft, q] }); },
      title: 'Tape une longueur puis Entrée : le point suivant est posé dans la direction du curseur.', blurOnEnter: true });
    const p = shell('grid_on', 'Tracer le sol', () => libre ? `${ui.s.draft.length} point${ui.s.draft.length > 1 ? 's' : ''} posé${ui.s.draft.length > 1 ? 's' : ''}` : 'Forme rectangulaire', [
      section('Forme', b(segmented<'libre' | 'rectangle'>([{ value: 'libre', label: 'Libre', icon: 'polyline' }, { value: 'rectangle', label: 'Rectangle', icon: 'rectangle' }],
        () => ui.s.floorShape, v => ui.set({ floorShape: v, draft: [] })))),
      h('div', { class: 'mrs' },
        b(measureRow(libre ? 'Segment en cours' : 'Plus grand côté', () => fmtM(stats().seg), true)),
        b(measureRow(libre ? 'Longueur tracée' : 'Périmètre', () => fmtM(stats().total))),
        b(measureRow('Surface', () => fmtArea(stats().surface))),
        b(extentRow(() => [...ui.s.draft, ...(ui.s.cursor ? [ui.s.cursor] : [])]))),
      libre
        ? section('Au clavier', b(lenField), h('p', { class: 'p-help' }, 'Après le premier point, tape une longueur puis ', h('b', null, 'Entrée'), '.'))
        : section('Dimensions exactes',
          h('div', { class: 'g2' },
            numberField({ label: 'Largeur', unit: 'm', decimals: 2, min: 1, max: 10, get: () => rect.w, set: v => { rect.w = v; } }).el,
            numberField({ label: 'Profondeur', unit: 'm', decimals: 2, min: 1, max: 10, get: () => rect.d, set: v => { rect.d = v; } }).el),
          button('Créer ce rectangle', 'rectangle', 'btn-secondary', () => closeDraft(ctx, [{ x: 0, y: 0 }, { x: rect.w, y: 0 }, { x: rect.w, y: rect.d }, { x: 0, y: rect.d }])),
          h('p', { class: 'p-help' }, 'Ou dessine-le sur le plan : un clic pour un coin, un clic pour le coin opposé.')),
      section('Revêtement', b(floorTiles())),
    ], foot);
    const fin = finish(p, binds);
    const base = fin.refresh;
    fin.refresh = () => { base(); close.disabled = ui.s.draft.length < 3; (undoPt as HTMLButtonElement).disabled = !ui.s.draft.length; };
    fin.refresh();
    return fin;
  }

  // Sol fermé : édition
  const f = () => store.doc.floor!;
  const sel = ui.s.sel?.kind === 'vertex' ? ui.s.sel.index : -1;
  const vertexBlock = sel >= 0 ? section(`Point n° ${sel + 1}`,
    h('div', { class: 'g2' },
      b(numberField({ label: 'X', prefix: 'X', unit: 'm', decimals: 2, get: () => f().points[sel]?.x ?? 0, set: x => moveTo(x, null) })),
      b(numberField({ label: 'Y', prefix: 'Y', unit: 'm', decimals: 2, get: () => f().points[sel]?.y ?? 0, set: y => moveTo(null, y) }))),
    button('Retirer ce point', 'delete', 'btn-danger', () => deleteSelection(ctx))) : null;
  function moveTo(x: number | null, y: number | null) {
    const q = { ...f().points[sel] }; if (x !== null) q.x = x; if (y !== null) q.y = y;
    const pts = f().points.map((p, i) => i === sel ? q : p);
    if (!isSimplePolygon(pts)) { toast('Impossible : les côtés se croiseraient.', undefined, 'warning'); return; }
    if (!shopExtent(pts).ok) { toast(MAX_SHOP_MSG, undefined, 'warning'); return; }
    store.update(d => moveVertex(d, sel, q));
  }
  const p = shell('grid_on', 'Sol', () => `${f().points.length} côtés · ${fmtArea(area(f().points))}`, [
    h('div', { class: 'mrs' },
      b(measureRow('Surface', () => fmtArea(area(f().points)), true)),
      b(measureRow('Périmètre', () => fmtM(perimeter(f().points)))),
      b(extentRow(() => f().points))),
    vertexBlock ?? h('p', { class: 'p-help' }, h('b', null, 'Glisse un point'), ' pour le déplacer, clique sur un ', h('b', null, '+'), ' pour ajouter un point, puis ', h('b', null, 'Suppr'), ' pour retirer le point choisi.'),
    section('Revêtement', b(floorTiles())),
    floorTints(f().material) ? section('Couleur', b(swatches(FLOOR_COLORS, () => f().color, c => store.update(d => { d.floor!.color = c; })))) : null,
  ], h('div', { class: 'pn-f' }, button('Effacer le sol et recommencer', 'ink_eraser', 'btn-danger', () => clearFloor(ctx))));
  return finish(p, binds);
}

/* ---------- Murs ---------- */
export function wallsPanel(ctx: Ctx): Panel {
  const { store, ui } = ctx;
  const binds: Bound[] = [];
  const b = <T extends Bound>(x: T) => { binds.push(x); return x.el; };
  if (!store.doc.floor) return emptyPanel('border_outer', 'Murs', 'Les murs se créent tout seuls autour du sol. Commence par tracer le sol.', ctx);
  const sel = ui.s.sel?.kind === 'wall' ? ui.s.sel.index : -1;
  const styleOf = (i: number) => store.doc.walls.styles[i];
  const target = () => sel >= 0 ? [sel] : store.doc.walls.styles.map((_, i) => i);
  const setStyle = (patch: Partial<{ material: WallMaterial; color: string }>) => store.update(d => { for (const i of target()) Object.assign(d.walls.styles[i], patch); });
  const ref = () => styleOf(sel >= 0 ? sel : 0);
  const matTiles = tiles((Object.keys(WALL_LABELS) as WallMaterial[]).map(m => ({ value: m, label: WALL_LABELS[m], thumb: h('div', { class: 'thumb', style: { background: thumbCss('w', m, '#E9E3D8'), backgroundBlendMode: 'multiply' } }) })),
    () => ref().material, m => setStyle({ material: m }));
  const all = store.doc.walls.styles;
  const mixed = sel < 0 && all.some(s => s.material !== all[0].material || s.color !== all[0].color);
  const p = shell('border_outer', sel >= 0 ? `Mur n° ${sel + 1}` : 'Murs',
    () => sel >= 0 ? `Longueur ${fmtM(wallLength(store.doc, sel))}` : `${store.doc.walls.styles.length} murs · sans toit`, [
      section('Tous les murs', h('div', { class: 'g2' },
        b(numberField({ label: 'Hauteur', unit: 'cm', min: WALL_LIMITS.height[0] * 100, max: WALL_LIMITS.height[1] * 100, get: () => store.doc.walls.height * 100,
          set: v => store.update(d => { d.walls.height = v / 100; clampAllOpenings(d); }) })),
        b(numberField({ label: 'Épaisseur', unit: 'cm', min: WALL_LIMITS.thickness[0] * 100, max: WALL_LIMITS.thickness[1] * 100, get: () => store.doc.walls.thickness * 100,
          set: v => store.update(d => { d.walls.thickness = v / 100; }) })))),
      sel < 0 ? h('p', { class: 'p-help' }, h('b', null, 'Clique sur un mur'), ' pour changer seulement sa matière ou sa couleur. Sinon, les réglages ci-dessous s’appliquent à tous les murs.') : null,
      mixed ? alert('info', 'Les murs sont différents', 'Choisir une matière ou une couleur ici l’applique à tous les murs.') : null,
      section(sel >= 0 ? 'Matière (face intérieure)' : 'Matière de tous les murs', b(matTiles)),
      wallTints(ref().material) ? section('Couleur', b(swatches(WALL_COLORS, () => ref().color, c => setStyle({ color: c })))) : null,
    ], sel >= 0 ? h('div', { class: 'pn-f' }, button('Appliquer à tous les murs', 'format_paint', 'btn-secondary', () => {
      const s = { ...styleOf(sel) }; store.update(d => { d.walls.styles = d.walls.styles.map(() => ({ ...s })); }); toast('Style appliqué à tous les murs.');
    })) : undefined);
  const fin = finish(p, binds);
  // La couleur n'existe que pour les matières teintables : on reconstruit si besoin.
  return fin;
}

/* ---------- Portes et fenêtres ---------- */
const TYPE_ICON: Record<OpeningType, string> = { porte: 'door_front', fenetre: 'window', vitrine: 'storefront' };
export function openingsPanel(ctx: Ctx): Panel {
  const { store, ui } = ctx;
  const binds: Bound[] = [];
  const b = <T extends Bound>(x: T) => { binds.push(x); return x.el; };
  if (!store.doc.floor) return emptyPanel('door_front', 'Portes / fenêtres', 'Les ouvertures se posent sur les murs. Commence par tracer le sol.', ctx);
  const sel = ui.s.sel?.kind === 'opening' ? ui.s.sel.id : null;
  const typeOpts = (Object.keys(OPENING_DEFAULTS) as OpeningType[]).map(t => ({ value: t, label: OPENING_DEFAULTS[t].label, thumb: h('div', { class: 'thumb-ic' }, icon(TYPE_ICON[t])) }));
  if (!sel) {
    const n = store.doc.openings.length;
    const p = shell('door_front', 'Portes / fenêtres', () => `${store.doc.openings.length} ouverture${store.doc.openings.length > 1 ? 's' : ''}`, [
      section('À poser', b(tiles(typeOpts, () => ui.s.placeType, t => ui.set({ placeType: t }), 3))),
      h('p', { class: 'p-help' }, h('b', null, 'Clique sur un mur'), ' pour y poser l’ouverture choisie. Clique ensuite sur une ouverture pour la régler ou ', h('b', null, 'glisse-la'), ' le long du mur.'),
      n === 0 ? alert('info', 'Pense à la porte d’entrée !', 'Une boutique a au moins une porte, et souvent une vitrine.') : null,
    ]);
    return finish(p, binds);
  }
  const o = () => store.doc.openings.find(q => q.id === sel)!;
  const L = () => wallLength(store.doc, o().wall);
  const set = (fn: (x: import('../model/types').Opening) => void) => {
    let msg = '';
    store.update(d => {
      const x = d.openings.find(q => q.id === sel)!; fn(x);
      x.width = Math.max(0.3, Math.min(x.width, wallLength(d, x.wall) - 0.2));
      x.height = Math.max(0.3, Math.min(x.height, d.walls.height - x.sill - 0.05));
      const t = findFreeT(d, x.wall, x.width, x.t, x.id);
      if (t === null) { msg = 'Pas assez de place sur ce mur.'; return false; }
      x.t = t;
    });
    if (msg) toast(msg, undefined, 'warning');
  };
  const isDoor = () => o().type === 'porte';
  const p = shell(TYPE_ICON[o().type], OPENING_DEFAULTS[o().type].label, () => `Sur le mur n° ${o().wall + 1} · ${fmtM(L())}`, [
    section('Type', b(segmented((Object.keys(OPENING_DEFAULTS) as OpeningType[]).map(t => ({ value: t, label: OPENING_DEFAULTS[t].label })), () => o().type,
      t => { set(x => { x.type = t; x.sill = OPENING_DEFAULTS[t].sill; }); }))),
    section('Dimensions', h('div', { class: 'g2' },
      b(numberField({ label: 'Largeur', unit: 'cm', min: 30, max: 1000, get: () => o().width * 100, set: v => set(x => { x.width = v / 100; }) })),
      b(numberField({ label: 'Hauteur', unit: 'cm', min: 30, max: 600, get: () => o().height * 100, set: v => set(x => { x.height = v / 100; }) })))),
    isDoor() ? null : section('Hauteur du bas (allège)', b(numberField({ label: 'Allège', unit: 'cm', min: 0, max: 400, get: () => o().sill * 100,
      set: v => set(x => { x.sill = v / 100; }), title: 'Distance entre le sol et le bas de la fenêtre' }))),
    section('Position', b(numberField({ label: 'Distance au début du mur', unit: 'cm', min: 0, max: 10000, get: () => (o().t - o().width / 2) * 100,
      set: v => set(x => { x.t = clampT(wallLength(store.doc, x.wall), x.width, v / 100 + x.width / 2); }) })),
      h('p', { class: 'p-help' }, 'Tu peux aussi ', h('b', null, 'glisser'), ' l’ouverture le long du mur.')),
  ], h('div', { class: 'pn-f two' },
    button('Dupliquer', 'content_copy', 'btn-secondary', () => duplicateOpening(ctx, sel)),
    button('Supprimer', 'delete', 'btn-danger', () => deleteSelection(ctx))));
  return finish(p, binds);
}

export function emptyPanel(ic: string, title: string, text: string, ctx?: Ctx, soon = false): Panel {
  const body: (Node | null)[] = [h('p', { class: 'p-help' }, text)];
  if (soon) body.push(alert('info', 'Bientôt disponible', 'Cette partie arrive dans une prochaine version de l’outil.'));
  const foot = ctx && !ctx.store.doc.floor && !soon ? h('div', { class: 'pn-f' }, button('Tracer le sol', 'grid_on', 'btn-primary btn-lg', () => ctx.ui.set({ tool: 'sol', view: '2d' }))) : undefined;
  const p = shell(ic, title, () => '', body, foot);
  return finish(p, []);
}

/** Petite vérification de cohérence exportée pour les tests : nombre de murs = nombre de côtés. */
export const wallCount = (ctx: Ctx) => (ctx.store.doc.floor ? edges(ctx.store.doc.floor.points).length : 0);

/* ---------- Mobilier ---------- */
const OBJECT_COLORS = [
  { name: 'Noir', hex: '#2E2D2B' }, { name: 'Blanc cassé', hex: '#F6F4F0' }, { name: 'Chêne', hex: '#C9A97E' }, { name: 'Terracotta', hex: '#BF4E36' },
  { name: 'Sauge', hex: '#6E8B6B' }, { name: 'Sable', hex: '#D9D2C6' }, { name: 'Bleu ardoise', hex: '#5B6B7A' },
];

export function furniturePanel(ctx: Ctx): Panel {
  const n = () => ctx.store.doc.objects.length;
  const p = shell('chair', 'Mobilier', () => `${n()} objet${n() > 1 ? 's' : ''} dans la boutique`, [
    h('p', { class: 'p-help' }, 'Choisis un meuble dans la ', h('b', null, 'bibliothèque'), ', puis ', h('b', null, 'glisse-le'), ' dans la boutique. Clique sur un objet pour le régler.'),
    h('p', { class: 'p-help' }, h('b', null, 'Maj + clic'), ' : choisir plusieurs objets. Sur le plan, ', h('b', null, 'glisse dans le vide'), ' pour les entourer.'),
    h('p', { class: 'p-help' }, 'Raccourcis : ', h('b', null, 'Ctrl+C / Ctrl+V'), ' copier-coller, ', h('b', null, 'Ctrl+D'), ' dupliquer, ', h('b', null, 'R'), ' tourner, ', h('b', null, 'flèches'), ' déplacer, ', h('b', null, 'Suppr'), ' supprimer.'),
  ], h('div', { class: 'pn-f' }, button('Ouvrir la bibliothèque', 'chair', 'btn-primary btn-lg', () => ctx.ui.set({ libraryOpen: true }))));
  return finish(p, []);
}

export function objectPanel(ctx: Ctx): Panel {
  const { store, ui } = ctx;
  const binds: Bound[] = [];
  const b = <T extends Bound>(x: T) => { binds.push(x); return x.el; };
  const ids = () => (ui.s.sel?.kind === 'objects' ? ui.s.sel.ids : []);
  const objs = () => store.doc.objects.filter(o => ids().includes(o.id));
  const one = objs().length === 1 ? objs()[0].id : null;
  const o = () => store.doc.objects.find(x => x.id === one)!;
  const item = one ? getItem(o().model) : undefined;

  // Rotation (curseur avec aperçu en direct)
  const rotVal = h('span', { style: { color: 'var(--ink)' } });
  const range = h('input', { type: 'range', min: '0', max: '345', step: '15', 'aria-label': 'Rotation' });
  range.addEventListener('input', () => { store.begin(); store.live(d => { for (const x of d.objects) if (ids().includes(x.id) && !x.locked) x.rot = +range.value; }); });
  range.addEventListener('change', () => store.end());
  binds.push({ el: range, refresh: () => { const r = objs()[0]?.rot ?? 0; if (document.activeElement !== range) range.value = String(Math.round(r / 15) * 15 % 360); rotVal.textContent = `${Math.round(r)}°`; } });

  const setSize = (k: 'w' | 'd' | 'h', cm: number) => editObjects(ctx, x => {
    const v = cm / 100, f = v / x.size[k];
    if (ui.s.keepRatio) x.size = { w: x.size.w * f, d: x.size.d * f, h: x.size.h * f };
    x.size[k] = v;
    for (const kk of ['w', 'd', 'h'] as const) x.size[kk] = Math.round(x.size[kk] * 1000) / 1000;
  });
  const ratio = h('input', { type: 'checkbox', onchange: (e: Event) => ui.set({ keepRatio: (e.target as HTMLInputElement).checked }) });
  binds.push({ el: ratio, refresh: () => { ratio.checked = ui.s.keepRatio; } });

  const lockBtn = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => toggleLock(ctx) });
  binds.push({ el: lockBtn, refresh: () => { const l = objs().length > 0 && objs().every(x => x.locked); lockBtn.replaceChildren(icon(l ? 'lock' : 'lock_open'), l ? 'Déverrouiller' : 'Verrouiller'); } });

  const orig = h('button', { type: 'button', class: 'sw orig', title: 'Couleurs d’origine', 'aria-label': 'Couleurs d’origine', onclick: () => editObjects(ctx, x => { x.color = null; }) });
  const sw = swatches(OBJECT_COLORS, () => objs()[0]?.color ?? '', c => editObjects(ctx, x => { x.color = c; }));
  sw.el.prepend(orig);
  binds.push(sw, { el: orig, refresh: () => orig.classList.toggle('on', objs().every(x => !x.color)) });

  const thumb = h('div', { class: 'pn-thumb' });
  if (one) thumbnail(o().model).then(u => thumb.replaceChildren(h('img', { src: u, alt: '' }))).catch(() => { /* pas de miniature */ });
  const row = (a: string, extra: Node) => h('span', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' } }, a, extra);
  const p = shell(one ? 'chair' : 'select_all', one ? (item?.name ?? 'Objet') : `${objs().length} objets`,
    () => one ? `${categoryLabel(item?.cat ?? '')} · ${SOURCE_LABEL[item?.source ?? 'base']}` : 'Sélection multiple', [
      one ? section(row('Dimensions', h('label', { class: 'chk' }, ratio, 'Garder les proportions')),
        h('div', { class: 'g3' },
          b(numberField({ label: 'Longueur', unit: 'cm', min: 1, max: 2000, get: () => o().size.w * 100, set: v => setSize('w', v) })),
          b(numberField({ label: 'Profondeur', unit: 'cm', min: 1, max: 2000, get: () => o().size.d * 100, set: v => setSize('d', v) })),
          b(numberField({ label: 'Hauteur', unit: 'cm', min: 1, max: 2000, get: () => o().size.h * 100, set: v => setSize('h', v) })))) : null,
      one ? section('Position', h('div', { class: 'g2' },
          b(numberField({ label: 'X', prefix: 'X', unit: 'm', decimals: 2, get: () => o().x, set: v => editObjects(ctx, x => { x.x = v; }) })),
          b(numberField({ label: 'Y', prefix: 'Y', unit: 'm', decimals: 2, get: () => o().y, set: v => editObjects(ctx, x => { x.y = v; }) }))),
        b(numberField({ label: 'Hauteur au-dessus du sol', unit: 'cm', min: 0, max: 600, get: () => o().z * 100, set: v => editObjects(ctx, x => { x.z = v / 100; }),
          title: 'Pour accrocher un objet au mur ou au plafond' }))) : null,
      section(row('Rotation', rotVal),
        h('div', { class: 'rot-row' },
          h('button', { class: 'sq', type: 'button', title: '−15°', onclick: () => rotateObjects(ctx, -15) }, icon('rotate_left')),
          range,
          h('button', { class: 'sq', type: 'button', title: '+15° (touche R)', onclick: () => rotateObjects(ctx, 15) }, icon('rotate_right'))),
        b(numberField({ label: 'Angle exact (vue de dessus)', unit: '°', min: -360, max: 360, get: () => objs()[0]?.rot ?? 0,
          set: a => editObjects(ctx, x => { x.rot = ((Math.round(a * 10) / 10) % 360 + 360) % 360; }), title: 'N’importe quel angle, par exemple 37' }))),
      section('Couleur', sw.el),
      h('div', { class: 'g2' }, lockBtn, button('Aligner', 'grid_4x4', 'btn-secondary', () => alignObjects(ctx), 'Aligner sur la grille de 10 cm et sur 15°')),
    ], h('div', { class: 'pn-f two' },
      button('Dupliquer', 'content_copy', 'btn-secondary', () => duplicateObjects(ctx)),
      button('Supprimer', 'delete', 'btn-danger', () => deleteObjects(ctx))));
  if (one) p.el.querySelector('.pn-ic')!.replaceWith(thumb);
  return finish(p, binds);
}

/** Ligne « Encombrement » : largeur × profondeur du sol, en orange au-delà de 10 × 7 m. */
function extentRow(pts: () => import('../model/types').Vec2[]): Bound {
  const r = measureRow('Encombrement (max 10 × 7 m)', () => {
    const p = pts(); if (p.length < 2) return '—';
    const e = shopExtent(p);
    return `${e.w.toFixed(2).replace('.', ',')} × ${e.h.toFixed(2).replace('.', ',')} m`;
  });
  const base = r.refresh;
  r.refresh = () => { base(); const p = pts(); r.el.classList.toggle('bad', p.length >= 2 && !shopExtent(p).ok); };
  r.refresh();
  return r;
}
