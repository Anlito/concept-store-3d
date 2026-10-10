import type { OpeningType } from '../model/types';

/* Petits dessins (SVG) des styles de portes, fenêtres et vitrines, pour les vignettes du panneau. */

const GLASS = '#CFE0E8';
export function styleThumb(type: OpeningType, style: string, color: string): string {
  const parts: string[] = [];
  const r = (x: number, y: number, w: number, h: number, fill: string, stroke = 'none', sw = 0) =>
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
  const l = (x1: number, y1: number, x2: number, y2: number, sw = 2) => parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}"/>`);
  // Mur de fond
  r(0, 0, 60, 48, '#F4F2EE');
  if (type === 'porte') {
    const x = 18, y = 6, w = 24, h = 42;
    if (style === 'passage') { r(x, y, w, h, '#E3DCD0'); r(x, y + h - 3, w, 3, '#CFC6B8'); return wrapSvg(parts); } // ouverture nue
    r(x - 2, y - 2, w + 4, h + 2, style === 'pleine' ? '#2E2D2B' : color);
    if (style === 'pleine') { r(x, y, w, h, color); parts.push(`<circle cx="${x + w - 5}" cy="30" r="1.6" fill="#2E2D2B"/>`); }
    else if (style === 'double') { r(x + 2, y + 2, w / 2 - 3, h - 4, GLASS); r(x + w / 2 + 1, y + 2, w / 2 - 3, h - 4, GLASS); }
    else if (style === 'coulissante') { r(x + 1, y + 2, w * 0.6, h - 2, GLASS, color, 1.5); r(x + w * 0.4, y + 2, w * 0.6 - 1, h - 2, GLASS, color, 1.5); }
    else {
      r(x + 3, y + 3, w - 6, h - 10, GLASS); r(x + 3, y + h - 7, w - 6, 7, color);
      if (style === 'atelier') { l(x + w / 2, y + 3, x + w / 2, y + h - 7, 1.5); for (let k = 1; k < 4; k++) l(x + 3, y + 3 + ((h - 10) * k) / 4, x + w - 3, y + 3 + ((h - 10) * k) / 4, 1.5); }
    }
  } else {
    const wide = type === 'vitrine', x = wide ? 5 : 12, w = wide ? 50 : 36, y = wide ? 5 : 10, h = wide ? 38 : 26;
    if (style === 'sans-cadre') { r(x, y, w, h, GLASS); l(x, y, x + w, y, 2); l(x, y + h, x + w, y + h, 2); l(x + w / 2, y, x + w / 2, y + h, 0.6); }
    else {
      const fw = style === 'fixe' ? 2 : 3;
      r(x, y, w, h, color); r(x + fw, y + fw, w - 2 * fw, h - 2 * fw, GLASS);
      if (style === 'atelier') { for (let k = 1; k < 4; k++) l(x + (w * k) / 4, y, x + (w * k) / 4, y + h, 1.5); for (let k = 1; k < 3; k++) l(x, y + (h * k) / 3, x + w, y + (h * k) / 3, 1.5); }
      else if (style === 'classique' || style === 'moderne') l(x + w / 2, y, x + w / 2, y + h, 2.5);
      else if (style === 'bois') { l(x + w / 3, y, x + w / 3, y + h, 3); l(x + (2 * w) / 3, y, x + (2 * w) / 3, y + h, 3); l(x, y + h * 0.25, x + w, y + h * 0.25, 3); r(x - 3, y - 4, w + 6, 3, color); }
    }
  }
  return wrapSvg(parts);
}

/** Vue de dessus d'un sens d'ouverture : rue (ou côté 2) en haut, intérieur (ou côté 1) en bas. */
export function swingThumb(out: boolean, flip: boolean, double: boolean): string {
  const p: string[] = [];
  p.push('<rect x="0" y="0" width="60" height="24" fill="#FFFFFF"/><rect x="0" y="24" width="60" height="24" fill="#EFE9DF"/>');
  p.push('<rect x="0" y="21" width="18" height="6" fill="#3A3936"/><rect x="42" y="21" width="18" height="6" fill="#3A3936"/>');
  const y0 = out ? 21 : 27, dy = out ? -1 : 1;
  const leaf = (hx: number, ox: number, r: number) => {
    const ex = hx, ey = y0 + dy * r, sweep = (ox > hx) === out ? 1 : 0;
    p.push(`<line x1="${hx}" y1="${y0}" x2="${ex}" y2="${ey}" stroke="#BF4E36" stroke-width="2.5" stroke-linecap="round"/>`);
    p.push(`<path d="M${ex} ${ey} A${r} ${r} 0 0 ${sweep} ${ox} ${y0}" fill="none" stroke="#BF4E36" stroke-width="1.2" stroke-dasharray="2.5 2"/>`);
  };
  if (double) { leaf(18, 30, 12); leaf(42, 30, 12); }
  else if (flip) leaf(42, 18, 20); else leaf(18, 42, 20);
  return wrapSvg(p);
}

/** Couleurs proposées pour les menuiseries. */
export const FRAME_COLORS = [
  { name: 'Noir', hex: '#2E2D2B' }, { name: 'Blanc', hex: '#ECE9E3' }, { name: 'Gris aluminium', hex: '#B8B4AD' }, { name: 'Bleu ardoise', hex: '#5B6B7A' },
  { name: 'Chêne', hex: '#C9A97E' }, { name: 'Noyer', hex: '#8A5A3B' }, { name: 'Terracotta', hex: '#BF4E36' }, { name: 'Sauge', hex: '#6E8B6B' },
  { name: 'Vert sapin', hex: '#3F5E4A' }, { name: 'Jaune ocre', hex: '#D9A54A' },
];

const wrapSvg = (parts: string[]) => `<svg viewBox="0 0 60 48" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
