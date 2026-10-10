import { STEPS, type Ctx, type Tool, type View } from './state';
import type { WallStyle } from '../model/types';
import { h, icon } from '../ui/dom';
import { toggle } from '../ui/components';
import { View3D } from '../view3d/view3d';
import { Plan2D } from '../view2d/plan';
import { type Panel, floorPanel, furniturePanel, objectPanel, openingsPanel, wallsPanel } from './panels';
import { libraryDrawer } from './libraryDrawer';
import { imagePanel, imagesPanel } from './imagesUi';
import { saveProject } from './files';
import { openPhotoDialog } from './photoDialog';
import { helpButton, offerTour } from './guide/guide';
import { stepsButton } from './guide/steps';
import { copyObjects, duplicateObjects, nudgeObjects, pasteObjects, rotateObjects, selectedIds } from './objectActions';
import { closeDraft, deleteSelection, stopPartitions } from './actions';
import { wallSegs, wallStyleOf } from '../model/project';
import { floorTints, wallTints } from '../view3d/materials';

const TOOLS: { id: Tool; icon: string; label: string; soon?: boolean }[] = [
  { id: 'sol', icon: 'grid_on', label: 'Surface' },
  { id: 'murs', icon: 'border_outer', label: 'Murs' },
  { id: 'ouvertures', icon: 'door_front', label: 'Portes / fenêtres' },
  { id: 'mobilier', icon: 'chair', label: 'Mobilier' },
  { id: 'images', icon: 'image', label: 'Images' },
];

/** Éditeur : barre du haut, barre d'outils, vue (3D ou plan 2D) et panneau de propriétés. */
export class Editor {
  readonly el: HTMLElement;
  readonly view3d: View3D;
  readonly plan: Plan2D;
  private panelHost: HTMLElement;
  private panel: Panel | null = null;
  private panelKey = '';
  private vp: HTMLElement;

