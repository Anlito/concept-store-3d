import * as THREE from 'three';
import type { Volume, VolumeType } from '../model/types';
import { uid } from '../model/geometry';
import { meshParts } from './objImport';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/* Volumes de l'atelier : valeurs par défaut, encombrement, et construction en 3D.
   Repère du meuble : x et y au sol (y = profondeur), z vers le haut ; en 3D : (x, z, y). */

export const VOLUME_LABEL: Record<VolumeType, string> = {
  boite: 'Boîte', arrondie: 'Boîte arrondie', cylindre: 'Cylindre', plan: 'Plan', arche: 'Arche', boule: 'Boule', demiboule: 'Demi-boule',
  cone: 'Cône', pyramide: 'Pyramide', tube: 'Tube', demirond: 'Demi-rond', prisme: 'Prisme',
  modele: 'Modèle importé',
};
/** Formes proposées dans l'atelier (le « modèle importé » vient d'un fichier Tinkercad). */
export const VOLUME_TYPES = (Object.keys(VOLUME_LABEL) as VolumeType[]).filter(t => t !== 'modele');

export function newVolume(type: VolumeType, n: number, color = '#C9A97E'): Volume {
  const base = { id: uid(), type, name: `${VOLUME_LABEL[type]} ${n}`, x: 0, y: 0, z: 0, t: 0.03, turned: false, rot: 0, color };
  switch (type) {
    case 'boite': return { ...base, w: 0.6, d: 0.4, h: 0.5 };
    case 'cylindre': return { ...base, w: 0.4, d: 0.4, h: 0.6 };
    case 'plan': return { ...base, w: 1, d: 0.5, h: 0.03, t: 0.03 };
    case 'arche': return { ...base, w: 1, d: 0.3, h: 1.4, t: 0.12 };
    case 'boule': return { ...base, w: 0.4, d: 0.4, h: 0.4 };
    case 'demiboule': return { ...base, w: 0.5, d: 0.5, h: 0.25 };
    case 'arrondie': return { ...base, w: 0.8, d: 0.5, h: 0.4, t: 0.06 };
    case 'pyramide': return { ...base, w: 0.5, d: 0.5, h: 0.6 };
    case 'cone': return { ...base, w: 0.4, d: 0, h: 0.6 };
    case 'tube': return { ...base, w: 0.4, d: 0.4, h: 0.6, t: 0.03 };
    case 'demirond': return { ...base, w: 0.8, d: 0.4, h: 1 };
    case 'prisme': return { ...base, w: 1, d: 0.4, h: 0.5 };
    case 'modele': return { ...base, w: 0.5, d: 0.5, h: 0.5, color: '' };
  }
}

/** Encombrement du volume avant rotation : largeur (x), profondeur (y), hauteur (z). */
export function volumeBox(v: Volume): { bw: number; bd: number; bh: number } {
  switch (v.type) {
    case 'boite': case 'arrondie': case 'pyramide': case 'arche': case 'prisme': case 'modele': return { bw: v.w, bd: v.d, bh: v.h };
    case 'cylindre': case 'tube': return v.turned ? { bw: v.h, bd: v.w, bh: v.w } : { bw: v.w, bd: v.w, bh: v.h };
    case 'boule': return { bw: v.w, bd: v.w, bh: v.w };
    case 'demiboule': return { bw: v.w, bd: v.w, bh: v.w / 2 };
    case 'cone': { const m = Math.max(v.w, v.d); return { bw: m, bd: m, bh: v.h }; }
    case 'demirond': return v.turned ? { bw: v.h, bd: v.w, bh: v.w / 2 } : { bw: v.w, bd: v.w / 2, bh: v.h };
    case 'plan': return v.turned ? { bw: v.w, bd: v.t, bh: v.d } : { bw: v.w, bd: v.d, bh: v.t };
  }
}

function archGeometry(L: number, H: number, P: number, t: number) {
  const R = L / 2, top = Math.max(H - R, 0.001), ri = Math.max(R - t, 0.001);
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(t, 0); s.lineTo(t, top);
  s.absarc(R, top, ri, Math.PI, 0, true);
  s.lineTo(L - t, 0); s.lineTo(L, 0); s.lineTo(L, top);
  s.absarc(R, top, R, 0, Math.PI, false);
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: P, bevelEnabled: false, curveSegments: 24 });
  g.translate(-L / 2, -H / 2, -P / 2);
  return g;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
const mat = (c: string) => { let m = mats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }); m.name = c; mats.set(c, m); } return m; };

