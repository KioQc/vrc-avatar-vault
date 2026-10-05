# Roadmap VAV — de 0.8.4 à 1.0.0

Document de travail du 3 octobre 2026. Base publique : **0.8.4**. La roadmap initiale partait de 0.8.2 ; 0.8.3 (maintenance) et 0.8.4 (statistiques facultatives) ont depuis été publiées.

## Règles de livraison

- Une étape à la fois, avec un périmètre fermé et un aperçu testable avant publication stable.
- Existant dans le code ne signifie pas validé dans un vrai projet Unity : conserver les validations manuelles ouvertes tant qu’elles ne sont pas réalisées.
- Pas de recalcul des releases historiques ; aucune réinitialisation du coffre.
- Données manquantes affichées comme inconnues, avec leur source. Les mesures avant build ne sont pas des performances finales SDK.
- Suggestions de changelog soumises à validation. Simulation du menu locale ; aucun envoi OSC automatique.
- Fonctionnement principal sans IA et hors connexion. Collecte statistique toujours facultative.
- Source et menu final résolu distincts ; Unity Bridge fournit les données du traitement Unity/VRCFury, sans reconstruction spéculative depuis le YAML.
- Aucun nouvel engagement de date : passage à l’étape suivante selon les critères de validation.

## État initial vérifié dans le dépôt

| Domaine | Existant en 0.8.4 | Travail restant / preuve attendue |
| --- | --- | --- |
| Maintenance | Sauvegardes SQLite, rollback, diagnostics, mise à jour signée ; installation 0.8.3 validée par le propriétaire | Matrice Windows portable → installé, plusieurs versions → dernière, désinstallation/réinstallation complète |
| Unity | Liaison, Unity/SDK/UPM/VPM, ouvrir Unity/dossier, rescan | Résolution précise des versions et sources ; validation sur projets réels et chemins indisponibles |
| Dépendances | Détection des manifestes et fiches manuelles nom/version/source/lien/chemin/notes | Distinguer version déclarée et résolue ; source Git/local/registre ; éviter les écrasements entre manifestes |
| Watcher | Scan borné, filtres, changements et renommages, surveillance facultative | Cas réels de sauvegardes Unity, renommages ambigus, grands projets et erreurs de lecture |
| Snapshots | Métadonnées filesystem, captures techniques, comparaison, baseline, liens aux releases | Clarifier métadonnées vs sauvegarde des assets ; fiabiliser le parcours de release/baseline |
| Bridge | 0.1.0, sélection de descriptor, captures, présence, actions locales authentifiées | Durcir connexion et extraction ; qualification Unity/SDK pour 0.2 |
| Changelog/performance | Suggestions explicites, bugs, known issues, inspecteurs et comparaisons | Couverture des règles, provenance par donnée et ergonomie des régressions |
| Versions | Incréments cumulatifs présents et testés | Stratégie persistante par avatar et aperçu complet à auditer/compléter |
| Interface | Palette de commandes et panneaux déjà présents | Workspace unifié, switcher contextuel, inspecteur commun et radial complet |

Repères : `src-tauri/src/unity.rs`, `project_scan.rs`, `studio.rs`, `src/features/avatars/UnityPanel.tsx`, `src/features/studio/`, `src/db/repository.test.ts`, `unity-bridge/com.vrcavatarvault.bridge/Editor/`, `EXTENSIONS.md`.

## 0.9.0 — Unity Workflow : prochaine étape

Consolider Avatar → Project → Changes → Snapshot → Release.

