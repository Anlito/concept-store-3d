# Concept Store 3D — outil élève

Application web autonome pour le projet « Concept Store » (technologie, cycle 4).
Cahier des charges : voir le PDF fourni. Maquettes : dossier `maquettes/`.

## Utilisation au collège

Le dossier `dist/` est le livrable : le copier sur le réseau, puis **double-cliquer sur `index.html`**
(Chrome ou Edge). Aucune installation, aucun accès Internet.

- `dist/diagnostic.html` : **test du poste** (navigateur, WebGL, performances, fichiers).
  À lancer d'abord sur un PC du collège, puis transmettre le rapport téléchargé.
- Mode serveur (facultatif) : `node scripts/serve.mjs dist 8080`, ou n'importe quel serveur statique.

## Développement

Node.js portable est installé dans `.tools/` (non versionné).

```
npm install
npm run build     # dist/index.html + dist/diagnostic.html (fichiers uniques)
npm test          # tests Playwright sur les fichiers construits, en file://
npm run dev       # serveur de développement Vite
```

Pile : TypeScript, Three.js, jsPDF, Vite + vite-plugin-singlefile. Pas de framework d'interface.
Icônes : Material Symbols Rounded (Apache 2.0), embarquées par `scripts/build-icons.mjs`.
Police : Nunito (SIL OFL), embarquée.

## Bibliothèque de mobilier (niveau A)

- `library/catalogue.json` : sélection des modèles (nom, catégorie, taille réelle, objets muraux…).
- `library/modeles/*.glb` : modèles retenus (CC0), regroupés en GLB par `scripts/import-packs.mjs`
  à partir des packs téléchargés dans `.tools/packs/`.
- `library/inventaire.json` : source, auteur et licence de chaque modèle (règle : CC0 ou CC-BY uniquement).
- `scripts/build-library.mjs` intègre les modèles dans le HTML (base64), lancé par `npm run build`.

Crédits : Kenney « Furniture Kit » (CC0, kenney.nl) · Kay Lousberg « KayKit Furniture Bits » (CC0, kaylousberg.com).

## Sauvegarde des projets

- Un projet = un fichier `.json` (sol, murs, ouvertures, objets, cartouche).
- Chrome / Edge : « Enregistrer » ouvre le sélecteur de dossier (dossier de l'équipe), puis réécrit ce fichier.
  Autres navigateurs : le projet est téléchargé.
- **Projet modèle** : le professeur prépare une boutique puis « Enregistrer ▾ › Enregistrer comme modèle ».
  Le fichier `modele-….json` porte la marque `isTemplate` : l'outil refuse de l'écraser et un élève
  qui l'ouvre doit toujours enregistrer sous un nouveau nom. Astuce : mettre ce fichier en lecture seule
  sur le réseau.
- Copie de secours automatique dans le navigateur (IndexedDB) ; « Projets récents » sur l'accueil ;
  avertissement si on ferme l'onglet sans enregistrer.

## Dossier « Mobilier » du professeur (niveau C)

Le livrable `dist/` contient un dossier `Mobilier/` (voir `Mobilier/LISEZMOI.txt`) :
- déposer des `.glb` (sous-dossiers = catégories ; `_170cm` à la fin du nom = hauteur réelle) ;
- double-cliquer sur `Mettre-a-jour-le-mobilier.bat` : il génère `mobilier-prof.js`, lu au démarrage
  (un `.js` voisin reste lisible en double-clic, contrairement à un `.json`) ;
- ou, sous Chrome / Edge, « Charger le dossier du professeur » dans la bibliothèque (dossier mémorisé).
Échelle devinée (modèle en cm ou en mm), correction possible sur la carte ; avertissement au-delà
de 5 Mo ou 50 000 triangles, modèle ignoré au-delà de 25 Mo.

## Version 1.0 : finitions

- Aide intégrée (bouton « Aide » de l'accueil et « ? » de l'éditeur) et page « Crédits et licences ».
- Photos du rendu 3D (bouton « Photo ») : PNG ou JPG, HD, grande ou carrée, angles prédéfinis
  (façade, 3/4, intérieur, dessus) ou les 4 angles en `.zip`, sans les poignées de sélection.
- La page de diagnostic transmet la qualité d'ombres conseillée ; la 3D propose de couper les ombres
  si elle devient saccadée.
- `npm run package` : construit et crée `livrables/Concept-Store-3D-<version>.zip` (dossier à copier).
- `dist/LISEZMOI.txt` : installation au collège.