/** Maille d'un volume, centrée sur son encombrement puis placée et tournée. */
export function volumeMesh(v: Volume): THREE.Object3D {
  const { bw, bd, bh } = volumeBox(v);
  const r = THREE.MathUtils.degToRad;
  if (v.type === 'modele') {
    // Modèle importé : une maille par couleur, mise à la taille voulue (w, h, d).
    const g = new THREE.Group();
    const m = v.mesh;
    if (m) for (const p of meshParts(m)) {
      const mesh = new THREE.Mesh(p.geo, flatMat(v.color || p.color));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.volume = v.id;
      g.add(mesh);
    }
    if (m) g.scale.set(v.w / m.size[0], v.h / m.size[1], v.d / m.size[2]);
    const holder = new THREE.Group(); holder.add(g);
    holder.position.set(v.x + bw / 2, v.z + bh / 2, v.y + bd / 2);
    holder.rotation.set(r(v.tiltX ?? 0), -r(v.rot), -r(v.tiltY ?? 0), 'YXZ');
    holder.userData.volume = v.id;
    return holder;
  }
  let g: THREE.BufferGeometry;
  switch (v.type) {
    case 'boite': g = new THREE.BoxGeometry(v.w, v.h, v.d); break;
    case 'cylindre': g = new THREE.CylinderGeometry(v.w / 2, v.w / 2, v.h, seg(v.w)); if (v.turned) g.rotateZ(Math.PI / 2); break;
    case 'plan': g = new THREE.BoxGeometry(bw, bh, bd); break;
    case 'arche': g = archGeometry(v.w, v.h, v.d, Math.min(v.t, v.w / 2 - 0.005)); break;
    case 'boule': g = new THREE.SphereGeometry(v.w / 2, 32, 20); break;
    case 'demiboule': g = domeGeometry(v.w / 2); if (v.turned) g.rotateX(Math.PI); break;
    case 'arrondie': g = new RoundedBoxGeometry(v.w, v.h, v.d, 4, Math.max(0.001, Math.min(v.t, v.w / 2, v.d / 2, v.h / 2) - 0.0005)); break;
    case 'pyramide': g = pyramidGeometry(v.w, v.d, v.h); break;
    case 'cone': g = new THREE.CylinderGeometry(Math.max(v.d, 0) / 2, v.w / 2, v.h, seg(Math.max(v.w, v.d))); break;
    case 'tube': g = tubeGeometry(v.w / 2, Math.min(v.t, v.w / 2 - 0.003), v.h); if (v.turned) g.rotateZ(Math.PI / 2); break;
    case 'demirond': g = halfRoundGeometry(v.w / 2, v.h, v.turned); break;
    case 'prisme': g = prismGeometry(v.w, v.d, v.h, v.turned); break;
  }
  centerGeometry(g);
  const m = new THREE.Mesh(g, mat(v.color));
  m.position.set(v.x + bw / 2, v.z + bh / 2, v.y + bd / 2);
  // Inclinaisons d'abord (dans le repère du volume), puis rotation vue de dessus.
  m.rotation.set(r(v.tiltX ?? 0), -r(v.rot), -r(v.tiltY ?? 0), 'YXZ');
  m.castShadow = true; m.receiveShadow = true;
  m.userData.volume = v.id;
  return m;
}

/** Groupe de tous les volumes (les volumes masqués sont inclus sauf si `skipHidden`). */
export function buildVolumes(vols: Volume[], skipHidden = false): THREE.Group {
  const g = new THREE.Group();
  for (const v of vols) if (!(skipHidden && v.hidden)) g.add(volumeMesh(v));
  return g;
}

/** Dimensions totales (m) d'un assemblage de volumes. */
export function totalSize(vols: Volume[]) {
  if (!vols.length) return { w: 0, d: 0, h: 0 };
  const b = new THREE.Box3().setFromObject(buildVolumes(vols));
  const s = b.getSize(new THREE.Vector3());
  return { w: s.x, d: s.z, h: s.y };
}

const seg = (diam: number) => Math.max(16, Math.min(48, Math.round(diam * 120)));
/** Recentre une géométrie sur son encombrement (le placement se fait ensuite par le coin). */
function centerGeometry(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
}
/** Demi-boule pleine, côté plat en bas (profil tourné ; le bord reste net). */
function domeGeometry(r: number) {
  const n = 16, pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, 0)];
  for (let i = 1; i <= n; i++) { const a = (i / n) * (Math.PI / 2); pts.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a))); }
  return new THREE.LatheGeometry(pts, seg(2 * r));
}
/** Pyramide à base rectangulaire (faces planes). */
function pyramidGeometry(w: number, d: number, h: number) {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).toNonIndexed();
  g.rotateY(Math.PI / 4); g.scale(w, h, d);
  g.computeVertexNormals();
  return g;
}
/** Cylindre creux, debout. */
function tubeGeometry(r: number, t: number, h: number) {
  const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, Math.max(r - t, 0.001), 0, Math.PI * 2, true); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: seg(2 * r) });
  g.rotateX(-Math.PI / 2);
  return g;
}
/** Demi-cylindre : debout (côté plat à l'arrière) ou couché (côté plat au sol). */
function halfRoundGeometry(r: number, len: number, lying: boolean) {
  const s = new THREE.Shape(); s.moveTo(-r, 0); s.absarc(0, 0, r, Math.PI, 0, true); s.lineTo(-r, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: seg(2 * r) });
  if (lying) g.rotateY(Math.PI / 2); else g.rotateX(-Math.PI / 2);
  return g;
}
/** Prisme à section triangulaire (toit), ou triangle rectangle (coin) si `corner`. */
function prismGeometry(w: number, d: number, h: number, corner: boolean) {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(corner ? 0 : w / 2, h); s.lineTo(0, 0);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
}
const flatMats = new Map<string, THREE.MeshStandardMaterial>();
/** Matériau à facettes (les modèles Tinkercad ont des arêtes vives). */
const flatMat = (c: string) => { let m = flatMats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true }); flatMats.set(c, m); } return m; };
