import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Ctx, ShadowQuality } from '../app/state';
import type { Project } from '../model/types';
import { bounds, edges } from '../model/geometry';
import { OPENING_DEFAULTS, findFreeT, imageExtent, insideFloor, rugCorners, wallHeight, wallLength, wallSegs } from '../model/project';
import { pieceAt } from '../model/rooms';
import { buildShop, wallMatrix, fixture, type BuiltShop, type Pick } from './build';
import { placeOpening, selectPan, selectPick, selectRoomAt } from "../app/actions";
import { ObjectLayer } from "./objects3d";
import { toast } from '../ui/components';
import { buildImages, type BuiltImages } from './images3d';

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
  /** Pendant une photo : murs avant abaissés ou non, sans toucher au réglage de l'élève. */
  private cutOverride: boolean | null = null;
  readonly objects: ObjectLayer;
  private images: BuiltImages | null = null;
  private imagesKey = '';

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

    const ov = document.createElement("div"); ov.className = "vp-3d-ov"; this.el.appendChild(ov);
    this.objects = new ObjectLayer(ctx, {
      camera: this.camera, canvas: this.renderer.domElement,
      setOrbit: on => { this.controls.enabled = on; },
      invalidate: () => { this.needsRender = true; },
      ray: e => this.rayFrom(e),
    }, ov);
    this.scene.add(this.objects.group, this.objects.selectionGroup);
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(this.el);
    ctx.store.subscribe(() => this.sync());
    ctx.ui.subscribe(ch => {
      if (ch.includes('shadows')) this.applyShadows();
      if (ch.includes("sel") || ch.includes("tool")) { this.drawSelection(); this.objects.drawSelection(); }
      if (ch.includes("view")) this.objects.updateHandles();
      if (ch.includes('cutaway')) this.updateCutaway(true);
      this.needsRender = true;
    });
    this.applyShadows();
    this.sync();
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.active) return;
      if (this.controls.update()) this.needsRender = true;
      if (this.needsRender) { this.updateCutaway(); this.renderer.render(this.scene, this.camera); this.objects.updateHandles(); this.needsRender = false; this.watchSpeed(); }
    };
    requestAnimationFrame(loop);
  }

  /** Surveille la fluidité pendant les mouvements : si la 3D est saccadée avec des ombres, on propose de les couper. */
  private frames: number[] = [];
  private lastFrame = 0;
  private speedWarned = false;
  private watchSpeed() {
    const now = performance.now(), dt = now - this.lastFrame;
    this.lastFrame = now;
    // On ne compte que les images enchaînées (rotation, glisser…) ; rien sous pilotage automatique (tests).
    if (this.speedWarned || dt > 400 || navigator.webdriver) return;
    this.frames.push(dt);
    if (this.frames.length < 90) return;
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    this.frames = [];
    if (avg > 55 && this.ctx.ui.s.shadows !== 'off') {
      this.speedWarned = true;
      toast('La 3D est saccadée sur ce poste.', { label: 'Couper les ombres', run: () => { this.ctx.ui.set({ shadows: 'off' }); try { localStorage.setItem('cs3d-shadows', 'off'); } catch { /* ignoré */ } } }, 'warning');
    }
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
  /** Photo du rendu 3D (data URL), à la taille demandée, sans les poignées de sélection.
      La caméra, les ombres et les murs sont remis comme avant après la prise de vue. */
  capture(o: { w: number; h: number; mime: 'image/png' | 'image/jpeg'; view: PhotoView; best: boolean; background: string }): string {
    const cam = this.camera.position.clone(), target = this.controls.target.clone();
    const size = this.renderer.getSize(new THREE.Vector2()), ratio = this.renderer.getPixelRatio(), bg = (this.scene.background as THREE.Color).clone();
    const hidden = [this.overlay, this.objects.selectionGroup, this.ghost].filter(Boolean) as THREE.Object3D[];
    hidden.forEach(x => { x.visible = false; });
    if (o.best) this.applyShadows('high');
    this.scene.background = new THREE.Color(o.background);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(o.w, o.h, false);
    this.camera.aspect = o.w / o.h; this.camera.updateProjectionMatrix();
    if (o.view !== 'actuelle') this.placeCamera(o.view); // cadrage calculé au format de la photo
    this.updateCutaway(true);
    this.renderer.render(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera); // deuxième passe : carte d'ombres à jour
    const url = this.renderer.domElement.toDataURL(o.mime, 0.92);
    // Remise en état
    hidden.forEach(x => { x.visible = true; });
    this.cutOverride = null;
    this.scene.background = bg;
    this.camera.position.copy(cam); this.controls.target.copy(target); this.controls.update();
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(size.x, size.y, false);
    this.camera.aspect = size.x / size.y; this.camera.updateProjectionMatrix();
    if (o.best) this.applyShadows();
    this.updateCutaway(true);
    this.needsRender = true;
    return url;
  }

  /** Angles prédéfinis pour les photos. */
  private placeCamera(view: PhotoView) {
    const d = this.ctx.store.doc;
    if (!d.floor) return;
    if (view === 'facade') { this.facade(true); return; }
    const b = bounds(d.floor.points);
    const c = new THREE.Vector3((b.x0 + b.x1) / 2, 0.8, (b.y0 + b.y1) / 2), r = Math.max(b.w, b.h, 3);
    const fov = THREE.MathUtils.degToRad(this.camera.fov), dist = (r * 0.85) / Math.tan(fov / 2);
    this.controls.target.copy(c);
    if (view === 'dessus') { this.cutOverride = false; this.camera.position.set(c.x, dist * 1.3, c.z + dist * 0.12); }
    else if (view === 'interieur') { // depuis un angle de la boutique, à hauteur d'yeux
      this.cutOverride = false;
      this.camera.position.set(b.x0 + 0.5, 1.6, b.y1 - 0.5);
      this.controls.target.set((b.x0 + b.x1) / 2 + b.w * 0.15, 1.1, (b.y0 + b.y1) / 2 - b.h * 0.1);
    } else {
      this.cutOverride = true;
      const dir = new THREE.Vector3(view === 'gauche' ? -0.55 : 0.55, 0.62, 0.75).normalize();
      this.camera.position.copy(c).add(dir.multiplyScalar(dist));
    }
    this.camera.lookAt(this.controls.target);
  }

  /** Place la caméra dans la rue, face à la façade (mur choisi, sinon celui de la porte d'entrée). */
  facade(forPhoto = false) {
    const d = this.ctx.store.doc, s = this.ctx.ui.s;
    if (!d.floor) return;
    const E = edges(d.floor.points), n = E.length;
    let i = s.sel?.kind === 'wall' ? s.sel.index
      : s.sel?.kind === 'opening' ? d.openings.find(o => o.id === (s.sel as { id: string }).id)?.wall ?? -1
      : s.sel?.kind === 'image' ? d.images.find(o => o.id === (s.sel as { id: string }).id)?.wall ?? -1 : -1;
    if (i >= n) i = -1; // une cloison n'a pas de façade
    const front = (t: string) => d.openings.find(o => o.type === t && o.wall < n)?.wall;
    if (i < 0) i = front('porte') ?? front('vitrine') ?? E.reduce((b, e) => (e.length > E[b].length ? e.i : b), 0);
    const e = E[i], H = d.walls.height;
    const mid = new THREE.Vector3((e.a.x + e.b.x) / 2, H * 0.45, (e.a.y + e.b.y) / 2);
    const fov = THREE.MathUtils.degToRad(this.camera.fov), dist = Math.max((e.length * (forPhoto ? 0.56 : 0.62)) / Math.tan(fov / 2) / this.camera.aspect, 4);
    if (forPhoto) this.cutOverride = false; else this.ctx.ui.set({ cutaway: false });
    this.controls.target.copy(mid);
    this.camera.position.set(mid.x + e.n.x * dist, 1.6, mid.z + e.n.y * dist);
    this.controls.update(); this.needsRender = true;
  }
  /** Place la caméra face à une image : devant le mur (dans la boutique, ou dans la rue pour la façade), ou au-dessus d'un tapis. */
  lookAtImage(id: string) {
    const d = this.ctx.store.doc, im = d.images.find(q => q.id === id);
    if (!im || !d.floor) return;
    if (this.ctx.ui.s.view !== '3d') this.ctx.ui.set({ view: '3d' });
    const rug = rugCorners(d, im), ex = imageExtent(d, im);
    if (rug) {
      const c = rug.reduce((s, q) => ({ x: s.x + q.x / rug.length, y: s.y + q.y / rug.length }), { x: 0, y: 0 });
      this.controls.target.set(c.x, 0, c.y);
      this.camera.position.set(c.x, 4.5, c.y + 3);
    } else if (ex) {
      const { e } = ex, fov = THREE.MathUtils.degToRad(this.camera.fov);
      const uc = (ex.u0 + ex.u1) / 2, vc = Math.min((ex.h0 + ex.h1) / 2, 2.2);
      const dir = ex.ext ? e.n : { x: -e.n.x, y: -e.n.y }; // vers celui qui regarde
      const base = { x: e.a.x + e.u.x * uc + (ex.ext ? e.n.x * e.T : 0), y: e.a.y + e.u.y * uc + (ex.ext ? e.n.y * e.T : 0) };
      const width = Math.max(ex.u1 - ex.u0, 1.6) * 1.5;
      let dist = Math.max(1.6, width / 2 / Math.tan(fov / 2) / this.camera.aspect);
      const at = (k: number) => ({ x: base.x + dir.x * k, y: base.y + dir.y * k });
      // Face intérieure (ou côté d'une cloison) : la caméra reste dans la boutique.
      if (!ex.ext || e.part >= 0) while (dist > 0.9 && !insideFloor(d, at(dist))) dist -= 0.2;
      if (ex.ext && e.part < 0) this.ctx.ui.set({ cutaway: false }); // façade : les murs restent debout
      const cam = at(dist);
      this.controls.target.set(base.x, vc, base.y);
      this.camera.position.set(cam.x, Math.max(1.5, vc), cam.y);
    }
    this.controls.update(); this.needsRender = true;
  }
  zoom(f: number) {
    const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f);
    if (off.length() < this.controls.minDistance || off.length() > this.controls.maxDistance) return;
    this.camera.position.copy(this.controls.target).add(off);
    this.needsRender = true;
  }

  private applyShadows(force?: ShadowQuality) {
    const q: ShadowQuality = force ?? this.ctx.ui.s.shadows;
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
    const key = JSON.stringify([d.floor, d.walls, d.partitions, d.rooms, d.pans, d.openings]);
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
    this.syncImages(d);
    this.objects.sync();
    this.drawSelection();
    this.needsRender = true;
  }

  /** Images posées : reconstruites seulement si elles, ou les murs, changent. */
  private syncImages(d: Project) {
    const key = JSON.stringify([d.floor, d.walls, d.partitions, d.openings, d.images, d.assets.map(a => a.id)]);
    if (key === this.imagesKey) return;
    this.imagesKey = key;
    if (this.images) { this.scene.remove(this.images.root); disposeTree(this.images.root); }
    this.images = buildImages(d, () => { this.imagesKey = ''; this.syncImages(this.ctx.store.doc); this.needsRender = true; });
    this.scene.add(this.images.root);
    for (const [w, g] of this.images.byWall) g.visible = !this.lowered.has(w);
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
    const on = this.cutOverride ?? this.ctx.ui.s.cutaway;
    let changed = false;
    for (const w of this.shop.walls) {
      const low = on && !w.partition && cam.clone().sub(w.mid).dot(w.normal) > 0.3;
      if (low !== this.lowered.has(w.index) || force) {
        if (low) this.lowered.add(w.index); else this.lowered.delete(w.index);
        w.group.scale.y = low ? LOW_WALL / w.height : 1;
        const ig = this.images?.byWall.get(w.index); if (ig) ig.visible = !low;
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
    const E = wallSegs(d);
    const T = d.walls.thickness;
    const mat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const line = new THREE.LineBasicMaterial({ color: ACCENT });
    const addRect = (wall: number, u0: number, u1: number, h0: number, h1: number, zs = [0.004, -T - 0.004], m = mat, ln = line) => {
      const e = E[wall]; if (!e) return;
      const k = this.lowered.has(wall) ? LOW_WALL / e.H : 1;
      const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(wallMatrix(e.a.x, e.a.y, e.u.x, e.u.y));
      for (const z of zs) {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(u1 - u0, (h1 - h0) * k), m);
        pl.position.set((u0 + u1) / 2, ((h0 + h1) / 2) * k, z); g.add(pl);
        const pts = [new THREE.Vector3(u0, h0 * k, z), new THREE.Vector3(u1, h0 * k, z), new THREE.Vector3(u1, h1 * k, z), new THREE.Vector3(u0, h1 * k, z)];
        const lp = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), ln); lp.renderOrder = 10; g.add(lp);
      }
      this.overlay.add(g);
    };
    if (sel.kind === 'wall' && E[sel.index]) addRect(sel.index, 0, E[sel.index].length, 0, E[sel.index].H);
    if (sel.kind === 'opening') {
      const o = d.openings.find(q => q.id === sel.id);
      if (o) addRect(o.wall, o.t - o.width / 2, o.t + o.width / 2, o.sill, o.sill + o.height);
    }
    if (sel.kind === 'pan' && E[sel.wall]) { // pan de mur choisi : sa face seulement
      const pc = pieceAt(d, E[sel.wall], sel.side, sel.u);
      if (pc) addRect(sel.wall, pc.u0, pc.u1, 0, E[sel.wall].H, [sel.side === 'ext' ? -T - 0.004 : 0.004]);
    }
    if (sel.kind === 'image') {
      // Image choisie : cadre orange visible à travers tout, sur la bonne face (ou au sol pour un tapis).
      const im = d.images.find(q => q.id === sel.id);
      const see = { transparent: true, depthTest: false, depthWrite: false };
      const m2 = new THREE.MeshBasicMaterial({ color: ACCENT, opacity: 0.18, side: THREE.DoubleSide, ...see }), l2 = new THREE.LineBasicMaterial({ color: ACCENT, ...see });
      const ex = im && imageExtent(d, im), pad = 0.06;
      if (ex) addRect(im!.wall, ex.u0 - pad, ex.u1 + pad, Math.max(0, ex.h0 - pad), ex.h1 + pad, [ex.ext ? -T - 0.04 : 0.04], m2, l2);
      const rug = im && rugCorners(d, im);
      if (rug) {
        const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rug.map(q => new THREE.Vector3(q.x, 0.02, q.y))), l2);
        loop.renderOrder = 10; this.overlay.add(loop);
      }
    }
    this.needsRender = true;
  }

  /* ---------- Souris ---------- */
  private pick(e: PointerEvent): { pick: Pick; point: THREE.Vector3; object: THREE.Object3D } | null {
    if (!this.shop) return null;
    this.raycaster.ray.copy(this.rayFrom(e));
    const hits = this.raycaster.intersectObjects([...this.shop.pickables, ...(this.images?.pickables ?? []), this.objects.group], true).filter(h => h.object.visible && isShown(h.object));
    for (const h of hits) { const p = h.object.userData.pick as Pick | undefined; if (p) return { pick: p, point: h.point, object: h.object }; }
    return null;
  }
  /** Rayon partant de la caméra et passant par le pointeur. */
  rayFrom(e: PointerEvent | MouseEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    return this.raycaster.ray.clone();
  }
  /** Position le long du mur i (m) d'un point 3D. */
  private tOnWall(i: number, p: THREE.Vector3) {
    const e = wallSegs(this.ctx.store.doc)[i];
    return (p.x - e.a.x) * e.u.x + (p.z - e.a.y) * e.u.y;
  }
  /** Intersection du rayon souris avec le plan intérieur du mur i. */
  private rayOnWall(e: PointerEvent, i: number) {
    const ed = wallSegs(this.ctx.store.doc)[i];
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(ed.n.x, 0, ed.n.y), new THREE.Vector3(ed.a.x, 0, ed.a.y));
    return this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }

  private bindPointer() {
    const cv = this.renderer.domElement;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    // Bouton molette : déplacer la vue, sans le défilement automatique de Chrome.
    cv.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
    let down: { x: number; y: number; empty: boolean } | null = null;
    let drag: { id: string; wall: number; dt: number } | null = null;
    // Écouteur en phase de capture : il passe avant OrbitControls et peut le désactiver pendant un glisser.
    this.el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || (e.target as HTMLElement).closest(".h3d")) return;
      const hit = this.pick(e);
      down = { x: e.clientX, y: e.clientY, empty: !hit || hit.pick.kind === 'floor' };
      const { store, ui } = this.ctx;
      if (!hit) return;
      if (hit.pick.kind === "object") {
        if (this.objects.onObjectDown(e, hit.pick.id)) cv.setPointerCapture(e.pointerId);
        return;
      }
      if (hit.pick.kind === 'image') { selectPick(this.ctx, hit.pick); return; }
      // Outils Sol et Murs (intérieur) : un clic sur le sol ou un mur choisit la pièce (du côté de la caméra).
      // Murs (intérieur) : un clic sur une face choisit ce pan de mur (la façade d'un mur du contour n'en fait pas partie).
      if (ui.s.tool === 'murs' && ui.s.wallFace === 'int' && hit.pick.kind === 'wall') {
        const i = hit.pick.index, e0 = wallSegs(store.doc)[i];
        const sd = (hit.point.x - e0.a.x) * e0.n.x + (hit.point.z - e0.a.y) * e0.n.y, side = sd >= e0.T / 2 ? 'ext' : 'int';
        if (e0.part >= 0 || side === 'int') { selectPan(this.ctx, i, Math.max(0, Math.min(e0.length, this.tOnWall(i, hit.point))), side); down.empty = false; return; }
      }
      if ((ui.s.tool === 'revetement' || (ui.s.tool === 'murs' && ui.s.wallFace === 'int')) && (hit.pick.kind === 'floor' || hit.pick.kind === 'wall')) {
        const back = this.camera.position.clone().sub(hit.point).setY(0).normalize().multiplyScalar(0.08);
        if (selectRoomAt(this.ctx, { x: hit.point.x + back.x, y: hit.point.z + back.z }) || selectRoomAt(this.ctx, { x: hit.point.x - back.x, y: hit.point.z - back.z })) down.empty = false;
        return;
      }
      if (hit.pick.kind === "opening") {
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
      if (!this.objects.dragging) this.controls.enabled = true;
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
    const height = Math.min(def.height, wallHeight(store.doc, i) - def.sill - 0.05);
    this.setGhost({ wall: i, o: { id: 'ghost', wall: i, type: ui.s.placeType, t, width, height, sill: def.sill } });
  }
  private setGhost(g: { wall: number; o: import('../model/types').Opening } | null) {
    if (this.ghost) { this.scene.remove(this.ghost); disposeTree(this.ghost); this.ghost = null; }
    if (g && this.ctx.store.doc.floor) {
      const e = wallSegs(this.ctx.store.doc)[g.wall], T = this.ctx.store.doc.walls.thickness;
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

/** Vrai si l'objet et tous ses parents sont visibles (une image d'un mur abaissé ne se choisit pas). */
function isShown(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export type PhotoView = 'actuelle' | 'facade' | 'gauche' | 'droite' | 'interieur' | 'dessus';