  constructor(private ctx: Ctx) {
    const { store, ui } = ctx;
    this.view3d = new View3D(ctx);
    this.plan = new Plan2D(ctx);

    // --- Barre du haut
    const name = h('input', { class: 'tb-name', value: store.doc.name, 'aria-label': 'Nom du projet', spellcheck: false, size: 18 });
    name.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') name.blur(); });
    name.addEventListener('change', () => { const v = name.value.trim() || 'Ma boutique'; store.update(d => { d.name = v; }); });
    const status = h('div', { class: 'tb-status' });
    const vbtn = (v: View, ic: string, label: string) => h('button', { type: 'button', 'data-view': v, onclick: () => ui.set({ view: v }) }, icon(ic), label);
    const b2d = vbtn('2d', 'grid_on', 'Plan 2D'), b3d = vbtn('3d', 'view_in_ar', 'Vue 3D');
    const undo = h('button', { class: 'btn btn-ghost', type: 'button', 'data-tour': 'undo', title: 'Annuler (Ctrl+Z)', onclick: () => this.undo() }, icon('undo'), 'Annuler');
    const redo = h('button', { class: 'btn btn-ghost', type: 'button', title: 'Rétablir (Ctrl+Y)', onclick: () => store.redo() }, icon('redo'), 'Rétablir');
    const topbar = h('header', { class: 'tb' },
      h('div', { class: 'tb-l' },
        h('button', { class: 'tb-logo', type: 'button', title: 'Accueil', onclick: () => ctx.home() }, icon('storefront')),
        h('div', { class: 'tb-title' }, name, status)),
      h('div', { class: 'tb-c' }, h('div', { class: 'vsw', 'data-tour': 'view' }, b2d, b3d)),
      h('div', { class: 'tb-r' }, helpButton(), undo, redo, h('div', { class: 'tb-sep' }),
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => ctx.exportPlan() }, icon('print'), 'Plan A3'),
        this.saveGroup()));

    // --- Barre d'outils
    const toolBtns = TOOLS.map(t => h('button', { type: 'button', class: t.soon ? 'soon' : '', 'data-tool': t.id, title: t.soon ? 'Bientôt disponible' : t.label,
      onclick: () => ui.set({ tool: t.id, sel: null, libraryOpen: t.id === 'mobilier', ...(ui.s.partDraw ? { partDraw: false, draft: [], cursor: null } : {}) }) }, icon(t.icon), t.label));
    const rail = h('nav', { class: 'tr', 'data-tour': 'rail' }, stepsButton(ctx), h('div', { class: 'tr-sep' }), toolBtns);

    // --- Vue
    this.vp = h('main', { class: 'vp' }, this.view3d.el, this.plan.el);
    const ov3d = this.overlay3d(), ov2d = this.overlay2d();
    const lib = libraryDrawer(ctx), drawer = lib.el;
    this.vp.append(ov3d, ov2d, drawer);
    let wasOpen = false;
    ui.subscribe(ch => { if (ch.includes('libraryOpen') && ui.s.libraryOpen && !wasOpen) lib.refresh(); wasOpen = ui.s.libraryOpen; });

    this.panelHost = h('div', { style: { display: 'contents' } });
    this.el = h('div', { class: 'ed' }, topbar, h('div', { class: 'ed-body' }, rail, this.vp, this.panelHost));

    const refreshChrome = () => {
      const s = ui.s;
      b2d.classList.toggle('on', s.view === '2d'); b3d.classList.toggle('on', s.view === '3d');
      toolBtns.forEach((b, i) => {
        b.classList.toggle('on', TOOLS[i].id === s.tool);
        b.replaceChildren(icon(TOOLS[i].icon, TOOLS[i].id === s.tool), TOOLS[i].label);
      });
      undo.disabled = !store.canUndo && !s.draft.length; redo.disabled = !store.canRedo;
      if (document.activeElement !== name) name.value = store.doc.name;
      const st = store.dirty && s.saveStatus !== 'saving' ? 'unsaved' : s.saveStatus;
      status.className = 'tb-status ' + (st === 'new' ? 'unsaved' : st);
      status.title = ctx.file.fileName ? 'Fichier : ' + ctx.file.fileName : '';
      status.replaceChildren(...(st === 'saved' ? [icon('check_circle', true), 'Enregistré'] : st === 'saving' ? [icon('progress_activity'), 'Enregistrement…']
        : st === 'new' ? ['Pas encore enregistré'] : ['Non enregistré']));
      this.vp.classList.toggle('v2d', s.view === '2d');
      this.vp.classList.toggle('lib-open', s.libraryOpen);
      drawer.style.display = s.libraryOpen ? '' : 'none';
      this.view3d.el.style.display = ov3d.style.display = s.view === '3d' ? '' : 'none';
      this.plan.el.style.display = ov2d.style.display = s.view === '2d' ? '' : 'none';
      this.view3d.setActive(s.view === '3d');
      this.plan.setActive(s.view === '2d');
    };
    store.subscribe(() => { this.validateSelection(); refreshChrome(); this.updatePanel(); });
    ui.subscribe(() => { refreshChrome(); this.updatePanel(); });
    refreshChrome();
    this.updatePanel();
    this.bindKeys();
    // Visite guidée proposée la première fois qu'une partie est ouverte (outil, puis vue 3D).
    let lastTool = ui.s.tool, lastView = ui.s.view;
    ui.subscribe(() => {
      const s = ui.s;
      if (!this.el.isConnected) return;
      if (s.tool !== lastTool) offerTour(s.tool);
      else if (s.view !== lastView && s.view === '3d' && store.doc.floor) offerTour('vue3d');
      lastTool = s.tool; lastView = s.view;
    });
  }

  /** Bouton « Enregistrer » + menu (Enregistrer sous, Enregistrer comme modèle pour le professeur). */
  private saveGroup() {
    const menu = h('div', { class: 'menu', role: 'menu' },
      h('button', { type: 'button', role: 'menuitem', onclick: () => { close(); void saveProject(this.ctx, 'saveAs'); } }, icon('save'), 'Enregistrer sous…', h('kbd', null, 'Ctrl+Maj+S')),
      h('button', { type: 'button', role: 'menuitem', onclick: () => { close(); void saveProject(this.ctx, 'template'); } }, icon('bookmark_add'), 'Enregistrer comme modèle (professeur)'));
    const close = () => { menu.classList.remove('open'); document.removeEventListener('pointerdown', outside, true); };
    const outside = (e: Event) => { if (!wrap.contains(e.target as Node)) close(); };
    const wrap = h('div', { class: 'split', 'data-tour': 'save' },
      h('button', { class: 'btn btn-primary split-main', type: 'button', title: 'Enregistrer (Ctrl+S)', onclick: () => void saveProject(this.ctx, 'save') }, icon('save'), 'Enregistrer'),
      h('button', { class: 'btn btn-primary split-more', type: 'button', title: 'Autres façons d’enregistrer', 'aria-label': 'Autres façons d’enregistrer',
        onclick: () => { if (menu.classList.toggle('open')) document.addEventListener('pointerdown', outside, true); else close(); } }, icon('keyboard_arrow_down')),
      menu);
    return wrap;
  }

  private undo() {
    const { ui, store } = this.ctx;
    if (ui.s.draft.length) ui.set({ draft: ui.s.draft.slice(0, -1) }); else store.undo();
  }

  /** Retire de la sélection un élément qui n'existe plus (après annuler, par exemple). */
  private validateSelection() {
    const { ui, store } = this.ctx, s = ui.s.sel, d = store.doc;
    if (!s) return;
    const n = d.floor?.points.length ?? 0;
    if ((s.kind === 'opening' && !d.openings.some(o => o.id === s.id)) || (s.kind === 'vertex' && s.index >= n) || (s.kind === 'wall' && s.index >= wallSegs(d).length)) ui.set({ sel: null });
    if (s.kind === 'image' && !d.images.some(i => i.id === s.id)) ui.set({ sel: null });
    if (s.kind === 'objects') {
      const ids = s.ids.filter(id => d.objects.some(o => o.id === id));
      if (ids.length !== s.ids.length) ui.set({ sel: ids.length ? { kind: 'objects', ids } : null });
    }
  }

  /** Le panneau est reconstruit seulement si sa structure change ; sinon il est rafraîchi. */
  private updatePanel() {
    const { ui, store } = this.ctx, s = ui.s, d = store.doc;
    const selWall = s.sel?.kind === 'wall' ? s.sel.index : 0;
    const ext = s.wallFace === 'ext';
    const faceMat = (w: WallStyle) => ext ? w.outMaterial ?? 'peinture' : w.material;
    const faceCol = (w: WallStyle) => ext ? w.outColor ?? '' : w.color;
    const op = s.sel?.kind === 'opening' ? d.openings.find(o => o.id === (s.sel as { id: string }).id) : undefined;
    const key = JSON.stringify([s.tool, s.sel, !!d.floor, s.floorShape, d.floor && floorTints(d.floor.material),
      s.wallFace, s.partDraw, s.tool === 'murs' || s.tool === 'sol' ? d.partitions.length : null, wallStyleOf(d, selWall) && wallTints(faceMat(wallStyleOf(d, selWall)!)), op?.type, op?.style, op?.color, op?.openOut, op?.flipHinge, s.placeType,
      s.sel?.kind === 'image' ? d.images.filter(i => i.id === (s.sel as { id: string }).id).map(i => i.target + i.repeat + i.side + i.wall) : null,
      s.tool === 'images' && s.sel?.kind !== 'image' ? d.images.map(i => i.id + i.target + i.wall) : null,
      s.tool === 'murs' && !s.sel && d.walls.styles.some(w => faceMat(w) !== faceMat(d.walls.styles[0]) || faceCol(w) !== faceCol(d.walls.styles[0]))]);
    if (key !== this.panelKey) {
      this.panelKey = key;
      this.panel = this.buildPanel();
      this.panelHost.replaceChildren(this.panel.el);
    } else this.panel?.refresh();
  }
  private buildPanel(): Panel {
    switch (this.ctx.ui.s.tool) {
      case 'sol': return floorPanel(this.ctx, this.plan);
      case 'murs': return wallsPanel(this.ctx);
      case 'ouvertures': return openingsPanel(this.ctx);
      case 'mobilier': return this.ctx.ui.s.sel?.kind === 'objects' ? objectPanel(this.ctx) : furniturePanel(this.ctx);
      case 'images': return this.ctx.ui.s.sel?.kind === 'image' ? imagePanel(this.ctx) : imagesPanel(this.ctx);
    }
  }

  /** Pas d'aimantation, partout dans l'éditeur. Le sol et les autres éléments gardent chacun leur pas. */
  private stepSelect() {
    const { ui } = this.ctx;
    const label = h('span', { class: 'step-l' });
    const sel = h('select', { 'aria-label': 'Pas de l’aimantation', onchange: (e: Event) => ui.set({ step: +(e.target as HTMLSelectElement).value }) },
      ...STEPS.map(s => h('option', { value: String(s.v) }, s.label)));
    const el = h('label', { class: 'step', title: 'Les points, meubles et ouvertures s’accrochent sur une grille de ce pas' }, icon('grid_4x4'), label, sel);
    const refresh = () => {
      sel.value = String(ui.s.step);
      label.textContent = ui.s.tool === 'sol' ? 'Pas du tracé' : 'Pas';
      el.classList.toggle('off', !ui.s.snap);
    };
    refresh();
    return { el, refresh };
  }

  /* ---------- Surcouches des vues ---------- */
  private overlay3d() {
    const { ui } = this.ctx;
    const empty = h('div', { class: 'vp-empty' }, h('div', null,
      h('div', { class: 'big' }, icon('grid_on')), h('h2', null, 'Commence par la surface'),
      h('p', null, 'Trace la surface de ta boutique sur le plan 2D : les murs se créeront tout seuls.'),
      h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => ui.set({ view: '2d', tool: 'sol' }) }, icon('grid_on'), 'Tracer la surface')));
    const cut = toggle('Murs abaissés', 'vertical_align_bottom', () => ui.s.cutaway, v => ui.set({ cutaway: v }));
    cut.el.dataset.tour = 'cut';
    cut.el.title = 'Abaisser les murs entre la caméra et la boutique pour voir l’intérieur';
    const shadows = h('select', { 'aria-label': 'Ombres', 'data-tour': 'shadows', title: 'Qualité des ombres (à baisser si la 3D est lente)', onchange: (e: Event) => {
      const v = (e.target as HTMLSelectElement).value as 'off' | 'low' | 'high';
      ui.set({ shadows: v }); try { localStorage.setItem('cs3d-shadows', v); } catch { /* ignoré */ }
    } }, h('option', { value: 'off' }, 'Sans ombres'), h('option', { value: 'low' }, 'Ombres légères'), h('option', { value: 'high' }, 'Ombres soignées'));
    const facade = h('button', { class: 'tg', type: 'button', 'data-tour': 'facade', title: 'Voir la boutique depuis la rue', onclick: () => this.view3d.facade() }, icon('storefront'), 'Façade');
    const snap3 = toggle('Aimanter', 'join', () => ui.s.snap, v => ui.set({ snap: v })), step3 = this.stepSelect();
    snap3.el.title = 'Aimantation des meubles et ouvertures sur la grille';
    const photo = h('button', { class: 'tg', type: 'button', 'data-tour': 'photo', title: 'Images PNG ou JPG du rendu 3D', onclick: () => openPhotoDialog(this.ctx, this.view3d) }, icon('photo_camera'), 'Photo');
    const bar = h('div', { class: 'fbar' }, cut.el, facade, photo, shadows, snap3.el, step3.el);
    const el = h('div', { class: 'vp-ov', style: { position: 'absolute', inset: '0', pointerEvents: 'none' } },
      h('div', { style: { pointerEvents: 'auto' } }, bar),
      h('div', { class: 'vp-hints' },
        h('div', { class: 'pill' }, icon('mouse'), 'Glisser : tourner'),
        h('div', { class: 'pill' }, icon('pan_tool_alt'), 'Clic molette + glisser : déplacer'),
        h('div', { class: 'pill' }, icon('zoom_in'), 'Molette : zoom')),
      h('div', { class: 'vp-zoom', style: { pointerEvents: 'auto' } },
        h('button', { type: 'button', title: 'Zoom arrière', onclick: () => this.view3d.zoom(1.2) }, icon('remove')),
        h('button', { type: 'button', title: 'Recentrer', onclick: () => this.view3d.frame() }, icon('center_focus_strong')),
        h('button', { type: 'button', title: 'Zoom avant', onclick: () => this.view3d.zoom(1 / 1.2) }, icon('add'))),
      empty);
    const refresh = () => { cut.refresh(); snap3.refresh(); step3.refresh(); shadows.value = ui.s.shadows; empty.style.display = this.ctx.store.doc.floor ? 'none' : ''; };
    ui.subscribe(refresh); this.ctx.store.subscribe(refresh); refresh();
    return el;
  }

  private overlay2d() {
    const { ui, store } = this.ctx;
    const tg = [
      toggle('Grille', 'grid_4x4', () => ui.s.grid, v => ui.set({ grid: v })),
      toggle('Aimantation', 'join', () => ui.s.snap, v => ui.set({ snap: v })),
      toggle('Cotes', 'straighten', () => ui.s.dims, v => ui.set({ dims: v })),
    ];
    const step = this.stepSelect();
    const hint = h('div', { class: 'hintbar' });
    const el = h('div', { class: 'vp-ov', style: { position: 'absolute', inset: '0', pointerEvents: 'none' } },
      h('div', { style: { pointerEvents: 'auto' } }, h('div', { class: 'fbar' }, ...tg.map(t => t.el), step.el)),
      h('div', { class: 'vp-zoom', style: { pointerEvents: 'auto' } },
        h('button', { type: 'button', title: 'Zoom arrière', onclick: () => this.plan.zoom(1 / 1.25) }, icon('remove')),
        h('button', { type: 'button', title: 'Tout voir', onclick: () => this.plan.fit() }, icon('center_focus_strong')),
        h('button', { type: 'button', title: 'Zoom avant', onclick: () => this.plan.zoom(1.25) }, icon('add'))),
      hint);
    const H = (ic: string | null, txt: string, kbd?: string) => h('span', null, kbd ? h('kbd', null, kbd) : ic ? icon(ic) : null, txt);
    const refresh = () => {
      tg.forEach(t => t.refresh()); step.refresh();
      const s = ui.s, d = store.doc;
      let parts: HTMLElement[];
      if (s.partDraw && d.floor && (s.tool === 'sol' || s.tool === 'murs')) parts = [H('left_click', s.draft.length ? 'Clic : fin de la cloison' : 'Clic : début de la cloison'), H(null, '45°', 'Maj'), H(null, 'terminer', 'Échap')];
      else if (s.tool === 'sol' && !d.floor) parts = s.floorShape === 'rectangle'
        ? [H('left_click', s.draft.length ? 'Clic : coin opposé' : 'Clic : premier coin'), H(null, 'annuler', 'Échap')]
        : [H('left_click', 'Clic : poser un point'), H('ads_click', 'Double-clic : terminer'), H(null, 'annuler', 'Échap')];
      else if (s.tool === 'sol') parts = [H('open_with', 'Glisser un point : le déplacer'), H('add', 'Clic sur + : ajouter un point'), H(null, 'retirer', 'Suppr')];
      else if (s.tool === 'ouvertures') parts = [H('left_click', `Clic sur un mur : poser ${s.placeType === 'porte' ? 'une porte' : s.placeType === 'fenetre' ? 'une fenêtre' : 'une vitrine'}`), H('open_with', 'Glisser : déplacer')];
      else if (s.tool === 'mobilier') parts = [H('open_with', 'Glisser un objet : le déplacer'), H('select_all', 'Glisser dans le vide : en choisir plusieurs'), H(null, 'tourner', 'R')];
      else if (s.tool === 'images') parts = [H('left_click', 'Clic sur un repère : choisir l’image'), H('ads_click', 'Clic sur un mur : y ajouter une image')];
      else parts = [H('left_click', 'Clic sur un mur ou une cloison : le choisir'), H('pan_tool_alt', 'Glisser le fond : déplacer la vue')];
      hint.replaceChildren(...parts);
    };
    ui.subscribe(refresh); store.subscribe(refresh); refresh();
    return el;
  }

  /* ---------- Clavier ---------- */
  private bindKeys() {
    const { ui, store } = this.ctx;
    window.addEventListener('keydown', e => {
      if (!this.el.isConnected) return;
      const t = e.target as HTMLElement;
      const ctrl0 = e.ctrlKey || e.metaKey;
      if (ctrl0 && e.key.toLowerCase() === 's') { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); void saveProject(this.ctx, e.shiftKey ? 'saveAs' : 'save'); return; }
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      const ctrl = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      const drawing = ui.s.tool === 'sol' && !store.doc.floor;
      if (ctrl && key === 's') { e.preventDefault(); void saveProject(this.ctx, e.shiftKey ? 'saveAs' : 'save'); return; }
      if (ctrl && key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
      if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); return; }
      if (e.key === 'Escape') {
        if (this.plan.cancelDrag() || this.view3d.objects.cancel()) return;
        if (ui.s.partDraw) stopPartitions(this.ctx);
        else if (ui.s.libraryOpen) ui.set({ libraryOpen: false });
        else if (ui.s.draft.length) ui.set({ draft: [] }); else ui.set({ sel: null });
        return;
      }
      if (drawing && e.key === 'Backspace') { e.preventDefault(); ui.set({ draft: ui.s.draft.slice(0, -1) }); return; }
      if (drawing && e.key === 'Enter' && ui.s.floorShape === 'libre' && ui.s.draft.length >= 3) { closeDraft(this.ctx); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(this.ctx); return; }
      // Objets : copier, coller, dupliquer, tourner, déplacer au clavier
      const objSel = selectedIds(this.ctx).length > 0;
      if (ctrl && key === 'c' && objSel) { e.preventDefault(); copyObjects(this.ctx); return; }
      if (ctrl && key === 'v') { e.preventDefault(); pasteObjects(this.ctx); return; }
      if (ctrl && key === 'd' && objSel) { e.preventDefault(); duplicateObjects(this.ctx); return; }
      if (!ctrl && key === 'r' && objSel) { e.preventDefault(); rotateObjects(this.ctx, e.shiftKey ? -15 : 15); return; }
      if (objSel && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const s = e.shiftKey ? 0.01 : ui.s.step, dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
        nudgeObjects(this.ctx, dx, dy); return;
      }
      // Saisie d'une longueur au clavier pendant le tracé
      if (ui.s.partDraw && ui.s.draft.length && /^[0-9]$/.test(e.key) && !ctrl) { // longueur de la cloison au clavier
        const input = this.panelHost.querySelector<HTMLInputElement>('input[aria-label="Longueur de la cloison"]');
        if (input) { e.preventDefault(); input.dataset.typed = '1'; input.focus(); input.value = e.key; }
        return;
      }
      if (drawing && ui.s.floorShape === 'libre' && ui.s.draft.length && /^[0-9]$/.test(e.key) && !ctrl) {
        const input = this.panelHost.querySelector<HTMLInputElement>('input[aria-label="Longueur du côté suivant"]');
        if (input) { e.preventDefault(); input.dataset.typed = '1'; input.focus(); input.value = e.key; }
      }
    });
  }
}
