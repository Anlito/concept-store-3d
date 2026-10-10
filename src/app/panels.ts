import type { Ctx } from './state';
import type { FloorMaterial, OpeningType, WallMaterial, WallStyle } from '../model/types';
import { h, icon } from '../ui/dom';
import { type Bound, alert, button, measureRow, numberField, section, segmented, swatches, tiles, toast } from '../ui/components';
import { add, area, dist, edges, fmtArea, fmtM, isSimplePolygon, mul, norm, perimeter, sub } from '../model/geometry';
import { DEFAULT_OUT, MAX_SHOP_MSG, MIN_PARTITION, OPENING_DEFAULTS, OPENING_STYLES, openingStyle, WALL_LIMITS, clampAllOpenings, clampT, contourCount, findFreeT, insideFloor, isPartition, moveVertex, shopExtent, wallHeight, wallLength, wallName, wallSegs } from '../model/project';
import { FLOOR_LABELS, WALL_LABELS, floorTints, thumbCss, wallTints } from '../view3d/materials';
import { type FloorLook, type WallLook, clearRoomStyles, floorOfRoom, panStyleOf, pieceAt, rooms, roomStyles, setPanStyle, setRoomStyle, wallLookOf } from '../model/rooms';
import { clearFloor, closeDraft, deleteSelection, duplicateOpening, partitionByLength, startPartitions, stopPartitions } from './actions';
import type { Plan2D } from '../view2d/plan';
import { getItem, categoryLabel, SOURCE_LABEL } from '../library/library';
import { thumbnail } from '../library/thumbs';
import { FRAME_COLORS, styleThumb, swingThumb } from './openingStyles';
import { alignObjects, deleteObjects, duplicateObjects, editObjects, rotateObjects, toggleLock } from './objectActions';

/* Panneau de propriétés (à droite). Il est reconstruit quand l'outil ou la sélection change,
   et simplement rafraîchi (refresh) à chaque modification du projet. */

