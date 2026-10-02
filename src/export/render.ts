import { jsPDF } from 'jspdf';
import { SHEET, ZONE, type Layout } from './sheet';

/* Deux rendus de la même feuille : SVG (aperçu à l'écran) et PDF vectoriel (jsPDF, unité mm). */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const MM_TO_PT = 72 / 25.4;

/** Aperçu SVG (viewBox en mm). Si le plan ne tient pas, il est rogné à la zone du plan. */
export function sheetSvg(l: Layout): string {
  const o: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET.w} ${SHEET.h}" width="100%" height="100%" style="display:block" data-testid="sheet">`,
    `<defs><clipPath id="zone"><rect x="${ZONE.x0 - 2}" y="${ZONE.y0 - 4}" width="${ZONE.x1 - ZONE.x0 + 4}" height="${ZONE.y1 - ZONE.y0 + 6}"/></clipPath></defs>`,
    `<rect width="${SHEET.w}" height="${SHEET.h}" fill="#fff"/>`];
  const planParts: string[] = [], rest: string[] = [];
  for (const p of l.prims) {
    const out = p.t !== 'rect' && p.plan ? planParts : rest;
    if (p.t === 'line') out.push(`<line x1="${p.x1.toFixed(2)}" y1="${p.y1.toFixed(2)}" x2="${p.x2.toFixed(2)}" y2="${p.y2.toFixed(2)}" stroke="#111" stroke-width="${p.w}"${p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''}/>`);
    else if (p.t === 'rect') out.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ? '#111' : 'none'}" stroke-width="${p.lw}"/>`);
    else {
      const anchor = p.align === 'center' ? 'middle' : p.align === 'right' ? 'end' : 'start';
      out.push(`<text x="${p.x.toFixed(2)}" y="${p.y.toFixed(2)}" font-size="${p.size}" font-family="Nunito, Helvetica, Arial, sans-serif" font-weight="${p.bold ? 800 : 600}" fill="${p.color ?? '#111'}" text-anchor="${anchor}" dominant-baseline="central"${p.rot ? ` transform="rotate(${p.rot.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})"` : ''}>${esc(p.str)}</text>`);
    }
  }
  o.push(l.fits ? planParts.join('') : `<g clip-path="url(#zone)">${planParts.join('')}</g>`);
  o.push(rest.join(''), '</svg>');
  return o.join('');
}

/** PDF A3 paysage, tracé vectoriel, à imprimer à 100 %. */
export function sheetPdf(l: Layout, title: string): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
  doc.setProperties({ title, subject: 'Plan des murs à l’échelle', creator: 'Concept Store 3D' });
  doc.setLineCap('butt');
  for (const p of l.prims) {
    if (p.t === 'line') {
      doc.setLineWidth(p.w);
      doc.setLineDashPattern(p.dash ? [...p.dash] : [], 0);
      doc.setDrawColor(17, 17, 17);
      doc.line(p.x1, p.y1, p.x2, p.y2);
    } else if (p.t === 'rect') {
      doc.setLineDashPattern([], 0);
      doc.setLineWidth(p.lw);
      doc.setDrawColor(17, 17, 17);
      if (p.fill) doc.setFillColor(p.fill);
      doc.rect(p.x, p.y, p.w, p.h, p.fill && p.stroke ? 'FD' : p.fill ? 'F' : 'S');
    } else {
      doc.setFont('helvetica', p.bold ? 'bold' : 'normal');
      doc.setFontSize(p.size * MM_TO_PT);
      doc.setTextColor(p.color ?? '#111111');
      const w = doc.getTextWidth(p.str);
      const dx = p.align === 'center' ? -w / 2 : p.align === 'right' ? -w : 0;
      const r = ((p.rot ?? 0) * Math.PI) / 180;
      // Centrage manuel (fiable avec la rotation) ; jsPDF compte les angles dans le sens inverse.
      const x = p.x + dx * Math.cos(r), y = p.y + dx * Math.sin(r);
      doc.text(p.str, x, y, { baseline: 'middle', angle: p.rot ? -p.rot : 0 });
    }
  }
  return doc;
}
