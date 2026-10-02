/* Meubles « volumes simples » propres à l'outil (repris des maquettes, catalogue CAT de CS-IsoScene).
   Ils complètent les packs CC0 pour les besoins d'une boutique : comptoirs, portants, podiums, mannequin…
   Repère : x et y au sol (m), z vers le haut ; b = boîte, c = cylindre, s = sphère. */

export type Part =
  | { t: 'b'; x: number; y: number; z: number; w: number; d: number; h: number; c: string }
  | { t: 'c'; cx: number; cy: number; z: number; r: number; h: number; c: string }
  | { t: 's'; cx: number; cy: number; z: number; r: number; c: string };

const W = '#C9A97E', DK = '#2E2D2B', WH = '#F6F4F0', TC = '#BF4E36', GR = '#6E8B6B';
const b = (x: number, y: number, z: number, w: number, d: number, h: number, c: string): Part => ({ t: 'b', x, y, z, w, d, h, c });
const cy = (cx: number, cy_: number, z: number, r: number, h: number, c: string): Part => ({ t: 'c', cx, cy: cy_, z, r, h, c });
const s = (cx: number, cy_: number, z: number, r: number, c: string): Part => ({ t: 's', cx, cy: cy_, z, r, c });

const portant = (L: number, n: number): Part[] => {
  const cols = ['#E7E1D6', TC, '#3C3B38', '#C9BFAF', '#E9E3D8', '#8A8478'];
  const cl: Part[] = [];
  for (let i = 0; i < n; i++) cl.push(b(0.12 + (i * (L - 0.3)) / n, 0.05, 0.6, 0.17, 0.34, 0.94, cols[i % 6]));
  return [b(0, 0, 0, 0.04, 0.4, 0.03, DK), b(0, 0.18, 0, 0.04, 0.04, 1.6, DK), b(0.04, 0.18, 1.56, L - 0.08, 0.04, 0.04, DK), ...cl,
    b(L - 0.04, 0, 0, 0.04, 0.4, 0.03, DK), b(L - 0.04, 0.18, 0, 0.04, 0.04, 1.6, DK)];
};

export interface VolumeModel { id: string; nom: string; cat: string; parts: Part[]; mural?: boolean; elev?: number; plafond?: boolean }

export const VOLUME_MODELS: VolumeModel[] = [
  { id: 'v-comptoir', nom: 'Comptoir noir', cat: 'comptoirs', parts: [b(0, 0, 0, 1.8, 0.6, 1, DK), b(-0.03, -0.03, 1, 1.86, 0.66, 0.04, W)] },
  { id: 'v-caisse', nom: 'Comptoir caisse', cat: 'comptoirs', parts: [b(0, 0, 0, 1.2, 0.6, 0.95, WH), b(-0.02, -0.02, 0.95, 1.24, 0.64, 0.04, W), b(0.4, 0.12, 0.99, 0.3, 0.03, 0.24, DK), b(0.35, 0.25, 0.99, 0.4, 0.22, 0.03, DK)] },
  { id: 'v-comptoir-arrondi', nom: 'Comptoir arrondi', cat: 'comptoirs', parts: [b(0, 0, 0, 1.6, 0.6, 1, WH), b(-0.03, -0.03, 1, 1.66, 0.66, 0.04, W), cy(1.6, 0.3, 0, 0.3, 1.04, TC)] },
  { id: 'v-portant', nom: 'Portant', cat: 'portants', parts: portant(1.2, 4) },
  { id: 'v-portant-long', nom: 'Portant long', cat: 'portants', parts: portant(1.8, 6) },
  { id: 'v-mannequin', nom: 'Mannequin', cat: 'portants', parts: [cy(0.25, 0.25, 0, 0.2, 0.03, DK), cy(0.25, 0.25, 0.03, 0.015, 0.9, DK), cy(0.25, 0.25, 0.9, 0.16, 0.55, '#E9E3D8'), s(0.25, 0.25, 1.62, 0.11, '#E9E3D8')] },
  { id: 'v-podiums', nom: 'Podiums duo', cat: 'decor', parts: [cy(0.35, 0.35, 0, 0.35, 0.5, WH), cy(0.9, 0.3, 0, 0.25, 0.8, '#E9E3D8')] },
  { id: 'v-cubes', nom: 'Cubes empilés', cat: 'rangements', parts: [b(0, 0, 0, 0.4, 0.4, 0.4, WH), b(0.4, 0, 0, 0.4, 0.4, 0.4, '#E9E3D8'), b(0, 0, 0.4, 0.4, 0.4, 0.4, '#E9E3D8')] },
  { id: 'v-miroir', nom: 'Miroir sur pied', cat: 'decor', parts: [b(0, 0, 0, 0.7, 0.05, 1.7, W), b(0.05, 0.05, 0.05, 0.6, 0.005, 1.6, '#DCE7EC')] },
  { id: 'v-vases', nom: 'Duo de vases', cat: 'decor', parts: [cy(0.15, 0.15, 0, 0.13, 0.32, TC), cy(0.15, 0.15, 0.32, 0.06, 0.1, TC), cy(0.45, 0.25, 0, 0.09, 0.22, '#E9E3D8')] },
  { id: 'v-plante-haute', nom: 'Plante haute', cat: 'plantes', parts: [cy(0.25, 0.25, 0, 0.22, 0.42, TC), s(0.12, 0.3, 0.72, 0.22, '#7F9C7B'), s(0.25, 0.25, 0.98, 0.36, GR)] },
  { id: 'v-suspension', nom: 'Suspension', cat: 'luminaires', plafond: true, parts: [cy(0.2, 0.2, 0, 0.2, 0.3, DK), cy(0.2, 0.2, 0.3, 0.006, 0.7, DK)] },
];
