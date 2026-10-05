import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Ctx } from './state';
import type { Creation, Volume, VolumeType } from '../model/types';
import { Store } from '../model/store';
import { uid } from '../model/geometry';
import { h, icon } from '../ui/dom';
import { type Bound, alert, button, choose, numberField, section, swatches, toast, toggle } from '../ui/components';
import { HEAVY_TRIANGLES, importObjFiles } from '../library/objImport';
import { CATEGORIES } from '../library/library';
import { VOLUME_LABEL, VOLUME_TYPES, buildVolumes, newVolume, totalSize, volumeBox, volumeMesh } from '../library/volumes3d';
import { saveCreation } from './creations';
import { helpButton, offerTour } from './guide/guide';

/* Atelier de création de mobilier (maquette 05) : l'élève assemble des volumes simples (boîte, cylindre,
   plan, arche), règle leurs dimensions au clavier, leur couleur, puis enregistre le meuble dans
   « Mes créations ». L'atelier a son propre historique (annuler / rétablir). */

const COLORS = [
  { name: 'Noir', hex: '#2E2D2B' }, { name: 'Blanc cassé', hex: '#F6F4F0' }, { name: 'Chêne', hex: '#C9A97E' }, { name: 'Noyer', hex: '#8A5A3B' },
  { name: 'Terracotta', hex: '#BF4E36' }, { name: 'Ocre', hex: '#D9A54A' }, { name: 'Sauge', hex: '#6E8B6B' }, { name: 'Vert sapin', hex: '#3F5E4A' },
  { name: 'Bleu ardoise', hex: '#5B6B7A' }, { name: 'Bleu ciel', hex: '#BCD3DF' }, { name: 'Rose poudré', hex: '#E8C8BC' }, { name: 'Gris béton', hex: '#B8B4AD' },
];
const PICTO: Record<VolumeType, string> = {
  boite: '<path d="M8 15 24 7l16 8v18l-16 8-16-8z M8 15l16 8 16-8 M24 23v18"/>',
  cylindre: '<ellipse cx="24" cy="12" rx="12" ry="5"/><path d="M12 12v22c0 3 5 5 12 5s12-2 12-5V12"/>',
  plan: '<path d="M5 26 24 17l19 9-19 9z M5 26v3l19 9 19-9v-3"/>',
  arche: '<path d="M10 42V22a14 14 0 0 1 28 0v20h-7V22a7 7 0 0 0-14 0v20z"/>',
  boule: '<circle cx="24" cy="24" r="15"/><path d="M9 24c0 4 7 7 15 7s15-3 15-7"/>',
  cone: '<path d="M24 7 11 36c0 3 6 5 13 5s13-2 13-5z"/><path d="M11 36c0-3 6-5 13-5s13 2 13 5"/>',
  tube: '<ellipse cx="24" cy="12" rx="12" ry="5"/><ellipse cx="24" cy="12" rx="6" ry="2.5"/><path d="M12 12v22c0 3 5 5 12 5s12-2 12-5V12"/>',
  demirond: '<path d="M8 14h32c0 7-7 11-16 11S8 21 8 14z"/><path d="M8 14v20c0 7 7 9 16 9s16-2 16-9V14"/>',
  prisme: '<path d="M6 38 20 12l22 6-14 26z"/><path d="M20 12l8 32"/>',
  modele: '',
};
const cmStr = (m: number) => String(Math.round(m * 100));

