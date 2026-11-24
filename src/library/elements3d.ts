import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Matiere, Poignee, Volume } from '../model/types';
import { isTransparent, matiereMaterial, projectUV } from './matieres';

/* Éléments de meuble tout faits de l'atelier : porte, bloc de tiroirs, étagère (caisson), pieds, poignée,
   rideau, claustra, portant et coussin. Chaque élément est un petit groupe de pièces construit dans son
   encombrement : x de 0 à la longueur, y de 0 à la hauteur, z de 0 (arrière) à la profondeur (face avant). */

type Part = 'main' | 'accent' | THREE.Material;
const GLASS = () => matiereMaterial('#DCEBEE', 'verre');
const CANE = () => matiereMaterial('#D9C29A', 'cannage');
export const ACCENT_DEFAUT = '#2E2D2B';

class Kit {
  readonly meshes: THREE.Mesh[] = [];
  constructor(private v: Volume) {}
  /** Ajoute une pièce dont la géométrie est centrée, avec son centre en (x, y, z). */
  add(g: THREE.BufferGeometry, part: Part, x: number, y: number, z: number, rot?: THREE.Euler | THREE.Quaternion) {
    const v = this.v;
    const matiere: Matiere | undefined = part === 'main' ? v.matiere : part === 'accent' ? (v.matiere2 ?? 'metal') : undefined;
    projectUV(g, matiere);
    const material = part === 'main' ? matiereMaterial(v.color || '#C9A97E', v.matiere, v.type === 'rideau')
      : part === 'accent' ? matiereMaterial(v.color2 || ACCENT_DEFAUT, v.matiere2 ?? 'metal') : part;
    const m = new THREE.Mesh(g, material);
    m.position.set(x, y, z);
    if (rot instanceof THREE.Quaternion) m.quaternion.copy(rot); else if (rot) m.rotation.copy(rot);
    const clear = isTransparent(matiere) || (material as THREE.MeshStandardMaterial).transparent;
    m.castShadow = !clear; m.receiveShadow = true;
    if (clear) m.renderOrder = 2;
    m.userData.volume = v.id;
    this.meshes.push(m);
    return m;
  }
  /** Boîte par ses deux coins. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, part: Part = 'main') {
    const w = Math.max(x1 - x0, 0.001), h = Math.max(y1 - y0, 0.001), d = Math.max(z1 - z0, 0.001);
    return this.add(new THREE.BoxGeometry(w, h, d), part, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }
  /** Cylindre (ou tronc de cône) entre deux points. */
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, part: Part = 'main', r2 = r) {
    const dir = b.clone().sub(a), len = Math.max(dir.length(), 0.001);
    const g = new THREE.CylinderGeometry(r2, r, len, Math.max(12, Math.min(32, Math.round(r * 800))));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const c = a.clone().add(b).multiplyScalar(0.5);
    return this.add(g, part, c.x, c.y, c.z, q);
  }
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Poignée posée sur une face avant (en z = front), centrée en (x, y). */
function handle(k: Kit, kind: Poignee | string | undefined, x: number, y: number, front: number, vertical: boolean, len = 0.128, part: Part = 'accent') {
  if (!kind || kind === 'aucune') return;
  const out = 0.03;
  if (kind === 'bouton') {
    k.add(new THREE.CylinderGeometry(0.016, 0.01, 0.026, 20).rotateX(Math.PI / 2), part, x, y, front + 0.013);
    return;
  }
  if (kind === 'coquille') {
    // Demi-coquille : la moitié d'un cylindre couché, ouverte vers le haut
    const L = Math.min(len, 0.1), g = new THREE.CylinderGeometry(0.018, 0.018, L, 20, 1, false, 0, Math.PI);
    g.rotateZ(Math.PI / 2); g.rotateX(Math.PI / 2); // axe de gauche à droite, bombé vers l'avant
    if (vertical) g.rotateZ(Math.PI / 2);
    k.add(g, part, x, y, front);
    return;
  }
  const L = kind === 'longue' ? len : Math.min(len, 0.16), r = 0.006;
  const d = vertical ? V(0, L / 2, 0) : V(L / 2, 0, 0), c = V(x, y, front + out);
  k.rod(c.clone().sub(d), c.clone().add(d), r, part);
  const inset = vertical ? V(0, L / 2 - 0.012, 0) : V(L / 2 - 0.012, 0, 0);
  for (const s of [-1, 1]) { const p = c.clone().add(inset.clone().multiplyScalar(s)); k.rod(V(p.x, p.y, front), V(p.x, p.y, front + out), 0.005, part); }
}

