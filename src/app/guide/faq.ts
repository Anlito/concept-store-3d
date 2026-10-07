import type { Part } from './tours';

/* Questions fréquentes, par partie. Mise en forme : **gras**, [[touche]]. */

export type FaqGroup = Part | 'general';
export interface Faq { q: string; a: string }

export const FAQ: Record<FaqGroup, Faq[]> = {
  general: [
    { q: 'Où est enregistré mon projet ?', a: 'Avec [[Ctrl+S]] (ou **Enregistrer**), dans un fichier **.json** que tu ranges dans le dossier de ton équipe. Une copie de secours reste aussi sur ce poste, mais seul le fichier est en sécurité.' },
    { q: 'J’ai fermé sans enregistrer : tout est perdu ?', a: 'Non. Rouvre l’outil **sur le même poste** : ton projet est dans **Projets récents**, sur l’accueil. Enregistre-le tout de suite.' },
    { q: 'Comment continuer mon projet sur un autre PC ?', a: 'Accueil › **Ouvrir un projet**, puis choisis le fichier .json de ton équipe. Les meubles de l’Atelier et les images sont dans le fichier.' },
    { q: 'Comment annuler une erreur ?', a: '[[Ctrl+Z]] ou le bouton **Annuler** en haut. [[Ctrl+Y]] pour rétablir.' },
    { q: 'Comment renommer mon projet ?', a: 'Clique sur son nom, en haut à gauche, et tape le nouveau nom.' },
    { q: 'Comment changer le pas de l’aimantation ?', a: 'Menu **Pas**, dans la barre au-dessus de la vue : 1 m par défaut pour le sol, 10 cm pour le reste. Tu peux aussi couper l’aimantation.' },
    { q: 'Je ne trouve pas la couleur que je veux.', a: 'Clique sur le **+** au bout des pastilles : palette, pipette ou code exact (#RRGGBB). Tes couleurs restent ensuite dans la liste.' },
    { q: 'La 3D est lente, que faire ?', a: 'En Vue 3D, choisis **Sans ombres** ou **Ombres légères**. Ferme les autres onglets. Un modèle Tinkercad très détaillé peut aussi ralentir.' },
    { q: 'L’outil a-t-il besoin d’Internet ?', a: 'Non. Tout fonctionne sur le poste et **aucune donnée n’est envoyée** sur Internet.' },
    { q: 'Quels sont les raccourcis clavier ?', a: '[[Ctrl+S]] enregistrer · [[Ctrl+Z]] / [[Ctrl+Y]] annuler / rétablir · [[Suppr]] supprimer · [[Échap]] désélectionner · [[Ctrl+C]] / [[Ctrl+V]] copier / coller · [[Ctrl+D]] dupliquer · [[R]] tourner de 15° · **flèches** déplacer · **molette** zoomer.' },
  ],
  accueil: [
    { q: 'Nouveau projet ou projet modèle ?', a: '**Nouveau projet** : une boutique vide. **Projet modèle** : une boutique de départ (l’exemple de l’outil ou le modèle de ton professeur), que tu enregistres ensuite sous un nouveau nom.' },
    { q: 'Mon projet n’est pas dans Projets récents.', a: 'Cette liste est propre à **ce poste**. Utilise **Ouvrir un projet** et choisis ton fichier dans le dossier de ton équipe.' },
    { q: 'La croix d’un projet récent efface-t-elle mon fichier ?', a: 'Non, elle le retire seulement de la liste. Le fichier .json reste dans ton dossier.' },
  ],
  sol: [
    { q: 'Comment tracer le sol ?', a: 'Outil **Sol**, en **Plan 2D** : un clic par coin, puis clic sur le point de départ, double-clic ou [[Entrée]] pour fermer. Les murs se créent tout seuls.' },
    { q: 'Comment faire un rectangle aux bonnes dimensions ?', a: 'Dans le panneau, choisis **Rectangle**, tape la largeur et la profondeur, puis **Créer ce rectangle**.' },
    { q: 'Comment taper une longueur exacte ?', a: 'Pendant le tracé, tape un nombre au clavier : il va dans **Longueur du côté suivant**. Valide avec [[Entrée]].' },
    { q: 'Pourquoi pas plus de 10 × 7 m ?', a: 'C’est la taille maximale du projet : à l’échelle **1 m = 3 cm**, le plan tient sur une feuille A3.' },
    { q: 'Comment modifier la forme du sol ?', a: '**Glisse un point** pour le déplacer, clique sur un **+** pour en ajouter un, [[Suppr]] retire le point choisi.' },
    { q: 'Comment recommencer le sol ?', a: 'Bouton **Effacer le sol et recommencer**, en bas du panneau. [[Ctrl+Z]] peut l’annuler.' },
    { q: 'Comment changer le revêtement du sol ?', a: 'Panneau **Sol** › **Revêtement** et **Couleur**.' },
  ],
  murs: [
    { q: 'Pourquoi les murs font-ils 10 cm ?', a: 'À l’échelle de la maquette (1 m = 3 cm), 10 cm donnent **3 mm** : l’épaisseur du carton.' },
    { q: 'Comment changer un seul mur ?', a: 'Clique dessus, sur le plan ou en 3D. Sans mur choisi, les réglages vont à **tous** les murs.' },
    { q: 'Comment décorer l’extérieur de la boutique ?', a: 'Dans **Face à décorer**, choisis **Façade** : matière (bardage, pierre…) et couleur du côté rue.' },
    { q: 'Comment donner le même aspect à tous les murs ?', a: 'Règle un mur, puis **Appliquer à tous les murs**.' },
    { q: 'Comment mettre une affiche ou un papier peint ?', a: 'Avec l’outil **Images** : cadre ou tapisserie murale.' },
    { q: 'Comment séparer des espaces (réserve, cabines, caisse) ?', a: 'Outil **Murs** › **Tracer une cloison**, puis sur le plan 2D : un clic au départ, un clic à l’arrivée. La cloison suivante part de là ; [[Échap]] pour arrêter.' },
    { q: 'Comment modifier ou supprimer une cloison ?', a: 'Clique dessus (outil **Murs**) : longueur, hauteur, matière de chaque côté. Sur le plan, **glisse** la cloison ou ses extrémités. [[Suppr]] la supprime.' },
    { q: 'Comment faire une cloison basse (muret, comptoir) ?', a: 'Clique sur la cloison et baisse sa **Hauteur** dans le panneau.' },
  ],
  ouvertures: [
    { q: 'Comment poser une porte, une fenêtre ou une vitrine ?', a: 'Outil **Portes / fenêtres** : choisis le type et le style, puis **clique sur un mur**.' },
    { q: 'Comment la déplacer ou la régler précisément ?', a: '**Glisse-la** le long du mur, ou clique dessus et tape sa largeur, sa hauteur et sa **distance au début du mur**.' },
    { q: 'C’est quoi l’allège ?', a: 'La hauteur entre le sol et le bas de la fenêtre ou de la vitrine.' },
    { q: 'Comment changer la couleur du cadre ?', a: 'Clique sur l’ouverture › **Couleur de la menuiserie**.' },
    { q: 'Comment supprimer une ouverture ?', a: 'Clique dessus, puis [[Suppr]] ou le bouton **Supprimer**.' },
    { q: 'Comment faire une ouverture sans porte entre deux espaces ?', a: 'Choisis **Porte**, style **Passage (sans porte)**, puis clique sur la cloison.' },
  ],
  mobilier: [
    { q: 'Comment ajouter un meuble ?', a: 'Ouvre la **bibliothèque**, choisis un meuble et **glisse-le** dans la boutique, ou clique sur **Placer dans la boutique**.' },
    { q: 'Comment tourner un meuble ?', a: '[[R]] le tourne de 15° ([[Maj]]+[[R]] dans l’autre sens). Pour un angle précis : **Angle exact** dans le panneau.' },
    { q: 'Comment choisir plusieurs meubles ?', a: '[[Maj]] + clic sur chacun. Sur le plan, glisse dans le vide pour les entourer.' },
    { q: 'Comment changer sa taille ou le poser en hauteur ?', a: 'Clique dessus : **Longueur**, **Profondeur**, **Hauteur** et **Hauteur au-dessus du sol** (étagère murale, objet sur un meuble…).' },
    { q: 'Mon meuble bouge sans arrêt.', a: 'Clique dessus puis **Verrouiller** : il ne bouge plus tant que tu ne le déverrouilles pas.' },
    { q: 'Il manque le meuble dont j’ai besoin.', a: 'Bibliothèque › **Créer un meuble** : l’Atelier le fabrique avec des volumes ou un fichier Tinkercad.' },
    { q: 'Où sont les meubles du professeur ?', a: 'Onglet **Ajouts du professeur** de la bibliothèque.' },
  ],
  images: [
    { q: 'Quelles images puis-je utiliser ?', a: '**PNG ou JPG**, 5 Mo maximum, **faites par toi** (Canva…) ou **libres de droits**.' },
    { q: 'Comment mettre un logo sur la vitrine ?', a: 'Ajouter une image › **Vitrine**. Un PNG à fond transparent donne l’effet d’un lettrage collé.' },
    { q: 'Comment décorer la façade avec une image ?', a: 'Dans les réglages de l’image, choisis **Façade (rue)** au lieu d’Intérieur.' },
    { q: 'Comment répéter un motif sur tout le mur ?', a: 'Choisis **Tapisserie murale** : le motif peut couvrir tout le mur.' },
    { q: 'Pourquoi mes images ne sont pas sur le plan A3 ?', a: 'Le plan ne montre que les murs et les ouvertures. Les images se voient en **3D** et sur les **photos**.' },
  ],
  vue3d: [
    { q: 'Comment me déplacer en 3D ?', a: '**Glisse** pour tourner, **clique avec la molette** et glisse pour te déplacer, **tourne la molette** pour zoomer. Le bouton du milieu, en bas à droite, recentre la vue.' },
    { q: 'Comment voir l’intérieur ?', a: 'Active **Murs abaissés** : les murs devant la caméra s’abaissent.' },
    { q: 'Comment voir la boutique depuis la rue ?', a: 'Bouton **Façade**.' },
    { q: 'Comment faire une image de mon rendu ?', a: 'Bouton **Photo** : choisis l’angle (façade, 3/4, intérieur, dessus ou les 4 en .zip), la taille et **PNG ou JPG**.' },
  ],
  atelier: [
    { q: 'À quoi sert l’Atelier ?', a: 'À fabriquer un meuble avec des volumes. Il rejoint **Mes créations** et il est enregistré **dans le projet**.' },
    { q: 'Comment centrer ou aligner deux volumes ?', a: 'Choisis un volume, puis **Placer par rapport à…** : choisis le volume de référence et l’alignement.' },
    { q: 'Comment pencher ou tourner un volume ?', a: 'Section **Rotation et inclinaison** : tourner, pencher vers l’avant ou vers la droite. **Remettre droit** annule.' },
    { q: 'Comment importer un modèle Tinkercad ?', a: 'Dans Tinkercad : **Exporter › OBJ**. Ici : **Importer un fichier Tinkercad (OBJ)** et choisis le .zip ou le .obj (5 Mo maximum).' },
    { q: 'Mon modèle importé est couché ou trop grand.', a: '**Redresser** le remet debout, **Taille d’origine** reprend les mesures de Tinkercad.' },
    { q: 'Comment modifier une création plus tard ?', a: 'Bibliothèque › **Mes créations** › crayon sur le meuble.' },
    { q: 'Comment réutiliser mes créations dans un autre projet ?', a: 'Bibliothèque › Mes créations › **Importer d’un autre projet**.' },
  ],
  plan: [
    { q: 'Comment bien imprimer le plan ?', a: 'Format **A3 paysage**, en **« Taille réelle »** ou **100 %**, sans « Ajuster à la page ».' },
    { q: 'Comment vérifier l’échelle ?', a: 'Mesure la **barre d’échelle** à la règle : sa longueur exacte est écrite à côté (9 cm à l’échelle 1 m = 3 cm).' },
    { q: 'Le plan ne tient pas sur la feuille.', a: 'Choisis une échelle plus petite (1 m = 2 cm) ou réduis la boutique.' },
    { q: 'Pourquoi les meubles ne sont pas sur le plan ?', a: 'Le plan est le **gabarit de la maquette** : murs, portes, fenêtres et cotes.' },
  ],
};
