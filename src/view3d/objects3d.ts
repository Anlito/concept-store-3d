import * as THREE from 'three';
import type { Ctx } from '../app/state';
import type { PlacedObject } from '../model/types';
import { getItem, instantiate, loadProto, onProtoForgotten } from '../library/library';
import { normRot, snapToWall } from '../model/objects';
import { snapTo } from '../model/geometry';
import { selectedIds, selectObjects } from '../app/objectActions';
import { h, icon } from '../ui/dom';
import type { Pick } from './build';

/* Objets posés en 3D : affichage, poignées de sélection (maquette 02) et déplacements à la souris. */

const ACCENT = new THREE.Color('#BF4E36');
const rad = (d: number) => (d * Math.PI) / 180;

interface Host {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  setOrbit(on: boolean): void;
  invalidate(): void;
  ray(e: PointerEvent | MouseEvent): THREE.Ray;
}
interface Entry { group: THREE.Group; key: string; ready: boolean }

export class ObjectLayer {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  private sel = new THREE.Group();
  private moveH: HTMLElement; private rotH: HTMLElement; private label: HTMLElement;
  private ringR = 1;
  private drag: null | { kind: 'move'; start: THREE.Vector3; orig: Map<string, { x: number; y: number }>; primary: string }
    | { kind: 'rot'; c: THREE.Vector2; a0: number; orig: Map<string, number> } = null;

  constructor(private ctx: Ctx, private host: Host, overlayRoot: HTMLElement) {
    this.group.name = 'objets';
    this.sel.renderOrder = 10;
    this.moveH = h('div', { class: 'h3d h-move', title: 'Glisser pour déplacer' }, icon('open_with'));
    this.rotH = h('div', { class: 'h3d h-rot', title: 'Glisser pour tourner' }, icon('rotate_right'));
    this.label = h('div', { class: 'tag3d' });
    overlayRoot.append(this.moveH, this.rotH, this.label);
    for (const el of [this.moveH, this.rotH]) el.addEventListener('pointerdown', e => this.onHandleDown(e, el === this.moveH ? 'move' : 'rot'));
    window.addEventListener('pointermove', e => this.onMove(e));
    window.addEventListener('pointerup', () => this.onUp());
    // Création modifiée dans l'atelier : on reconstruit les objets qui l'utilisent.
    onProtoForgotten(id => {
      for (const [oid, e] of this.entries) if (e.key.startsWith(id + '|')) { this.group.remove(e.group); this.entries.delete(oid); }
      this.sync(); this.host.invalidate();
    });
  }

  get selectionGroup() { return this.sel; }
  get dragging() { return !!this.drag; }

  /** Met la scène à jour d'après le projet (création, suppression, position, taille, couleur). */
  sync() {
    const objs = this.ctx.store.doc.objects;
    const keep = new Set(objs.map(o => o.id));
    for (const [id, e] of this.entries) if (!keep.has(id)) { this.group.remove(e.group); this.entries.delete(id); }
    for (const o of objs) {
      const key = o.model + '|' + (o.color ?? '');
      let e = this.entries.get(o.id);
      if (!e || e.key !== key) {
        if (e) this.group.remove(e.group);
        const g = new THREE.Group(); g.userData.id = o.id;
        e = { group: g, key, ready: false };
        this.entries.set(o.id, e);
        this.group.add(g);
        const entry = e;
        loadProto(o.model).then(proto => {
          if (this.entries.get(o.id) !== entry) return;
          const inst = instantiate(proto, o.color);
          const pick: Pick = { kind: 'object', id: o.id };
          inst.traverse(c => { c.userData.pick = pick; });
          inst.userData.dims = proto.dims;
          g.add(inst); entry.ready = true;
          this.place(g, this.ctx.store.doc.objects.find(x => x.id === o.id));
          this.drawSelection(); this.host.invalidate();
        }).catch(err => console.error(err));
      }
      this.place(e.group, o);
    }
    this.drawSelection();
  }