export const WALL_COLORS = [
  { name: 'Blanc cassé', hex: '#FCFBF9' }, { name: 'Sable', hex: '#E9E3D8' }, { name: 'Lin', hex: '#D9D2C6' }, { name: 'Rose poudré', hex: '#E8C8BC' },
  { name: 'Terracotta', hex: '#BF4E36' }, { name: 'Ocre', hex: '#D9A54A' }, { name: 'Sauge', hex: '#6E8B6B' }, { name: 'Bleu ciel', hex: '#BCD3DF' },
  { name: 'Bleu ardoise', hex: '#5B6B7A' }, { name: 'Noir', hex: '#2E2D2B' },
  { name: 'Vert sapin', hex: '#3F5E4A' }, { name: 'Bleu nuit', hex: '#2F3E57' }, { name: 'Anthracite', hex: '#45474A' },
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

  if (!store.doc.floor) {
    // Tracé
    const libre = ui.s.floorShape === 'libre';
    const stats = () => plan.draftStats();
    const rect = { w: 10, d: 7 };
    const close = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => closeDraft(ctx) }, icon('check'), 'Fermer la surface');
    const undoPt = button('Retirer le dernier point', 'backspace', 'btn-ghost', () => ui.set({ draft: ui.s.draft.slice(0, -1) }));
    const foot = libre ? h('div', { class: 'pn-f' }, close, undoPt) : undefined;
    const lenField = numberField({ label: 'Longueur du côté suivant', unit: 'm', decimals: 2, min: 0.1, max: 100,
      get: () => stats().seg, set: l => { const q = plan.pointAtLength(l); if (q) ui.set({ draft: [...ui.s.draft, q] }); },
      title: 'Tape une longueur puis Entrée : le point suivant est posé dans la direction du curseur.', blurOnEnter: true });
    const p = shell('grid_on', 'Tracer la surface', () => libre ? `${ui.s.draft.length} point${ui.s.draft.length > 1 ? 's' : ''} posé${ui.s.draft.length > 1 ? 's' : ''}` : 'Forme rectangulaire', [
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
    ], foot);
    const fin = finish(p, binds);
    const base = fin.refresh;
    fin.refresh = () => { base(); close.disabled = ui.s.draft.length < 3; (undoPt as HTMLButtonElement).disabled = !ui.s.draft.length; };
    fin.refresh();
    return fin;
  }

  // Surface fermée : édition (et cloisons, qu'on trace aussi depuis cet outil)
  if (ui.s.partDraw) return partitionDrawPanel(ctx);
  if (ui.s.sel?.kind === 'wall' && ui.s.sel.index >= contourCount(store.doc)) return partitionPanel(ctx, ui.s.sel.index);
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
  const p = shell('grid_on', 'Surface', () => `${f().points.length} côtés · ${fmtArea(area(f().points))}`, [
    h('div', { class: 'mrs' },
      b(measureRow('Surface', () => fmtArea(area(f().points)), true)),
      b(measureRow('Périmètre', () => fmtM(perimeter(f().points)))),
      b(extentRow(() => f().points))),
    vertexBlock ?? h('p', { class: 'p-help' }, h('b', null, 'Glisse un point'), ' pour le déplacer, clique sur un ', h('b', null, '+'), ' pour ajouter un point, puis ', h('b', null, 'Suppr'), ' pour retirer le point choisi.'),
    partitionsCard(ctx),
    section('Murs', h('div', { class: 'g2' },
      b(numberField({ label: 'Hauteur', unit: 'cm', min: WALL_LIMITS.height[0] * 100, max: WALL_LIMITS.height[1] * 100, get: () => store.doc.walls.height * 100,
        set: v => store.update(d => { d.walls.height = v / 100; clampAllOpenings(d); }) })),
      b(numberField({ label: 'Épaisseur', unit: 'cm', min: WALL_LIMITS.thickness[0] * 100, max: WALL_LIMITS.thickness[1] * 100, get: () => store.doc.walls.thickness * 100,
        set: v => store.update(d => { d.walls.thickness = v / 100; }) }))),
      h('p', { class: 'p-help' }, 'Les revêtements se choisissent ensuite avec les outils ', h('b', null, 'Sol'), ' et ', h('b', null, 'Murs'), ', pièce par pièce.')),
  ], h('div', { class: 'pn-f' }, button('Effacer la surface et recommencer', 'ink_eraser', 'btn-danger', () => clearFloor(ctx))));
  return finish(p, binds);
}

