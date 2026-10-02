import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import catalogue from '../../library/catalogue.json';
import { VOLUME_MODELS, type Part } from './volumes';
import type { Creation, Volume } from '../model/types';
import { buildVolumes } from './volumes3d';

/* Bibliothèque de mobilier. Les modèles GLB sont intégrés au fichier HTML (base64, voir scripts/build-library.mjs) :
   aucun fetch, donc compatible avec l'ouverture en file://. */

export type Category = 'assises' | 'rangements' | 'comptoirs' | 'tables' | 'portants' | 'plantes' | 'luminaires' | 'decor';
export const CATEGORIES: { id: Category | 'tout'; label: string; icon: string }[] = [
  { id: 'tout', label: 'Tout', icon: 'apps' }, { id: 'assises', label: 'Assises', icon: 'chair' },
  { id: 'rangements', label: 'Rangements', icon: 'shelves' }, { id: 'comptoirs', label: 'Comptoirs', icon: 'countertops' },
  { id: 'tables', label: 'Tables', icon: 'table_restaurant' }, { id: 'portants', label: 'Portants', icon: 'checkroom' },
  { id: 'plantes', label: 'Plantes', icon: 'potted_plant' }, { id: 'luminaires', label: 'Luminaires', icon: 'light' },
  { id: 'decor', label: 'Décor', icon: 'interests' },
];
export const categoryLabel = (c: string) => CATEGORIES.find(x => x.id === c)?.label ?? c;

export type Source = 'base' | 'moi' | 'prof';
export const SOURCE_LABEL: Record<Source, string> = { base: 'Base', moi: 'Mes créations', prof: 'Ajouts du professeur' };

export interface LibItem {
  id: string; name: string; cat: Category; source: Source;
  /** Pack d'origine (crédits). */
  pack: string;
  mural?: boolean; elev?: number; plafond?: boolean;
  glb?: string;            // modèle GLB en base64
  parts?: Part[];          // ou volumes simples (meubles de l'outil)
  volumes?: Volume[];      // ou volumes de l'atelier (créations des élèves)
  /** Création : enregistrée dans le projet ouvert, ou seulement sur ce poste. */
  where?: 'projet' | 'poste';
  team?: string;
  target?: { h?: number; w?: number };
  rot?: number;
}

import { MODELS } from './models.gen';

interface CatEntry { id: string; nom: string; cat: Category; pack: string; src: string; h?: number; w?: number; mural?: boolean; elev?: number; plafond?: boolean; rot?: number }
const items: LibItem[] = [
  ...(catalogue.modeles as CatEntry[]).map(m => ({
    id: m.id, name: m.nom, cat: m.cat, source: 'base' as Source, pack: m.pack, mural: m.mural, elev: m.elev, plafond: m.plafond, rot: m.rot,
    glb: MODELS[m.id], target: { h: m.h, w: m.w },
  })),
  ...VOLUME_MODELS.map(v => ({ id: v.id, name: v.nom, cat: v.cat as Category, source: 'base' as Source, pack: 'outil', parts: v.parts, mural: v.mural, elev: v.elev, plafond: v.plafond })),
];
const byId = new Map(items.map(i => [i.id, i]));

/* ---------- Créations de l'équipe (« Mes créations ») ---------- */
const creations = new Map<string, LibItem>();
const creationItem = (c: Creation, where: 'projet' | 'poste'): LibItem =>
  ({ id: c.id, name: c.name, cat: (c.cat as Category) || 'decor', source: 'moi', pack: 'eleves', volumes: c.volumes, where, team: c.team });
/** Met à jour la liste des créations : celles du projet ouvert, puis celles gardées sur ce poste. */
export function setCreations(inProject: Creation[], onComputer: Creation[]) {
  const next = new Map<string, LibItem>();
  for (const c of onComputer) next.set(c.id, creationItem(c, 'poste'));
  for (const c of inProject) next.set(c.id, creationItem(c, 'projet'));
  for (const [id, it] of next) { const old = creations.get(id); if (!old || JSON.stringify(old.volumes) !== JSON.stringify(it.volumes)) forgetProto(id); }
  creations.clear(); for (const [id, it] of next) creations.set(id, it);
}

export const libraryItems = () => [...items, ...[...creations.values()].sort((a, b) => (a.where === b.where ? 0 : a.where === 'projet' ? -1 : 1))];
export const getItem = (id: string) => byId.get(id) ?? creations.get(id);
export const PACKS = catalogue.packs as Record<string, { nom: string; auteur: string; licence: string; source: string }>;

/* ---------- Prototypes 3D ---------- */
export interface Proto {
  /** Objet normalisé : centré en x/z, posé sur y = 0, à sa taille par défaut (m). Face avant vers +z. */
  object: THREE.Object3D;
  dims: { w: number; d: number; h: number };
  /** Matériau « principal » (plus grande surface), remplacé quand l'élève choisit une couleur. */
  main: THREE.MeshStandardMaterial | null;
}

const loader = new GLTFLoader();
const protos = new Map<string, Promise<Proto>>();