  private place(g: THREE.Group, o: PlacedObject | undefined) {
    if (!o) return;
    g.position.set(o.x, o.z, o.y);
    g.rotation.y = -rad(o.rot);
    const inst = g.children[0];
    const dims = inst?.userData.dims as PlacedObject['size'] | undefined;
    if (inst && dims) inst.scale.set(o.size.w / dims.w, o.size.h / dims.h, o.size.d / dims.d);
  }

  pickables() { return [this.group]; }

  /** Contours de sélection : emprise en tirets, arêtes, anneau de rotation. */
  drawSelection() {
    this.sel.traverse(c => { const m = c as THREE.Mesh; m.geometry?.dispose(); });
    this.sel.clear();
    const ids = selectedIds(this.ctx);
    const objs = this.ctx.store.doc.objects.filter(o => ids.includes(o.id));
    const dash = new THREE.LineDashedMaterial({ color: ACCENT, dashSize: 0.1, gapSize: 0.07, depthTest: false, transparent: true });
    const solid = new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false, transparent: true });
    for (const o of objs) {
      const g = new THREE.Group();
      g.position.set(o.x, o.z, o.y); g.rotation.y = -rad(o.rot);
      const w = o.size.w / 2, d = o.size.d / 2, hh = o.size.h;
      const rect = (y: number) => [new THREE.Vector3(-w, y, -d), new THREE.Vector3(w, y, -d), new THREE.Vector3(w, y, d), new THREE.Vector3(-w, y, d)];
      const base = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rect(0.01)), dash); base.computeLineDistances();
      const top = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rect(hh)), solid);
      const verts = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rect(0).flatMap((p, i) => [p, rect(hh)[i]])), solid);
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(o.size.w, o.size.d), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.1, depthTest: false, side: THREE.DoubleSide }));
      fill.rotation.x = -Math.PI / 2; fill.position.y = 0.005;
      for (const x of [base, top, verts, fill]) { x.renderOrder = 10; g.add(x); }
      if (objs.length === 1) {
        this.ringR = Math.max(o.size.w, o.size.d) / 2 * 1.15 + 0.3;
        const pts = Array.from({ length: 65 }, (_, i) => new THREE.Vector3(Math.cos(i / 64 * Math.PI * 2) * this.ringR, 0.01 - o.z, Math.sin(i / 64 * Math.PI * 2) * this.ringR));
        const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: ACCENT, dashSize: 0.04, gapSize: 0.1, depthTest: false, transparent: true, opacity: 0.85 }));
        ring.computeLineDistances(); ring.renderOrder = 10; g.add(ring);
      }
      this.sel.add(g);
    }
    this.updateHandles();
  }

  /** Place les poignées HTML (déplacer, tourner, dimensions) au-dessus de l'objet sélectionné. */
  updateHandles() {
    const ids = selectedIds(this.ctx);
    const objs = this.ctx.store.doc.objects.filter(o => ids.includes(o.id));
    const show = objs.length > 0 && this.ctx.ui.s.view === '3d';
    const anyLocked = objs.some(o => o.locked);
    this.moveH.style.display = show && !anyLocked ? '' : 'none';
    this.rotH.style.display = show && !anyLocked && objs.length === 1 ? '' : 'none';
    this.label.style.display = show && objs.length === 1 ? '' : 'none';
    if (!show) return;
    const cam = this.host.camera, cv = this.host.canvas;
    const toScreen = (p: THREE.Vector3) => { const q = p.clone().project(cam); return { x: (q.x + 1) / 2 * cv.clientWidth, y: (1 - q.y) / 2 * cv.clientHeight, behind: q.z > 1 }; };
    // Centre du groupe sélectionné
    const c = new THREE.Vector3(); let top = 0;
    for (const o of objs) { c.x += o.x / objs.length; c.z += o.y / objs.length; top = Math.max(top, o.z + o.size.h); }
    const m = toScreen(new THREE.Vector3(c.x, top, c.z));
    Object.assign(this.moveH.style, { left: m.x + 'px', top: (m.y - 46) + 'px' });
    if (objs.length === 1) {
      const o = objs[0];
      const dir = new THREE.Vector2(cam.position.x - o.x, cam.position.z - o.y).normalize();
      const r = toScreen(new THREE.Vector3(o.x + dir.x * this.ringR, 0.01, o.y + dir.y * this.ringR));
      Object.assign(this.rotH.style, { left: r.x + 'px', top: r.y + 'px' });
      const corner = toScreen(new THREE.Vector3(o.x, o.z + o.size.h, o.y));
      this.label.textContent = `${Math.round(o.size.w * 100)} × ${Math.round(o.size.d * 100)} × ${Math.round(o.size.h * 100)} cm` + (o.locked ? ' · verrouillé' : '');
      Object.assign(this.label.style, { left: (corner.x + 70) + 'px', top: (corner.y - 20) + 'px' });
    }
  }

  /* ---------- Souris ---------- */
  private floorPoint(e: PointerEvent | MouseEvent, y = 0) {
    const p = this.host.ray(e).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3());
    return p;
  }

  /** Clic sur un objet dans la vue 3D : sélection (Maj = ajouter / retirer) et début du glisser. */
  onObjectDown(e: PointerEvent, id: string) {
    const ids = selectedIds(this.ctx);
    if (e.shiftKey) { selectObjects(this.ctx, [id], true); return true; }
    if (!ids.includes(id)) selectObjects(this.ctx, [id]);
    return this.beginMove(e, id);
  }

  private onHandleDown(e: PointerEvent, kind: 'move' | 'rot') {
    e.preventDefault(); e.stopPropagation();
    const objs = this.ctx.store.doc.objects.filter(o => selectedIds(this.ctx).includes(o.id));
    if (!objs.length) return;
    if (kind === 'move') this.beginMove(e, objs[0].id);
    else {
      const o = objs[0], p = this.floorPoint(e); if (!p) return;
      this.ctx.store.begin();
      this.drag = { kind: 'rot', c: new THREE.Vector2(o.x, o.y), a0: Math.atan2(p.z - o.y, p.x - o.x), orig: new Map(objs.map(x => [x.id, x.rot])) };
      this.host.setOrbit(false);
    }
  }

  private beginMove(e: PointerEvent, primary: string) {
    const objs = this.ctx.store.doc.objects.filter(o => selectedIds(this.ctx).includes(o.id) && !o.locked);
    if (!objs.some(o => o.id === primary)) return false;
    const p = this.floorPoint(e); if (!p) return false;
    this.ctx.store.begin();
    this.drag = { kind: 'move', start: p, orig: new Map(objs.map(o => [o.id, { x: o.x, y: o.y }])), primary };
    this.host.setOrbit(false);
    document.body.style.cursor = 'grabbing';
    return true;
  }

  private onMove(e: PointerEvent) {
    const d = this.drag; if (!d) return;
    const { store, ui } = this.ctx;
    const p = this.floorPoint(e); if (!p) return;
    if (d.kind === 'move') {
      let dx = p.x - d.start.x, dy = p.z - d.start.z;
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
      const a = Math.atan2(p.z - d.c.y, p.x - d.c.x);
      const delta = ((a - d.a0) * 180) / Math.PI;
      store.live(doc => {
        for (const o of doc.objects) {
          const r0 = d.orig.get(o.id); if (r0 === undefined) continue;
          let r = r0 + delta;
          if (!e.shiftKey) r = Math.round(r / 15) * 15;
          o.rot = normRot(r);
        }
      });
    }
  }

  private onUp() {
    if (!this.drag) return;
    this.drag = null;
    this.ctx.store.end();
    this.host.setOrbit(true);
    document.body.style.cursor = '';
  }

  /** Échap pendant un glisser : on revient à la position de départ. */
  cancel() { if (this.drag) { this.drag = null; this.ctx.store.cancel(); this.host.setOrbit(true); document.body.style.cursor = ''; return true; } return false; }
}