/* ---------- Murs ---------- */
export function wallsPanel(ctx: Ctx): Panel {
  const { store, ui } = ctx;
  const binds: Bound[] = [];
  const b = <T extends Bound>(x: T) => { binds.push(x); return x.el; };
  if (!store.doc.floor) return emptyPanel('border_outer', 'Murs', 'Les murs se créent tout seuls autour de la surface. Commence par tracer la surface.', ctx);
  // Face travaillée : intérieur (les murs de chaque pièce), ou extérieur (façade, pour attirer le client).
  const ext = ui.s.wallFace === 'ext';
  const n = contourCount(store.doc), rs = rooms(store.doc);
  const room = !ext && ui.s.sel?.kind === 'room' && ui.s.sel.index < rs.length ? ui.s.sel.index : -1;
  const wall = ext && ui.s.sel?.kind === 'wall' && ui.s.sel.index < n ? ui.s.sel.index : -1;
  const face = segmented<'int' | 'ext'>([{ value: 'int', label: 'Intérieur', icon: 'chair' }, { value: 'ext', label: 'Façade', icon: 'storefront' }],
    () => ui.s.wallFace, v => ui.set({ wallFace: v, sel: null, ...(v === 'ext' ? { cutaway: false } : {}) }));
  const matTiles = (get: () => WallMaterial, set: (m: WallMaterial) => void) => b(tiles((Object.keys(WALL_LABELS) as WallMaterial[]).map(m => ({ value: m, label: WALL_LABELS[m], thumb: h('div', { class: 'thumb', style: { background: thumbCss('w', m, '#E9E3D8'), backgroundBlendMode: 'multiply' } }) })), get, set));

  if (ext) {
    // Façade : un mur du contour à la fois, ou tous.
    const target = () => (wall >= 0 ? [wall] : store.doc.walls.styles.map((_, i) => i));
    const ref = () => store.doc.walls.styles[wall >= 0 ? wall : 0];
    const mat = () => ref().outMaterial ?? DEFAULT_OUT.material, col = () => ref().outColor ?? DEFAULT_OUT.color;
    const set = (patch: Partial<{ material: WallMaterial; color: string }>) => store.update(d => {
      for (const i of target()) { const st = d.walls.styles[i]; if (patch.material) st.outMaterial = patch.material; if (patch.color) st.outColor = patch.color; }
    });
    const all = store.doc.walls.styles, key = (s: WallStyle) => (s.outMaterial ?? DEFAULT_OUT.material) + (s.outColor ?? DEFAULT_OUT.color);
    const p = shell('storefront', wall >= 0 ? `Façade · mur n° ${wall + 1}` : 'Façade', () => (wall >= 0 ? `Longueur ${fmtM(wallLength(store.doc, wall))}` : `${n} murs côté rue`), [
      section('Face à décorer', b(face)),
      h('p', { class: 'p-help' }, 'La façade, c’est ce que voit le client depuis la rue. ', h('b', null, 'Clique sur un mur'), ' pour décorer seulement sa façade ; le bouton ', h('b', null, 'Façade'), ' de la vue 3D place la caméra devant.'),
      wall < 0 && all.some(s => key(s) !== key(all[0])) ? alert('info', 'Les façades sont différentes', 'Choisir une matière ou une couleur ici l’applique à toute la façade.') : null,
      section(wall >= 0 ? 'Matière de ce mur' : 'Matière de toute la façade', matTiles(mat, m => set({ material: m }))),
      wallTints(mat()) ? section('Couleur', b(swatches(WALL_COLORS, col, c => set({ color: c })))) : null,
    ], wall >= 0 ? h('div', { class: 'pn-f' }, button('Appliquer à toute la façade', 'format_paint', 'btn-secondary', () => {
      const s = store.doc.walls.styles[wall];
      store.update(d => { for (const st of d.walls.styles) { st.outMaterial = s.outMaterial; st.outColor = s.outColor; } }); toast('Façade appliquée à tous les murs.');
    })) : undefined);
    return finish(p, binds);
  }

  // Intérieur, un pan de mur : la face d'un mur entre deux cloisons, ou un côté de cloison.
  if (ui.s.sel?.kind === 'pan') {
    const sp = ui.s.sel, seg = () => wallSegs(store.doc)[sp.wall], pc = () => pieceAt(store.doc, seg(), sp.side, sp.u);
    const look = () => wallLookOf(store.doc, seg(), sp.side, pc());
    const own = () => !!panStyleOf(store.doc, seg(), sp.side, pc().u0, pc().u1);
    const set = (patch: Partial<WallLook>) => store.update(d => { const e2 = wallSegs(d)[sp.wall]; setPanStyle(d, e2, sp.side, pieceAt(d, e2, sp.side, sp.u), { ...look(), ...patch }); });
    const r = pc()?.room ?? -1, isPart = seg().part >= 0;
    const where = isPart ? `Cloison n° ${seg().part + 1} · côté ${sp.side === 'ext' ? 2 : 1}` : `Mur n° ${sp.wall + 1}`;
    const p = shell('border_outer', 'Pan de mur', () => `${where} · ${fmtM((pc()?.u1 ?? 0) - (pc()?.u0 ?? 0))}${r >= 0 ? ` · pièce ${r + 1}` : ''}`, [
      section('Face à décorer', b(face)),
      h('p', { class: 'p-help' }, 'Ce revêtement va seulement sur ', h('b', null, 'ce pan de mur'), ' (en orange sur le plan et en 3D).'),
      r >= 0 ? button('Tous les murs de la pièce', 'select_all', 'btn-ghost', () => ui.set({ sel: { kind: 'room', index: r } })) : null,
      section('Matière de ce pan', matTiles(() => look().material, m => set({ material: m }))),
      wallTints(look().material) ? section('Couleur', b(swatches(WALL_COLORS, () => look().color, c => set({ color: c })))) : null,
    ], own() ? h('div', { class: 'pn-f' }, button('Comme les autres murs de la pièce', 'restart_alt', 'btn-secondary', () => {
      store.update(d => { const e2 = wallSegs(d)[sp.wall]; setPanStyle(d, e2, sp.side, pieceAt(d, e2, sp.side, sp.u), null); });
    })) : undefined);
    return finish(p, binds);
  }

  // Intérieur : les murs d'une pièce (faces du contour et côtés des cloisons qui la bordent), ou tous.
  const look = (): WallLook => {
    if (room >= 0) return roomStyles(store.doc)[room]?.wall ?? { material: store.doc.walls.styles[0].material, color: store.doc.walls.styles[0].color };
    const st = store.doc.walls.styles[0]; return { material: st.material, color: st.color };
  };
  const set = (patch: Partial<WallLook>) => store.update(d => {
    if (room >= 0) { setRoomStyle(d, room, { wall: { ...look(), ...patch } }); return; }
    // Tous les murs : murs du contour, deux côtés des cloisons, et plus de revêtement propre aux pièces.
    for (const st of d.walls.styles) Object.assign(st, patch);
    for (const c of d.partitions) { Object.assign(c.style, patch); if (patch.material) c.style.outMaterial = patch.material; if (patch.color) c.style.outColor = patch.color; }
    clearRoomStyles(d, 'wall'); d.pans = [];
  });
  const mixed = room < 0 && ((store.doc.rooms ?? []).some(st => st.wall) || !!store.doc.pans?.length);
  const p = shell('border_outer', room >= 0 ? `Murs de la pièce n° ${room + 1}` : 'Murs', () => (room >= 0 ? `Pièce de ${fmtArea(rs[room].area)}` : `${rs.length} pièce${rs.length > 1 ? 's' : ''} · sans toit`), [
    section('Face à décorer', b(face)),
    room >= 0 ? button('Tous les murs', 'arrow_back', 'btn-ghost', () => ui.set({ sel: null }))
      : h('p', { class: 'p-help' }, rs.length > 1
        ? [h('b', null, 'Clique dans une pièce'), ' pour décorer tous ses murs, ou ', h('b', null, 'sur un mur'), ' pour ce pan seulement (plan ou 3D). Sinon, le choix s’applique à tous les murs.']
        : ['Le choix s’applique à tous les murs. ', h('b', null, 'Clique sur un mur'), ' pour décorer ce pan seulement. Pour des pièces, trace des ', h('b', null, 'cloisons'), ' avec l’outil ', h('b', null, 'Surface'), '.']),
    mixed ? alert('info', 'Les pièces sont différentes', 'Choisir une matière ou une couleur ici l’applique aux murs de toutes les pièces.') : null,
    section(room >= 0 ? 'Matière des murs de la pièce' : 'Matière de tous les murs', matTiles(() => look().material, m => set({ material: m }))),
    wallTints(look().material) ? section('Couleur', b(swatches(WALL_COLORS, () => look().color, c => set({ color: c })))) : null,
  ], room >= 0 ? h('div', { class: 'pn-f' }, button('Appliquer à toutes les pièces', 'format_paint', 'btn-secondary', () => {
    const l = look(); store.update(d => {
      for (const st of d.walls.styles) Object.assign(st, l);
      for (const c of d.partitions) Object.assign(c.style, l, { outMaterial: l.material, outColor: l.color });
      clearRoomStyles(d, 'wall'); d.pans = [];
    }); ui.set({ sel: null }); toast('Murs appliqués à toutes les pièces.');
  })) : undefined);
  return finish(p, binds);
}

