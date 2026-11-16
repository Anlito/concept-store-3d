/* Rangement des fichiers des élèves : UN SEUL dossier par équipe, partagé par Concept Store 3D et Vitrine
   (même code dans les deux outils). Le dossier de l'équipe est reconnu quel que soit l'ordre des prénoms,
   les accents, les majuscules, les séparateurs ou un « et » : « Léa, Malik », « Malik et Léa », « lea-malik »
   désignent le même dossier. Ainsi un outil ne recrée jamais un dossier que l'autre a déjà créé, et ne range
   jamais un dossier d'équipe dans un autre.

   Dossier choisi par l'élève :
   - CONCEPT STORE : on y cherche le dossier de l'équipe ; on ne le crée que s'il n'existe pas ;
   - le dossier de l'équipe lui-même (son nom donne les prénoms de l'équipe, même incomplets) : on enregistre dedans ;
   - un autre dossier qui contient déjà le dossier de l'équipe : on l'utilise ;
   - un autre dossier : on demande à l'élève (voir `travail` : il contient déjà un projet, c'est sans doute un
     dossier d'équipe mal nommé, à ne pas remplir d'un sous-dossier). */

export interface DossierRangement {
  name: string;
  getDirectoryHandle(nom: string, o?: { create?: boolean }): Promise<DossierRangement>;
  values?(): AsyncIterable<{ kind: string; name: string }>;
}

const MOTS_DE_LIAISON = new Set(['et', 'and', 'avec', 'equipe', 'groupe']);
const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Prénoms d'une équipe ou d'un nom de dossier : « Léa, Malik (absent) » → [lea, malik]. */
export const prenomsDe = (s: string) => [...new Set(sansAccents(s.replace(/\([^)]*\)/g, ' ')).split(/[^a-z0-9]+/).filter(w => w && !MOTS_DE_LIAISON.has(w)))];
/** Même équipe : mêmes prénoms, dans n'importe quel ordre. */
export const memeEquipe = (a: string, b: string) => { const x = prenomsDe(a).sort().join('_'); return !!x && x === prenomsDe(b).sort().join('_'); };
/** Le nom de dossier désigne cette équipe : mêmes prénoms, ou une partie seulement (élève absent, prénom oublié). */
function nomDeLEquipe(nomDossier: string, membres: string) {
  const d = prenomsDe(nomDossier), m = new Set(prenomsDe(membres));
  if (!d.length || !m.size) return false;
  return d.every(p => m.has(p)) || [...m].every(p => d.includes(p));
}
const simple = (s: string) => sansAccents(s).replace(/[^a-z0-9]+/g, '');
/** Fichiers de travail d'une équipe : projet 3D, site, plan A3. */
const TRAVAIL = /\.(json|vitrine)$|^plan-a3/i;

async function entrees(d: DossierRangement) {
  const out: { kind: string; name: string }[] = [];
  try { if (d.values) for await (const e of d.values()) out.push({ kind: e.kind, name: e.name }); } catch { /* dossier illisible */ }
  return out;
}

export type ChoixDossier =
  | { dossier: DossierRangement; comment: 'lui-meme' | 'trouve' | 'cree' }
  | { autre: true; travail: boolean };

/**
 * Le dossier où ranger les fichiers de l'équipe, à partir du dossier choisi par l'élève.
 * `nomEquipe` : nom donné au dossier s'il faut le créer (« Lea_Malik ») ; `dossierProjet` : « CONCEPT STORE ».
 */
export async function dossierDeLEquipe(dir: DossierRangement, membres: string, nomEquipe: string, dossierProjet: string): Promise<ChoixDossier> {
  const projet = simple(dir.name) === simple(dossierProjet);
  if (!projet && nomDeLEquipe(dir.name, membres)) return { dossier: dir, comment: 'lui-meme' };
  const es = await entrees(dir);
  // D'abord les mêmes prénoms ; sinon un dossier qui n'en a qu'une partie, s'il est le seul (deux « Léa » dans la classe : on ne devine pas).
  const dossiers = es.filter(e => e.kind === 'directory');
  const partiels = dossiers.filter(e => nomDeLEquipe(e.name, membres));
  const ex = dossiers.find(e => memeEquipe(e.name, membres)) ?? (partiels.length === 1 ? partiels[0] : undefined);
  if (ex) return { dossier: await dir.getDirectoryHandle(ex.name), comment: 'trouve' };
  if (projet) return { dossier: await dir.getDirectoryHandle(nomEquipe, { create: true }), comment: 'cree' };
  return { autre: true, travail: es.some(e => e.kind === 'file' && TRAVAIL.test(e.name)) };
}
