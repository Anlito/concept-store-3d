# Concept Store 3D

Outil web pour le projet **« Concept Store »** en technologie (cycle 4) : les élèves dessinent la surface
de leur boutique, ses pièces et ses ouvertures, impriment le plan A3 qui sert de gabarit à la maquette
en carton, puis l'aménagent et la décorent en 3D.

Il fonctionne **sans installation ni Internet** : un double-clic sur `index.html` (Chrome ou Edge),
même depuis un dossier réseau du collège. Aucune donnée n'est envoyée en ligne.

## Ce que font les élèves

1. **Surface** : tracé du contour (10 × 7 m au plus), des **cloisons** qui forment les pièces
   (réserve, toilettes, cabines…), hauteur des murs. Longueurs au clavier, aimantation réglable.
2. **Portes / fenêtres** : portes (sens d'ouverture, passage sans porte), fenêtres, vitrines, plusieurs styles.
3. **Plan A3** : PDF à l'échelle 1 m = 3 cm (murs de 10 cm = carton de 3 mm), cartouche obligatoire,
   enregistrement dans le dossier de l'équipe.
4. **Sol** et **Murs** : revêtements pièce par pièce ou pan de mur par pan de mur, façade côté rue.
5. **Mobilier** : bibliothèque de meubles, **Atelier** pour créer les siens (volumes ou fichier Tinkercad OBJ).
6. **Images** : affiches, tapisseries, tapis, logos sur la vitrine (PNG ou JPG).
7. **Vue 3D** et **photos** du rendu (PNG ou JPG) pour la présentation.

Un bouton **Étape** rappelle la démarche en 7 étapes (du concept validé à l'installation du mobilier).
L'aide intégrée propose des **visites guidées** de chaque partie et des **questions fréquentes**.

## Installer au collège

Télécharger le zip de la dernière version (onglet **Releases**), le dézipper, puis copier le dossier
`Concept-Store-3D` dans le dossier de chaque classe :

- `index.html` : l'outil (un seul fichier, tout est dedans) ;
- `diagnostic.html` : test d'un PC du collège (navigateur, 3D, enregistrement) ;
- `Fiche-eleve.pdf` : fiche A4 à distribuer ;
- `Mobilier/` : modèles 3D ajoutés par le professeur (voir `Mobilier/LISEZMOI.txt`).

Les projets des élèves sont des fichiers `.json`, rangés dans le dossier de leur équipe.

## Développement

Pile : TypeScript, Three.js, jsPDF, fflate, Vite (fichier HTML unique). Pas de framework d'interface.

```
npm install
npm run build     # dist/index.html et dist/diagnostic.html
npm test          # tests Playwright, sur les fichiers construits ouverts en file://
npm run package   # build + fiche élève + livrables/Concept-Store-3D-<version>.zip
npm run dev       # serveur de développement
```

- `src/model/` : données du projet (surface, cloisons, pièces, ouvertures…), sans dépendance à l'affichage.
- `src/view2d/`, `src/view3d/` : plan 2D (SVG) et vue 3D (Three.js).
- `src/app/` : écrans, panneaux, aide (`guide/`).
- `src/export/` : plan A3 en PDF.
- `library/` : modèles 3D de la bibliothèque, leur inventaire et leurs licences.
- `fiche/` : fiche élève (HTML → PDF).

## Licence

Code sous licence **MIT** (voir `LICENSE`). Les éléments tiers gardent leur licence :
modèles 3D CC0 (Kenney, Kay Lousberg ; détail dans `library/inventaire.json`), police Nunito (SIL OFL 1.1),
icônes Material Symbols (Apache 2.0), Three.js, jsPDF et fflate (MIT).
