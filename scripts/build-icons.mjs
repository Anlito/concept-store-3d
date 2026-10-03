// Génère src/ui/icons.gen.ts à partir des SVG Material Symbols Rounded (paquet @material-symbols/svg-400).
// Seules les icônes listées ici sont embarquées. Lancer : node scripts/build-icons.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const NAMES = `storefront help add folder_open chevron_right arrow_back check_circle progress_activity grid_on view_in_ar
undo redo print save border_outer door_front chair image mouse zoom_in remove center_focus_strong close rotate_left rotate_right
content_copy delete grid_4x4 join straighten keyboard_arrow_down left_click ads_click polyline rectangle check backspace apps shelves
countertops table_restaurant checkroom potted_plant light interests handyman add_location_alt search bookmark_add upload_file
visibility visibility_off filter_frames wallpaper texture warning download crop_landscape open_with lock lock_open content_paste
computer speed memory info error folder description refresh monitor cancel window edit palette select_all deselect
frame_person height open_in_full drag_pan pan_tool_alt home settings tune pin_drop crop_square circle
web architecture category add_photo_alternate restart_alt align_horizontal_center align_vertical_center align_vertical_bottom filter_center_focus vertical_align_top west east north south library_add ink_eraser vertical_align_bottom group ungroup format_paint light_mode contrast
`.split(/\s+/).filter(Boolean);

const dir = 'node_modules/@material-symbols/svg-400/rounded/';
const pathOf = f => { const s = readFileSync(f, 'utf8'); return [...s.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]).join(' '); };
const out = {};
for (const n of new Set(NAMES)) {
  const f = dir + n + '.svg';
  if (!existsSync(f)) { console.error('Icône introuvable : ' + n); process.exitCode = 1; continue; }
  out[n] = pathOf(f);
  const ff = dir + n + '-fill.svg';
  if (existsSync(ff)) { const p = pathOf(ff); if (p !== out[n]) out[n + ':fill'] = p; }
}
writeFileSync('src/ui/icons.gen.ts',
  '// Fichier généré par scripts/build-icons.mjs — ne pas modifier à la main.\n' +
  '// Material Symbols Rounded (Google), licence Apache 2.0.\n' +
  'export const ICONS: Record<string, string> = ' + JSON.stringify(out, null, 0).replace(/","/g, '",\n  "') + ';\n');
console.log(Object.keys(out).length + ' tracés écrits');
