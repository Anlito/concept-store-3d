import * as THREE from 'three';
import type { Volume, VolumeType } from '../model/types';
import { uid } from '../model/geometry';

/* Volumes de l'atelier : valeurs par défaut, encombrement, et construction en 3D.
   Repère du meuble : x et y au sol (y = profondeur), z vers le haut ; en 3D : (x, z, y). */

export const VOLUME_LABEL: Record<VolumeType, string> = { boite: 'Boîte', cylindre: 'Cylindre', plan: 'Plan', arche: 'Arche' };

export function newVolume(type: VolumeType, n: number, color = '#C9A97E'): Volume {
  const base = { id: uid(), type, name: `${VOLUME_LABEL[type]} ${n}`, x: 0, y: 0, z: 0, t: 0.03, turned: false, rot: 0, color };
  switch (type) {
    case 'boite': return { ...base, w: 0.6, d: 0.4, h: 0.5 };
    case 'cylindre': return { ...base, w: 0.4, d: 0.4, h: 0.6 };
    case 'plan': return { ...base, w: 1, d: 0.5, h: 0.03, t: 0.03 };
    case 'arche': return { ...base, w: 1, d: 0.3, h: 1.4, t: 0.12 };
  }
}

/** Encombrement du volume avant rotation : largeur (x), profondeur (y), hauteur (z). */
export function volumeBox(v: Volume): { bw: number; bd: number; bh: number } {
  switch (v.type) {
    case 'boite': case 'arche': return { bw: v.w, bd: v.d, bh: v.h };
    case 'cylindre': return v.turned ? { bw: v.h, bd: v.w, bh: v.w } : { bw: v.w, bd: v.w, bh: v.h };
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
export function volumeMesh(v: Volume): THREE.Mesh {
  const { bw, bd, bh } = volumeBox(v);
  let g: THREE.BufferGeometry;
  switch (v.type) {
    case 'boite': g = new THREE.BoxGeometry(v.w, v.h, v.d); break;
    case 'cylindre': g = new THREE.CylinderGeometry(v.w / 2, v.w / 2, v.h, Math.max(16, Math.min(48, Math.round(v.w * 120)))); if (v.turned) g.rotateZ(Math.PI / 2); break;
    case 'plan': g = new THREE.BoxGeometry(bw, bh, bd); break;
    case 'arche': g = archGeometry(v.w, v.h, v.d, Math.min(v.t, v.w / 2 - 0.005)); break;
  }
  const m = new THREE.Mesh(g, mat(v.color));
  m.position.set(v.x + bw / 2, v.z + bh / 2, v.y + bd / 2);
  m.rotation.y = -THREE.MathUtils.degToRad(v.rot);
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
