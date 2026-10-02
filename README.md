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
