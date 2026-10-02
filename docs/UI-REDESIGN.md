# Interface desktop 0.6.0

## Structure
Design system central `src/desktop.css` : surfaces neutres, variables de couleur et d’espacement, densité compacte/confortable, sidebar 232 px, topbar 52 px, barre d’état 26 px. Les styles techniques existants restent disponibles ; les composants communs imposent les surfaces et la densité desktop.

Sidebar Library / Development / Tools, contexte de l’avatar actif, breadcrumbs, statut VRChat, présence Unity horodatée et session de travail. Les états absents ne sont pas présentés comme connectés. Le dernier avatar visité est conservé dans les réglages locaux. Les tabs et filtres de bibliothèque utilisent l’URL.

## Vues
- Overview : continuer un projet, bugs/tâches/revues de fichiers, sessions, releases et activité. Quatre indicateurs seulement.
- Bibliothèque : grille compacte, plateformes essentielles, actions au survol et clic droit ; liste avec versions, plateformes, lien Unity, changements et date. Recherche/filtre/tri/vue conservés dans l’URL ; favoris optimistes avec rollback.
- Avatar : miniature 76 px, version, actions et accès directs aux changements, bugs, Unity, paramètres, FX, performance, snapshots et fichiers. JSON/OSC/métadonnées restent dans Technical details. Les anciens outils et routes sont conservés.
- Changes : navigation des releases à gauche, lignes groupées par catégorie, inspecteur latéral, export Markdown/Discord, édition/déplacement/duplication/suppression. Métadonnées des captures et de l’upload associé.
- Bugs : table filtrée par recherche/statut/sévérité, panneau de droite pour éditer/reproduire/corriger, entrée de changelog facultative, known issues conservés.
- Unity : projet/manifests réels conservés, lien direct pour ouvrir Unity. Snapshots : chronologie de captures Unity/filesystem, versions observées VRChat et releases ; détail JSON chargé à la demande.
- Paramètres : budget réseau, table triable, filtres type/saved/synced, inspecteur usages Animator/menus et historique des captures. Les champs manquants restent Unknown.
- Menus : mode visuel compact et arbre récursif avec protection contre cycles ; références de sous-menus conservées. FX reste une liste de layers/states/transitions lisible, sans prétendre reproduire Unity Animator.
- Performance : badges API séparés des mesures Unity, graphiques compacts en grille, comparaison de plateformes et variations.
- Dépendances et fichiers : détails latéraux ; lecture des dépendances Unity et ajout manuel toujours disponibles.
- Pages globales Bugs, Work Sessions, Snapshots, Dependencies. Les tags et changelogs globaux restent accessibles via la palette.
- Settings : apparence, densité, sidebar, animations, couleurs prédéfinies/personnalisées ; tous les réglages API, OSC, dossiers, releases, sauvegardes, IA et profils restent présents.

## Clavier et comportements
Ctrl+K : palette. Flèches/Home/End et Entrée : commandes. Ctrl+N : changement dans le contexte avatar. Ctrl+Shift+N ou Ctrl+I : import. Ctrl+Entrée : validation des formulaires HTML des dialogues. Esc : fermeture. / : recherche locale lorsqu’aucun champ n’est actif.
Menus contextuels construits sur les primitives Radix existantes : focus piégé, Esc, navigation clavier ; clic droit ou Shift+F10 sur l’élément ciblé. Les détails techniques utilisent le même composant Modal avec variante inspector-panel. Les suppressions conservent leurs confirmations et l’édition d’un changement/bug avertit lors d’une fermeture sans sauvegarde.

## Vérification et limites
Contrôle visuel 1280×720 : Overview, en-tête avatar, bug table/drawer et navigation des onze sections d’avatar. Parcours réellement effectué dans la base navigateur de test : palette → Add Change → Ctrl+Entrée → ligne Unreleased. Aucun compte utilisateur ou projet Unity n’a été modifié pour ce test.
Tests de rendu des neuf inspecteurs avec captures représentatives, plus pages globales, grille/liste/favoris vides, paramètres, VRChat et collections. Ce ne sont pas des tests de clic ni des mesures de contraste automatisées.
La reprise du navigateur a ensuite été refusée par sa politique d’accès ; pas de validation visuelle finale à 1920/2560 ni des modes clair/compact après ce refus. Les media queries et préférences sont implémentées, pas présentées comme visuellement vérifiées dans toutes les combinaisons.
Les panneaux latéraux restent modaux pour conserver un focus accessible. Le redimensionnement CSS dépend du moteur WebView ; pas de gestionnaire universel de split panes. La navigation des tables se fait par leurs boutons/liens et le clavier normal ; aucune virtualisation de très grandes tables. Les icônes de menu Unity restent des références et ne sont pas téléchargées. L’IA, le protocole Unity, l’API VRChat et les schémas SQLite n’ont pas été remplacés par des données fictives. Les fixtures sont réservées au mode de test explicite.
