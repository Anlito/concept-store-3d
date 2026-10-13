import type { LevelData, Project, Vec2 } from './types';
import { edges, lerp, pointInPolygon, projectOnSegment } from './geometry';
import { footprint } from './objects';

/* Étage (un seul, facultatif). Le projet garde au premier plan le niveau affiché (sol, murs, cloisons,
   ouvertures, meubles, images, revêtements) : tous les outils de l'éditeur travaillent sur lui sans changement.
   L'autre niveau attend dans `autreNiveau` ; `niveau` dit lequel est au premier plan (0 = rez-de-chaussée).
   L'étage tient dans le rez-de-chaussée (plus petit possible, jamais plus grand). Les escaliers posés au
   rez-de-chaussée ouvrent le plancher de l'étage au-dessus d'eux (trémie). */

export const LEVEL_KEYS = ['floor', 'walls', 'partitions', 'openings', 'objects', 'images', 'rooms', 'pans'] as const;
export const NIVEAU_LABEL = ['Rez-de-chaussée', 'Étage'] as const;

export const aUnEtage = (p: Project) => !!p.autreNiveau;
export const niveauActif = (p: Project): 0 | 1 => (p.niveau === 1 ? 1 : 0);

function extraire(p: Project): LevelData {
  const l = {} as Record<string, unknown>;
  for (const k of LEVEL_KEYS) l[k] = p[k];
  return l as unknown as LevelData;
}

/** Copie du projet avec l'autre niveau au premier plan (changer de niveau dans l'éditeur). */
export function basculerNiveau(p: Project): Project {
  if (!p.autreNiveau) return p;
  const c = structuredClone(p), avant = extraire(c);
  Object.assign(c, c.autreNiveau);
  c.autreNiveau = avant;
  c.niveau = niveauActif(p) === 1 ? 0 : 1;
  return c;
}
/** Le rez-de-chaussée au premier plan (format des fichiers enregistrés). */
export const versRdc = (p: Project) => (niveauActif(p) === 1 ? basculerNiveau(p) : p);

/** L'autre niveau vu comme un projet (lecture seule : pour l'afficher). */
export function autreProjet(p: Project): Project | null {
  if (!p.autreNiveau) return null;
  return { ...p, ...p.autreNiveau, autreNiveau: undefined, niveau: niveauActif(p) === 1 ? 0 : 1 };
}
export function niveaux(p: Project): { rdc: Project; etage: Project | null } {
  const a = autreProjet(p);
  return niveauActif(p) === 0 ? { rdc: p, etage: a } : { rdc: a!, etage: p };
}

/** Ajoute l'étage (le projet est au rez-de-chaussée) : même contour au départ, sans cloisons ni meubles. */
export function ajouterEtage(p: Project) {
  if (p.autreNiveau || niveauActif(p) !== 0) return;
  p.autreNiveau = {
    floor: p.floor ? structuredClone(p.floor) : null,
    walls: structuredClone(p.walls),
    partitions: [], openings: [], objects: [], images: [], rooms: [], pans: [],
  };
}

/** Décalage vertical (m) de l'autre niveau par rapport au niveau affiché (l'étage repose sur les murs du rez-de-chaussée). */
export function decalageAutre(p: Project): number {
  if (!p.autreNiveau) return 0;
  return niveauActif(p) === 0 ? p.walls.height : -p.autreNiveau.walls.height;
}

/** Un contour d'étage tient dans le rez-de-chaussée (points et milieux des côtés dedans, ou sur le bord). */
export function dansLeRdc(p: Project, pts: Vec2[]): boolean {
  if (niveauActif(p) !== 1 || !p.autreNiveau?.floor) return true;
  const rdc = p.autreNiveau.floor.points;
  const ok = (q: Vec2) => pointInPolygon(q, rdc) || edges(rdc).some(e => projectOnSegment(q, e.a, e.b).d < 0.02);
  return pts.every(ok) && pts.every((q, i) => ok(lerp(q, pts[(i + 1) % pts.length], 0.5)));
}
export const ETAGE_TROP_GRAND = 'L’étage doit tenir dans le rez-de-chaussée (il peut être plus petit, pas plus grand).';

/** Escaliers (meubles « v-escalier-… ») posés au rez-de-chaussée : leur emprise ouvre le plancher de l'étage. */
export const estEscalier = (model: string) => model.startsWith('v-escalier');
export function tremies(p: Project): Vec2[][] {
  const { rdc } = niveaux(p);
  return rdc.objects.filter(o => estEscalier(o.model)).map(o => footprint(o));
}
/** L'étage n'a pas d'escalier pour y monter (rappel aux élèves). */
export const etageSansEscalier = (p: Project) => aUnEtage(p) && tremies(p).length === 0;