/* ---------- Sol (revêtement, pièce par pièce) ---------- */
export function coveringPanel(ctx: Ctx): Panel {
  const { store, ui } = ctx;
  const binds: Bound[] = [];
  const b = <T extends Bound>(x: T) => { binds.push(x); return x.el; };
  if (!store.doc.floor) return emptyPanel('grid_view', 'Sol', 'Le revêtement se pose sur la surface de la boutique. Commence par tracer la surface.', ctx);
  const rs = rooms(store.doc);
  const room = ui.s.sel?.kind === 'room' && ui.s.sel.index < rs.length ? ui.s.sel.index : -1;
  const look = (): FloorLook => (room >= 0 ? floorOfRoom(store.doc, room) : { material: store.doc.floor!.material, color: store.doc.floor!.color });
  const set = (patch: Partial<FloorLook>) => store.update(d => {
    if (room >= 0) setRoomStyle(d, room, { floor: { ...look(), ...patch } });
    else { Object.assign(d.floor!, patch); clearRoomStyles(d, 'floor'); }
  });
  const list = room < 0 && rs.length > 1 ? section('Les pièces', h('div', { class: 'room-list' }, ...rs.map((r, i) => {
    const l = floorOfRoom(store.doc, i);
    return h('button', { class: 'room-row', type: 'button', onclick: () => ui.set({ sel: { kind: 'room', index: i } }) },
      h('span', { class: 'room-n' }, String(i + 1)), h('span', { class: 'room-t' }, h('b', null, `Pièce n° ${i + 1}`), h('span', null, `${fmtArea(r.area)} · ${FLOOR_LABELS[l.material]}`)), icon('chevron_right'));
  }))) : null;
  const mixed = room < 0 && (store.doc.rooms ?? []).some(st => st.floor);
  const p = shell('grid_view', room >= 0 ? `Sol de la pièce n° ${room + 1}` : 'Sol', () => (room >= 0 ? `Pièce de ${fmtArea(rs[room].area)}` : `${rs.length} pièce${rs.length > 1 ? 's' : ''} · ${fmtArea(area(store.doc.floor!.points))}`), [
    room >= 0 ? button('Toutes les pièces', 'arrow_back', 'btn-ghost', () => ui.set({ sel: null }))
      : h('p', { class: 'p-help' }, rs.length > 1
        ? [h('b', null, 'Clique dans une pièce'), ' (sur le plan ou en 3D) pour lui donner son propre sol. Sinon, le choix s’applique à toute la boutique.']
        : ['Le choix s’applique à toute la boutique. Pour un sol différent dans chaque pièce, trace des ', h('b', null, 'cloisons'), ' avec l’outil ', h('b', null, 'Surface'), '.']),
    mixed ? alert('info', 'Les pièces sont différentes', 'Choisir un revêtement ici l’applique à toutes les pièces.') : null,
    section(room >= 0 ? 'Revêtement de la pièce' : 'Revêtement de toute la boutique', b(tiles(
      (Object.keys(FLOOR_LABELS) as FloorMaterial[]).map(m => ({ value: m, label: FLOOR_LABELS[m], thumb: h('div', { class: 'thumb', style: { background: thumbCss('f', m, '#D6D3CD'), backgroundBlendMode: 'multiply' } }) })),
      () => look().material, m => set({ material: m })))),
    floorTints(look().material) ? section('Couleur', b(swatches(FLOOR_COLORS, () => look().color, c => set({ color: c })))) : null,
    list,
  ], room >= 0 ? h('div', { class: 'pn-f' }, button('Appliquer à toutes les pièces', 'format_paint', 'btn-secondary', () => {
    const l = look(); store.update(d => { Object.assign(d.floor!, l); clearRoomStyles(d, 'floor'); }); ui.set({ sel: null }); toast('Sol appliqué à toutes les pièces.');
  })) : undefined);
  return finish(p, binds);
}