function dataUrlToBuffer(url: string) /* base64 → octets */ {
  const bin = atob(url), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function triArea(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position'); if (!p) return 0;
  const idx = g.index, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let s = 0; const n = idx ? idx.count : p.count;
  for (let i = 0; i + 2 < n; i += 3) {
    const [i0, i1, i2] = idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2];
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    s += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return s;
}

/** Matériaux mats, ombres, et repérage du matériau principal. */
function prepare(root: THREE.Object3D): THREE.MeshStandardMaterial | null {
  const areas = new Map<THREE.Material, number>();
  const replaced = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const conv = mats.map(src => {
      let r = replaced.get(src);
      if (!r) {
        const s = src as THREE.MeshStandardMaterial;
        r = new THREE.MeshStandardMaterial({ color: s.color ?? new THREE.Color(0xffffff), map: s.map ?? null, roughness: 0.85, metalness: 0,
          transparent: s.transparent, opacity: s.opacity ?? 1 });
        r.name = src.name; replaced.set(src, r);
      }
      return r;
    });
    m.material = Array.isArray(m.material) ? conv : conv[0];
    const area = triArea(m.geometry) * m.getWorldScale(new THREE.Vector3()).lengthSq();
    for (const c of conv) areas.set(c, (areas.get(c) ?? 0) + area / conv.length);
  });
  let main: THREE.MeshStandardMaterial | null = null, best = -1;
  for (const [m, a] of areas) if (a > best && !(m as THREE.MeshStandardMaterial).transparent) { best = a; main = m as THREE.MeshStandardMaterial; }
  return main;
}

/** Recentre (x/z), pose au sol et met à l'échelle cible. */
function normalize(obj: THREE.Object3D, item: LibItem): Proto['dims'] {
  if (item.rot) obj.rotation.y = THREE.MathUtils.degToRad(item.rot);
  obj.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  let k = 1;
  if (item.target?.h) k = item.target.h / Math.max(size.y, 1e-6);
  else if (item.target?.w) k = item.target.w / Math.max(size.x, size.z, 1e-6);
  obj.scale.multiplyScalar(k);
  // Objets plats (tapis) : 2 cm d'épaisseur au plus
  if (item.target?.w && size.y * k > 0.02) obj.scale.y *= 0.02 / (size.y * k);
  obj.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
  const s = box.getSize(new THREE.Vector3());
  return { w: round(s.x), d: round(s.z), h: round(s.y) };
}
const round = (x: number) => Math.max(0.01, Math.round(x * 1000) / 1000);

function buildParts(parts: Part[]): THREE.Group {
  const g = new THREE.Group();
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (c: string) => { let m = mats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }); m.name = c; mats.set(c, m); } return m; };
  for (const p of parts) {
    let mesh: THREE.Mesh;
    if (p.t === 'b') { mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), mat(p.c)); mesh.position.set(p.x + p.w / 2, p.z + p.h / 2, p.y + p.d / 2); }
    else if (p.t === 'c') { mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, p.h, Math.max(12, Math.round(p.r * 120))), mat(p.c)); mesh.position.set(p.cx, p.z + p.h / 2, p.cy); }
    else { mesh = new THREE.Mesh(new THREE.SphereGeometry(p.r, 20, 14), mat(p.c)); mesh.position.set(p.cx, p.z, p.cy); }
    g.add(mesh);
  }
  return g;
}

export function loadProto(id: string): Promise<Proto> {
  let p = protos.get(id);
  if (p) return p;
  const item = getItem(id);
  p = (async (): Promise<Proto> => {
    if (!item) throw new Error('Modèle inconnu : ' + id);
    let obj: THREE.Object3D;
    if (item.parts) obj = buildParts(item.parts);
    else if (item.volumes) obj = buildVolumes(item.volumes);
    else if (item.glb) {
      const gltf = await loader.parseAsync(dataUrlToBuffer(item.glb), '');
      obj = gltf.scene;
    } else throw new Error('Modèle vide : ' + id);
    const main = prepare(obj);
    const dims = normalize(obj, item);
    const root = new THREE.Group(); root.add(obj);
    return { object: root, dims, main };
  })();
  protos.set(id, p);
  return p;
}

/** Copie d'un prototype, avec la couleur choisie (le matériau principal est cloné). */
export function instantiate(proto: Proto, color: string | null): THREE.Object3D {
  const o = proto.object.clone(true);
  if (color && proto.main) {
    const m = proto.main.clone(); m.color.set(color);
    o.traverse(c => {
      const mesh = c as THREE.Mesh; if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(x => x === proto.main ? m : x);
      else if (mesh.material === proto.main) mesh.material = m;
    });
  }
  return o;
}

/** Dimensions par défaut d'un modèle (après chargement). */
export async function defaultDims(id: string) { return (await loadProto(id)).dims; }

/** Oublie le prototype d'un modèle (création modifiée) : il sera reconstruit. */
export function forgetProto(id: string) { protos.delete(id); onForget.forEach(f => f(id)); }
const onForget = new Set<(id: string) => void>();
export const onProtoForgotten = (f: (id: string) => void) => onForget.add(f);
