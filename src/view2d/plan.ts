import type { Ctx } from '../app/state';
import type { Opening, Vec2 } from '../model/types';
import { add, bounds, dist, dot, edges, fmtM, isSimplePolygon, mul, norm, offsetPolygon, snapTo, sub, v, area, cross } from '../model/geometry';
import { OPENING_DEFAULTS, findFreeT, insertVertex, moveVertex, shopExtent, wallLength } from '../model/project';
import { closeDraft, placeOpening, selectPick } from "../app/actions";
import { footprint, hitObject, normRot, snapToWall, toPlan } from "../model/objects";
import { selectObjects, selectedIds } from "../app/objectActions";
import { getItem } from "../library/library";
import { ICONS } from "../ui/icons.gen";

/* Plan 2D vu de dessus (SVG). Écran = (m − origine) × k, k en pixels par mètre. */

const A = '#BF4E36', INK = '#22211F', BG = '#FBFAF8', WARN = '#D99A2B';
const SNAP_PX = 12, ALIGN_PX = 8;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

interface Snapped { p: Vec2; kind: 'point' | 'grid' | 'free'; guides: { x?: number; y?: number } }
type Drag =
  | { kind: 'pan'; x: number; y: number; ox: number; oy: number; moved: boolean; click: boolean }
  | { kind: 'vertex'; index: number; moved: boolean }
  | { kind: "opening"; id: string; dt: number }
  | { kind: "objects"; start: Vec2; orig: Map<string, Vec2>; primary: string }
  | { kind: "rotate"; c: Vec2; a0: number; orig: Map<string, number> }
  | { kind: "band"; a: Vec2; b: Vec2; additive: boolean };

export class Plan2D {
  readonly el: HTMLElement;
  private svg: SVGSVGElement;
  private k = 56; private ox = -3; private oy = -2.5;
  private active = false;
  private scheduled = false;
  private drag: Drag | null = null;
  private snapInfo: Snapped | null = null;
  private hoverGhost: Opening | null = null;
  private hoverMid: number | null = null;
  private space = false;
  private fitted = false;

  constructor(private ctx: Ctx) {
    this.el = document.createElement('div');
    this.el.className = 'vp-2d';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('data-testid', 'plan');
    this.el.appendChild(this.svg);
    ctx.store.subscribe(r => { if (r === 'load') this.fitted = false; this.schedule(); });
    ctx.ui.subscribe(() => this.schedule());
    new ResizeObserver(() => { if (!this.fitted) this.fit(); this.schedule(); }).observe(this.el);
    this.bind();
  }

  setActive(on: boolean) { this.active = on; if (on) { if (!this.fitted) this.fit(); this.schedule(); } }