/* ---------- Cloisons ---------- */
/** Carte « Cloisons et pièces », bien visible dans les panneaux Surface et Murs. */
function partitionsCard(ctx: Ctx) {
  const n = ctx.store.doc.partitions.length;
  return h('div', { class: 'p-cta', 'data-tour': 'partitions' },
    h('div', { class: 'p-cta-t' }, icon('border_outer'), h('b', null, 'Cloisons et pièces')),
    h('p', null, 'Réserve, toilettes, salle du personnel, atelier, cabines d’essayage… Sépare les espaces avec des cloisons.',
      n ? ` ${n} cloison${n > 1 ? 's' : ''} pour l’instant : clique dessus pour la régler.` : ''),
    button('Tracer une cloison', 'add', 'btn-primary', () => startPartitions(ctx)));
}
/** Tracé en cours : consignes et longueur du segment. */
function partitionDrawPanel(ctx: Ctx): Panel {
  const { ui } = ctx;
  const len = () => { const a = ui.s.draft[0], c = ui.s.cursor; return a && c ? dist(a, c) : 0; };
  const lenField = numberField({ label: 'Longueur de la cloison', unit: 'cm', min: MIN_PARTITION * 100, max: 1300, get: () => len() * 100,
    set: v => partitionByLength(ctx, v / 100), blurOnEnter: true,
    title: 'Tape une longueur puis Entrée : la cloison part du point de départ, dans la direction du curseur.' });
  const p = shell('add', 'Tracer une cloison', () => (ui.s.draft.length ? `Longueur : ${fmtM(len())}` : 'Clique au point de départ'), [
    h('p', { class: 'p-help' }, h('b', null, 'Clique'), ' au point de départ sur le plan, puis ', h('b', null, 'clique'), ' au point d’arrivée. La cloison suivante part de là : continue pour fermer un espace.'),
    h('p', { class: 'p-help' }, 'Les extrémités s’accrochent aux murs, aux autres cloisons et à la grille. ', h('b', null, 'Maj'), ' : angles de 45°.'),
    section('Au clavier', lenField.el, h('p', { class: 'p-help' }, 'Après le point de départ, montre la direction avec la souris, tape la longueur en cm puis ', h('b', null, 'Entrée'), '.')),
    h('p', { class: 'p-help' }, h('b', null, 'Échap'), ' ou double-clic : arrêter le tracé.'),
    alert('info', 'Épaisseur', 'Une cloison a la même épaisseur que les murs (10 cm : le carton de 3 mm de la maquette).'),
  ], h('div', { class: 'pn-f' }, button('Terminer le tracé', 'check', 'btn-primary btn-lg', () => stopPartitions(ctx))));
  return finish(p, [lenField]);
}

