/* Modèle de données unique du projet. Toutes les longueurs sont en mètres, les angles en degrés.
   Repère du plan : x vers la droite, y vers le bas (vue de dessus). En 3D : (x, y) du plan → (x, 0, y). */

export interface Vec2 { x: number; y: number }

export type FloorMaterial = 'parquet' | 'beton' | 'carrelage' | 'terrazzo' | 'peinture';
export type WallMaterial = 'peinture' | 'beton' | 'carrelage' | 'brique' | 'bois' | 'bardage' | 'pierre';
export type OpeningType = 'porte' | 'fenetre' | 'vitrine';

/** Revêtement d'un mur : face intérieure (material, color) et face extérieure, la façade (outMaterial, outColor). */
export interface WallStyle { material: WallMaterial; color: string; outMaterial?: WallMaterial; outColor?: string }

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
  /** Style de menuiserie (voir OPENING_STYLES) ; absent = style par défaut du type. */
  style?: string;
  /** Couleur de la menuiserie (cadre, ou vantail d'une porte pleine) ; absente = couleur du style. */
  color?: string;
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
  /** Meubles créés par l'équipe (atelier), enregistrés avec le projet. */
  creations: Creation[];
  /** Images importées et images posées. */
  assets: ImageAsset[];
  images: PlacedImage[];
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

/* ---------- Atelier de création (niveau B) ---------- */
export type VolumeType = 'boite' | 'cylindre' | 'plan' | 'arche' | 'boule' | 'cone' | 'tube' | 'demirond' | 'prisme' | 'modele';

/** Volume simple d'une création. Longueurs en mètres, repère du meuble : x et y au sol, z vers le haut. */
export interface Volume {
  id: string;
  type: VolumeType;
  name: string;
  /** Coin du volume (avant rotation), depuis le coin du meuble. */
  x: number; y: number; z: number;
  /** Boîte, arche, prisme : longueur, profondeur, hauteur. Cylindre, tube, demi-rond : w = diamètre, h = hauteur.
      Boule : w = diamètre. Cône : w = diamètre du bas, d = diamètre du haut (0 = pointe), h = hauteur.
      Plan : w = longueur, d = largeur (h inutilisé). */
  w: number; d: number; h: number;
  /** Épaisseur du plan, de l'arche ou du tube. */
  t: number;
  /** Cylindre, tube ou demi-rond couché ; plan debout ; prisme en coin (triangle rectangle). */
  turned: boolean;
  /** Rotation autour de la verticale, vue de dessus (degrés, sens horaire). */
  rot: number;
  /** Inclinaison vers l'avant (degrés ; négatif = vers l'arrière). */
  tiltX?: number;
  /** Inclinaison vers la droite (degrés ; négatif = vers la gauche). */
  tiltY?: number;
  color: string;
  /** Masqué dans l'atelier seulement (pour travailler sur les volumes cachés). */
  hidden?: boolean;
  /** Modèle importé (Tinkercad) : w, d, h = taille voulue ; color vide = couleurs d'origine. */
  mesh?: ImportedMesh;
}

/** Maillage importé d'un fichier OBJ, en mètres, dans les axes 3D (x largeur, y hauteur, z profondeur).
    Les positions sont quantifiées sur 16 bits et encodées en base64 pour garder le fichier projet léger. */
export interface ImportedMesh {
  id: string;
  /** Nom du fichier d'origine. */
  source: string;
  /** Taille d'origine (m) après conversion des millimètres : [largeur, hauteur, profondeur]. */
  size: [number, number, number];
  triangles: number;
  parts: { color: string; pos: string }[];
}

/** Meuble créé par l'équipe dans l'atelier (« Mes créations »). */
export interface Creation {
  id: string;
  name: string;
  cat: string;
  team: string;
  volumes: Volume[];
  updated: number;
}

/* ---------- Images importées (PNG / JPG) ---------- */
export type ImageTarget = 'cadre' | 'tapisserie' | 'tapis' | 'vitrine';

/** Image importée par l'élève, réduite à 2048 px au plus, gardée dans le projet. */
export interface ImageAsset {
  id: string;
  name: string;
  /** data URL (PNG si l'image a de la transparence, JPEG sinon). */
  data: string;
  w: number;
  h: number;
}

/** Image posée dans la boutique (visible en 3D seulement, jamais sur le plan A3). */
export interface PlacedImage {
  id: string;
  asset: string;
  target: ImageTarget;
  /** Mur porteur (cadre, tapisserie, vitrine). */
  wall: number;
  /** Position du centre : 0 à 1 le long du mur (ou du sol en largeur), 0 à 1 en hauteur (ou en profondeur). */
  x: number;
  y: number;
  /** Largeur de l'image, ou d'un motif quand elle est répétée (m). */
  size: number;
  /** Rotation dans son plan (degrés). */
  rot: number;
  /** Répéter le motif sur tout le mur ou tout le sol. */
  repeat: boolean;
  /** Face du mur : intérieur (par défaut) ou façade, côté rue (enseigne, vitrophanie vue de dehors…). */
  side?: 'int' | 'ext';
}
