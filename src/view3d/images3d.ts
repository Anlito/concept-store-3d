import * as THREE from 'three';
import type { ImageAsset, Project } from '../model/types';
import { bounds, edges } from '../model/geometry';
import { wallMatrix, wallRects, type Pick } from './build';

/* Images posées dans la boutique, en 3D seulement : cadre, tapisserie (murale), tapis (au sol), vitrine (autocollant).
   Repère d'un mur : x le long du mur, y vers le haut, z vers l'intérieur (face intérieure en z = 0). */

const textures = new Map<string, THREE.Texture>();
function texture(a: ImageAsset, onLoad: () => void) {
  let t = textures.get(a.id);
  if (!t) {
    t = new THREE.TextureLoader().load(a.data, onLoad);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    textures.set(a.id, t);
  }
  return t;
}

const FRAME = new THREE.MeshStandardMaterial({ color: '#22211F', roughness: 0.6 });

export interface BuiltImages { root: THREE.Group; byWall: Map<number, THREE.Group>; pickables: THREE.Object3D[] }

export function buildImages(p: Project, onTexture: () => void): BuiltImages {
  const root = new THREE.Group(); root.name = 'images';
  const byWall = new Map<number, THREE.Group>(), pickables: THREE.Object3D[] = [];
  if (!p.floor) return { root, byWall, pickables };
  const E = edges(p.floor.points), H = p.walls.height;
  for (const im of p.images) {
    const a = p.assets.find(x => x.id === im.asset); if (!a) continue;
    const ratio = a.h / a.w;
    const base = texture(a, onTexture);
    if (!base.image) continue; // image pas encore décodée : la scène sera reconstruite à son chargement
    const tex = base.clone();
    tex.wrapS = tex.wrapT = im.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    const transparent = a.data.startsWith('data:image/png');
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, transparent, alphaTest: transparent ? 0.04 : 0, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const pick: Pick = { kind: 'image', id: im.id };
    let obj: THREE.Object3D;
    const tileW = im.size, tileH = im.size * ratio;

    if (im.target === 'tapis') {
      const b = bounds(p.floor.points);
      if (im.repeat) {
        const shape = new THREE.Shape(p.floor.points.map(q => new THREE.Vector2(q.x, -q.y)));
        const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2);
        const uv = g.getAttribute('uv') as THREE.BufferAttribute, pa = g.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, pa.getX(i), pa.getZ(i));
        tex.repeat.set(1 / tileW, 1 / tileH); tex.offset.set(im.x, im.y); tex.rotation = THREE.MathUtils.degToRad(im.rot);
        obj = new THREE.Mesh(g, mat); obj.position.y = 0.003;
      } else {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(tileW, tileH), mat);
        m.rotation.set(-Math.PI / 2, 0, -THREE.MathUtils.degToRad(im.rot));
        m.position.set(b.x0 + im.x * b.w, 0.004, b.y0 + im.y * b.h);
        obj = m;
      }
      obj.traverse(o => { o.userData.pick = pick; (o as THREE.Mesh).receiveShadow = true; });
      root.add(obj); pickables.push(obj);
      continue;
    }

    // Images murales
    const e = E[im.wall]; if (!e) continue;
    const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(wallMatrix(e.a.x, e.a.y, e.u.x, e.u.y));
    // Façade : face extérieure (z = −épaisseur), image retournée pour être lue depuis la rue.
    const ext = im.side === 'ext', T = p.walls.thickness;
    if (im.target === 'tapisserie' && im.repeat) {
      const pos: number[] = [], uv: number[] = [];
      for (const [u0, u1, h0, h1] of wallRects(p, im.wall, ext)) {
        const quad = [[u0, h0], [u1, h0], [u1, h1], [u0, h0], [u1, h1], [u0, h1]];
        for (const [u, hh] of quad) { pos.push(u, hh, ext ? -T - 0.002 : 0.002); uv.push(ext ? -u : u, hh); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      tex.repeat.set(1 / tileW, 1 / tileH); tex.offset.set(im.x, im.y); tex.rotation = THREE.MathUtils.degToRad(im.rot);
      obj = new THREE.Mesh(geo, mat);
    } else {
      const u = (ext ? 1 - im.x : im.x) * e.length, v = im.y * H; // côté rue, 0 % = à gauche vu de dehors
      const holder = new THREE.Group();
      holder.rotation.order = 'YXZ';
      if (ext) holder.rotation.y = Math.PI;
      holder.rotation.z = -THREE.MathUtils.degToRad(im.rot);
      holder.add(new THREE.Mesh(new THREE.PlaneGeometry(tileW, tileH), mat));
      if (im.target === 'cadre') {
        const f = Math.max(0.025, tileW * 0.05), d = 0.03;
        const bar = (w: number, hh: number, x: number, y: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), FRAME); m.position.set(x, y, -d / 2 + 0.005); m.castShadow = true; return m; };
        holder.add(bar(tileW + 2 * f, f, 0, tileH / 2 + f / 2), bar(tileW + 2 * f, f, 0, -tileH / 2 - f / 2), bar(f, tileH, -tileW / 2 - f / 2, 0), bar(f, tileH, tileW / 2 + f / 2, 0));
      }
      const off = im.target === 'cadre' ? 0.03 : 0.004;
      holder.position.set(u, v, ext ? -T - off : off);
      obj = holder;
    }
    obj.traverse(o => { o.userData.pick = pick; });
    g.add(obj);
    pickables.push(g);
    let wg = byWall.get(im.wall); if (!wg) { wg = new THREE.Group(); byWall.set(im.wall, wg); root.add(wg); }
    wg.add(g);
  }
  return { root, byWall, pickables };
}