/** Cloison choisie : longueur, hauteur, revêtement de chaque côté, suppression. */
function partitionPanel(ctx: Ctx, wall: number): Panel {
  const { store } = ctx;
  const binds: Bound[] = [];
  const b = <T extends Bound>(x: T) => { binds.push(x); return x.el; };
  const j = wall - contourCount(store.doc);
  const c = () => store.doc.partitions[j];
  const setLength = (l: number) => {
    let ok = true;
    store.update(d => {
      const x = d.partitions[j], nb = add(x.a, mul(norm(sub(x.b, x.a)), l));
      if (!insideFloor(d, nb)) { ok = false; return false; }
      x.b = { x: Math.round(nb.x * 1000) / 1000, y: Math.round(nb.y * 1000) / 1000 };
      clampAllOpenings(d);
    });
    if (!ok) toast('La cloison sortirait de la boutique.', undefined, 'warning');
  };
  const p = shell('border_outer', `Cloison n° ${j + 1}`, () => (c() ? `Longueur ${fmtM(dist(c().a, c().b))}` : ''), [
    section('Dimensions', h('div', { class: 'g2' },
      b(numberField({ label: 'Longueur', unit: 'cm', min: MIN_PARTITION * 100, max: 1300, get: () => dist(c().a, c().b) * 100, set: v => setLength(v / 100),
        title: 'La cloison s’allonge ou se raccourcit depuis son point de départ' })),
      b(numberField({ label: 'Hauteur', unit: 'cm', min: 50, max: WALL_LIMITS.height[1] * 100, get: () => wallHeight(store.doc, wall) * 100,
        set: v => store.update(d => { const x = d.partitions[j]; x.height = Math.abs(v / 100 - d.walls.height) < 1e-6 ? undefined : v / 100; clampAllOpenings(d); }),
        title: 'Une cloison basse (comptoir, muret) peut être moins haute que les murs' })))),
    h('p', { class: 'p-help' }, 'Sur le plan 2D, ', h('b', null, 'glisse'), ' la cloison ou ses extrémités pour la déplacer. Pour une porte ou un passage : outil ', h('b', null, 'Portes / fenêtres'), ', puis clic sur la cloison.'),
    alert('info', 'Revêtement', 'Chaque côté de la cloison prend le revêtement des murs de sa pièce : outil Murs, puis clic dans la pièce.'),
  ], h('div', { class: 'pn-f two' },
    button('Nouvelle cloison', 'add', 'btn-secondary', () => startPartitions(ctx)),
    button('Supprimer', 'delete', 'btn-danger', () => deleteSelection(ctx))));
  return finish(p, binds);
}

