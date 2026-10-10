import * as THREE from 'three';
import type { Opening, Project } from '../model/types';
import { offsetPolygon, dot, sub } from '../model/geometry';
import { floorMaterial, wallMaterial } from './materials';
import { DEFAULT_OUT, openingColor, openingStyle, wallSegs, type WallSeg } from '../model/project';

/* Construction de la boutique en 3D à partir du modèle : sol, dalle, murs avec ouvertures, menuiseries.
   Chaque mur est un groupe dans son repère local : x le long du mur (depuis le sommet i), y vers le haut,
   z vers l'intérieur de la boutique. La face intérieure est en z = 0, la face extérieure en z = −épaisseur.
   Une cloison se construit de la même façon (côté 1 en z = 0, côté 2 en z = −épaisseur), avec deux chants. */

export type Pick = { kind: 'wall'; index: number } | { kind: 'opening'; id: string } | { kind: 'floor' } | { kind: 'object'; id: string } | { kind: 'image'; id: string };

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
  /** Cloison intérieure : jamais abaissée par la vue en coupe. */
  partition: boolean;
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
  const pts = p.floor.points, T = p.walls.thickness;
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

  // Murs du contour, puis cloisons
  const n = pts.length;
  wallSegs(p).forEach(e => {
    const i = e.i, L = e.length, part = e.part >= 0, Hw = e.H;
    const style = part ? p.partitions[e.part].style : p.walls.styles[i];
    // Face extérieure d'un mur du contour : débord aux angles (raccord en onglet) ; cloison : même longueur.
    const uA = part ? 0 : dot(sub(outer[i], e.a), e.u), uB = part ? L : dot(sub(outer[(i + 1) % n], e.a), e.u);
    const ops = p.openings.filter(o => o.wall === i).sort((a, b) => a.t - b.t);
    const inner = new Quads(), out = new Quads(), cap = new Quads();
    const faces = (q: Quads, z: number, nrm: THREE.Vector3, start: number, end: number) => {
      let cur = start;
      ops.forEach(o => {
        const lo = o.t - o.width / 2, hi = o.t + o.width / 2, top = o.sill + o.height;
        q.rect(cur, lo, 0, Hw, z, nrm);
        q.rect(lo, hi, 0, o.sill, z, nrm);
        q.rect(lo, hi, top, Hw, z, nrm);
        cur = hi;
      });
      q.rect(cur, end, 0, Hw, z, nrm);
    };
    faces(inner, 0, IN, 0, L);
    faces(out, -T, OUT, uA, uB);
    // Dessus du mur (visible quand le mur est abaissé)
    cap.add([new THREE.Vector3(0, Hw, 0), new THREE.Vector3(L, Hw, 0), new THREE.Vector3(uB, Hw, -T), new THREE.Vector3(uA, Hw, -T)], UP,
      [[0, 0], [L, 0], [uB, T], [uA, T]]);
    if (part) { // chants de la cloison
      cap.add([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -T), new THREE.Vector3(0, Hw, -T), new THREE.Vector3(0, Hw, 0)], NX, [[0, 0], [T, 0], [T, Hw], [0, Hw]]);
      cap.add([new THREE.Vector3(L, 0, 0), new THREE.Vector3(L, 0, -T), new THREE.Vector3(L, Hw, -T), new THREE.Vector3(L, Hw, 0)], PX, [[0, 0], [T, 0], [T, Hw], [0, Hw]]);
    }
    // Tableaux des ouvertures (épaisseur du mur)
    ops.forEach(o => {
      const lo = o.t - o.width / 2, hi = o.t + o.width / 2, top = o.sill + o.height;
      const side = (u: number, nrm: THREE.Vector3) => out.add([new THREE.Vector3(u, o.sill, 0), new THREE.Vector3(u, o.sill, -T), new THREE.Vector3(u, top, -T), new THREE.Vector3(u, top, 0)], nrm,
        [[0, o.sill], [T, o.sill], [T, top], [0, top]]);
      side(lo, PX); side(hi, NX);
      if (top < Hw - 1e-4) out.add([new THREE.Vector3(lo, top, 0), new THREE.Vector3(hi, top, 0), new THREE.Vector3(hi, top, -T), new THREE.Vector3(lo, top, -T)], DOWN, [[lo, 0], [hi, 0], [hi, T], [lo, T]]);
      if (o.sill > 0) out.add([new THREE.Vector3(lo, o.sill, 0), new THREE.Vector3(hi, o.sill, 0), new THREE.Vector3(hi, o.sill, -T), new THREE.Vector3(lo, o.sill, -T)], UP, [[lo, 0], [hi, 0], [hi, T], [lo, T]]);
    });

    const g = new THREE.Group(); g.name = part ? 'cloison-' + (e.part + 1) : 'mur-' + (i + 1);
    g.matrixAutoUpdate = false;
    g.matrix.copy(wallMatrix(e.a.x, e.a.y, e.u.x, e.u.y));
    const pick: Pick = { kind: 'wall', index: i };
    const mi = inner.mesh(wallMaterial(style.material, style.color)), mc = cap.mesh(M.cap);
    const mo = part ? out.mesh(wallMaterial(style.outMaterial ?? style.material, style.outColor ?? style.color)) // côté 2 de la cloison
      : out.mesh(wallMaterial(style.outMaterial ?? DEFAULT_OUT.material, style.outColor ?? DEFAULT_OUT.color)); // façade
    for (const m of [mi, mo, mc]) { m.userData.pick = pick; pickables.push(m); g.add(m); }
    ops.forEach(o => { const f = fixture(o, T); f.userData.pick = { kind: 'opening', id: o.id } satisfies Pick; f.traverse(c => { c.userData.pick = f.userData.pick; }); pickables.push(f); g.add(f); });

    // Le groupe « scale » sert à abaisser le mur (vue en coupe) sans reconstruire la géométrie.
    const holder = new THREE.Group(); holder.add(g);
    root.add(holder);
    walls.push({ index: i, group: holder, length: L, height: Hw, thickness: T, partition: part,
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
  const lo = o.t - o.width / 2, hi = o.t + o.width / 2, top = o.sill + o.height, w = o.width, H = o.height, cz = -T / 2;
  const style = openingStyle(o).value, col = colorMat(openingColor(o));
  const f = 0.05; // largeur du cadre dormant
  /** Vitre (plan transparent) centrée en (x, y), dans le plan z. */
  const glass = (gw: number, gh: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(gw, 0.01), Math.max(gh, 0.01)), M.glass);
    m.position.set(x, y, z); m.renderOrder = 2; return m;
  };
  /** Cadre rectangulaire (4 barres) de largeur fw, profondeur d, autour de la zone x0..x1, y0..y1. */
  const frame = (x0: number, x1: number, y0: number, y1: number, fw: number, d: number, z: number, mat: THREE.Material, bottom = true) => {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    g.add(box(fw, y1 - y0, d, mat, x0 + fw / 2, cy, z), box(fw, y1 - y0, d, mat, x1 - fw / 2, cy, z), box(x1 - x0, fw, d, mat, cx, y1 - fw / 2, z));
    if (bottom) g.add(box(x1 - x0, fw, d, mat, cx, y0 + fw / 2, z));
  };
  /** Petits bois (quadrillage atelier) : nx colonnes × ny rangées. */
  const grid = (x0: number, x1: number, y0: number, y1: number, nx: number, ny: number, z: number, mat: THREE.Material, d = 0.03) => {
    for (let k = 1; k < nx; k++) g.add(box(0.025, y1 - y0, d, mat, x0 + ((x1 - x0) * k) / nx, (y0 + y1) / 2, z));
    for (let k = 1; k < ny; k++) g.add(box(x1 - x0, 0.025, d, mat, (x0 + x1) / 2, y0 + ((y1 - y0) * k) / ny, z));
  };
  const handle = (x: number, z: number) => { const m = box(0.025, 0.4, 0.025, M.dark, x, 1.05, z); return m; };

  if (o.type === 'porte') {
    if (style === 'passage') return g; // ouverture nue, sans menuiserie
    const fd = T + 0.02, dark = style === 'pleine' ? M.dark : col;
    frame(lo, hi, 0, top, f, fd, cz, dark, false); // dormant (sans traverse basse)
    // Vantail du côté où la porte s'ouvre ; poignée à l'opposé de la charnière (miroir si charnière à droite).
    const zl = o.openOut ? -T + 0.04 : -0.04, lw = w - 2 * f, lh = H - f;
    const hx = (x: number) => (o.flipHinge ? lo + hi - x : x);
    if (style === 'pleine') {
      g.add(box(lw, lh, 0.04, col, o.t, lh / 2, zl));
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), M.dark);
      knob.position.set(hx(hi - f - 0.09), 1.0, zl + 0.05); g.add(knob);
      const k2 = knob.clone(); k2.position.z = zl - 0.05; g.add(k2);
    } else if (style === 'vitree' || style === 'atelier') {
      const s = 0.08; // montants du vantail
      frame(lo + f, hi - f, 0, lh, s, 0.045, zl, col);
      g.add(box(lw, 0.18, 0.045, col, o.t, 0.09, zl)); // soubassement
      g.add(glass(lw - 2 * s, lh - s - 0.18, o.t, 0.18 + (lh - s - 0.18) / 2, zl));
      if (style === 'atelier') grid(lo + f + s, hi - f - s, 0.18, lh - s, 2, 4, zl, col);
      g.add(handle(hx(hi - f - s - 0.05), zl + 0.05), handle(hx(hi - f - s - 0.05), zl - 0.05));
    } else if (style === 'double') {
      const s = 0.07, half = lw / 2;
      for (const sx of [-1, 1]) {
        const cx = o.t + (sx * half) / 2, x0 = cx - half / 2, x1 = cx + half / 2;
        frame(x0, x1, 0, lh, s, 0.045, zl, col);
        g.add(glass(half - 2 * s, lh - 2 * s, cx, lh / 2, zl));
        g.add(handle(o.t + sx * (s + 0.04), zl + 0.05), handle(o.t + sx * (s + 0.04), zl - 0.05));
      }
    } else { // coulissante : deux panneaux vitrés décalés, rail en haut
      const s = 0.04, pw = lw / 2 + 0.05;
      g.add(box(lw, 0.06, 0.12, col, o.t, lh - 0.03, zl));
      [[lo + f + pw / 2, zl - 0.03], [hi - f - pw / 2, zl + 0.03]].forEach(([cx, z]) => {
        frame(cx - pw / 2, cx + pw / 2, 0, lh - 0.06, s, 0.03, z, col);
        g.add(glass(pw - 2 * s, lh - 0.06 - 2 * s, cx, (lh - 0.06) / 2, z));
      });
    }
    return g;
  }

  // Fenêtres et vitrines
  const fd = 0.08, y0 = o.sill, y1 = top, cy = (y0 + y1) / 2;
  if (style === 'sans-cadre') {
    g.add(box(w, 0.03, fd, col, o.t, y0 + 0.015, cz), box(w, 0.03, fd, col, o.t, y1 - 0.015, cz)); // profils fins haut et bas
    const n = Math.max(1, Math.round(w / 1.5));
    for (let k = 0; k < n; k++) g.add(glass(w / n - 0.006, H - 0.06, lo + (w * (k + 0.5)) / n, cy, cz));
  } else {
    const fw = style === 'fixe' ? 0.03 : f;
    frame(lo, hi, y0, y1, fw, fd, cz, col);
    g.add(glass(w - 2 * fw, H - 2 * fw, o.t, cy, cz));
    if (style === 'atelier') grid(lo + fw, hi - fw, y0 + fw, y1 - fw, Math.max(2, Math.round(w / 0.4)), Math.max(2, Math.round(H / 0.45)), cz, col);
    else if (style === 'classique' || style === 'moderne') {
      const n = Math.max(1, Math.round(w / 1.2)); // montants tous les 1,2 m environ
      for (let k = 1; k < n; k++) g.add(box(0.04, H, fd * 0.8, col, lo + (w * k) / n, cy, cz));
    } else if (style === 'bois') { // devanture traditionnelle : montants et imposte
      const n = Math.max(1, Math.round(w / 1));
      for (let k = 1; k < n; k++) g.add(box(0.07, H, fd, col, lo + (w * k) / n, cy, cz));
      g.add(box(w, 0.07, fd, col, o.t, y0 + H * 0.78, cz));
      g.add(box(w + 0.16, 0.08, 0.06, col, o.t, y1 + 0.04, -T - 0.03)); // corniche côté rue
    }
  }
  if (o.type === 'fenetre') g.add(box(w + 0.1, 0.03, 0.12, M.light, o.t, o.sill - 0.015, 0.04)); // appui intérieur
  return g;
}