/** Pièces d'un élément de meuble, dans son encombrement (bw × bh × bd). */
export function elementParts(v: Volume, bw: number, bh: number, bd: number): THREE.Mesh[] {
  const k = new Kit(v);
  switch (v.type) {
    case 'porte': {
      const w = bw, h = bh, t = bd, f = Math.max(0.035, Math.min(0.1, Math.min(w, h) * 0.14));
      const style = v.style ?? 'pleine';
      if (style === 'pleine') k.box(0, 0, 0, w, h, t);
      else {
        const inner = style === 'moulure' ? t * 0.6 : t;
        // Cadre : montants verticaux, traverses haute et basse
        k.box(0, 0, 0, f, h, t); k.box(w - f, 0, 0, w, h, t);
        k.box(f, 0, 0, w - f, f, t); k.box(f, h - f, 0, w - f, h, t);
        if (style === 'moulure') { k.box(f, f, 0, w - f, h - f, inner); const m = f * 0.35; k.box(f + m, f + m, inner, w - f - m, h - f - m, inner + 0.004); }
        else if (style === 'vitree') k.box(f, f, t / 2 - 0.003, w - f, h - f, t / 2 + 0.003, GLASS());
        else if (style === 'cannee') k.box(f, f, t / 2 - 0.002, w - f, h - f, t / 2 + 0.002, CANE());
        else if (style === 'persienne') {
          const n = Math.max(2, Math.floor((h - 2 * f) / 0.045)), step = (h - 2 * f) / n;
          for (let i = 0; i < n; i++) k.add(new THREE.BoxGeometry(w - 2 * f, step * 1.05, t * 0.25), 'main', w / 2, f + step * (i + 0.5), t / 2, new THREE.Euler(-0.6, 0, 0));
        }
      }
      const hx = v.turned ? Math.max(0.035, f / 2) : w - Math.max(0.035, f / 2);
      handle(k, v.poignee ?? 'barre', hx, h > 1.2 ? Math.min(1, h / 2) : h / 2, t, true, Math.min(0.6, h * 0.7));
      break;
    }
    case 'tiroirs': {
      const n = clampN(v.n, 1, 10, 3), ft = 0.02, g = 0.004, side = !!v.turned;
      k.box(0, 0, 0, bw, bh, Math.max(bd - ft, 0.01));
      for (let i = 0; i < n; i++) {
        if (side) {
          const fw = (bw - g * (n + 1)) / n, x0 = g + i * (fw + g);
          k.box(x0, g, bd - ft, x0 + fw, bh - g, bd);
          handle(k, v.poignee ?? 'barre', x0 + fw / 2, bh - Math.min(0.08, bh * 0.15), bd, false, fw * 0.8);
        } else {
          const fh = (bh - g * (n + 1)) / n, y0 = g + i * (fh + g);
          k.box(g, y0, bd - ft, bw - g, y0 + fh, bd);
          handle(k, v.poignee ?? 'barre', bw / 2, y0 + fh / 2, bd, false, bw * 0.8);
        }
      }
      break;
    }
    case 'caisson': {
      const t = Math.min(v.t, bw / 3, bh / 3), n = clampN(v.n, 0, 15, 3), n2 = clampN(v.n2, 0, 10, 0), back = v.fond ? 0.008 : 0;
      k.box(0, 0, 0, t, bh, bd); k.box(bw - t, 0, 0, bw, bh, bd);
      k.box(t, 0, 0, bw - t, t, bd); k.box(t, bh - t, 0, bw - t, bh, bd);
      const ih = bh - 2 * t, iw = bw - 2 * t;
      for (let i = 1; i <= n; i++) { const y = t + (ih - n * t) / (n + 1) * i + t * (i - 1); k.box(t, y, back, bw - t, y + t, bd); }
      for (let i = 1; i <= n2; i++) { const x = t + (iw - n2 * t) / (n2 + 1) * i + t * (i - 1); k.box(x, t, back, x + t, bh - t, bd); }
      if (back) k.box(t, t, 0, bw - t, bh - t, back);
      break;
    }
    case 'pieds': {
      const t = Math.min(v.t, bw / 2, bd / 2), r = t / 2, style = v.style ?? 'rond';
      if (style === 'central') {
        const R = Math.min(bw, bd) / 2;
        k.add(new THREE.CylinderGeometry(R * 0.85, R, 0.03, 40), 'main', bw / 2, 0.015, bd / 2);
        k.rod(V(bw / 2, 0.03, bd / 2), V(bw / 2, bh - 0.02, bd / 2), r);
        k.add(new THREE.CylinderGeometry(Math.min(R, r * 3), Math.min(R, r * 3), 0.02, 32), 'main', bw / 2, bh - 0.01, bd / 2);
        break;
      }
      for (const [cx, cz] of [[r, r], [bw - r, r], [r, bd - r], [bw - r, bd - r]]) {
        const sx = cx < bw / 2 ? 1 : -1, sz = cz < bd / 2 ? 1 : -1; // vers l'intérieur
        switch (style) {
          case 'carre': k.box(cx - r, 0, cz - r, cx + r, bh, cz + r); break;
          case 'fuseau': k.rod(V(cx, 0, cz), V(cx, bh, cz), r * 0.45, 'main', r); break;
          case 'compas': { const s = Math.min(bh * 0.18, bw / 4, bd / 4); k.rod(V(cx, 0, cz), V(cx + sx * s, bh, cz + sz * s), r * 0.5, 'main', r); break; }
          case 'boule': k.add(new THREE.SphereGeometry(0.5, 24, 16).scale(t, bh, t), 'main', cx, bh / 2, cz); break;
          case 'epingle': {
            // Deux tiges en V qui se rejoignent en bas par une boucle
            const e = Math.min(0.05, bd / 4);
            const curve = new THREE.CatmullRomCurve3([V(cx, bh, cz), V(cx, 0.07, cz + sz * e * 0.8), V(cx, 0.006, cz + sz * e), V(cx, 0.07, cz + sz * e * 1.2), V(cx, bh, cz + sz * e * 2)]);
            k.add(new THREE.TubeGeometry(curve, 48, 0.005, 8, false), 'main', 0, 0, 0);
            break;
          }
          case 'roulette': {
            const wd = Math.min(bh * 0.75, 0.08), rr = Math.max(r, 0.025);
            k.add(new THREE.CylinderGeometry(wd / 2, wd / 2, 0.022, 24).rotateZ(Math.PI / 2), 'accent', cx, wd / 2, cz);
            k.box(cx - 0.016, wd / 2, cz - 0.014, cx + 0.016, bh - 0.008, cz + 0.014);
            k.box(cx - rr, bh - 0.008, cz - rr, cx + rr, bh, cz + rr);
            break;
          }
          default: k.rod(V(cx, 0, cz), V(cx, bh, cz), r);
        }
      }
      break;
    }
    case 'poignee': handle(k, v.style ?? 'barre', bw / 2, bh / 2, 0, !!v.turned, v.w, 'main'); break;
    case 'rideau': {
      const tringle = v.fond !== false, top = tringle ? bh - 0.035 : bh, amp = Math.max(0.005, Math.min(v.t, bd) / 2);
      const panel = (x0: number, w: number, pleat: number, a: number) => {
        const seg = Math.max(8, Math.round(w / pleat * 8));
        const g = new THREE.PlaneGeometry(w, top - 0.01, seg, 1), p = g.getAttribute('position');
        for (let i = 0; i < p.count; i++) p.setZ(i, a * Math.sin((p.getX(i) + w / 2) / pleat * Math.PI * 2));
        g.computeVertexNormals();
        k.add(g, 'main', x0 + w / 2, 0.01 + (top - 0.01) / 2, bd / 2);
      };
      if (v.style === 'ouvert') { const w = bw * 0.24; panel(0, w, 0.06, amp); panel(bw - w, w, 0.06, amp); }
      else panel(0, bw, 0.13, amp);
      if (tringle) {
        k.rod(V(0.01, bh - 0.02, bd / 2), V(bw - 0.01, bh - 0.02, bd / 2), 0.01, 'accent');
        for (const x of [0.015, bw - 0.015]) k.add(new THREE.SphereGeometry(0.018, 16, 12), 'accent', x, bh - 0.02, bd / 2);
      }
      break;
    }
    case 'claustra': {
      const n = clampN(v.n, 2, 80, 12), t = v.t, round = v.style === 'ronds';
      for (let i = 0; i < n; i++) {
        if (v.turned) {
          const y = t / 2 + (bh - t) * i / (n - 1);
          if (round) k.rod(V(0, y, bd / 2), V(bw, y, bd / 2), Math.min(t, bd) / 2); else k.box(0, y - t / 2, 0, bw, y + t / 2, bd);
        } else {
          const x = t / 2 + (bw - t) * i / (n - 1);
          if (round) k.rod(V(x, 0, bd / 2), V(x, bh, bd / 2), Math.min(t, bd) / 2); else k.box(x - t / 2, 0, 0, x + t / 2, bh, bd);
        }
      }
      break;
    }
    case 'portant': {
      const r = v.t / 2;
      for (const x of [r, bw - r]) {
        k.rod(V(x, r * 2, bd / 2), V(x, bh - r, bd / 2), r);
        k.rod(V(x, r, 0), V(x, r, bd), r);
      }
      k.rod(V(0, bh - r, bd / 2), V(bw, bh - r, bd / 2), r);
      if (v.fond) k.box(r * 2, 0.14, bd * 0.1, bw - r * 2, 0.16, bd * 0.9, 'accent');
      break;
    }
    case 'coussin': {
      if (v.style === 'boudin') { const R = bh / 2; k.add(new THREE.CapsuleGeometry(R, Math.max(bw - 2 * R, 0.001), 8, 24).rotateZ(Math.PI / 2), 'main', bw / 2, R, bd / 2); }
      else k.add(new RoundedBoxGeometry(bw, bh, bd, 6, Math.max(0.002, Math.min(bh / 2, bw / 2, bd / 2) * 0.92)), 'main', bw / 2, bh / 2, bd / 2);
      break;
    }
  }
  return k.meshes;
}
const clampN = (n: number | undefined, min: number, max: number, def: number) => Math.max(min, Math.min(max, Math.round(n ?? def)));
