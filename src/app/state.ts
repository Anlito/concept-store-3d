import type { OpeningType, Vec2 } from '../model/types';
import type { Store } from '../model/store';
import type { FileState } from './files';

export type Tool = 'sol' | 'murs' | 'ouvertures' | 'mobilier' | 'images';
export type View = '2d' | '3d';
export type Selection =
  | null
  | { kind: 'wall'; index: number }
  | { kind: 'opening'; id: string }
  | { kind: 'vertex'; index: number }
  | { kind: 'objects'; ids: string[] };
export type ShadowQuality = 'off' | 'low' | 'high';
export type SaveStatus = 'new' | 'saved' | 'unsaved' | 'saving';

export interface UIState {
  view: View;
  tool: Tool;
  sel: Selection;
  /** Tracé du sol en cours (avant fermeture). */
  draft: Vec2[];
  /** Position aimantée du curseur dans le plan (pour les cotes en direct). */
  cursor: Vec2 | null;
  floorShape: 'libre' | 'rectangle';
  grid: boolean;
  snap: boolean;
  dims: boolean;
  /** Pas de la grille d'aimantation (m). */
  step: number;
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
  try { shadows = (localStorage.getItem('cs3d-shadows') as ShadowQuality) || 'low'; } catch { /* stockage indisponible */ }
  return {
    view: '2d', tool: 'sol', sel: null, draft: [], cursor: null, floorShape: 'libre',
    grid: true, snap: true, dims: true, step: 0.1, placeType: 'porte', shadows, cutaway: true, saveStatus: 'saved', libraryOpen: false, keepRatio: true,
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
}
