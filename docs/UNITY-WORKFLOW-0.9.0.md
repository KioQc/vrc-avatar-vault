# VAV 0.9.0 — progression

Première base : **0.9.0-preview.1**, livraison locale. La version stable publiée reste 0.8.10.

## Fonctionnel dans cette preview

- Logos VAV fournis par le propriétaire : barre latérale normale/compacte, accueil, favicon et icône desktop.
- Association à un projet Unity existant ; ouverture via VCC, accès au dossier et rescan.
- Lecture de ProjectVersion.txt, manifest.json, packages-lock.json et vpm-manifest.json.
- Dépendances déclarées UPM/VPM/Git/locales ; versions, sources, chemins et références disponibles.
- Dépendances manuelles pour les assets non déclarés : lien, chemin, notes.
- Vue du workflow : projet, lots de changements à revoir, snapshots et releases.
- Démarrage/arrêt du watcher depuis la vue Unity.
- Snapshot manuel et baseline volontaire depuis la vue Unity ; comparaisons détaillées dans Snapshots.
- Watcher existant : deux scans stables, caches Unity ignorés, aucune écriture automatique dans le changelog.

## Limites explicites

Un snapshot de fichiers stocke les métadonnées et empreintes : ce n’est pas une sauvegarde complète du projet Unity.
Les assets copiés directement dans Assets ne sont pas identifiés automatiquement comme dépendances.
L’ouverture d’un projet est déléguée à VCC : ce projet doit y être enregistré.
Les actions natives sont désactivées dans l’aperçu navigateur de test.

## Avant une 0.9.0 stable

- Valider sur de vrais projets VCC, dont dépendances locales, Git, VPM et projets volumineux.
- Valider le parcours : modification de fichiers, Added/Modified/Deleted/Renamed, revue, snapshot, baseline liée à une release.
- Vérifier que les versions/métadonnées de packages restent lisibles avec les variations de manifests rencontrées.
- Valider installation de la preview et conservation des données existantes.

Le Bridge 0.2 et le Smart Changelog restent les étapes 0.9.1 et 0.9.2 prévues dans la roadmap.

## Preview 3
Le scanner lit aussi les package.json installés par VCC. Le Bridge 0.1.1 lit les entrées VRCFury authored (menus et paramètres référencés, déclarations Toggle), sans calculer le résultat final généré au build.
Compilation vérifiée contre les DLL Unity 2022.3.22f1; un test exécuté dans Unity avec des fixtures isolées vérifie GUID:fileID, menus récursifs, objets inactifs et déclarations Toggle.
Le parcours complet sur un véritable avatar VRCFury et l'ouverture VCC restent à valider avant stable.
