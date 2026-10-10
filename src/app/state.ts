import type { OpeningType, Vec2 } from '../model/types';
import type { Store } from '../model/store';
import type { FileState } from './files';

/** Outils : 'sol' = Surface (tracé), 'revetement' = Sol (revêtements). */
export type Tool = 'sol' | 'revetement' | 'murs' | 'ouvertures' | 'mobilier' | 'images';
export type View = '2d' | '3d';
export type Selection =
  | null
  | { kind: 'wall'; index: number }
  | { kind: 'opening'; id: string }
  | { kind: 'vertex'; index: number }
  | { kind: 'objects'; ids: string[] }
  | { kind: 'image'; id: string }
  /** Pièce (zone fermée par le contour et les cloisons), par son rang dans rooms(). */
  | { kind: 'room'; index: number }
  /** Pan de mur : face d'un mur ou côté d'une cloison ('int' = côté 1), autour de la position u. */
  | { kind: 'pan'; wall: number; side: 'int' | 'ext'; u: number };
export type ShadowQuality = 'off' | 'low' | 'high';
export type SaveStatus = 'new' | 'saved' | 'unsaved' | 'saving';

export interface UIState {
  view: View;
  tool: Tool;
  sel: Selection;
  /** Tracé en cours : sol (avant fermeture) ou cloison (son point de départ). */
  draft: Vec2[];
  /** Position aimantée du curseur dans le plan (pour les cotes en direct). */
  cursor: Vec2 | null;
  floorShape: 'libre' | 'rectangle';
  grid: boolean;
  snap: boolean;
  dims: boolean;
  /** Pas d'aimantation en cours (m) : celui du sol avec l'outil Sol, l'autre pour tout le reste. */
  step: number;
  /** Pas mémorisés : tracé du sol (1 m par défaut) et placement des éléments (10 cm par défaut). */
  stepSol: number;
  stepOther: number;
  /** Type d'ouverture posé par un clic sur un mur. */
  placeType: OpeningType;
  shadows: ShadowQuality;
  /** Abaisse automatiquement les murs entre la caméra et la boutique. */
  cutaway: boolean;
  saveStatus: SaveStatus;
  /** Tiroir de la bibliothèque de mobilier ouvert. */
  libraryOpen: boolean;
  /** Redimensionnement proportionnel des objets. */
  keepRatio: boolean;
  /** Onglet affiché à l'ouverture de la bibliothèque. */
  libraryTab: 'base' | 'moi' | 'prof';
  /** Face des murs en cours de décoration : intérieur ou façade. */
  wallFace: 'int' | 'ext';
  /** Tracé de cloisons en cours (outil Murs, plan 2D). */
  partDraw: boolean;
  /** Style choisi pour les prochaines ouvertures posées, par type. */
  placeStyles: Partial<Record<OpeningType, string>>;
}

type UIListener = (changed: (keyof UIState)[]) => void;

export class UIStore {
  s: UIState;
  private listeners = new Set<UIListener>();
  constructor(init: UIState) { this.s = init; }
  subscribe(fn: UIListener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  set(patch: Partial<UIState>) {
    const changed = (Object.keys(patch) as (keyof UIState)[]).filter(k => this.s[k] !== patch[k]);
    if (!changed.length) return;
    Object.assign(this.s, patch);
    this.listeners.forEach(f => f(changed));
  }
}

export function defaultUI(): UIState {
  let shadows: ShadowQuality = 'low';
  // Choix de l'élève, sinon recommandation de la page de test du poste, sinon ombres légères.
  try { shadows = (localStorage.getItem('cs3d-shadows') ?? localStorage.getItem('cs3d-shadows-reco') ?? 'low') as ShadowQuality; } catch { /* stockage indisponible */ }
  return {
    view: '2d', tool: 'sol', sel: null, draft: [], cursor: null, floorShape: 'libre',
    grid: true, snap: true, dims: true, step: 1, stepSol: 1, stepOther: 0.1, placeType: 'porte', shadows, cutaway: true, saveStatus: 'saved', libraryOpen: false, keepRatio: true, libraryTab: 'base', wallFace: 'int', partDraw: false, placeStyles: {},
  };
}

/** Contexte partagé par les vues et les panneaux. */
export interface Ctx {
  store: Store;
  ui: UIStore;
  /** Va à l'accueil. */
  home(): void;
  /** Ouvre l'écran « Plan A3 à imprimer ». */
  exportPlan(): void;
  /** Fichier du projet en cours (pour « Enregistrer »). */
  file: FileState;
  /** Ouvre l'atelier de création (nouveau meuble, ou création existante à modifier). */
  openAtelier(creationId?: string): void;
  /** Montre une image posée : vue 3D, caméra face à elle. */
  showImage(id: string): void;
}

/** Pas d'aimantation proposés (m). */
export const STEPS = [{ v: 0.01, label: '1 cm' }, { v: 0.05, label: '5 cm' }, { v: 0.1, label: '10 cm' }, { v: 0.5, label: '50 cm' }, { v: 1, label: '1 m' }];

/** Garde un pas séparé pour le sol et pour le reste : le pas suit l'outil, et un changement est mémorisé. */
export function bindSnapSteps(ui: UIStore) {
  ui.subscribe(ch => {
    const s = ui.s;
    if (ch.includes('tool')) {
      const want = s.tool === 'sol' ? s.stepSol : s.stepOther;
      if (want !== s.step) ui.set({ step: want });
    } else if (ch.includes('step')) {
      if (s.tool === 'sol' && s.stepSol !== s.step) ui.set({ stepSol: s.step });
      if (s.tool !== 'sol' && s.stepOther !== s.step) ui.set({ stepOther: s.step });
    }
  });
}
