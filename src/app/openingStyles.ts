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
  return `<svg viewBox="0 0 60 48" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}

/** Couleurs proposées pour les menuiseries. */
export const FRAME_COLORS = [
  { name: 'Noir', hex: '#2E2D2B' }, { name: 'Blanc', hex: '#ECE9E3' }, { name: 'Gris aluminium', hex: '#B8B4AD' }, { name: 'Bleu ardoise', hex: '#5B6B7A' },
  { name: 'Chêne', hex: '#C9A97E' }, { name: 'Noyer', hex: '#8A5A3B' }, { name: 'Terracotta', hex: '#BF4E36' }, { name: 'Sauge', hex: '#6E8B6B' },
  { name: 'Vert sapin', hex: '#3F5E4A' }, { name: 'Jaune ocre', hex: '#D9A54A' },
];
