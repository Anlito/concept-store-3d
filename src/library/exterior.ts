import type { Volume, VolumeType } from '../model/types';

/* Décor extérieur (catégorie « Extérieur ») : de quoi travailler la façade du concept store.
   Construits avec les volumes de l'atelier. Repère : x le long du mur, y vers la rue (face avant), z en haut.
   « outside » : l'objet s'accroche à la face extérieure du mur (dos au mur, face à la rue). */

let n = 0;
const vol = (type: VolumeType, x: number, y: number, z: number, w: number, d: number, h: number, color: string, more: Partial<Volume> = {}): Volume =>
  ({ id: 'ext' + n++, type, name: type, x, y, z, w, d, h, t: 0.02, turned: false, rot: 0, color, ...more });

const TC = '#BF4E36', WH = '#F6F4F0', DK = '#2E2D2B', GR = '#6E8B6B';

/** Store banne rayé : six lés inclinés de 20° et un lambrequin. */
function awning(): Volume[] {
  const out: Volume[] = [];
  for (let i = 0; i < 6; i++) out.push(vol('plan', i * 0.4, 0, 0.4, 0.4, 1, 0, i % 2 ? WH : TC, { t: 0.02, tiltX: 20 }));
  out.push(vol('plan', 0, 0.96, 0.02, 2.4, 0.22, 0, TC, { turned: true, t: 0.012 }));
  out.push(vol('boite', 0, -0.02, 0.48, 2.4, 0.06, 0.08, DK)); // coffre contre le mur
  return out;
}
/** Enseigne drapeau : potence et panneau perpendiculaires au mur. */
function bladeSign(): Volume[] {
  return [
    vol('boite', 0.25, 0, 0.62, 0.1, 0.03, 0.26, DK),
    vol('cylindre', -0.05, 0.335, 0.735, 0.03, 0.03, 0.7, DK, { turned: true, rot: 90 }),
    vol('plan', 0, 0.385, 0.1, 0.6, 0.6, 0, TC, { turned: true, t: 0.03, rot: 90 }),
  ];
}
/** Chevalet stop-trottoir (ardoise). */
function aFrame(): Volume[] {
  return [
    vol('plan', 0, 0.06, 0, 0.6, 0.95, 0, DK, { turned: true, t: 0.025, tiltX: -12 }),
    vol('plan', 0, 0.34, 0, 0.6, 0.95, 0, DK, { turned: true, t: 0.025, tiltX: 12 }),
  ];
}
/** Jardinière plantée. */
function planter(): Volume[] {
  return [
    vol('boite', 0, 0, 0, 1, 0.35, 0.4, '#3A3936'),
    vol('boule', 0.05, 0.02, 0.32, 0.32, 0.32, 0.32, GR), vol('boule', 0.34, 0.01, 0.3, 0.34, 0.34, 0.34, '#7F9C7B'), vol('boule', 0.65, 0.03, 0.32, 0.3, 0.3, 0.3, GR),
  ];
}
/** Lanterne murale. */
function lantern(): Volume[] {
  return [
    vol('boite', 0.06, 0, 0.1, 0.08, 0.03, 0.2, DK),
    vol('boite', 0.03, 0.03, 0.12, 0.14, 0.16, 0.03, DK),
    vol('cylindre', 0.035, 0.05, 0.15, 0.13, 0.13, 0.22, '#F3E6C4'),
    vol('cone', 0.02, 0.04, 0.37, 0.16, 0.02, 0.08, DK),
  ];
}

export interface ExteriorModel { id: string; nom: string; volumes: Volume[]; mural?: boolean; outside?: boolean; elev?: number }
export const EXTERIOR_MODELS: ExteriorModel[] = [
  { id: 'x-store-banne', nom: 'Store banne', volumes: awning(), mural: true, outside: true, elev: 2.3 },
  { id: 'x-enseigne-drapeau', nom: 'Enseigne drapeau', volumes: bladeSign(), mural: true, outside: true, elev: 2.2 },
  { id: 'x-lanterne', nom: 'Lanterne murale', volumes: lantern(), mural: true, outside: true, elev: 1.9 },
  { id: 'x-chevalet', nom: 'Chevalet stop-trottoir', volumes: aFrame() },
  { id: 'x-jardiniere', nom: 'Jardinière', volumes: planter() },
];