  /** Cadre le sol (ou une zone de 14 × 10 m autour de l'origine si le sol est vide). */
  fit() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    const f = this.ctx.store.doc.floor;
    const b = f ? bounds(f.points) : { x0: 0, y0: 0, x1: 10, y1: 7, w: 10, h: 7 };
    const m = 2.2;
    this.k = Math.min(w / (b.w + 2 * m), h / (b.h + 2 * m));
    this.k = Math.max(10, Math.min(200, this.k));
    this.ox = (b.x0 + b.x1) / 2 - w / 2 / this.k;
    this.oy = (b.y0 + b.y1) / 2 - h / 2 / this.k;
    this.fitted = true;
    this.schedule();
  }
  zoom(f: number, cx?: number, cy?: number) {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const px = cx ?? w / 2, py = cy ?? h / 2;
    const before = this.toPlanLocal(px, py);
    this.k = Math.max(8, Math.min(400, this.k * f));
    this.ox = before.x - px / this.k; this.oy = before.y - py / this.k;
    this.schedule();
  }

  private X = (x: number) => (x - this.ox) * this.k;
  private Y = (y: number) => (y - this.oy) * this.k;
  private toPlanLocal = (px: number, py: number) => v(px / this.k + this.ox, py / this.k + this.oy);
  /** Coordonnées écran (clientX, clientY) d'un point du plan — utile aux tests automatisés. */
  toScreen(p: Vec2) { const r = this.svg.getBoundingClientRect(); return { x: r.left + this.X(p.x), y: r.top + this.Y(p.y) }; }
  private toPlan(e: MouseEvent) { const r = this.svg.getBoundingClientRect(); return this.toPlanLocal(e.clientX - r.left, e.clientY - r.top); }

  private schedule() {
    if (this.scheduled || !this.active) return;
    this.scheduled = true;
    requestAnimationFrame(() => { this.scheduled = false; this.render(); });
  }

  private get drawing() { const s = this.ctx.ui.s; return s.tool === 'sol' && !this.ctx.store.doc.floor; }

  /* ---------- Aimantation ---------- */
  private refs(excludeVertex?: number): Vec2[] {
    const d = this.ctx.store.doc;
    const r = d.floor ? d.floor.points.filter((_, i) => i !== excludeVertex) : [];
    return [...r, ...this.ctx.ui.s.draft];
  }
  private snap(p: Vec2, opts: { from?: Vec2; shift?: boolean; excludeVertex?: number } = {}): Snapped {
    const s = this.ctx.ui.s;
    let q = { ...p };
    if (opts.shift && opts.from) { // Maj : angles multiples de 45°
      const d = sub(q, opts.from), a = Math.round(Math.atan2(d.y, d.x) / (Math.PI / 4)) * (Math.PI / 4);
      const l = snapTo(Math.hypot(d.x, d.y), s.snap ? s.step : 0.01);
      return { p: add(opts.from, v(Math.cos(a) * l, Math.sin(a) * l)), kind: 'grid', guides: {} };
    }
    if (!s.snap) return { p: v(snapTo(q.x, 0.01), snapTo(q.y, 0.01)), kind: 'free', guides: {} };
    const refs = this.refs(opts.excludeVertex);
    let best: Vec2 | null = null, bd = SNAP_PX / this.k;
    for (const r of refs) { const d = dist(r, p); if (d < bd) { bd = d; best = r; } }
    if (best) return { p: { ...best }, kind: 'point', guides: {} };
    q = v(snapTo(q.x, s.step), snapTo(q.y, s.step));
    const guides: Snapped['guides'] = {};
    let ax = ALIGN_PX / this.k, ay = ALIGN_PX / this.k;
    for (const r of refs) {
      if (Math.abs(r.x - p.x) < ax) { ax = Math.abs(r.x - p.x); q.x = r.x; guides.x = r.x; }
      if (Math.abs(r.y - p.y) < ay) { ay = Math.abs(r.y - p.y); q.y = r.y; guides.y = r.y; }
    }
    return { p: q, kind: 'grid', guides };
  }

  /* ---------- Tests de survol ---------- */
  private hitWall(p: Vec2) {
    const d = this.ctx.store.doc; if (!d.floor) return null;
    const T = d.walls.thickness, tol = 6 / this.k;
    for (const e of edges(d.floor.points)) {
      const t = dot(sub(p, e.a), e.u), s = dot(sub(p, e.a), e.n);
      if (t >= -tol && t <= e.length + tol && s >= -tol && s <= T + tol) return { wall: e.i, t };
    }
    return null;
  }
  private hitOpening(p: Vec2) {
    const w = this.hitWall(p); if (!w) return null;
    return this.ctx.store.doc.openings.find(o => o.wall === w.wall && Math.abs(o.t - w.t) <= o.width / 2 + 2 / this.k) ?? null;
  }
  private hitVertex(p: Vec2) {
    const f = this.ctx.store.doc.floor; if (!f) return -1;
    let best = -1, bd = 12 / this.k;
    f.points.forEach((q, i) => { const d = dist(q, p); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  private hitMid(p: Vec2) {
    const f = this.ctx.store.doc.floor; if (!f) return -1;
    let best = -1, bd = 12 / this.k;
    edges(f.points).forEach(e => { if (e.length * this.k < 70) return; const m = mul(add(e.a, e.b), 0.5), d = dist(m, p); if (d < bd) { bd = d; best = e.i; } });
    return best;
  }

  /* ---------- Souris et clavier ---------- */
  private bind() {
    const svg = this.svg;
    svg.addEventListener('contextmenu', e => e.preventDefault());
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      this.zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    window.addEventListener('keydown', e => { if (e.code === 'Space' && this.active && !(e.target instanceof HTMLInputElement)) { this.space = true; svg.style.cursor = 'grab'; } });
    window.addEventListener('keyup', e => { if (e.code === 'Space') { this.space = false; svg.style.cursor = ''; } });

    svg.addEventListener('pointerdown', e => {
      svg.setPointerCapture(e.pointerId);
      const p = this.toPlan(e);
      const { ui, store } = this.ctx, s = ui.s;
      const pan = (click: boolean) => { this.drag = { kind: 'pan', x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy, moved: false, click }; };
      if (e.button === 1 || e.button === 2 || this.space) { pan(false); return; }
      if (e.button !== 0) return;
      if (this.drawing) {
        const last = s.draft[s.draft.length - 1];
        const sn = this.snap(p, { from: last, shift: e.shiftKey });
        if (s.floorShape === 'rectangle') {
          if (!s.draft.length) ui.set({ draft: [sn.p], cursor: sn.p });
          else {
            const a = s.draft[0], b = sn.p;
            if (Math.abs(b.x - a.x) < 0.3 || Math.abs(b.y - a.y) < 0.3) return;
            closeDraft(this.ctx, [a, v(b.x, a.y), b, v(a.x, b.y)]);
          }
          return;
        }
        if (s.draft.length >= 3 && dist(sn.p, s.draft[0]) < SNAP_PX / this.k) { closeDraft(this.ctx); return; }
        if (e.detail >= 2) return; // le double-clic est traité par dblclick
        ui.set({ draft: [...s.draft, sn.p], cursor: sn.p });
        return;
      }
      if (s.tool === 'sol' && store.doc.floor) {
        const vi = this.hitVertex(p);
        if (vi >= 0) { ui.set({ sel: { kind: 'vertex', index: vi } }); store.begin(); this.drag = { kind: 'vertex', index: vi, moved: false }; return; }
        const mi = this.hitMid(p);
        if (mi >= 0) {
          store.begin();
          const e0 = edges(store.doc.floor.points)[mi];
          store.live(d => insertVertex(d, mi, this.snap(mul(add(e0.a, e0.b), 0.5)).p));
          ui.set({ sel: { kind: 'vertex', index: mi + 1 } });
          this.drag = { kind: 'vertex', index: mi + 1, moved: true };
          return;
        }
      }
      if (s.tool !== "ouvertures" && this.objectDown(e, p)) return;
      const op = this.hitOpening(p);
      if (op) {
        selectPick(this.ctx, { kind: 'opening', id: op.id });
        const e0 = edges(store.doc.floor!.points)[op.wall];
        store.begin();
        this.drag = { kind: 'opening', id: op.id, dt: op.t - dot(sub(p, e0.a), e0.u) };
        return;
      }
      const w = this.hitWall(p);
      if (w) {
        if (s.tool === 'ouvertures') placeOpening(this.ctx, w.wall, w.t);
        else selectPick(this.ctx, { kind: "wall", index: w.wall });
        return;
      }
      if (s.tool === "ouvertures" && this.objectDown(e, p)) return;
      if (s.tool === "mobilier") { this.drag = { kind: "band", a: p, b: p, additive: e.shiftKey }; return; }
      pan(true);
    });

    svg.addEventListener('dblclick', () => { if (this.drawing && this.ctx.ui.s.floorShape === 'libre' && this.ctx.ui.s.draft.length >= 3) closeDraft(this.ctx); });

    svg.addEventListener('pointermove', e => {
      const p = this.toPlan(e);
      const { ui, store } = this.ctx, s = ui.s, d = this.drag;
      if (d?.kind === 'pan') {
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.hypot(dx, dy) > 3) d.moved = true;
        this.ox = d.ox - dx / this.k; this.oy = d.oy - dy / this.k;
        svg.style.cursor = 'grabbing';
        this.schedule(); return;
      }
      if (d?.kind === 'vertex') {
        const sn = this.snap(p, { excludeVertex: d.index }); this.snapInfo = sn;
        const pts = store.doc.floor!.points.map((q, i) => i === d.index ? sn.p : q);
        if (isSimplePolygon(pts) && shopExtent(pts).ok) store.live(doc => moveVertex(doc, d.index, sn.p));
        d.moved = true; this.schedule(); return;
      }
      if (d?.kind === "objects" || d?.kind === "rotate" || d?.kind === "band") { this.objectDrag(d, p, e.shiftKey); return; }
      if (d?.kind === "opening") {
        const o = store.doc.openings.find(q => q.id === d.id); if (!o) return;
        const e0 = edges(store.doc.floor!.points)[o.wall];
        let t = dot(sub(p, e0.a), e0.u) + d.dt;
        if (s.snap) t = snapTo(t - o.width / 2, s.step) + o.width / 2;
        const ft = findFreeT(store.doc, o.wall, o.width, t, o.id);
        if (ft !== null) store.live(doc => { doc.openings.find(q => q.id === d.id)!.t = Math.round(ft * 1000) / 1000; });
        return;
      }
      // Survol
      if (this.drawing) {
        const last = s.draft[s.draft.length - 1];
        this.snapInfo = this.snap(p, { from: last, shift: e.shiftKey });
        ui.set({ cursor: this.snapInfo.p });
        svg.style.cursor = 'crosshair';
        this.schedule(); return;
      }
      this.snapInfo = null;
      this.hoverGhost = null; this.hoverMid = null;
      let cursor = '';
      if (s.tool === 'sol' && store.doc.floor) {
        if (this.hitVertex(p) >= 0) cursor = 'move';
        else { const mi = this.hitMid(p); if (mi >= 0) { this.hoverMid = mi; cursor = 'copy'; } }
      }
      if (!cursor && this.rotHandleHit(p)) cursor = "alias";
      if (!cursor && this.topObject(p)) cursor = this.topObject(p)!.locked ? "not-allowed" : "move";
      if (!cursor) {
        const op = this.hitOpening(p);
        if (op) cursor = "grab";
        else {
          const w = this.hitWall(p);
          if (w && s.tool === 'ouvertures') {
            const def = OPENING_DEFAULTS[s.placeType], width = Math.min(def.width, wallLength(store.doc, w.wall) - 0.2);
            const t = findFreeT(store.doc, w.wall, width, w.t);
            if (t !== null) this.hoverGhost = { id: 'ghost', wall: w.wall, type: s.placeType, t, width, height: def.height, sill: def.sill };
            cursor = t === null ? 'not-allowed' : 'copy';
          } else if (w) cursor = 'pointer';
        }
      }
      svg.style.cursor = cursor;
      this.schedule();
    });

    const up = (e: PointerEvent) => {
      const d = this.drag; this.drag = null;
      if (!d) return;
      if (d.kind === "pan") { svg.style.cursor = ""; if (d.click && !d.moved) this.ctx.ui.set({ sel: null }); }
      else if (d.kind === "band") {
        const x0 = Math.min(d.a.x, d.b.x), x1 = Math.max(d.a.x, d.b.x), y0 = Math.min(d.a.y, d.b.y), y1 = Math.max(d.a.y, d.b.y);
        const ids = this.ctx.store.doc.objects.filter(o => o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1).map(o => o.id);
        if (dist(d.a, d.b) * this.k < 4) { if (!d.additive) this.ctx.ui.set({ sel: null }); }
        else selectObjects(this.ctx, ids, d.additive);
      }
      else this.ctx.store.end();
      this.snapInfo = null;
      void e; this.schedule();
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('pointerleave', () => { if (this.drawing) this.ctx.ui.set({ cursor: null }); this.hoverGhost = null; this.schedule(); });
  }

  /* ---------- Objets ---------- */
  /** Objet le plus haut (dessiné en dernier) sous le point. */
  private topObject(p: Vec2) {
    const objs = this.sortedObjects();
    for (let i = objs.length - 1; i >= 0; i--) if (hitObject(objs[i], p)) return objs[i];
    return null;
  }
  private sortedObjects() { return [...this.ctx.store.doc.objects].sort((a, b) => b.size.w * b.size.d - a.size.w * a.size.d); }
  /** Poignée de rotation (devant l'objet sélectionné, s'il est seul et non verrouillé). */
  private rotHandle() {
    const ids = selectedIds(this.ctx);
    if (ids.length !== 1) return null;
    const o = this.ctx.store.doc.objects.find(x => x.id === ids[0]);
    if (!o || o.locked) return null;
    return { o, p: toPlan(o, 0, o.size.d / 2 + 28 / this.k) };
  }
  private rotHandleHit(p: Vec2) { const r = this.rotHandle(); return r && dist(r.p, p) < 13 / this.k ? r : null; }

  private objectDown(e: PointerEvent, p: Vec2) {
    const { store, ui } = this.ctx;
    const rh = this.rotHandleHit(p);
    if (rh) {
      store.begin();
      this.drag = { kind: 'rotate', c: v(rh.o.x, rh.o.y), a0: Math.atan2(p.y - rh.o.y, p.x - rh.o.x), orig: new Map([[rh.o.id, rh.o.rot]]) };
      return true;
    }
    const o = this.topObject(p);
    if (!o) return false;
    if (e.shiftKey) { selectObjects(this.ctx, [o.id], true); return true; }
    if (!selectedIds(this.ctx).includes(o.id)) selectObjects(this.ctx, [o.id]);
    else if (ui.s.tool !== 'mobilier') ui.set({ tool: 'mobilier' });
    const ids = selectedIds(this.ctx);
    const movable = store.doc.objects.filter(x => ids.includes(x.id) && !x.locked);
    if (movable.some(x => x.id === o.id)) {
      store.begin();
      this.drag = { kind: 'objects', start: p, orig: new Map(movable.map(x => [x.id, v(x.x, x.y)])), primary: o.id };
    }
    return true;
  }

  private objectDrag(d: Extract<Drag, { kind: 'objects' | 'rotate' | 'band' }>, p: Vec2, shift: boolean) {
    const { store, ui } = this.ctx;
    if (d.kind === 'band') { d.b = p; this.schedule(); return; }
    if (d.kind === 'objects') {
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      const o0 = d.orig.get(d.primary)!;
      if (ui.s.snap) { dx = snapTo(o0.x + dx, ui.s.step) - o0.x; dy = snapTo(o0.y + dy, ui.s.step) - o0.y; }
      store.live(doc => {
        for (const o of doc.objects) {
          const s = d.orig.get(o.id); if (!s) continue;
          o.x = Math.round((s.x + dx) * 1000) / 1000; o.y = Math.round((s.y + dy) * 1000) / 1000;
          if (d.orig.size === 1 && getItem(o.model)?.mural) snapToWall(doc, o);
        }
      });
    } else {
      const a = Math.atan2(p.y - d.c.y, p.x - d.c.x), delta = ((a - d.a0) * 180) / Math.PI;
      store.live(doc => {
        for (const o of doc.objects) {
          const r0 = d.orig.get(o.id); if (r0 === undefined) continue;
          o.rot = normRot(shift ? r0 + delta : Math.round((r0 + delta) / 15) * 15);
        }
      });
    }
  }

  /** Annule le glisser en cours (Échap). */
  cancelDrag() { if (this.drag && this.drag.kind !== 'pan') { this.ctx.store.cancel(); this.drag = null; this.schedule(); return true; } return false; }

  /* ---------- Dessin ---------- */
  private render() {
    if (!this.active) return;
    const W = this.el.clientWidth, H = this.el.clientHeight;
    const { store, ui } = this.ctx, s = ui.s, d = store.doc;
    const X = this.X, Y = this.Y, k = this.k;
    const o: string[] = [];
    const line = (a: Vec2, b: Vec2, st: string) => o.push(`<line x1="${X(a.x).toFixed(1)}" y1="${Y(a.y).toFixed(1)}" x2="${X(b.x).toFixed(1)}" y2="${Y(b.y).toFixed(1)}" style="${st}"/>`);
    const path = (pts: Vec2[], close = true) => 'M' + pts.map(q => `${X(q.x).toFixed(1)} ${Y(q.y).toFixed(1)}`).join('L') + (close ? 'Z' : '');
    const text = (x: number, y: number, str: string, st: string, rot = 0) =>
      o.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" ${rot ? `transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"` : ''} style="font-family:Nunito,sans-serif;${st}">${esc(str)}</text>`);
    const pill = (x: number, y: number, str: string, bg: string, fg: string, size = 15, rot = 0) => {
      const w = str.length * size * 0.56 + 18, hh = size + 11;
      o.push(`<rect x="${(x - w / 2).toFixed(1)}" y="${(y - hh / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${hh}" rx="${hh / 2}" style="fill:${bg}" ${rot ? `transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"` : ''}/>`);
      text(x, y + 0.5, str, `font-size:${size}px;font-weight:800;fill:${fg}`, rot);
    };
    const readable = (a: Vec2, b: Vec2) => { let r = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; if (r > 90) r -= 180; if (r <= -90) r += 180; return r; };

    // Grille
    if (s.grid) {
      const x0 = this.ox, y0 = this.oy, x1 = x0 + W / k, y1 = y0 + H / k;
      const lvls: [number, string][] = [[1, '#E2E0DB'], [0.5, '#EEEDE9']];
      if (k * 0.1 >= 9) lvls.push([0.1, '#F4F3F0']);
      for (let li = lvls.length - 1; li >= 0; li--) {
        const [st, col] = lvls[li];
        for (let x = Math.ceil(x0 / st) * st; x <= x1; x += st) { if (li > 0 && Math.abs(x / lvls[li - 1][0] - Math.round(x / lvls[li - 1][0])) < 1e-6) continue; o.push(`<line x1="${X(x).toFixed(1)}" y1="0" x2="${X(x).toFixed(1)}" y2="${H}" style="stroke:${col};stroke-width:1"/>`); }
        for (let y = Math.ceil(y0 / st) * st; y <= y1; y += st) { if (li > 0 && Math.abs(y / lvls[li - 1][0] - Math.round(y / lvls[li - 1][0])) < 1e-6) continue; o.push(`<line x1="0" y1="${Y(y).toFixed(1)}" x2="${W}" y2="${Y(y).toFixed(1)}" style="stroke:${col};stroke-width:1"/>`); }
      }
    }

    // Sol et murs
    if (d.floor) {
      const pts = d.floor.points, T = d.walls.thickness, outer = offsetPolygon(pts, T), E = edges(pts);
      o.push(`<path d="${path(pts)}" style="fill:#F3EEE6"/>`);
      o.push(`<path d="${path(outer)} ${path(pts)}" style="fill:#3A3936;fill-rule:evenodd" data-testid="walls"/>`);
      // Ouvertures
      const opening = (op: Opening, ghost = false) => {
        const e = E[op.wall]; if (!e) return;
        const lo = op.t - op.width / 2, hi = op.t + op.width / 2;
        const i0 = add(e.a, mul(e.u, lo)), i1 = add(e.a, mul(e.u, hi)), o0 = add(i0, mul(e.n, T)), o1 = add(i1, mul(e.n, T));
        const col = ghost ? A : INK;
        o.push(`<path d="${path([i0, i1, o1, o0])}" style="fill:${ghost ? 'rgba(191,78,54,.25)' : BG}"/>`);
        line(i0, o0, `stroke:${col};stroke-width:1.5`); line(i1, o1, `stroke:${col};stroke-width:1.5`);
        if (op.type === 'porte') {
          const leafEnd = add(i0, mul(e.n, -op.width));
          line(i0, leafEnd, `stroke:${col};stroke-width:2`);
          const sweep = cross(sub(leafEnd, i0), sub(i1, i0)) > 0 ? 1 : 0;
          o.push(`<path d="M${X(leafEnd.x).toFixed(1)} ${Y(leafEnd.y).toFixed(1)} A${(op.width * k).toFixed(1)} ${(op.width * k).toFixed(1)} 0 0 ${sweep} ${X(i1.x).toFixed(1)} ${Y(i1.y).toFixed(1)}" style="fill:none;stroke:${col};stroke-width:1.2;stroke-dasharray:4 3"/>`);
        } else {
          const n = op.type === 'vitrine' ? 3 : 2;
          for (let j = 1; j <= n; j++) { const f = j / (n + 1); line(add(i0, mul(e.n, T * f)), add(i1, mul(e.n, T * f)), `stroke:${col};stroke-width:${op.type === 'vitrine' ? 1.6 : 1.2}`); }
        }
      };
      d.openings.forEach(op => opening(op));
      if (this.hoverGhost) opening(this.hoverGhost, true);

      // Objets (les plus grands d'abord, pour que les petits restent visibles)
      const selIds = selectedIds(this.ctx);
      for (const ob of this.sortedObjects()) {
        const fp = footprint(ob), on = selIds.includes(ob.id), flat = ob.size.h < 0.05;
        o.push(`<path d="${path(fp)}" data-object="${ob.id}" style="fill:${on ? '#FBF1ED' : flat ? 'rgba(255,255,255,.55)' : '#FFFFFF'};stroke:${on ? A : '#8A8782'};stroke-width:${on ? 2.5 : 1.5};stroke-linejoin:round${flat ? ';stroke-dasharray:5 4' : ''}"/>`);
        line(fp[3], fp[2], `stroke:${on ? A : '#6A6863'};stroke-width:3.5;stroke-linecap:round`); // face avant
        if (ob.locked) o.push(`<path d="${ICONS.lock}" transform="translate(${(X(ob.x) - 8).toFixed(1)} ${(Y(ob.y) + 2).toFixed(1)}) scale(${16 / 960})" style="fill:#6A6863"/>`);
        const wpx = Math.min(ob.size.w, ob.size.d) * k;
        if (wpx > 26 && Math.max(ob.size.w, ob.size.d) * k > 60) {
          const name = getItem(ob.model)?.name ?? '';
          text(X(ob.x), Y(ob.y) + (ob.locked ? 9 : 0), name, `font-size:${Math.min(13, Math.max(10, wpx / 4))}px;font-weight:700;fill:${on ? '#A8432D' : '#4A4945'}`);
        }
      }
      const rh = this.rotHandle();
      if (rh) {
        const f = toPlan(rh.o, 0, rh.o.size.d / 2);
        line(f, rh.p, `stroke:${A};stroke-width:2`);
        const cx = X(rh.p.x), cy = Y(rh.p.y);
        o.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="12" style="fill:#fff;stroke:${A};stroke-width:2" data-testid="rotate-handle"/>`);
        o.push(`<path d="${ICONS.rotate_right}" transform="translate(${(cx - 9).toFixed(1)} ${(cy + 9).toFixed(1)}) scale(${18 / 960})" style="fill:${A}"/>`);
        if (s.dims) pill(cx + 52, cy, `${Math.round(rh.o.rot)}°`, INK, '#fff', 12);
      }
      if (this.drag?.kind === 'band') {
        const b = this.drag;
        const r = [b.a, v(b.b.x, b.a.y), b.b, v(b.a.x, b.b.y)];
        o.push(`<path d="${path(r)}" style="fill:rgba(191,78,54,.08);stroke:${A};stroke-width:1.5;stroke-dasharray:5 4"/>`);
      }

      // Sélection
      const sel = s.sel;
      if (sel?.kind === 'wall' && E[sel.index]) {
        const e = E[sel.index], ob = outer[sel.index], oe = outer[(sel.index + 1) % pts.length];
        o.push(`<path d="${path([e.a, e.b, oe, ob])}" style="fill:rgba(191,78,54,.35);stroke:${A};stroke-width:2.5;stroke-linejoin:round"/>`);
      }
      if (sel?.kind === 'opening') {
        const op = d.openings.find(q => q.id === sel.id), e = op && E[op.wall];
        if (op && e) {
          const lo = op.t - op.width / 2, hi = op.t + op.width / 2, pad = 4 / k;
          const i0 = add(add(e.a, mul(e.u, lo - pad)), mul(e.n, -pad)), i1 = add(add(e.a, mul(e.u, hi + pad)), mul(e.n, -pad));
          o.push(`<path d="${path([i0, i1, add(i1, mul(e.n, T + 2 * pad)), add(i0, mul(e.n, T + 2 * pad))])}" style="fill:none;stroke:${A};stroke-width:2.5;stroke-linejoin:round"/>`);
          // Cotes de position : distance aux deux angles du mur
          if (s.dims) {
            const off = -0.45, pa = add(e.a, mul(e.n, off)), pl = add(add(e.a, mul(e.u, lo)), mul(e.n, off)), ph = add(add(e.a, mul(e.u, hi)), mul(e.n, off)), pb = add(e.b, mul(e.n, off));
            const st = `stroke:${A};stroke-width:1.2`;
            line(pa, pl, st); line(ph, pb, st);
            const rot = readable(e.a, e.b);
            if (lo > 0.25) pill((X(pa.x) + X(pl.x)) / 2, (Y(pa.y) + Y(pl.y)) / 2, fmtM(lo), A, '#fff', 13, rot);
            if (e.length - hi > 0.25) pill((X(ph.x) + X(pb.x)) / 2, (Y(ph.y) + Y(pb.y)) / 2, fmtM(e.length - hi), A, '#fff', 13, rot);
          }
        }
      }

      // Cotes des murs (longueur intérieure)
      if (s.dims) {
        E.forEach(e => {
          if (e.length * k < 40) return;
          const off = T + 0.55, a = add(e.a, mul(e.n, off)), b = add(e.b, mul(e.n, off));
          const st = 'stroke:#6A6863;stroke-width:1.5';
          line(a, b, st);
          line(add(e.a, mul(e.n, T + 0.15)), add(e.a, mul(e.n, off + 0.15)), st);
          line(add(e.b, mul(e.n, T + 0.15)), add(e.b, mul(e.n, off + 0.15)), st);
          const m = mul(add(a, b), 0.5);
          pill(X(m.x), Y(m.y), fmtM(e.length), BG, '#4A4945', 15, readable(e.a, e.b));
        });
      }

      // Poignées du sol
      if (s.tool === 'sol') {
        E.forEach(e => {
          if (e.length * k < 70) return;
          const m = mul(add(e.a, e.b), 0.5), hov = this.hoverMid === e.i;
          o.push(`<circle cx="${X(m.x).toFixed(1)}" cy="${Y(m.y).toFixed(1)}" r="${hov ? 11 : 9}" style="fill:${hov ? A : '#fff'};stroke:${A};stroke-width:2"/>`);
          const c = hov ? '#fff' : A;
          o.push(`<path d="M${X(m.x) - 4} ${Y(m.y)}h8M${X(m.x)} ${Y(m.y) - 4}v8" style="stroke:${c};stroke-width:2;stroke-linecap:round"/>`);
        });
        pts.forEach((q, i) => {
          const on = sel?.kind === 'vertex' && sel.index === i;
          o.push(`<circle cx="${X(q.x).toFixed(1)}" cy="${Y(q.y).toFixed(1)}" r="${on ? 9 : 7}" style="fill:${on ? A : '#fff'};stroke:${on ? '#fff' : INK};stroke-width:3" data-vertex="${i}"/>`);
        });
        if (sel?.kind === 'vertex' && pts[sel.index]) {
          const q = pts[sel.index];
          pill(X(q.x), Y(q.y) - 28, `${q.x.toFixed(2).replace('.', ',')} ; ${q.y.toFixed(2).replace('.', ',')}`, INK, '#fff', 12);
        }
      }
    }

    // Tracé en cours
    if (this.drawing) {
      const dr = s.draft, cur = s.cursor;
      // Au-delà de 10 × 7 m, le tracé passe en orange et un message apparaît près du curseur.
      const tooBig = !!cur && dr.length > 0 && !shopExtent([...dr, cur]).ok;
      const AC = tooBig ? WARN : A;
      if (tooBig && cur) pill(X(cur.x), Y(cur.y) + 34, 'Maximum 10 × 7 m', WARN, '#fff', 13);
      if (s.floorShape === 'rectangle' && dr.length && cur) {
        const a = dr[0], r = [a, v(cur.x, a.y), cur, v(a.x, cur.y)];
        o.push(`<path d="${path(r)}" style="fill:rgba(191,78,54,.07);stroke:${AC};stroke-width:4;stroke-linejoin:round"/>`);
        pill((X(a.x) + X(cur.x)) / 2, Math.min(Y(a.y), Y(cur.y)) - 26, fmtM(Math.abs(cur.x - a.x)), AC, '#fff', 16);
        pill(Math.max(X(a.x), X(cur.x)) + 50, (Y(a.y) + Y(cur.y)) / 2, fmtM(Math.abs(cur.y - a.y)), AC, '#fff', 16);
      } else if (dr.length) {
        const all = cur ? [...dr, cur] : dr;
        if (all.length >= 3) o.push(`<path d="${path(all)}" style="fill:rgba(191,78,54,.07)"/>`);
        if (cur && dr.length >= 2) line(cur, dr[0], `stroke:${A};stroke-width:1.5;stroke-dasharray:2 6;stroke-linecap:round;opacity:.6`);
        for (let i = 0; i < dr.length - 1; i++) line(dr[i], dr[i + 1], `stroke:${INK};stroke-width:5;stroke-linecap:round`);
        if (s.dims) for (let i = 0; i < dr.length - 1; i++) {
          const a = dr[i], b = dr[i + 1]; if (dist(a, b) * k < 40) continue;
          const n = norm(v(b.y - a.y, -(b.x - a.x))), m = add(mul(add(a, b), 0.5), mul(n, 22 / k));
          pill(X(m.x), Y(m.y), fmtM(dist(a, b)), BG, '#4A4945', 15, readable(a, b));
        }
        if (cur) {
          const last = dr[dr.length - 1];
          line(last, cur, `stroke:${AC};stroke-width:5;stroke-linecap:round`);
          const l = dist(last, cur);
          if (l > 0.01) {
            const n = norm(v(-(cur.y - last.y), cur.x - last.x)), m = add(mul(add(last, cur), 0.5), mul(n, 34 / k));
            pill(X(m.x), Y(m.y), fmtM(l), AC, '#fff', 18);
          }
        }
        dr.forEach((q, i) => o.push(`<circle cx="${X(q.x).toFixed(1)}" cy="${Y(q.y).toFixed(1)}" r="${i ? 7 : 10}" style="fill:#fff;stroke:${i ? INK : A};stroke-width:${i ? 3 : 4}"/>`));
        const st = dr[0];
        o.push(`<rect x="${X(st.x) - 40}" y="${Y(st.y) - 46}" width="80" height="26" rx="13" style="fill:#fff;stroke:${A};stroke-width:1.5"/>`);
        text(X(st.x), Y(st.y) - 33, 'Départ', `font-size:13px;font-weight:800;fill:${A}`);
      }
      // Curseur aimanté
      if (cur) {
        const sn = this.snapInfo;
        if (sn?.guides.x !== undefined) o.push(`<line x1="${X(sn.guides.x).toFixed(1)}" y1="0" x2="${X(sn.guides.x).toFixed(1)}" y2="${H}" style="stroke:${A};stroke-width:1;stroke-dasharray:6 6;opacity:.45"/>`);
        if (sn?.guides.y !== undefined) o.push(`<line x1="0" y1="${Y(sn.guides.y).toFixed(1)}" x2="${W}" y2="${Y(sn.guides.y).toFixed(1)}" style="stroke:${A};stroke-width:1;stroke-dasharray:6 6;opacity:.45"/>`);
        const cx = X(cur.x), cy = Y(cur.y);
        o.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="16" style="fill:rgba(191,78,54,.14);stroke:${A};stroke-width:2"/>`);
        o.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5" style="fill:${A}"/>`);
        if (s.snap && sn && sn.kind !== 'free') {
          const label = sn.kind === 'point' ? 'Sur un point' : 'Aimanté';
          o.push(`<rect x="${cx - 50}" y="${cy - 58}" width="100" height="28" rx="8" style="fill:${INK}"/>`);
          text(cx, cy - 44, label, 'font-size:13px;font-weight:800;fill:#fff');
        }
      }
    }
    // Aimantation pendant le déplacement d'un sommet
    if (this.drag?.kind === 'vertex' && this.snapInfo) {
      const sn = this.snapInfo;
      if (sn.guides.x !== undefined) o.push(`<line x1="${X(sn.guides.x).toFixed(1)}" y1="0" x2="${X(sn.guides.x).toFixed(1)}" y2="${H}" style="stroke:${A};stroke-width:1;stroke-dasharray:6 6;opacity:.45"/>`);
      if (sn.guides.y !== undefined) o.push(`<line x1="0" y1="${Y(sn.guides.y).toFixed(1)}" x2="${W}" y2="${Y(sn.guides.y).toFixed(1)}" style="stroke:${A};stroke-width:1;stroke-dasharray:6 6;opacity:.45"/>`);
    }
    this.svg.innerHTML = o.join('');
  }

  /** Surface et longueur du tracé en cours (pour le panneau). */
  draftStats() {
    const s = this.ctx.ui.s, dr = s.draft, cur = s.cursor;
    if (s.floorShape === 'rectangle') {
      if (!dr.length || !cur) return { seg: 0, total: 0, surface: 0 };
      const w = Math.abs(cur.x - dr[0].x), h = Math.abs(cur.y - dr[0].y);
      return { seg: Math.max(w, h), total: 2 * (w + h), surface: w * h };
    }
    const all = cur ? [...dr, cur] : dr;
    let total = 0; for (let i = 0; i < all.length - 1; i++) total += dist(all[i], all[i + 1]);
    return { seg: dr.length && cur ? dist(dr[dr.length - 1], cur) : 0, total, surface: all.length >= 3 ? area(all) : 0 };
  }

  /** Point suivant à une distance donnée, dans la direction du curseur (saisie au clavier). */
  pointAtLength(l: number): Vec2 | null {
    const s = this.ctx.ui.s, last = s.draft[s.draft.length - 1];
    if (!last) return null;
    let dir = s.cursor && dist(s.cursor, last) > 1e-3 ? norm(sub(s.cursor, last)) : v(1, 0);
    const a = Math.atan2(dir.y, dir.x), snapA = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
    if (Math.abs(a - snapA) < 0.14) dir = v(Math.cos(snapA), Math.sin(snapA)); // presque droit → droit
    return v(Math.round((last.x + dir.x * l) * 1000) / 1000, Math.round((last.y + dir.y * l) * 1000) / 1000);
  }
}


