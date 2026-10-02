import { ICONS } from './icons.gen';

type Attrs = Record<string, unknown> & { style?: Partial<CSSStyleDeclaration> | string; class?: string };
type Child = Node | string | number | null | undefined | false | Child[];

/** Petit utilitaire de création d'éléments : h('div', { class: 'x', onclick: f }, enfants…) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v); else Object.assign(el.style, v);
      } else if (k === 'class') el.className = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVGNS = 'http://www.w3.org/2000/svg';
/** Icône Material Symbols Rounded embarquée (variante pleine si fill=true et si elle existe). */
export function icon(name: string, fill = false, size?: number): SVGSVGElement {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 -960 960 960');
  s.setAttribute('class', 'ic');
  s.setAttribute('aria-hidden', 'true');
  if (size) s.style.fontSize = size + 'px';
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', (fill && ICONS[name + ':fill']) || ICONS[name] || '');
  s.appendChild(p);
  return s;
}

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | undefined> = {}, ...children: (SVGElement | null | undefined | false)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.appendChild(c);
  return el;
}

/** Nombre à la française : 4,50 */
export const fr = (v: number, digits = 2) => v.toFixed(digits).replace('.', ',');
