/* Modèle de données unique du projet. Toutes les longueurs sont en mètres, les angles en degrés.
   Repère du plan : x vers la droite, y vers le bas (vue de dessus). En 3D : (x, y) du plan → (x, 0, y). */

export interface Vec2 { x: number; y: number }

export type FloorMaterial = 'parquet' | 'beton' | 'carrelage' | 'terrazzo' | 'peinture';
export type WallMaterial = 'peinture' | 'beton' | 'carrelage' | 'brique' | 'bois';
export type OpeningType = 'porte' | 'fenetre' | 'vitrine';

export interface WallStyle { material: WallMaterial; color: string }

/** Ouverture posée sur le mur n° `wall` (le mur i va du sommet i au sommet i+1 du sol). */
export interface Opening {
  id: string;
  wall: number;
  type: OpeningType;
  /** Position du milieu de l'ouverture, mesurée depuis le début du mur, côté intérieur (m). */
  t: number;
  width: number;
  height: number;
  /** Hauteur du bas de l'ouverture (allège), 0 pour une porte (m). */
  sill: number;
}

export interface Floor {
  /** Polygone fermé, sommets dans le sens horaire (aire signée positive, y vers le bas). */
  points: Vec2[];
  material: FloorMaterial;
  color: string;
}

export interface Walls {
  height: number;
  thickness: number;
  /** Un style par mur, dans l'ordre des côtés du sol. */
  styles: WallStyle[];
}

export interface Team { name: string; members: string; klass: string }

export interface Project {
  format: 'concept-store-3d';
  version: 1;
  id: string;
  name: string;
  team: Team;
  floor: Floor | null;
  walls: Walls;
  openings: Opening[];
  objects: PlacedObject[];
  /** Projet modèle fourni par l'enseignant : ne jamais l'écraser. */
  isTemplate?: boolean;
}

/** Objet posé dans la boutique (meuble, plante, décor…). */
export interface PlacedObject {
  id: string;
  /** Identifiant du modèle dans la bibliothèque (base, créations de l'équipe ou ajouts du professeur). */
  model: string;
  /** Centre de l'emprise au sol, dans le plan (m). */
  x: number;
  y: number;
  /** Hauteur du bas de l'objet au-dessus du sol (m). */
  z: number;
  /** Rotation dans le sens horaire vu de dessus (degrés). */
  rot: number;
  /** Dimensions réelles : largeur, profondeur, hauteur (m). */
  size: { w: number; d: number; h: number };
  /** Couleur choisie, ou null pour les couleurs d'origine. */
  color: string | null;
  locked: boolean;
}