export function atelierScreen(ctx: Ctx, opts: { creation?: Creation; back: () => void; done: (id: string) => void }) {
  const editing = !!opts.creation;
  const st = new Store<Creation>(opts.creation ? structuredClone(opts.creation)
    : { id: 'c-' + uid(), name: 'Mon meuble', cat: 'decor', team: ctx.store.doc.team.name, volumes: [], updated: 0 });
  let sel: string | null = st.doc.volumes[0]?.id ?? null;
  // Volume de référence pour « Placer par rapport à » : par défaut, le volume choisi juste avant.
  let refId: string | null = null, prevSel: string | null = null;
  const vol = () => st.doc.volumes.find(v => v.id === sel);
  const edit = (fn: (v: Volume) => void) => st.update(d => { const v = d.volumes.find(x => x.id === sel); if (v) fn(v); });

  // ---------- Vue 3D ----------
  const view = new AtelierView(st, () => sel, id => { sel = id; renderAll(); });

  // ---------- Colonne de gauche ----------
  const list = h('div', { class: 'at-list', 'data-testid': 'volumes' });
  const listTitle = h('div', { class: 'p-sec-t' });
  const addTile = (t: VolumeType) => {
    const pic = h('span', { class: 'at-pic' }); pic.innerHTML = `<svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">${PICTO[t]}</svg>`;
    return h('button', { class: 'at-tile', type: 'button', title: 'Ajouter : ' + VOLUME_LABEL[t], 'aria-label': 'Ajouter : ' + VOLUME_LABEL[t], onclick: () => addVolume(t) }, pic, VOLUME_LABEL[t]);
  };
  const left = h('aside', { class: 'at-left' },
    section('Ajouter un volume', h('div', { class: 'at-tiles' }, ...VOLUME_TYPES.map(addTile))),
    h('div', { class: 'p-sec', style: { flex: '1', minHeight: '0' } }, listTitle, list),
    h('div', { class: 'p-sec' },
      h('button', { class: 'btn at-import', type: 'button', onclick: () => pickObj() }, icon('upload_file'), 'Importer un fichier Tinkercad (OBJ)'),
      h('p', { class: 'p-help', style: { textAlign: 'center' } }, 'Fichier .obj · 5 Mo maximum')));

  function addVolume(t: VolumeType) {
    const n = st.doc.volumes.filter(v => v.type === t).length + 1;
    const v = newVolume(t, n, vol()?.color ?? '#C9A97E');
    if (st.doc.volumes.length) { const s = totalSize(st.doc.volumes); v.x = Math.round((s.w + 0.1) * 100) / 100; }
    st.update(d => { d.volumes.push(v); });
    sel = v.id; renderAll();
    view.frame();
  }
  function renderList() {
    listTitle.textContent = `Mon meuble · ${st.doc.volumes.length} volume${st.doc.volumes.length > 1 ? 's' : ''}`;
    if (!st.doc.volumes.length) { list.replaceChildren(h('p', { class: 'p-help' }, 'Ajoute un premier volume avec les boutons ci-dessus.')); return; }
    list.replaceChildren(...st.doc.volumes.map(v => h('div', { class: 'at-row' + (v.id === sel ? ' on' : ''), onclick: () => { sel = v.id; renderAll(); } },
      h('span', { class: 'at-dot', style: { background: v.color || 'conic-gradient(#BF4E36 0 25%, #6E8B6B 0 50%, #C9A97E 0 75%, #5B6B7A 0)' } }), h('span', { class: 'at-name' }, v.name),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: v.hidden ? 'Afficher' : 'Masquer (dans l’atelier seulement)',
        onclick: (e: MouseEvent) => { e.stopPropagation(); st.update(d => { const x = d.volumes.find(q => q.id === v.id)!; x.hidden = !x.hidden; }); } }, icon(v.hidden ? 'visibility_off' : 'visibility')))));
  }

  // ---------- Panneau de droite ----------
  const panelHost = h('div', { style: { display: 'contents' } });
  let panelKey = '', binds: Bound[] = [];
  const saveBtn = h('button', { class: 'btn btn-primary btn-xl', type: 'button', onclick: () => void save() }, icon('bookmark_add'), editing ? 'Enregistrer le meuble' : 'Ajouter à Mes créations');
  function renderPanel() {
    const v = vol();
    const key = v ? `${v.id}|${v.type}|${v.turned}|${st.doc.volumes.map(x => x.id + x.name).join()}` : 'meuble';
    saveBtn.disabled = !st.doc.volumes.length;
    if (key === panelKey) { binds.forEach(b => b.refresh()); return; }
    panelKey = key; binds = [];
    if (v && prevSel && prevSel !== v.id && st.doc.volumes.some(x => x.id === prevSel)) refId = prevSel;
    if (v) prevSel = v.id;
    const b = <T extends Bound>(x: T) => { binds.push(x); return x.el; };
    const nf = (label: string, k: 'w' | 'd' | 'h' | 't' | 'x' | 'y' | 'z', min = 1, max = 400) => b(numberField({ label, unit: 'cm', min, max,
      get: () => (vol()?.[k] ?? 0) * 100, set: val => edit(x => { x[k] = val / 100; fixArch(x); }) }));
    let body: (Node | null)[];
    if (v) {
      const dims: Record<VolumeType, () => HTMLElement> = {
        boite: () => h('div', { class: 'g3' }, nf('Longueur', 'w'), nf('Profondeur', 'd'), nf('Hauteur', 'h')),
        cylindre: () => h('div', { class: 'g2' }, nf('Diamètre', 'w'), nf(v.turned ? 'Longueur' : 'Hauteur', 'h')),
        plan: () => h('div', { class: 'g3' }, nf('Longueur', 'w'), nf('Largeur', 'd'), nf('Épaisseur', 't', 1, 50)),
        arche: () => h('div', { class: 'g2' }, nf('Largeur', 'w'), nf('Profondeur', 'd'), nf('Hauteur', 'h'), nf('Épaisseur', 't', 1, 100)),
        boule: () => h('div', { class: 'g2' }, nf('Diamètre', 'w')),
        cone: () => h('div', { class: 'g3' }, nf('Diamètre bas', 'w'), nf('Diamètre haut', 'd', 0), nf('Hauteur', 'h')),
        tube: () => h('div', { class: 'g3' }, nf('Diamètre', 'w'), nf(v.turned ? 'Longueur' : 'Hauteur', 'h'), nf('Épaisseur', 't', 1, 100)),
        demirond: () => h('div', { class: 'g2' }, nf('Diamètre', 'w'), nf(v.turned ? 'Longueur' : 'Hauteur', 'h')),
        prisme: () => h('div', { class: 'g3' }, nf('Longueur', 'w'), nf('Profondeur', 'd'), nf('Hauteur', 'h')),
        modele: () => modelDims(),
      };
      const nameIn = h('input', { value: v.name, 'aria-label': 'Nom du volume', maxLength: 40 });
      nameIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') nameIn.blur(); });
      nameIn.addEventListener('change', () => edit(x => { x.name = nameIn.value.trim() || x.name; }));
      const turn = v.type === 'cylindre' || v.type === 'tube' || v.type === 'demirond' ? toggle('Couché', 'rotate_right', () => !!vol()?.turned, val => edit(x => { x.turned = val; }))
        : v.type === 'plan' ? toggle('Debout', 'rotate_right', () => !!vol()?.turned, val => edit(x => { x.turned = val; }))
        : v.type === 'prisme' ? toggle('En coin (triangle droit)', 'rotate_right', () => !!vol()?.turned, val => edit(x => { x.turned = val; })) : null;
      body = [
        h('label', { class: 'tf' }, 'Nom du volume', nameIn),
        section('Dimensions', dims[v.type]()),
        turn ? b(turn) : null,
        section('Position (depuis le coin du meuble)', h('div', { class: 'g3' }, nf('X', 'x', -500, 500), nf('Y', 'y', -500, 500), nf('Z (hauteur)', 'z', 0, 500))),
        placeRelative(v),
        section('Rotation et inclinaison (en degrés)',
          h('div', { class: 'rot-row rot-free' },
            h('button', { class: 'sq', type: 'button', title: '−15°', onclick: () => edit(x => { x.rot = norm360(x.rot - 15); }) }, icon('rotate_left')),
            b(numberField({ label: 'Tourner (vue de dessus)', unit: '°', min: -360, max: 360, get: () => vol()?.rot ?? 0, set: a => edit(x => { x.rot = norm360(a); }),
              title: 'N’importe quel angle, par exemple 37' })),
            h('button', { class: 'sq', type: 'button', title: '+15°', onclick: () => edit(x => { x.rot = norm360(x.rot + 15); }) }, icon('rotate_right'))),
          h('div', { class: 'g2' },
            b(numberField({ label: 'Pencher vers l’avant', unit: '°', min: -180, max: 180, get: () => vol()?.tiltX ?? 0, set: a => edit(x => { x.tiltX = a; }) })),
            b(numberField({ label: 'Pencher vers la droite', unit: '°', min: -180, max: 180, get: () => vol()?.tiltY ?? 0, set: a => edit(x => { x.tiltY = a; }) }))),
          h('p', { class: 'p-help' }, 'Un angle négatif penche vers l’arrière ou vers la gauche. Après une inclinaison, « Au sol » ou « Dessus » recalent le volume.'),
          button('Remettre droit', 'restart_alt', 'btn-ghost', () => edit(x => { x.rot = 0; x.tiltX = 0; x.tiltY = 0; }))),
        section('Couleur du volume', colorPicker(v)),
        h('div', { class: 'g2' }, button('Dupliquer', 'content_copy', 'btn-secondary', () => duplicate()), button('Supprimer', 'delete', 'btn-danger', () => remove())),
      ];
    } else {
      const nameIn = h('input', { value: st.doc.name, 'aria-label': 'Nom du meuble', maxLength: 40 });
      nameIn.addEventListener('keydown', e => e.stopPropagation());
      nameIn.addEventListener('change', () => st.update(d => { d.name = nameIn.value.trim() || 'Mon meuble'; }));
      binds.push({ el: nameIn, refresh: () => { if (document.activeElement !== nameIn) nameIn.value = st.doc.name; } });
      body = [
        h('label', { class: 'tf' }, 'Nom du meuble', nameIn),
        h('p', { class: 'p-help' }, h('b', null, 'Ajoute des volumes'), ' à gauche, puis clique sur un volume pour régler ses dimensions, sa position et sa couleur. Tu peux aussi le ', h('b', null, 'glisser'), ' sur le plateau.'),
        h('p', { class: 'p-help' }, 'Astuce : la position est mesurée depuis le coin du meuble, marqué par les deux traits orange du plateau.'),
      ];
    }
    const title = v ? v.name : 'Mon meuble';
    panelHost.replaceChildren(h('aside', { class: 'pn', 'data-testid': 'atelier-panel' },
      h('div', { class: 'pn-h' }, h('div', { class: 'pn-ic' }, icon(v ? 'category' : 'handyman')),
        h('div', { class: 'pn-t' }, h('div', { class: 'pn-t1' }, title), h('div', { class: 'pn-t2' }, v ? VOLUME_LABEL[v.type] : 'Atelier de mobilier')),
        v ? h('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: 'Désélectionner', onclick: () => { sel = null; renderAll(); } }, icon('close')) : null),
      h('div', { class: 'pn-b' }, ...body),
      h('div', { class: 'pn-f' }, saveBtn)));
    binds.forEach(x => x.refresh());
  }
  /** Pastilles de couleur ; un modèle importé peut garder ses couleurs d'origine (couleur vide). */
  function colorPicker(v: Volume): HTMLElement {
    const sw = swatches(COLORS, () => vol()?.color ?? '', c => edit(x => { x.color = c; }), 'sws6');
    binds.push(sw);
    if (v.type === 'modele') {
      const orig = h('button', { type: 'button', class: 'sw orig', title: 'Couleurs d’origine', 'aria-label': 'Couleurs d’origine', onclick: () => edit(x => { x.color = ''; }) });
      sw.el.prepend(orig);
      binds.push({ el: orig, refresh: () => orig.classList.toggle('on', !vol()?.color) });
    }
    return sw.el;
  }

  /* ---------- Modèle importé de Tinkercad ---------- */
  let modelRatio = true;
  function pickObj() {
    const input = h('input', { type: 'file', accept: '.zip,.obj,.mtl', multiple: true, style: { display: 'none' } });
    input.addEventListener('change', async () => {
      const files = [...(input.files ?? [])]; input.remove();
      if (!files.length) return;
      try {
        const r = await importObjFiles(files);
        const [w, hgt, d] = r.mesh.size;
        const v: Volume = { ...newVolume('modele', 1), name: r.name, w, h: hgt, d, mesh: r.mesh };
        if (st.doc.volumes.length) { const s = totalSize(st.doc.volumes); v.x = Math.round((s.w + 0.1) * 100) / 100; }
        st.update(doc => { doc.volumes.push(v); });
        sel = v.id; renderAll(); view.frame();
        const dims = `${cmStr(w)} × ${cmStr(d)} × ${cmStr(hgt)} cm`;
        if (r.warnings.length) toast(r.warnings.join(' '), undefined, 'warning');
        else toast(`« ${r.name} » importé : ${dims}, ${r.mesh.triangles.toLocaleString('fr-FR')} triangles.`);
      } catch (e) {
        toast((e as Error).message, undefined, 'warning');
      }
    });
    document.body.appendChild(input);
    input.click();
  }
  /** Dimensions d'un modèle importé : proportions gardées par défaut, taille d'origine Tinkercad. */
  function modelDims(): HTMLElement {
    const v = vol()!, m = v.mesh!;
    const setDim = (k: 'w' | 'd' | 'h', val: number) => edit(x => {
      const f = val / 100 / x[k];
      if (modelRatio) { x.w = r3(x.w * f); x.d = r3(x.d * f); x.h = r3(x.h * f); }
      x[k] = val / 100;
    });
    const field = (label: string, k: 'w' | 'd' | 'h') => numberField({ label, unit: 'cm', min: 1, max: 600, get: () => (vol()?.[k] ?? 0) * 100, set: val => setDim(k, val) });
    const fw = field('Longueur', 'w'), fd = field('Profondeur', 'd'), fh = field('Hauteur', 'h');
    binds.push(fw, fd, fh);
    const ratio = h('input', { type: 'checkbox', checked: modelRatio, onchange: (e: Event) => { modelRatio = (e.target as HTMLInputElement).checked; } });
    const mm = (x: number) => Math.round(x * 1000);
    return h('div', { class: 'p-sec' },
      h('label', { class: 'chk' }, ratio, 'Garder les proportions'),
      h('div', { class: 'g3' }, fw.el, fd.el, fh.el),
      h('p', { class: 'p-help' }, `Taille dans Tinkercad : ${mm(m.size[0])} × ${mm(m.size[2])} × ${mm(m.size[1])} mm · ${m.triangles.toLocaleString('fr-FR')} triangles`),
      m.triangles > HEAVY_TRIANGLES ? alert('warning', 'Modèle lourd', 'Il peut ralentir les PC du collège. Simplifie-le dans Tinkercad si la 3D devient lente.') : null,
      h('div', { class: 'g2' },
        button('Taille d’origine', 'restart_alt', 'btn-secondary', () => edit(x => { x.w = m.size[0]; x.h = m.size[1]; x.d = m.size[2]; })),
        button('Redresser', 'rotate_right', 'btn-secondary', () => { edit(x => { x.tiltX = ((x.tiltX ?? 0) + 90) % 360; }); align('sol'); })));
  }

  /** « Placer par rapport à » : centrer, poser dessus, coller à côté d'un autre volume. */
  function placeRelative(v: Volume): HTMLElement {
    const others = st.doc.volumes.filter(x => x.id !== v.id);
    if (!others.length) return section('Placer par rapport à…', h('p', { class: 'p-help' }, 'Ajoute un deuxième volume pour le placer par rapport au premier (centrer, poser dessus, coller à côté).'));
    const size = (x: Volume) => { const s = bbox(x).getSize(new THREE.Vector3()); return s.x * s.y * s.z; };
    if (!refId || !others.some(x => x.id === refId)) refId = [...others].sort((a, b) => size(b) - size(a))[0].id;
    const ref = h('select', { class: 'at-select', 'aria-label': 'Volume de référence', onchange: (e: Event) => { refId = (e.target as HTMLSelectElement).value; } },
      ...others.map(x => h('option', { value: x.id, selected: x.id === refId }, x.name)));
    const act = (ic: string, label: string, kind: Align, title: string) =>
      h('button', { class: 'algn', type: 'button', title, 'aria-label': title, onclick: () => align(kind) }, icon(ic), label);
    return section('Placer par rapport à…', ref,
      h('div', { class: 'algn-g' },
        act('filter_center_focus', 'Au centre', 'centre', 'Centrer sur le volume de référence (vu de dessus)'),
        act('align_horizontal_center', 'Centrer ↔', 'centreX', 'Centrer de gauche à droite'),
        act('align_vertical_center', 'Centrer ↕', 'centreY', 'Centrer de l’avant à l’arrière'),
        act('vertical_align_top', 'Dessus', 'dessus', 'Poser sur le dessus du volume de référence'),
        act('vertical_align_bottom', 'Au sol', 'sol', 'Poser au sol (hauteur 0)'),
        act('align_vertical_bottom', 'Même bas', 'bas', 'Mettre à la même hauteur de bas que la référence'),
        act('west', 'À gauche', 'gauche', 'Coller sur le côté gauche de la référence'),
        act('east', 'À droite', 'droite', 'Coller sur le côté droit de la référence'),
        act('south', 'Devant', 'devant', 'Coller devant la référence'),
        act('north', 'Derrière', 'derriere', 'Coller derrière la référence')));
  }
  function align(kind: Align) {
    const v = vol(), r = st.doc.volumes.find(x => x.id === refId);
    if (!v || !r) return;
    const A = bbox(v), B = bbox(r), ca = A.getCenter(new THREE.Vector3()), cb = B.getCenter(new THREE.Vector3());
    let dx = 0, dy = 0, dz = 0; // dy = profondeur (axe z en 3D), dz = hauteur (axe y en 3D)
    switch (kind) {
      case 'centre': dx = cb.x - ca.x; dy = cb.z - ca.z; break;
      case 'centreX': dx = cb.x - ca.x; break;
      case 'centreY': dy = cb.z - ca.z; break;
      case 'dessus': dz = B.max.y - A.min.y; break;
      case 'sol': dz = -A.min.y; break;
      case 'bas': dz = B.min.y - A.min.y; break;
      case 'gauche': dx = B.min.x - A.max.x; break;
      case 'droite': dx = B.max.x - A.min.x; break;
      case 'devant': dy = B.max.z - A.min.z; break;
      case 'derriere': dy = B.min.z - A.max.z; break;
    }
    edit(x => { x.x = r3(x.x + dx); x.y = r3(x.y + dy); x.z = Math.max(0, r3(x.z + dz)); });
  }
  /** Une arche garde une hauteur au moins égale à sa demi-largeur et une épaisseur raisonnable. */
  function fixArch(v: Volume) {
    if (v.type !== 'arche') return;
    v.h = Math.max(v.h, v.w / 2 + 0.02);
    v.t = Math.min(v.t, v.w / 2 - 0.01);
  }
  function duplicate() {
    const v = vol(); if (!v) return;
    const c = { ...structuredClone(v), id: uid(), name: v.name + ' (copie)', x: v.x + 0.1, y: v.y + 0.1 };
    st.update(d => { d.volumes.push(c); }); sel = c.id; renderAll();
  }
  function remove() {
    if (!sel) return;
    const id = sel;
    st.update(d => { d.volumes = d.volumes.filter(v => v.id !== id); }); sel = null; renderAll();
  }

  // ---------- Barre du haut et pastilles ----------
  const total = h('div', { class: 'pill at-total' });
  const nameTop = h('input', { class: 'at-name-in', 'aria-label': 'Nom du meuble', maxLength: 40 });
  nameTop.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') nameTop.blur(); });
  nameTop.addEventListener('change', () => st.update(d => { d.name = nameTop.value.trim() || 'Mon meuble'; }));
  const catTop = h('select', { class: 'at-cat', 'aria-label': 'Catégorie du meuble', onchange: (e: Event) => st.update(d => { d.cat = (e.target as HTMLSelectElement).value; }) },
    ...CATEGORIES.filter(c => c.id !== 'tout').map(c => h('option', { value: c.id }, c.label)));
  const undo = h('button', { class: 'btn btn-ghost', type: 'button', title: 'Annuler (Ctrl+Z)', onclick: () => { st.undo(); } }, icon('undo'), 'Annuler');
  const redo = h('button', { class: 'btn btn-ghost', type: 'button', title: 'Rétablir (Ctrl+Y)', onclick: () => { st.redo(); } }, icon('redo'), 'Rétablir');
  const back = async () => {
    if (st.canUndo) {
      const c = await choose('Quitter l’atelier ?', 'Ton meuble n’est pas encore dans « Mes créations ».', [
        { label: 'Rester', value: 'non', cls: 'btn-ghost' }, { label: 'Quitter sans enregistrer', value: 'oui', cls: 'btn-danger' }, { label: 'Enregistrer', value: 'save', cls: 'btn-primary', icon: 'bookmark_add' }]);
      if (c === 'save') { await save(); return; }
      if (c !== 'oui') return;
    }
    cleanup(); opts.back();
  };
  const el = h('div', { class: 'ed at', 'data-testid': 'atelier' },
    h('header', { class: 'tb' },
      h('div', { class: 'tb-l' },
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => void back() }, icon('arrow_back'), 'Retour à la boutique'),
        h('div', { class: 'tb-title' }, h('div', { class: 'tb-name', style: { pointerEvents: 'none' } }, 'Atelier de mobilier'),
          h('div', { class: 'tb-status', style: { color: 'var(--text-3)' } }, editing ? 'Modifier une création' : 'Nouveau meuble'))),
      h('div'),
      h('div', { class: 'tb-r' }, helpButton(), undo, redo)),
    h('div', { class: 'ed-body' }, left,
      h('main', { class: 'vp' }, view.el,
        h('div', { class: 'at-pills' }, h('label', { class: 'pill at-name' }, h('span', null, 'Nom'), nameTop), h('label', { class: 'pill at-name' }, h('span', null, 'Rangé dans'), catTop), total),
        h('label', { class: 'pill at-name at-step', title: 'Les volumes glissés à la souris s’accrochent sur ce pas (Maj : 1 cm)' }, icon('grid_4x4'), h('span', null, 'Pas'),
          h('select', { class: 'at-cat', 'aria-label': 'Pas de l’aimantation', onchange: (e: Event) => { view.step = +(e.target as HTMLSelectElement).value; } },
            h('option', { value: '0.01' }, '1 cm'), h('option', { value: '0.05', selected: true }, '5 cm'), h('option', { value: '0.1' }, '10 cm'))),
        h('div', { class: 'vp-zoom' },
          h('button', { type: 'button', title: 'Zoom arrière', onclick: () => view.zoom(1.2) }, icon('remove')),
          h('button', { type: 'button', title: 'Recentrer', onclick: () => view.frame() }, icon('center_focus_strong')),
          h('button', { type: 'button', title: 'Zoom avant', onclick: () => view.zoom(1 / 1.2) }, icon('add'))),
        h('div', { class: 'vp-hints' }, h('div', { class: 'pill' }, icon('open_with'), 'Glisser un volume : le déplacer (Maj : 1 cm)'), h('div', { class: 'pill' }, icon('mouse'), 'Glisser le fond : tourner'))),
      panelHost));

  function renderAll() {
    if (sel && !vol()) sel = null;
    renderList(); renderPanel(); view.sync();
    const s = totalSize(st.doc.volumes);
    total.textContent = st.doc.volumes.length ? `Total : ${cmStr(s.w)} × ${cmStr(s.d)} × ${cmStr(s.h)} cm` : 'Aucun volume';
    if (document.activeElement !== nameTop) nameTop.value = st.doc.name;
    catTop.value = st.doc.cat;
    undo.disabled = !st.canUndo; redo.disabled = !st.canRedo;
  }
  st.subscribe(() => renderAll());

  async function save() {
    if (!st.doc.volumes.length) return;
    await saveCreation(ctx, { ...st.doc, team: st.doc.team || ctx.store.doc.team.name });
    toast(editing ? `« ${st.doc.name} » mis à jour.` : `« ${st.doc.name} » ajouté à Mes créations.`);
    cleanup(); opts.done(st.doc.id);
  }

  // ---------- Clavier ----------
  const onKey = (e: KeyboardEvent) => {
    if (!el.isConnected) return;
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); st.undo(); }
    else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); st.redo(); }
    else if (ctrl && k === 'd') { e.preventDefault(); duplicate(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
    else if (e.key === 'Escape') { sel = null; renderAll(); }
    else if (e.key.startsWith('Arrow') && vol()) {
      e.preventDefault();
      const s = e.shiftKey ? 0.1 : 0.01;
      edit(v => { if (e.key === 'ArrowLeft') v.x -= s; if (e.key === 'ArrowRight') v.x += s; if (e.key === 'ArrowUp') v.y -= s; if (e.key === 'ArrowDown') v.y += s; v.x = r3(v.x); v.y = r3(v.y); });
    }
  };
  window.addEventListener('keydown', onKey);
  const cleanup = () => { window.removeEventListener('keydown', onKey); view.dispose(); };

  renderAll();
  requestAnimationFrame(() => view.frame());
  offerTour('atelier');
  return el;
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const norm360 = (a: number) => ((Math.round(a * 10) / 10) % 360 + 360) % 360;
type Align = 'centre' | 'centreX' | 'centreY' | 'dessus' | 'sol' | 'bas' | 'gauche' | 'droite' | 'devant' | 'derriere';
/** Encombrement réel d'un volume (rotation comprise), dans le repère 3D. */
const bbox = (v: Volume) => new THREE.Box3().setFromObject(volumeMesh(v));

/** Vue 3D de l'atelier : plateau quadrillé (25 cm, 1 m marqué), volumes, sélection, glisser au sol. */
class AtelierView {
  readonly el = h('div', { class: 'vp-3d' });
  private renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.02, 100);
  private controls: OrbitControls;
  private group = new THREE.Group();
  private selBox = new THREE.Group();
  private raf = 0;
  private dirty = true;
  private ray = new THREE.Raycaster();
  private ro: ResizeObserver;
  /** Pas d'aimantation pour glisser les volumes (m). */
  step = 0.05;

  constructor(private st: Store<Creation>, private selected: () => string | null, private select: (id: string | null) => void) {
    const r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    this.el.appendChild(r.domElement);
    this.scene.background = new THREE.Color('#EFEEEA');
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xe6dfd3, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(3, 6, 4); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 }); sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    // Plateau
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: '#F7F6F3', roughness: 1 }));
    plate.rotation.x = -Math.PI / 2; plate.position.set(1, -0.001, 1); plate.receiveShadow = true;
    const lines = (step: number, color: string) => {
      const pts: THREE.Vector3[] = [];
      for (let i = -2; i <= 4 + 1e-6; i += step) { pts.push(new THREE.Vector3(i, 0, -2), new THREE.Vector3(i, 0, 4), new THREE.Vector3(-2, 0, i), new THREE.Vector3(4, 0, i)); }
      return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
    };
    const axes = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.002, 0), new THREE.Vector3(1, 0.002, 0), new THREE.Vector3(0, 0.002, 0), new THREE.Vector3(0, 0.002, 1)]),
      new THREE.LineBasicMaterial({ color: '#BF4E36' }));
    this.scene.add(plate, lines(0.25, '#E6E4DF'), lines(1, '#D2CFC8'), axes, this.group, this.selBox);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.el);
    this.bind();
    const loop = () => { this.raf = requestAnimationFrame(loop); if (this.controls.update()) this.dirty = true; if (this.dirty) { this.renderer.render(this.scene, this.camera); this.dirty = false; } };
    this.raf = requestAnimationFrame(loop);
  }
  private resize() {
    const w = this.el.clientWidth, hh = this.el.clientHeight; if (!w || !hh) return;
    this.renderer.setSize(w, hh, false); this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  zoom(f: number) {
    const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f);
    if (off.length() < 0.1 || off.length() > 30) return;
    this.camera.position.copy(this.controls.target).add(off); this.dirty = true;
  }
  frame() {
    this.resize();
    const s = totalSize(this.st.doc.volumes), r = Math.max(s.w, s.d, s.h, 0.3);
    const c = new THREE.Vector3(s.w / 2, s.h / 3, s.d / 2);
    this.controls.target.copy(c);
    this.camera.position.copy(c).add(new THREE.Vector3(0.9, 0.75, 1.3).normalize().multiplyScalar(r * 2.4));
    this.controls.update(); this.dirty = true;
  }
  sync() {
    this.group.clear();
    const g = buildVolumes(this.st.doc.volumes, true);
    if (g.children.length) this.group.add(...g.children);
    this.selBox.clear();
    const v = this.st.doc.volumes.find(x => x.id === this.selected());
    if (v && !v.hidden) {
      const mesh = this.group.children.find(m => m.userData.volume === v.id) as THREE.Mesh | undefined;
      if (mesh) {
        const { bw, bd, bh } = volumeBox(v);
        const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(bw + 0.01, bh + 0.01, bd + 0.01)), new THREE.LineBasicMaterial({ color: '#BF4E36', depthTest: false, transparent: true }));
        box.position.copy(mesh.position); box.rotation.copy(mesh.rotation); box.renderOrder = 10;
        const foot = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), new THREE.MeshBasicMaterial({ color: '#BF4E36', transparent: true, opacity: 0.12, depthWrite: false }));
        foot.rotation.x = -Math.PI / 2; foot.position.set(mesh.position.x, 0.003, mesh.position.z);
        this.selBox.add(box, foot);
      }
    }
    this.dirty = true;
  }
  private bind() {
    const cv = this.renderer.domElement;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }); // molette : déplacer, sans défilement automatique
    let drag: { id: string; plane: THREE.Plane; start: THREE.Vector3; x: number; y: number } | null = null;
    let down: { x: number; y: number } | null = null;
    const rayAt = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      return this.ray;
    };
    this.el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
      const hit = rayAt(e).intersectObjects(this.group.children, true)[0];
      if (!hit) return;
      const id = hit.object.userData.volume as string;
      this.select(id);
      const v = this.st.doc.volumes.find(x => x.id === id)!;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -v.z);
      const p = this.ray.ray.intersectPlane(plane, new THREE.Vector3()); if (!p) return;
      drag = { id, plane, start: p, x: v.x, y: v.y };
      this.controls.enabled = false; this.st.begin(); cv.setPointerCapture(e.pointerId);
    }, { capture: true });
    this.el.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = rayAt(e).ray.intersectPlane(drag.plane, new THREE.Vector3()); if (!p) return;
      const step = e.shiftKey ? 0.01 : this.step, d = drag;
      const nx = Math.round((d.x + p.x - d.start.x) / step) * step, ny = Math.round((d.y + p.z - d.start.z) / step) * step;
      this.st.live(doc => { const v = doc.volumes.find(x => x.id === d.id); if (v) { v.x = r3(nx); v.y = r3(ny); } });
    });
    const up = (e: PointerEvent) => {
      if (drag) { this.st.end(); drag = null; }
      else if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) this.select(null);
      down = null; this.controls.enabled = true;
    };
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
  }
  dispose() {
    cancelAnimationFrame(this.raf); this.ro.disconnect(); this.controls.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