const colorMats = new Map<string, THREE.MeshStandardMaterial>();
const colorMat = (c: string) => { let m = colorMats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }); colorMats.set(c, m); } return m; };

/** Rectangles [u0, u1, h0, h1] de la face d'un mur, ouvertures découpées (pour la tapisserie). */
export function wallRects(p: Project, wall: number, outer = false): [number, number, number, number][] {
  const pts = p.floor!.points, e: WallSeg = wallSegs(p)[wall], H = e.H;
  // La face extérieure d'un mur du contour déborde aux angles (raccord en onglet avec les murs voisins).
  const op = outer && e.part < 0 ? offsetPolygon(pts, p.walls.thickness) : null;
  const start = op ? dot(sub(op[wall], e.a), e.u) : 0, end = op ? dot(sub(op[(wall + 1) % pts.length], e.a), e.u) : e.length;
  const ops = p.openings.filter(o => o.wall === wall).sort((a, b) => a.t - b.t);
  const out: [number, number, number, number][] = [];
  let cur = start;
  for (const o of ops) {
    const lo = o.t - o.width / 2, hi = o.t + o.width / 2, top = o.sill + o.height;
    if (lo > cur) out.push([cur, lo, 0, H]);
    if (o.sill > 0) out.push([lo, hi, 0, o.sill]);
    if (top < H) out.push([lo, hi, top, H]);
    cur = hi;
  }
  if (end > cur) out.push([cur, end, 0, H]);
  return out;
}
