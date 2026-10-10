import type { Ctx } from '../state';

/* Visites guidées : une par partie de l'outil. Chaque étape éclaire une zone de l'écran (sélecteur CSS,
   premier élément visible) ; « prepare » remet l'écran dans l'état voulu avant de la mesurer.
   Mise en forme des textes : **gras**, [[touche]]. */

export type Part = 'accueil' | 'sol' | 'revetement' | 'murs' | 'ouvertures' | 'mobilier' | 'images' | 'vue3d' | 'atelier' | 'plan';

export const PART_LABEL: Record<Part, string> = {
  accueil: 'Accueil', sol: 'Surface', revetement: 'Sol', murs: 'Murs', ouvertures: 'Portes / fenêtres', mobilier: 'Mobilier', images: 'Images',
  vue3d: 'Vue 3D', atelier: 'Atelier de mobilier', plan: 'Plan A3',
};
export const PART_ICON: Record<Part, string> = {
  accueil: 'home', sol: 'grid_on', revetement: 'grid_view', murs: 'border_outer', ouvertures: 'door_front', mobilier: 'chair', images: 'image',
  vue3d: 'view_in_ar', atelier: 'handyman', plan: 'print',
};

/** « optional » : étape sautée si sa zone n'est pas affichée au départ de la visite (ex. aucun projet récent). */
export interface TourStep { at: string; title: string; text: string; prepare?: () => void; optional?: boolean }

