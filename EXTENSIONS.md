# Extensions avancées — version 0.5.0

## Fonctions disponibles
- Projet Unity lié et dépendances UPM/VPM détectées ; dépendances locales ajoutées manuellement.
- Surveillance facultative toutes les 5 secondes, deux observations stables avant regroupement. Assets, Packages, ProjectSettings seulement ; caches, jonctions et liens ignorés. Hash SHA-256 sous budget, métadonnées pour gros fichiers. Suggestions explicites, jamais de changelog créé automatiquement.
- Snapshots filesystem et techniques, baselines, association à une release, renommage/export/suppression, comparaison. Historique indépendant des fichiers Unity : les assets ne sont pas copiés.
- Inspecteurs paramètres (coût réseau connu ou inconnu), menus et sous-menus, hiérarchie, FX/Animator, descriptor ; différences par identifiant lorsque disponible.
- Graphiques des métriques capturées, variations significatives, comparaison des captures PC/Quest/iOS et diagnostics Quest configurables. Règles versionnées 2026-10-v1.
- Bugs, étapes de reproduction, statut/sévérité, pièces jointes déjà présentes dans Files, known issues figés lors d’une release et exportés avec celle-ci.
- Sessions de travail persistantes : start/pause/resume/stop, récupération explicite après arrêt. Le temps de veille prolongée est exclu. Statistiques des changements, bugs, versions et temps enregistré.
- Association explicite release locale → snapshot API VRChat, après un rafraîchissement des données.
- IA facultative : Ollama ou endpoint chat-completions compatible. Texte et destination visibles avant envoi ; aucune connexion IA automatique. Clés dans le coffre Windows, séparées par endpoint.
- Profils VRChat avec jars de cookies et entrées du coffre Windows séparés. La bibliothèque locale reste commune aux profils.
- API locale HTTP v1 authentifiée, liée à 127.0.0.1 et désactivée à chaque démarrage. Événements par interrogation incrémentale.
- Unity Bridge Editor 0.1.0 : extraction en lecture seule, analyse/diff local, présence, envoi explicite des changements et snapshots, création de release exacte et baseline facultative.

## Limites explicites
- Pas de WebSocket dans cette version : `/events?after=…` fournit les événements par polling.
- Le bridge lit les objets sérialisés de la scène ouverte. Il ne remplace pas le build ou l’analyse officielle VRChat SDK. Les métriques sont des mesures/estimations avant build ; aucune note SDK n’est inventée.
- Pas de parseur YAML Unity général. Les champs absents restent inconnus. Les propriétés sérialisées sont bornées ; les objets de scène non sauvegardés peuvent avoir un identifiant valable seulement pendant la session.
- Pas de rendu des textures/icônes de menus dans le desktop ; leurs références sont conservées dans le JSON. Pas de carte interactive complète du graphe Animator ; états/transitions et conditions sont inspectables.
- Override controllers : le contrôleur de base est inspecté, pas la table complète des motions remplacées. Les estimations mémoire ne correspondent pas nécessairement au fichier uploadé.
- L’acceptation/ignorance des suggestions filesystem est disponible ; les alertes de régression n’ont pas encore de workflow dédié Review/Ignore.
- Aucun upload VRChat depuis le bridge ; il crée les releases locales. Le nom VRChat reste modifiable facultativement dans le dialogue desktop de publication.
- Surveillance bornée à 50 000 fichiers et profondeur 48. Snapshot API locale limité à 8 Mio ; une analyse trop grosse doit être réduite avant envoi. Les erreurs de scan sont affichées, pas transformées en suppressions.

## Données et mises à jour
Migration SQLite 003 transactionnelle, backup vérifié avant migration. Chemin AppData inchangé. Les exports comprennent bugs, sessions, snapshots, baselines, dépendances et associations de releases. Les restaurations désactivent les watchers et convertissent les sessions actives en sessions interrompues. Les anciens exports sans tables Studio restent lisibles. Les identifiants et tokens ne sont pas exportés.

## Références de règles
- https://creators.vrchat.com/avatars/animator-parameters/
- https://creators.vrchat.com/platforms/android/quest-content-limitations/
- https://creators.vrchat.com/avatars/avatar-performance-ranking-system/
