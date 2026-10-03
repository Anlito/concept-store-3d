import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { unzipSync } from 'fflate';
import type { ImportedMesh } from '../model/types';
import { uid } from '../model/geometry';

/* Import d'une création Tinkercad (OBJ).
   Tinkercad propose « Exporter › .OBJ » : on obtient un .zip contenant tinker.obj et obj.mtl (les couleurs).
   L'élève peut choisir le .zip, ou le .obj et le .mtl ensemble. Les longueurs sont en millimètres et l'axe
   vertical est z : on convertit en mètres, axe vertical y (Three.js), posé sur son coin. */

export const MAX_FILE_MB = 5;
/** Au-delà : avertissement (le modèle peut ralentir les PC du collège). */
export const HEAVY_TRIANGLES = 40_000;
/** Au-delà : refus. */
export const MAX_TRIANGLES = 200_000;

export interface ObjResult { mesh: ImportedMesh; name: string; warnings: string[] }

const dec = new TextDecoder();

/** Lit les fichiers choisis (zip, obj, mtl) et renvoie le maillage prêt pour l'atelier. */
export async function importObjFiles(files: File[]): Promise<ObjResult> {
  let objText = '', mtlText = '', name = '';
  for (const f of files) {
    if (f.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`« ${f.name} » fait ${(f.size / 1024 / 1024).toFixed(1).replace('.', ',')} Mo. Maximum : ${MAX_FILE_MB} Mo. Simplifie le modèle dans Tinkercad.`);
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext === 'zip') {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()));
      for (const [path, data] of Object.entries(entries)) {
        const e = path.toLowerCase();
        if (e.endsWith('.obj')) { objText = dec.decode(data); name ||= f.name.replace(/\.zip$/i, ''); }
        else if (e.endsWith('.mtl')) mtlText = dec.decode(data);
      }
    } else if (ext === 'obj') { objText = await f.text(); name = f.name.replace(/\.obj$/i, ''); }
    else if (ext === 'mtl') mtlText = await f.text();
    else throw new Error(`« ${f.name} » n’est pas un fichier Tinkercad : choisis le .zip, ou le .obj et le .mtl.`);
  }
  if (!objText) throw new Error('Aucun fichier .obj trouvé. Dans Tinkercad : Exporter › .OBJ, puis choisis le fichier .zip téléchargé.');
  const warnings: string[] = [];
  if (!mtlText) warnings.push('Pas de fichier .mtl : le modèle sera gris (choisis-le avec le .obj pour garder les couleurs).');
  const mesh = parseObj(objText, mtlText, name || 'modele');
  if (mesh.triangles > MAX_TRIANGLES) throw new Error(`Modèle trop lourd (${mesh.triangles.toLocaleString('fr-FR')} triangles) pour les PC du collège. Simplifie-le dans Tinkercad.`);
  if (mesh.triangles > HEAVY_TRIANGLES) warnings.push(`Modèle lourd (${mesh.triangles.toLocaleString('fr-FR')} triangles) : il peut ralentir les PC du collège.`);
  return { mesh, name: name || 'Modèle importé', warnings };
}

/** Convertit le texte OBJ (+ MTL) en maillage quantifié, regroupé par couleur. */
export function parseObj(objText: string, mtlText: string, source: string, zUp = true): ImportedMesh {
  const loader = new OBJLoader();
  if (mtlText) {
    const mc = new MTLLoader().parse(mtlText, '');
    mc.preload();
    loader.setMaterials(mc);
  }
  const root = loader.parse(objText);
  root.updateMatrixWorld(true);
  // Triangles regroupés par couleur
  const byColor = new Map<string, number[]>();
  const v = new THREE.Vector3();
  root.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position'); if (!pos) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const groups = m.geometry.groups.length ? m.geometry.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
    for (const g of groups) {
      const mat = mats[g.materialIndex ?? 0] as THREE.MeshPhongMaterial | undefined;
      const color = mtlText && mat?.color ? '#' + mat.color.getHexString() : '#C9C5BC';
      let arr = byColor.get(color); if (!arr) { arr = []; byColor.set(color, arr); }
      for (let i = g.start; i < Math.min(g.start + g.count, pos.count); i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        // mm → m ; Tinkercad : z vers le haut → Three.js : y vers le haut
        if (zUp) arr.push(v.x / 1000, v.z / 1000, -v.y / 1000); else arr.push(v.x / 1000, v.y / 1000, v.z / 1000);
      }
    }
  });
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let count = 0;
  for (const arr of byColor.values()) for (let i = 0; i < arr.length; i += 3) {
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], arr[i + k]); max[k] = Math.max(max[k], arr[i + k]); }
    count++;
  }
  if (!count) throw new Error('Le fichier .obj ne contient aucune forme.');
  const size = max.map((x, k) => Math.max(x - min[k], 1e-4)) as [number, number, number];
  const parts = [...byColor.entries()].filter(([, a]) => a.length).map(([color, arr]) => {
    const q = new Int16Array(arr.length);
    for (let i = 0; i < arr.length; i++) { const k = i % 3; q[i] = Math.round(((arr[i] - min[k]) / size[k]) * 65535) - 32768; }
    return { color, pos: toBase64(new Uint8Array(q.buffer)) };
  });
  return { id: uid(), source, size: size.map(x => Math.round(x * 100000) / 100000) as [number, number, number], triangles: Math.round(count / 3), parts };
}

/** Géométries (une par couleur), centrées sur l'origine, à la taille d'origine. Mises en cache. */
const cache = new Map<string, { color: string; geo: THREE.BufferGeometry }[]>();
export function meshParts(m: ImportedMesh) {
  let c = cache.get(m.id);
  if (!c) {
    c = m.parts.map(p => {
      const q = new Int16Array(fromBase64(p.pos).buffer);
      const f = new Float32Array(q.length);
      for (let i = 0; i < q.length; i++) { const k = i % 3; f[i] = ((q[i] + 32768) / 65535) * m.size[k] - m.size[k] / 2; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(f, 3));
      geo.computeVertexNormals();
      return { color: p.color, geo };
    });
    cache.set(m.id, c);
  }
  return c;
}

function toBase64(u8: Uint8Array) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string) {
  const s = atob(b64), u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
