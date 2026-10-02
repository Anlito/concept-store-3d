import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Ctx, ShadowQuality } from '../app/state';
import type { Project } from '../model/types';
import { bounds, edges } from '../model/geometry';
import { OPENING_DEFAULTS, findFreeT, wallLength } from '../model/project';
import { buildShop, wallMatrix, fixture, type BuiltShop, type Pick } from './build';
import { placeOpening, selectPick } from '../app/actions';

const ACCENT = '#BF4E36';
const LOW_WALL = 0.35; // hauteur des murs abaissés (m)

/** Vue 3D : rendu à la demande (pas de calcul quand rien ne bouge, pour les PC modestes). */
export class View3D {
  readonly el: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
  private controls: OrbitControls;
  private sun = new THREE.DirectionalLight(0xffffff, 1.7);
  private shop: BuiltShop | null = null;
  private shopKey = '';
  private overlay = new THREE.Group();
  private ghost: THREE.Group | null = null;
  private needsRender = true;
  private active = false;
  private raycaster = new THREE.Raycaster();
  private framedOnce = false;
  private lowered = new Set<number>();

  constructor(private ctx: Ctx) {
    this.el = document.createElement('div');
    this.el.className = 'vp-3d';
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.el.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#EFEEEA');
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xe6dfd3, 1.9));
    const fill = new THREE.DirectionalLight(0xfff4e8, 0.35); fill.position.set(10, 6, 12); this.scene.add(fill);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.122; ground.receiveShadow = true;
    this.scene.add(ground, this.overlay);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 80;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('change', () => { this.needsRender = true; });
    this.camera.position.set(5, 12, 18);

    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(this.el);
    ctx.store.subscribe(() => this.sync());
    ctx.ui.subscribe(ch => {
      if (ch.includes('shadows')) this.applyShadows();
      if (ch.includes('sel') || ch.includes('tool')) this.drawSelection();
      if (ch.includes('cutaway')) this.updateCutaway(true);
      this.needsRender = true;
    });
    this.applyShadows();
    this.sync();
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.active) return;
      if (this.controls.update()) this.needsRender = true;
      if (this.needsRender) { this.updateCutaway(); this.renderer.render(this.scene, this.camera); this.needsRender = false; }
    };
    requestAnimationFrame(loop);
  }

  setActive(on: boolean) {
    this.active = on;
    if (on) { this.resize(); if (!this.framedOnce && this.ctx.store.doc.floor) this.frame(); this.needsRender = true; }
  }

  private resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  /** Cadre la boutique (vue de trois quarts, depuis l'avant-gauche comme dans les maquettes). */
  frame() {
    const f = this.ctx.store.doc.floor;
    const b = f ? bounds(f.points) : { x0: 0, y0: 0, x1: 10, y1: 7, w: 10, h: 7 };
    const c = new THREE.Vector3((b.x0 + b.x1) / 2, 0.6, (b.y0 + b.y1) / 2);
    const r = Math.max(b.w, b.h, 3);
    this.controls.target.copy(c);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const d = (r * 0.8) / Math.tan(fov / 2) / Math.min(1, this.camera.aspect * 0.9);
    this.camera.position.copy(c).add(new THREE.Vector3(-0.42, 0.62, 0.66).normalize().multiplyScalar(d));
    this.controls.update();
    this.framedOnce = true;
    this.needsRender = true;
  }
  zoom(f: number) {
    const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f);
    if (off.length() < this.controls.minDistance || off.length() > this.controls.maxDistance) return;
    this.camera.position.copy(this.controls.target).add(off);
    this.needsRender = true;
  }

  private applyShadows() {
    const q: ShadowQuality = this.ctx.ui.s.shadows;
    this.renderer.shadowMap.enabled = q !== 'off';
    this.sun.castShadow = q !== 'off';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.radius = q === 'high' ? 3 : 1.5;
    this.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && 'needsUpdate' in m) m.needsUpdate = true; });
    this.renderer.setPixelRatio(q === 'off' ? 1 : Math.min(devicePixelRatio, 1.5));
    this.resize();
    this.needsRender = true;
  }

  /** Reconstruit la boutique si le sol, les murs ou les ouvertures ont changé. */
  private sync() {
    const d = this.ctx.store.doc;
    const key = JSON.stringify([d.floor, d.walls, d.openings]);
    if (key !== this.shopKey) {
      this.shopKey = key;
      if (this.shop) { this.scene.remove(this.shop.root); disposeTree(this.shop.root); }
      this.shop = buildShop(d);
      this.scene.add(this.shop.root);
      this.fitSun(d);
      this.lowered.clear();
      this.updateCutaway(true);
      if (d.floor && !this.framedOnce && this.active) this.frame();
    }
    this.drawSelection();
    this.needsRender = true;
  }

  private fitSun(d: Project) {
    const b = d.floor ? bounds(d.floor.points) : { x0: 0, y0: 0, x1: 10, y1: 7, w: 10, h: 7 };
    const c = new THREE.Vector3((b.x0 + b.x1) / 2, 0, (b.y0 + b.y1) / 2), r = Math.hypot(b.w, b.h) / 2 + 2;
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).add(new THREE.Vector3(0.55, 1.6, 0.7).normalize().multiplyScalar(r * 2.5));
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -r; cam.right = cam.top = r; cam.near = 0.5; cam.far = r * 5;
    cam.updateProjectionMatrix();
  }

  /** Abaisse les murs dont la face extérieure regarde la caméra (on voit l'intérieur, comme une maquette). */
  private updateCutaway(force = false) {
    if (!this.shop) return;
    const cam = new THREE.Vector2(this.camera.position.x, this.camera.position.z);
    const on = this.ctx.ui.s.cutaway;
    let changed = false;
    for (const w of this.shop.walls) {
      const low = on && cam.clone().sub(w.mid).dot(w.normal) > 0.3;
      if (low !== this.lowered.has(w.index) || force) {
        if (low) this.lowered.add(w.index); else this.lowered.delete(w.index);
        w.group.scale.y = low ? LOW_WALL / w.height : 1;
        changed = true;
      }
    }
    if (changed) { this.drawSelection(); this.needsRender = true; }
  }

  /** Surbrillance de l'élément choisi (mur ou ouverture). */
  private drawSelection() {
    disposeTree(this.overlay); this.overlay.clear();
    const d = this.ctx.store.doc, sel = this.ctx.ui.s.sel;
    if (!d.floor || !sel || !this.shop) { this.needsRender = true; return; }
    const E = edges(d.floor.points);
    const T = d.walls.thickness;
    const mat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const line = new THREE.LineBasicMaterial({ color: ACCENT });
    const addRect = (wall: number, u0: number, u1: number, h0: number, h1: number) => {
      const e = E[wall], k = this.lowered.has(wall) ? LOW_WALL / d.walls.height : 1;
      const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(wallMatrix(e.a.x, e.a.y, e.u.x, e.u.y));
      for (const z of [0.004, -T - 0.004]) {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(u1 - u0, (h1 - h0) * k), mat);
        pl.position.set((u0 + u1) / 2, ((h0 + h1) / 2) * k, z); g.add(pl);
        const pts = [new THREE.Vector3(u0, h0 * k, z), new THREE.Vector3(u1, h0 * k, z), new THREE.Vector3(u1, h1 * k, z), new THREE.Vector3(u0, h1 * k, z)];
        g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), line));
      }
      this.overlay.add(g);
    };
    if (sel.kind === 'wall' && E[sel.index]) addRect(sel.index, 0, E[sel.index].length, 0, d.walls.height);
    if (sel.kind === 'opening') {
      const o = d.openings.find(q => q.id === sel.id);
      if (o) addRect(o.wall, o.t - o.width / 2, o.t + o.width / 2, o.sill, o.sill + o.height);
    }
    this.needsRender = true;
  }

  /* ---------- Souris ---------- */
  private pick(e: PointerEvent): { pick: Pick; point: THREE.Vector3; object: THREE.Object3D } | null {
    if (!this.shop) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.shop.pickables, true);
    for (const h of hits) { const p = h.object.userData.pick as Pick | undefined; if (p) return { pick: p, point: h.point, object: h.object }; }
    return null;
  }
  /** Position le long du mur i (m) d'un point 3D. */
  private tOnWall(i: number, p: THREE.Vector3) {
    const e = edges(this.ctx.store.doc.floor!.points)[i];
    return (p.x - e.a.x) * e.u.x + (p.z - e.a.y) * e.u.y;
  }
  /** Intersection du rayon souris avec le plan intérieur du mur i. */
  private rayOnWall(e: PointerEvent, i: number) {
    const ed = edges(this.ctx.store.doc.floor!.points)[i];
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(ed.n.x, 0, ed.n.y), new THREE.Vector3(ed.a.x, 0, ed.a.y));
    return this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }

  private bindPointer() {
    const cv = this.renderer.domElement;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    let down: { x: number; y: number; empty: boolean } | null = null;
    let drag: { id: string; wall: number; dt: number } | null = null;
    // Écouteur en phase de capture : il passe avant OrbitControls et peut le désactiver pendant un glisser.
    this.el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const hit = this.pick(e);
      down = { x: e.clientX, y: e.clientY, empty: !hit || hit.pick.kind === 'floor' };
      const { store, ui } = this.ctx;
      if (!hit) return;
      if (hit.pick.kind === 'opening') {
        const o = store.doc.openings.find(q => q.id === (hit.pick as { id: string }).id)!;
        selectPick(this.ctx, hit.pick);
        drag = { id: o.id, wall: o.wall, dt: o.t - this.tOnWall(o.wall, hit.point) };
        this.controls.enabled = false; store.begin(); cv.setPointerCapture(e.pointerId);
      } else if (hit.pick.kind === 'wall') {
        if (ui.s.tool === 'ouvertures') {
          placeOpening(this.ctx, hit.pick.index, this.tOnWall(hit.pick.index, hit.point));
          this.controls.enabled = false;
        } else selectPick(this.ctx, hit.pick);
      }
    }, { capture: true });
    this.el.addEventListener('pointermove', e => {
      if (drag) {
        const p = this.rayOnWall(e, drag.wall); if (!p) return;
        const { store } = this.ctx;
        const o = store.doc.openings.find(q => q.id === drag!.id); if (!o) return;
        const t = findFreeT(store.doc, o.wall, o.width, this.tOnWall(drag.wall, p) + drag.dt, o.id);
        if (t !== null) store.live(d => { d.openings.find(q => q.id === o.id)!.t = Math.round(t * 100) / 100; });
        return;
      }
      if (e.buttons === 0) this.hover(e);
    });
    const up = (e: PointerEvent) => {
      if (drag) { this.ctx.store.end(); drag = null; }
      if (down && down.empty && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) this.ctx.ui.set({ sel: null });
      down = null;
      this.controls.enabled = true;
    };
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
    this.el.addEventListener('pointerleave', () => this.setGhost(null));
  }

  /** Aperçu de l'ouverture à poser quand on survole un mur avec l'outil « Portes / fenêtres ». */
  private hover(e: PointerEvent) {
    const { ui, store } = this.ctx;
    if (ui.s.tool !== 'ouvertures') { this.setGhost(null); return; }
    const hit = this.pick(e);
    if (!hit || hit.pick.kind !== 'wall') { this.setGhost(null); this.el.style.cursor = hit?.pick.kind === 'opening' ? 'grab' : ''; return; }
    const i = hit.pick.index, def = OPENING_DEFAULTS[ui.s.placeType];
    const width = Math.min(def.width, wallLength(store.doc, i) - 0.2);
    const t = findFreeT(store.doc, i, width, this.tOnWall(i, hit.point));
    this.el.style.cursor = t === null ? 'not-allowed' : 'copy';
    if (t === null) { this.setGhost(null); return; }
    const height = Math.min(def.height, store.doc.walls.height - def.sill - 0.05);
    this.setGhost({ wall: i, o: { id: 'ghost', wall: i, type: ui.s.placeType, t, width, height, sill: def.sill } });
  }
  private setGhost(g: { wall: number; o: import('../model/types').Opening } | null) {
    if (this.ghost) { this.scene.remove(this.ghost); disposeTree(this.ghost); this.ghost = null; }
    if (g && this.ctx.store.doc.floor) {
      const e = edges(this.ctx.store.doc.floor.points)[g.wall], T = this.ctx.store.doc.walls.thickness;
      const grp = new THREE.Group(); grp.matrixAutoUpdate = false; grp.matrix.copy(wallMatrix(e.a.x, e.a.y, e.u.x, e.u.y));
      const f = fixture(g.o, T);
      f.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { m.material = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55, depthTest: false }); m.renderOrder = 5; } });
      const pl = new THREE.Mesh(new THREE.BoxGeometry(g.o.width, g.o.height, T + 0.02),
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.18, depthTest: false }));
      pl.position.set(g.o.t, g.o.sill + g.o.height / 2, -T / 2); pl.renderOrder = 4;
      grp.add(pl, f);
      this.ghost = grp; this.scene.add(grp);
    }
    this.needsRender = true;
  }
}

function disposeTree(o: THREE.Object3D) {
  o.traverse(c => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}
