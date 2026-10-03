import { zipSync } from 'fflate';
import type { Ctx } from './state';
import type { PhotoView, View3D } from '../view3d/view3d';
import { h, icon } from '../ui/dom';
import { button, segmented, toast } from '../ui/components';

/* « Prendre une photo » : images PNG ou JPG du rendu 3D, pour un diaporama ou le site de la boutique. */

const VIEWS: { value: PhotoView | 'quatre'; label: string; icon: string }[] = [
  { value: 'actuelle', label: 'Vue actuelle', icon: 'photo_camera' },
  { value: 'facade', label: 'Façade', icon: 'storefront' },
  { value: 'gauche', label: '3/4 gauche', icon: 'view_in_ar' },
  { value: 'droite', label: '3/4 droite', icon: 'view_in_ar' },
  { value: 'interieur', label: 'Intérieur', icon: 'chair' },
  { value: 'dessus', label: 'Vue de dessus', icon: 'grid_on' },
  { value: 'quatre', label: 'Les 4 angles (.zip)', icon: 'apps' },
];
const SIZES = [
  { v: 'hd', label: 'HD · 1920 × 1080', w: 1920, h: 1080 },
  { v: 'grande', label: 'Grande · 2560 × 1440', w: 2560, h: 1440 },
  { v: 'carree', label: 'Carrée · 1080 × 1080 (réseaux)', w: 1080, h: 1080 },
  { v: 'ecran', label: 'Taille de l’écran', w: 0, h: 0 },
];
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'boutique';
const b64ToBytes = (url: string) => { const s = atob(url.slice(url.indexOf(',') + 1)), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
function download(name: string, href: string) {
  const a = h('a', { href, download: name }); document.body.appendChild(a); a.click(); a.remove();
}

export function openPhotoDialog(ctx: Ctx, view: View3D) {
  if (!ctx.store.doc.floor) { toast('Trace d’abord le sol de la boutique.', undefined, 'warning'); return; }
  let angle: PhotoView | 'quatre' = 'actuelle', format: 'png' | 'jpg' = 'png', size = 'hd', best = true, bg = '#EFEEEA';
  const img = h('img', { alt: 'Aperçu de la photo', class: 'ph-img' });
  const angleTiles = h('div', { class: 'ph-angles' });
  const sizeSel = h('select', { class: 'at-select', 'aria-label': 'Taille de l’image', onchange: (e: Event) => { size = (e.target as HTMLSelectElement).value; } },
    ...SIZES.map(s => h('option', { value: s.v }, s.label)));
  const fmt = segmented<'png' | 'jpg'>([{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }], () => format, v => { format = v; fmt.refresh(); });
  const bgSeg = segmented<string>([{ value: '#EFEEEA', label: 'Fond gris' }, { value: '#FFFFFF', label: 'Fond blanc' }], () => bg, v => { bg = v; bgSeg.refresh(); preview(); });
  const bestIn = h('input', { type: 'checkbox', checked: true, onchange: (e: Event) => { best = (e.target as HTMLInputElement).checked; preview(); } });

  const close = () => { veil.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const veil = h('div', { class: 'modal-veil' },
    h('div', { class: 'imd ph', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Prendre une photo', 'data-testid': 'photo-dialog' },
      h('div', { class: 'imd-h' }, h('h2', null, 'Prendre une photo'), h('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: 'Fermer', onclick: close }, icon('close'))),
      h('div', { class: 'imd-b ph-b' },
        h('div', { class: 'imd-col' },
          h('div', { class: 'p-sec-t' }, 'Angle de vue'), angleTiles,
          h('div', { class: 'p-sec-t' }, 'Image'), fmt.el, h('label', { class: 'tf' }, 'Taille', sizeSel), bgSeg.el,
          h('label', { class: 'chk' }, bestIn, 'Qualité maximale (ombres soignées)'),
          h('p', { class: 'p-help' }, 'PNG : meilleure qualité, pour une présentation. JPG : fichier plus léger, pour un site internet.')),
        h('div', { class: 'imd-col imd-pv' }, h('div', { class: 'p-sec-t' }, 'Aperçu'), h('div', { class: 'ph-pv' }, img),
          h('p', { class: 'p-help' }, 'Astuce : pour « Vue actuelle », tourne et zoome d’abord la vue 3D comme tu veux, puis reviens ici.'))),
      h('div', { class: 'imd-f' }, button('Annuler', null, 'btn-ghost', close), button('Enregistrer la photo', 'download', 'btn-primary btn-lg', () => shoot()))));
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(veil);

  function renderAngles() {
    angleTiles.replaceChildren(...VIEWS.map(v => h('button', { type: 'button', class: 'ph-angle' + (v.value === angle ? ' on' : ''), onclick: () => { angle = v.value; renderAngles(); preview(); } },
      icon(v.icon), v.label)));
  }
  function preview() {
    const v = angle === 'quatre' ? 'gauche' : angle;
    img.src = view.capture({ w: 640, h: 360, mime: 'image/jpeg', view: v, best, background: bg });
  }
  function shoot() {
    const s = SIZES.find(x => x.v === size)!;
    const w = s.w || view.el.clientWidth, hh = s.h || view.el.clientHeight;
    const mime = format === 'png' ? 'image/png' : 'image/jpeg', ext = format;
    const base = slug(ctx.store.doc.name);
    if (angle === 'quatre') {
      const files: Record<string, Uint8Array> = {};
      for (const v of ['gauche', 'droite', 'facade', 'interieur'] as PhotoView[]) files[`${base}-${v}.${ext}`] = b64ToBytes(view.capture({ w, h: hh, mime, view: v, best, background: bg }));
      const url = URL.createObjectURL(new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' }));
      download(`${base}-photos.zip`, url); setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('4 photos enregistrées dans un fichier .zip (dossier Téléchargements).');
    } else {
      download(`${base}-${angle}.${ext}`, view.capture({ w, h: hh, mime, view: angle, best, background: bg }));
      toast(`Photo enregistrée : ${base}-${angle}.${ext} (dossier Téléchargements).`);
    }
    close();
  }
  renderAngles();
  preview();
}
