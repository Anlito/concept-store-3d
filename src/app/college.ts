/* Réglages du collège, communs à tous les outils de la classe (Labo Blocs, distributeur, Théâtre d'ombre…) :
   la liste des classes et le chemin des dossiers de classe. Le professeur les modifie dans l'accueil de
   Labo Blocs (« Réglages du collège »). L'outil lit d'abord sa copie de secours (college.js, à côté de
   index.html), puis la version en ligne si internet répond : simple lecture d'un script, rien n'est envoyé.
     definirCollege({ classes: ['4A', '4B', …], cheminClasse: ['Bureau', 'Classe', '{classe}', 'COMMUN', 'TECHNOLOGIE'] }) */

export interface College { classes: string[]; cheminClasse?: string[] }

export const ADRESSE_COLLEGE = 'https://anlito.github.io/labo-blocs/site/college.js';
/** Concept Store 3D est un projet de 4e et de 3e : seules les classes de ces niveaux sont proposées. */
export const NIVEAUX = ['4', '3'];
/** Dossier du projet dans le dossier de la classe : les élèves le choisissent, l'outil y crée le dossier de l'équipe. */
export const DOSSIER_PROJET = 'CONCEPT STORE';
const CHEMIN_CLASSE_DEFAUT = ['{classe}', 'COMMUN', 'TECHNOLOGIE'];

let college: College | null = null;
const abonnes = new Set<() => void>();

/** Chargement au lancement : la copie de secours, puis la version en ligne (la dernière lue compte). */
export function chargerCollege() {
  (window as unknown as { definirCollege: (c: College) => void }).definirCollege = c => {
    if (!c || !Array.isArray(c.classes)) return;
    college = c;
    abonnes.forEach(f => f());
  };
  const lire = (src: string, ensuite?: () => void) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = s.onerror = () => { s.remove(); ensuite?.(); };
    document.head.appendChild(s);
  };
  lire('./college.js', () => lire(ADRESSE_COLLEGE + '?t=' + Date.now()));
}

/** Prévenu quand les réglages arrivent (renvoie de quoi se désabonner). */
export function surCollege(f: () => void) { abonnes.add(f); return () => { abonnes.delete(f); }; }

const niveauDe = (classe: string) => (classe.match(/\d/) ?? [''])[0];
/** Classes proposées : celles de 4e et de 3e (toutes les classes si les réglages n'en ont aucune). */
export function classesProposees(): string[] {
  const toutes = college?.classes ?? [];
  const duNiveau = toutes.filter(c => NIVEAUX.includes(niveauDe(c)));
  return duNiveau.length ? duNiveau : toutes;
}

/** Chemin du dossier du projet : « Bureau › Classe › 4B › COMMUN › TECHNOLOGIE › CONCEPT STORE ». */
export function cheminProjet(classe: string) {
  const c = classe.trim() ? classe.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '').toUpperCase() : '4X';
  const chemin = college?.cheminClasse?.length ? college.cheminClasse : CHEMIN_CLASSE_DEFAUT;
  return [...chemin, DOSSIER_PROJET].map(p => p.replace('{classe}', c)).join(' › ');
}