/* ---------- Portes et fenêtres ---------- */
const TYPE_ICON: Record<OpeningType, string> = { porte: 'door_front', fenetre: 'window', vitrine: 'storefront' };
export function openingsPanel(ctx: Ctx): Panel {
  const { store, ui } = ctx;
  const binds: Bound[] = [];
  const b = <T extends Bound>(x: T) => { binds.push(x); return x.el; };
  if (!store.doc.floor) return emptyPanel('door_front', 'Portes / fenêtres', 'Les ouvertures se posent sur les murs. Commence par tracer la surface.', ctx);
  const sel = ui.s.sel?.kind === 'opening' ? ui.s.sel.id : null;
  const typeOpts = (Object.keys(OPENING_DEFAULTS) as OpeningType[]).map(t => ({ value: t, label: OPENING_DEFAULTS[t].label, thumb: h('div', { class: 'thumb-ic' }, icon(TYPE_ICON[t])) }));
  if (!sel) {
    const n = store.doc.openings.length;
    const p = shell('door_front', 'Portes / fenêtres', () => `${store.doc.openings.length} ouverture${store.doc.openings.length > 1 ? 's' : ''}`, [
      section('À poser', b(tiles(typeOpts, () => ui.s.placeType, t => ui.set({ placeType: t }), 3))),
      section('Style', b(tiles(OPENING_STYLES[ui.s.placeType].map(s => ({ value: s.value, label: s.label, thumb: thumbOf(ui.s.placeType, s.value, s.color) })),
        () => ui.s.placeStyles[ui.s.placeType] ?? OPENING_STYLES[ui.s.placeType][0].value, v => ui.set({ placeStyles: { ...ui.s.placeStyles, [ui.s.placeType]: v } }), 2))),
      h('p', { class: 'p-help' }, h('b', null, 'Clique sur un mur'), ' pour y poser l’ouverture choisie : tu peux en poser plusieurs à la suite. Pour en régler une, ', h('b', null, 'clique dessus'), ' ; ', h('b', null, 'glisse-la'), ' pour la déplacer le long du mur.'),
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
      x.height = Math.max(0.3, Math.min(x.height, wallHeight(d, x.wall) - x.sill - 0.05));
      const t = findFreeT(d, x.wall, x.width, x.t, x.id);
      if (t === null) { msg = 'Pas assez de place sur ce mur.'; return false; }
      x.t = t;
    });
    if (msg) toast(msg, undefined, 'warning');
  };
  const isDoor = () => o().type === 'porte';
  /** Sens d'ouverture d'une porte battante : vers quel côté, charnière à gauche ou à droite. */
  const swingSection = () => {
    const st = openingStyle(o()).value;
    if (!isDoor() || st === 'passage' || st === 'coulissante') return null;
    const part = isPartition(store.doc, o().wall), dbl = st === 'double';
    const sideIn = part ? 'Côté 1' : 'Intérieur', sideOut = part ? 'Côté 2' : 'Rue';
    const opts = (dbl ? [[false, false], [true, false]] : [[false, false], [false, true], [true, false], [true, true]]).map(([out, flip]) => ({
      value: `${out ? 1 : 0}${flip ? 1 : 0}`,
      label: (out ? (part ? 'Vers le côté 2' : 'Vers la rue') : (part ? 'Vers le côté 1' : 'Vers l’intérieur')) + (dbl ? '' : flip ? ' · droite' : ' · gauche'),
      thumb: (() => { const t = h('div', { class: 'thumb thumb-svg' }); t.innerHTML = swingThumb(out, flip, dbl); return t; })(),
    }));
    return section('Sens d’ouverture', b(tiles(opts, () => `${o().openOut ? 1 : 0}${o().flipHinge && !dbl ? 1 : 0}`,
      v => set(x => { x.openOut = v[0] === '1' || undefined; x.flipHinge = v[1] === '1' || undefined; }), 2)),
      h('p', { class: 'p-help' }, `Vue de dessus : ${sideOut.toLowerCase()} en haut, ${sideIn.toLowerCase()} en bas. Gauche et droite : vu depuis ${part ? 'le côté 1' : 'l’intérieur'}.`));
  };
  const p = shell(TYPE_ICON[o().type], OPENING_DEFAULTS[o().type].label, () => `Sur ${isPartition(store.doc, o().wall) ? 'la' : 'le'} ${wallName(store.doc, o().wall)} · ${fmtM(L())}`, [
    button('Poser d’autres ouvertures', 'arrow_back', 'btn-ghost', () => ui.set({ sel: null }), 'Revenir au choix de l’ouverture à poser (Échap)'),
    section('Type', b(segmented((Object.keys(OPENING_DEFAULTS) as OpeningType[]).map(t => ({ value: t, label: OPENING_DEFAULTS[t].label })), () => o().type,
      t => { set(x => { x.type = t; x.sill = OPENING_DEFAULTS[t].sill; x.style = undefined; x.color = undefined; }); }))),
    section('Style', b(tiles(OPENING_STYLES[o().type].map(s => ({ value: s.value, label: s.label, thumb: thumbOf(o().type, s.value, o().color ?? s.color) })),
      () => openingStyle(o()).value, v => set(x => { x.style = v; }), 2))),
    swingSection(),
    section('Couleur de la menuiserie', b(frameSwatches(() => o().color, c => set(x => { x.color = c; })))),
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
  const foot = ctx && !ctx.store.doc.floor && !soon ? h('div', { class: 'pn-f' }, button('Tracer la surface', 'grid_on', 'btn-primary btn-lg', () => ctx.ui.set({ tool: 'sol', view: '2d' }))) : undefined;
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
      one && !item ? alert('warning', 'Modèle introuvable', 'Ce meuble vient du dossier du professeur, qui n’est pas chargé sur ce poste. Ouvre la bibliothèque, onglet « Ajouts du professeur ».') : null,
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

/** Panneau simple (en-tête, corps, pied) pour les autres modules (images…). */
export function makePanel(ic: string, title: string, sub: () => string, body: (Node | null | false)[], foot?: HTMLElement): Panel {
  return finish(shell(ic, title, sub, body, foot), []);
}

/** Vignette d'un style de porte, fenêtre ou vitrine. */
function thumbOf(type: OpeningType, style: string, color: string) {
  const t = h('div', { class: 'thumb thumb-svg' });
  t.innerHTML = styleThumb(type, style, color);
  return t;
}
/** Couleurs de menuiserie, avec « Couleur du style » (aucune couleur imposée). */
function frameSwatches(get: () => string | undefined, set: (c: string | undefined) => void): Bound {
  const sw = swatches(FRAME_COLORS, () => get() ?? '', c => set(c));
  const orig = h('button', { type: 'button', class: 'sw orig', title: 'Couleur du style', 'aria-label': 'Couleur du style', onclick: () => set(undefined) });
  sw.el.prepend(orig);
  return { el: sw.el, refresh: () => { sw.refresh(); orig.classList.toggle('on', !get()); } };
}