export function tourSteps(part: Part, ctx: Ctx): TourStep[] {
  const ui = ctx.ui;
  const v2d = () => ui.set({ view: '2d', libraryOpen: false });
  const v3d = () => ui.set({ view: '3d', libraryOpen: false });
  switch (part) {
    case 'accueil': return [
      { at: '[data-testid=new-project]', title: 'Nouveau projet', text: 'Une boutique vide : tu commences par tracer sa surface.' },
      { at: '[data-testid=open-project]', title: 'Ouvrir un projet', text: 'Pour continuer : choisis le fichier **.json** rangé dans le dossier de ton équipe.' },
      { at: '[data-testid=template]', title: 'Projet modèle', text: 'Une boutique de départ : l’exemple de l’outil ou le modèle préparé par ton professeur.' },
      { at: '[data-testid=recents]', title: 'Projets récents', text: 'Les derniers projets ouverts **sur ce poste**, avec leur copie de secours. Sur un autre PC, utilise « Ouvrir un projet ».', optional: true },
      { at: '[data-tour=help]', title: 'Besoin d’aide ?', text: 'Questions fréquentes et visites guidées, à tout moment.' },
    ];
    case 'sol': return [
      { at: '[data-tour=steps]', title: 'Les étapes du projet', text: 'Ce bouton rappelle quoi faire, dans l’ordre : concept, surface et pièces, plan A3, aménagement, mobilier, décoration, installation.', prepare: v2d },
      { at: '[data-tour=rail]', title: 'Les outils', text: 'Un outil par étape : **Surface**, **Murs**, **Portes / fenêtres**, **Mobilier**, **Images**. Tu peux y revenir quand tu veux.' },
      { at: '.vp', title: 'Le plan 2D', text: 'Ta boutique vue du dessus. **Un clic par coin**, puis clic sur le point de départ (ou [[Entrée]]) pour fermer la surface. Les murs se créent tout seuls. Maximum **10 × 7 m**.' },
      { at: '.pn', title: 'Le panneau de l’outil', text: 'Forme **libre** ou **rectangle**, dimensions exactes au clavier, puis puis les **cloisons** des pièces et la **hauteur des murs**. Les revêtements viennent après, avec **Sol** et **Murs**.' },
      { at: '.fbar', title: 'Grille, aimantation et cotes', text: 'Les coins s’accrochent sur la grille. Le **pas** du tracé est de 1 m : change-le ici si ta boutique a des demi-mètres.' },
      { at: '.hintbar', title: 'Les consignes', text: 'Cette bande rappelle ce que fait la souris avec l’outil choisi.' },
      { at: '[data-tour=view]', title: 'Plan 2D ou Vue 3D', text: 'Passe en **Vue 3D** pour voir ta boutique en volume.' },
      { at: '[data-tour=undo]', title: 'Annuler', text: 'Une erreur ? [[Ctrl+Z]] annule, [[Ctrl+Y]] rétablit.' },
      { at: '[data-tour=save]', title: 'Enregistre souvent', text: '[[Ctrl+S]] : le projet va dans le **dossier de ton équipe**. La flèche ▾ propose « Enregistrer sous ».' },
      { at: '[data-tour=help]', title: 'Besoin d’aide ?', text: 'Les questions fréquentes, et cette visite à relancer quand tu veux.' },
    ];
    case 'revetement': return [
      { at: '[data-tool=revetement]', title: 'L’outil Sol', text: 'Ici, tu choisis le **revêtement du sol** : parquet, béton, carrelage… et sa couleur.', prepare: v2d },
      { at: '.vp', title: 'Pièce par pièce', text: '**Clique dans une pièce** du plan (ou en 3D) : elle a son propre sol. Les pièces sont les espaces fermés par tes **cloisons**.' },
      { at: '.pn', title: 'Le revêtement', text: 'Sans pièce choisie, le revêtement va à **toute la boutique**. Avec une pièce choisie, seulement à elle.' },
    ];
    case 'murs': return [
      { at: '[data-tool=murs]', title: 'L’outil Murs', text: 'Les murs se tracent avec l’outil **Surface**. Ici, tu choisis leur **revêtement** : matière et couleur.' },
      { at: '.vp', title: 'Les murs d’une pièce', text: '**Intérieur** : clique dans une pièce pour décorer **tous ses murs**, ou **sur un mur** pour ce pan seulement. Un mur coupé par une cloison peut avoir un revêtement différent de chaque côté.' },
      { at: '.pn', title: 'Intérieur ou façade', text: '**Façade** : le côté rue, celui qui attire les clients. Clique sur un mur pour décorer seulement sa façade.' },
      { at: '.pn', title: 'Couleur exacte', text: 'Le **+** au bout des pastilles ouvre une palette pour choisir une couleur précise (code ou pipette).' },
      { at: '[data-tour=view]', title: 'Vérifie en 3D', text: 'En **Vue 3D**, le bouton **Façade** montre la boutique depuis la rue.' },
    ];
    case 'ouvertures': return [
      { at: '.pn', title: 'Choisir l’ouverture', text: '**Porte**, **fenêtre** ou **vitrine**, puis son **style**. Pense à la porte d’entrée !' },
      { at: '.vp', title: 'Poser sur un mur', text: '**Clique sur un mur** pour poser l’ouverture, puis **glisse-la** pour la déplacer le long du mur.' },
      { at: '.fbar', title: 'Le pas de 10 cm', text: 'Les ouvertures avancent par pas de 10 cm. Change le pas ici si besoin.' },
      { at: '.pn', title: 'Régler au centimètre', text: 'Clique sur une ouverture posée : largeur, hauteur, allège, position et couleur de la menuiserie.' },
    ];
    case 'mobilier': return [
      { at: '.lib', title: 'La bibliothèque', text: 'Tous les meubles, rangés par catégories. Choisis-en un puis **glisse-le** dans la boutique (ou « Placer dans la boutique »).', prepare: () => ui.set({ libraryOpen: true }) },
      { at: '.lib-tabs', title: 'Trois onglets', text: '**Base** : les meubles de l’outil. **Mes créations** : ceux de l’Atelier. **Ajouts du professeur**.' },
      { at: '[data-tour=lib-create]', title: 'Créer un meuble', text: 'Il manque un meuble ? Fabrique-le dans l’**Atelier** avec des volumes, ou importe un fichier **Tinkercad**.' },
      { at: '.vp', title: 'Déplacer et tourner', text: '**Glisse** un meuble pour le déplacer, [[R]] pour le tourner, **flèches** pour l’ajuster. [[Maj]] + clic : en choisir plusieurs.', prepare: () => ui.set({ libraryOpen: false }) },
      { at: '.pn', title: 'Régler le meuble', text: 'Clique sur un meuble : dimensions, hauteur au-dessus du sol, **angle exact**, couleur, verrouiller, aligner.' },
    ];
    case 'images': return [
      { at: '.pn', title: 'Tes images dans la boutique', text: '**Cadre**, **tapisserie**, **tapis** ou **vitrine** (logo collé sur la vitre). Fichiers **PNG ou JPG**.', prepare: v3d },
      { at: '.pn .pn-f', title: 'Ajouter une image', text: 'Choisis le fichier, où la placer et sur quel mur, puis règle sa taille. Images **faites par toi ou libres de droits**.' },
      { at: '.vp', title: 'Seulement en 3D', text: 'Les images se voient en **Vue 3D** et sur les photos, pas sur le plan A3. Clique sur une image pour la régler.' },
    ];
    case 'vue3d': return [
      { at: '.vp', title: 'Visiter la boutique', text: '**Glisse** pour tourner autour, **clique avec la molette** et glisse pour te déplacer, **tourne la molette** pour zoomer.', prepare: v3d },
      { at: '[data-tour=cut]', title: 'Murs abaissés', text: 'Abaisse les murs placés devant la caméra pour voir l’intérieur.' },
      { at: '[data-tour=facade]', title: 'Façade', text: 'La boutique vue de la rue, comme un client qui passe devant.' },
      { at: '[data-tour=photo]', title: 'Photo', text: 'Des images **PNG ou JPG** du rendu, sous plusieurs angles, pour ta présentation ou le site.' },
      { at: '[data-tour=shadows]', title: 'Ombres', text: 'Si la 3D est lente, baisse la qualité des ombres.' },
      { at: '.vp-zoom', title: 'Zoom et recentrer', text: 'Le bouton du milieu remet toute la boutique dans l’écran.' },
    ];
    case 'atelier': return [
      { at: '.at-left', title: 'Ajouter des volumes', text: 'Boîte, cylindre, arche, cône… Clique sur une forme pour l’ajouter à ton meuble.' },
      { at: '.at-import', title: 'Importer de Tinkercad', text: 'Ton modèle Tinkercad exporté en **OBJ** (ou le .zip téléchargé) devient un meuble.' },
      { at: '.vp', title: 'Assembler', text: '**Glisse** un volume pour le déplacer ([[Maj]] : au centimètre). Glisse le fond pour tourner la vue.' },
      { at: '[data-testid=atelier-panel]', title: 'Régler le volume choisi', text: 'Dimensions, position, rotation et inclinaison, couleur. **Placer par rapport à…** centre ou aligne deux volumes.' },
      { at: '.at-pills', title: 'Nom et rangement', text: 'Donne un nom à ton meuble et choisis sa catégorie dans la bibliothèque.' },
      { at: '[data-testid=atelier-panel] .pn-f', title: 'Ajouter à Mes créations', text: 'Ton meuble rejoint la bibliothèque. Il est enregistré **dans le projet**.' },
    ];
    case 'plan': return [
      { at: '.ex-sheet', title: 'L’aperçu de la feuille', text: 'Le plan A3 : murs, portes, fenêtres et cotes. C’est le **gabarit de ta maquette**.' },
      { at: '[data-tour=ex-scale]', title: 'L’échelle', text: '**1 m = 3 cm** pour la maquette. Si le plan ne tient pas, l’outil te le dit.' },
      { at: '[data-tour=ex-team]', title: 'Le cartouche', text: 'Nom de l’équipe, prénoms et classe, imprimés en bas de la feuille.' },
      { at: '.ex .pn-f', title: 'Enregistrer le plan', text: 'Le cartouche rempli, **Enregistrer le PDF** ouvre l’explorateur : choisis le **dossier de ton équipe**. Ton professeur l’imprimera.' },
    ];
  }
}
