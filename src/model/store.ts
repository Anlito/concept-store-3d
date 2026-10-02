import type { Project } from './types';

/* Le store tient le projet et son historique (annuler / rétablir).
   - update(fn) : une modification = une entrée d'historique.
   - begin() / live(fn) / end() : un geste (glisser un sommet…) = une seule entrée, même si le document
     change à chaque mouvement de souris. */

type Listener = (reason: ChangeReason) => void;
export type ChangeReason = 'doc' | 'history' | 'load';

const MAX_HISTORY = 100;
const clone = <T>(x: T): T => structuredClone(x);

export class Store {
  doc: Project;
  private past: Project[] = [];
  private future: Project[] = [];
  private gesture: Project | null = null;
  private listeners = new Set<Listener>();
  /** Nombre de modifications depuis le dernier enregistrement. */
  dirty = 0;

  constructor(doc: Project) { this.doc = doc; }

  subscribe(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(r: ChangeReason) { this.listeners.forEach(f => f(r)); }

  update(fn: (d: Project) => void | boolean) {
    const before = clone(this.doc);
    if (fn(this.doc) === false) { this.doc = before; return false; }
    if (JSON.stringify(before) === JSON.stringify(this.doc)) return false;
    this.push(before);
    this.emit('doc');
    return true;
  }

  begin() { if (!this.gesture) this.gesture = clone(this.doc); }
  live(fn: (d: Project) => void) { fn(this.doc); this.emit('doc'); }
  end() {
    const g = this.gesture; this.gesture = null;
    if (g && JSON.stringify(g) !== JSON.stringify(this.doc)) this.push(g);
  }
  /** Annule le geste en cours (Échap pendant un glisser). */
  cancel() { if (this.gesture) { this.doc = this.gesture; this.gesture = null; this.emit('doc'); } }

  private push(before: Project) {
    this.past.push(before);
    if (this.past.length > MAX_HISTORY) this.past.shift();
    this.future = [];
    this.dirty++;
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  undo() {
    const prev = this.past.pop(); if (!prev) return;
    this.future.push(this.doc); this.doc = prev; this.dirty++; this.emit('history');
  }
  redo() {
    const next = this.future.pop(); if (!next) return;
    this.past.push(this.doc); this.doc = next; this.dirty++; this.emit('history');
  }

  load(doc: Project) {
    this.doc = doc; this.past = []; this.future = []; this.gesture = null; this.dirty = 0; this.emit('load');
  }
}
