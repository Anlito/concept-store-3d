import * as THREE from 'three';
import type { Opening, Project } from '../model/types';
import { edges, offsetPolygon, dot, sub } from '../model/geometry';
import { floorMaterial, wallMaterial } from './materials';

/* Construction de la boutique en 3D à partir du modèle : sol, dalle, murs avec ouvertures, menuiseries.
   Chaque mur est un groupe dans son repère local : x le long du mur (depuis le sommet i), y vers le haut,
   z vers l'intérieur de la boutique. La face intérieure est en z = 0, la face extérieure en z = −épaisseur. */

export type Pick = { kind: 'wall'; index: number } | { kind: 'opening'; id: string } | { kind: 'floor' };

const M = {
  outer: new THREE.MeshStandardMaterial({ color: '#F4F2EE', roughness: 0.95, side: THREE.DoubleSide }),
  cap: new THREE.MeshStandardMaterial({ color: '#D8D2C8', roughness: 0.95, side: THREE.DoubleSide }),
  slab: new THREE.MeshStandardMaterial({ color: '#E3DCD0', roughness: 0.95 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2E2D2B', roughness: 0.7 }),
  light: new THREE.MeshStandardMaterial({ color: '#ECE9E3', roughness: 0.8 }),
  door: new THREE.MeshStandardMaterial({ color: '#E4DCCF', roughness: 0.85 }),
  glass: new THREE.MeshStandardMaterial({ color: '#CFE0E8', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
};

/** Accumulateur de quadrilatères (géométrie non indexée, normales explicites). */
class Quads {
  pos: number[] = []; nor: number[] = []; uv: number[] = [];
  add(p: THREE.Vector3[], n: THREE.Vector3, uv: [number, number][]) {
    // On oriente le quad pour que sa face avant regarde vers n.
    const c = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
    const order = c.dot(n) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of order) { this.pos.push(p[k].x, p[k].y, p[k].z); this.nor.push(n.x, n.y, n.z); this.uv.push(uv[k][0], uv[k][1]); }
  }
  /** Rectangle vertical dans le plan z = cst. */
  rect(u0: number, u1: number, h0: number, h1: number, z: number, n: THREE.Vector3) {
    if (u1 - u0 < 1e-4 || h1 - h0 < 1e-4) return;
    this.add([new THREE.Vector3(u0, h0, z), new THREE.Vector3(u1, h0, z), new THREE.Vector3(u1, h1, z), new THREE.Vector3(u0, h1, z)], n,
      [[u0, h0], [u1, h0], [u1, h1], [u0, h1]]);
  }
  mesh(mat: THREE.Material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const IN = new THREE.Vector3(0, 0, 1), OUT = new THREE.Vector3(0, 0, -1);
const PX = new THREE.Vector3(1, 0, 0), NX = new THREE.Vector3(-1, 0, 0);

export interface WallInfo {
  index: number; group: THREE.Group; length: number; height: number; thickness: number;
  /** Milieu et normale extérieure dans le plan (pour abaisser les murs côté caméra). */
  mid: THREE.Vector2; normal: THREE.Vector2;
}

export interface BuiltShop { root: THREE.Group; walls: WallInfo[]; pickables: THREE.Object3D[] }

/** Matrice du repère local d'un mur. */
export function wallMatrix(ax: number, ay: number, ux: number, uy: number) {
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uy), UP, new THREE.Vector3(-uy, 0, ux)).setPosition(ax, 0, ay);
}

export function buildShop(p: Project): BuiltShop {
  const root = new THREE.Group(); root.name = 'boutique';
  const walls: WallInfo[] = [], pickables: THREE.Object3D[] = [];
  if (!p.floor) return { root, walls, pickables };
  const pts = p.floor.points, H = p.walls.height, T = p.walls.thickness;
  const outer = offsetPolygon(pts, T);

  // Sol
  const shape = new THREE.Shape(pts.map(q => new THREE.Vector2(q.x, -q.y)));
  const fg = new THREE.ShapeGeometry(shape); fg.rotateX(-Math.PI / 2);
  // UV en mètres, dans le repère du plan
  const uv = fg.getAttribute('uv') as THREE.BufferAttribute, pa = fg.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pa.getX(i), pa.getZ(i));
  const floor = new THREE.Mesh(fg, floorMaterial(p.floor.material, p.floor.color));
  floor.receiveShadow = true; floor.userData.pick = { kind: 'floor' } satisfies Pick;
  root.add(floor); pickables.push(floor);

  // Dalle sous la boutique
  const sg = new THREE.ExtrudeGeometry(new THREE.Shape(outer.map(q => new THREE.Vector2(q.x, -q.y))), { depth: 0.12, bevelEnabled: false });
  sg.rotateX(-Math.PI / 2); sg.translate(0, -0.121, 0);
  const slab = new THREE.Mesh(sg, M.slab); slab.receiveShadow = true;
  root.add(slab);

  // Murs
  edges(pts).forEach((e, i) => {
    const L = e.length, style = p.walls.styles[i];
    const uA = dot(sub(outer[i], e.a), e.u), uB = dot(sub(outer[(i + 1) % pts.length], e.a), e.u);
    const ops = p.openings.filter(o => o.wall === i).sort((a, b) => a.t - b.t);
    const inner = new Quads(), out = new Quads(), cap = new Quads();
    const faces = (q: Quads, z: number, n: THREE.Vector3, start: number, end: number) => {
      let cur = start;
      ops.forEach(o => {
        const lo = o.t - o.width / 2, hi = o.t + o.width / 2, top = o.sill + o.height;
        q.rect(cur, lo, 0, H, z, n);
        q.rect(lo, hi, 0, o.sill, z, n);
        q.rect(lo, hi, top, H, z, n);
        cur = hi;
      });
      q.rect(cur, end, 0, H, z, n);
    };
    faces(inner, 0, IN, 0, L);
    faces(out, -T, OUT, uA, uB);
    // Dessus du mur (visible quand le mur est abaissé)
    cap.add([new THREE.Vector3(0, H, 0), new THREE.Vector3(L, H, 0), new THREE.Vector3(uB, H, -T), new THREE.Vector3(uA, H, -T)], UP,
      [[0, 0], [L, 0], [uB, T], [uA, T]]);
    // Tableaux des ouvertures (épaisseur du mur)
    ops.forEach(o => {
      const lo = o.t - o.width / 2, hi = o.t + o.width / 2, top = o.sill + o.height;
      const side = (u: number, n: THREE.Vector3) => out.add([new THREE.Vector3(u, o.sill, 0), new THREE.Vector3(u, o.sill, -T), new THREE.Vector3(u, top, -T), new THREE.Vector3(u, top, 0)], n,
        [[0, o.sill], [T, o.sill], [T, top], [0, top]]);
      side(lo, PX); side(hi, NX);
      out.add([new THREE.Vector3(lo, top, 0), new THREE.Vector3(hi, top, 0), new THREE.Vector3(hi, top, -T), new THREE.Vector3(lo, top, -T)], DOWN, [[lo, 0], [hi, 0], [hi, T], [lo, T]]);
      if (o.sill > 0) out.add([new THREE.Vector3(lo, o.sill, 0), new THREE.Vector3(hi, o.sill, 0), new THREE.Vector3(hi, o.sill, -T), new THREE.Vector3(lo, o.sill, -T)], UP, [[lo, 0], [hi, 0], [hi, T], [lo, T]]);
    });

    const g = new THREE.Group(); g.name = 'mur-' + (i + 1);
    g.matrixAutoUpdate = false;
    g.matrix.copy(wallMatrix(e.a.x, e.a.y, e.u.x, e.u.y));
    const pick: Pick = { kind: 'wall', index: i };
    const mi = inner.mesh(wallMaterial(style.material, style.color)), mo = out.mesh(M.outer), mc = cap.mesh(M.cap);
    for (const m of [mi, mo, mc]) { m.userData.pick = pick; pickables.push(m); g.add(m); }
    ops.forEach(o => { const f = fixture(o, T); f.userData.pick = { kind: 'opening', id: o.id } satisfies Pick; f.traverse(c => { c.userData.pick = f.userData.pick; }); pickables.push(f); g.add(f); });

    // Le groupe « scale » sert à abaisser le mur (vue en coupe) sans reconstruire la géométrie.
    const holder = new THREE.Group(); holder.add(g);
    root.add(holder);
    walls.push({ index: i, group: holder, length: L, height: H, thickness: T,
      mid: new THREE.Vector2((e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2), normal: new THREE.Vector2(e.n.x, e.n.y) });
  });
  return { root, walls, pickables };
}

const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
};

/** Menuiserie d'une ouverture, dans le repère local du mur. */
export function fixture(o: Opening, T: number): THREE.Group {
  const g = new THREE.Group(); g.name = o.type;
  const lo = o.t - o.width / 2, hi = o.t + o.width / 2, top = o.sill + o.height, w = o.width, cz = -T / 2;
  const f = 0.05; // largeur du cadre
  if (o.type === 'porte') {
    const fd = T + 0.02;
    g.add(box(f, o.height, fd, M.dark, lo + f / 2, o.height / 2, cz), box(f, o.height, fd, M.dark, hi - f / 2, o.height / 2, cz),
      box(w, f, fd, M.dark, o.t, top - f / 2, cz));
    const leaf = box(w - 2 * f, o.height - f, 0.04, M.door, o.t, (o.height - f) / 2, -T + 0.04);
    g.add(leaf);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), M.dark);
    knob.position.set(hi - f - 0.09, 1.0, -T + 0.04 + 0.05); g.add(knob);
    const knob2 = knob.clone(); knob2.position.z = -T + 0.04 - 0.05; g.add(knob2);
  } else {
    const mat = o.type === 'vitrine' ? M.dark : M.light, fd = 0.08;
    g.add(box(f, o.height, fd, mat, lo + f / 2, o.sill + o.height / 2, cz), box(f, o.height, fd, mat, hi - f / 2, o.sill + o.height / 2, cz),
      box(w, f, fd, mat, o.t, top - f / 2, cz), box(w, f, fd, mat, o.t, o.sill + f / 2, cz));
    // Montants intermédiaires (tous les 1,2 m environ)
    const n = Math.max(1, Math.round(w / 1.2));
    for (let k = 1; k < n; k++) g.add(box(0.04, o.height, fd * 0.8, mat, lo + (w * k) / n, o.sill + o.height / 2, cz));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * f, o.height - 2 * f), M.glass);
    glass.position.set(o.t, o.sill + o.height / 2, cz); glass.renderOrder = 2;
    g.add(glass);
    if (o.type === 'fenetre') g.add(box(w + 0.1, 0.03, 0.12, M.light, o.t, o.sill - 0.015, 0.04)); // appui intérieur
  }
  return g;
}