1. Projet lié : afficher nom, chemin, Unity, SDK, dernier scan et avertissements ; ouvrir Unity, ouvrir le dossier, rescanner. En cas de dossier absent, conserver la liaison et proposer de la corriger.
2. Dépendances : séparer identité, version déclarée, version résolue et origine. Gérer UPM, VPM, Git et chemins locaux sans inventer de version. Conserver les fiches manuelles pour Poiyomi, GoGo Loco, templates FT et assets non déclarés ; détecter VRCFury/Modular Avatar lorsque les métadonnées le permettent.
3. Surveillance : Added/Modified/Deleted/Renamed, filtres pertinents et caches exclus. Un échec ou scan incomplet ne doit jamais devenir une liste de suppressions. Signaler les limites de scan et les comparaisons sans hash.
4. Snapshots/baselines : capture manuelle, comparaison et choix explicite d’une baseline après release. Afficher que le snapshot filesystem ne sauvegarde pas les assets Unity.
5. Validation : tests de fusion des manifestes, versions inconnues, Git/local, renommages, erreurs de lecture, suppression d’un fichier, redémarrage et isolation entre deux avatars. Parcours réel sur un projet Unity/VCC avant stable.

Critère de sortie : l’utilisateur peut lier un projet, voir ses dépendances, modifier des fichiers, examiner le diff, sauvegarder une capture et sélectionner une baseline sans perte de données ni modification implicite du projet.

## 0.9.1 — Unity Bridge 0.2

Connexion locale authentifiée, état/protocole visibles, reconnexion et erreurs compréhensibles. Sélection explicite des VRCAvatarDescriptor. Hiérarchie, descriptor, paramètres, menus, FX/playable layers, PhysBones, contacts, renderers, matériaux et meshes. Actions Open in VAV, Create Snapshot, Add Change et Refresh Data.

Validation : plusieurs avatars dans une scène, changement de sélection, VAV fermé/redémarré, protocole incompatible, données trop volumineuses et champs absents. Vérifier dans Unity réel ; un contrôle de compilation seul ne suffit pas.

## 0.9.2 — Smart Changelog

Suggestions déterministes et expliquées : expressions, matériaux, structure et changements spécifiques à une plateforme. Une suggestion conserve les preuves qui la justifient. Bug Fixed → proposition d’entrée ; known issues sélectionnables et figés dans la release. Génération des notes sans IA, avec IA facultative et envoi explicite.

Validation : aucune entrée créée sans validation ; refus/acceptation sans doublon ; notes historiques inchangées après modification des bugs.

## 0.9.3 — Performance & PC / Quest

Historique par version et plateforme, variations significatives et comparaison côte à côte. Couvrir les métriques disponibles : géométrie, meshes, matériaux, bones, PhysBones/transforms, contacts, constraints, particules, mémoire texture, lights et audio sources. Provenance par champ : API, Bridge, parser ou filesystem. Diagnostics Quest avec problème, fichier et explication.

Validation : distinguer absence et zéro, mesures avant/après build et note API ; pas de compatibilité Quest déduite d’un impostor ; captures comparables et seuils versionnés. Vérifier les règles officielles au moment de l’implémentation.

## 0.9.4 — Data Safety

Format de sauvegarde versionné regroupant base, images, attachments, réglages nécessaires et métadonnées ; exclure secrets et identifiants de collecte. Restauration complète avec sauvegarde de sécurité préalable. Vérification SQLite, relations, fichiers manquants et orphelins sans suppression automatique. Migration en échec : rollback et ancienne base préservée.

Validation : restauration dans un coffre vierge et existant, archive corrompue, fichiers manquants, espace insuffisant, version future et chemins malveillants. Comparer données et pièces jointes avant/après.

## 0.9.5 — Daily Use & Performance

Mesurer puis optimiser lancement, ouverture d’avatar, recherche, images, snapshots, tables et historiques volumineux. Sessions Start/Pause/Resume/Stop et reprise explicite après crash : Resume, End at previous shutdown, Discard. Vérifier le travail hors ligne et les cas VRChat session expirée, reconnexion, 429 et cache.

Validation : bibliothèque synthétique de plusieurs milliers d’entrées avec mesures avant/après sur le même PC ; pas de perte de travail hors ligne ni de temps fictif après crash. À partir de cette étape, limiter les nouvelles fonctionnalités aux systèmes déjà prévus.

## 0.9.6 — Architecture UI 1.0

Consolider les composants communs : AppShell, Sidebar, Topbar, AvatarWorkspace, AvatarSwitcher, ContextInspector, QuickActions, DataTable, CommandPalette, PageHeader, StatusIndicator. Unifier espacements, typo, couleurs, bordures et états loading/error/offline/disabled. Navigation clavier et focus cohérents.

Validation : migrer progressivement des écrans représentatifs, vérifier clavier, tailles de fenêtre et états d’erreur avant de généraliser. Ne pas réécrire toutes les pages en une livraison.

## 0.9.7 — Navigation 1.0 Preview

Navigation globale Home/Avatars/Development/Activity/Tools/Settings. Workspace Overview/Changes/Menu/Parameters/FX/Unity/Bugs/Performance/Snapshots. AvatarSwitcher conservant l’onglet actif ; Ctrl+K avec actions contextuelles.

Validation : liens directs, retour navigateur, avatar supprimé, onglet indisponible et changement d’avatar avec brouillon non enregistré.

## 0.9.8 — Interactive Menu + VRCFury

Un seul modèle pour Radial et Tree. Button, Toggle, SubMenu, Radial Puppet, Two Axis et Four Axis ; retour, breadcrumb et historique. Simulation locale des paramètres. Inspecteur : type, paramètre, default/saved/synced, valeur simulée, usage FX, chemin et source.

Deux lots internes dans le même jalon : (A) menu source/simulation ; (B) provenance VRCFury et menu résolu via Bridge. Ne pas présenter un menu source comme le résultat final. Conserver objets, chemins, icônes, paramètres générés/globaux et modifications Animator lorsqu’ils sont réellement disponibles. Diff de menus entre captures.

Validation : sous-menus cycliques ou manquants, paramètres partagés, valeurs des puppets et cohérence Radial/Tree ; aucun envoi VRChat. Valider le menu résolu avec un build Unity réel et une version VRCFury explicitement testée.

## 0.9.9 — Release Candidate, versioning et gel des fonctionnalités

Deux stratégies distinctes, persistantes par avatar : SemVer et Additive avec incrément par défaut.

- SemVer depuis 1.4.7 : Major 2.0.0, Minor 1.5.0, Patch 1.4.8.
- Additive : 1.9.9 + 0.1.0 = 1.10.9 ; +0.0.1 = 1.9.10 ; +1.0.0 = 2.9.9.
- 1.2.4 + 0.5.0 = 1.7.4 ; aucune retenue décimale entre segments.
- Changer la stratégie ne modifie jamais les releases existantes.

Aperçu Publish : version actuelle, stratégie, incrément, prochaine version, changements non publiés, bugs résolus et snapshot disponible. Calcul depuis la version persistée, contrôle des doublons et erreurs explicites. Corriger tout bug bloquant de versioning découvert avant ce jalon plutôt que le laisser attendre.

Validation : exemples ci-dessus, incréments répétés, changement de stratégie, annulation, reprise et publication concurrente. Feature freeze ; aucune nouvelle architecture.

## 1.0.0 — Workflow & UI Overhaul

Finaliser les parcours quotidiens et réduire les clics : switcher toujours disponible, inspecteur latéral commun, liens Menu → Parameter → FX → Animation → objet/source, actions rapides, session active et états Unity/VRChat discrets. Dashboard Continue Working / Needs Attention avec explication des alertes.

Parcours de validation complet : ouvrir avatar → démarrer session → Unity → capture Bridge → menu interactif → snapshot → suggestion acceptée → bug résolu → aperçu/version calculée → release locale → upload VRChat détecté → association confirmée → nouvelle baseline. Ne jamais associer silencieusement un upload ambigu.

Critère de sortie : parcours documenté et validé sur PC/Quest, mise à jour depuis les versions supportées avec données intactes, restauration éprouvée, absence de bugs bloquants et limites connues publiées.

## Après 1.0

Git/tags/branches, plugins, cloud sync, collaboration, dépôt VCC, CLI avancée, automatisations et OSC actif restent hors périmètre jusqu’à 1.1+.

## Suivi

La roadmap décrit du travail prévu, pas des fonctionnalités livrées. Prochain lot : **0.9.0 Unity Workflow**. Aucun changement de version, binaire ou publication n’est effectué par cette mise à jour documentaire.
