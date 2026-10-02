# Unity Bridge 0.1.0 — VRC Avatar Vault

Package Editor pour Unity 2022.3, protocole desktop v1. Lecture seule des scènes/assets ; aucun upload VRChat.

## Installer et connecter
1. Installer Avatar Vault 0.5.0. Conserver l’application précédente fermée pendant l’installation.
2. Dans Unity Package Manager, utiliser **Add package from tarball** et choisir `VRC-Avatar-Vault-Unity-Bridge-0.1.0.tgz`. Autre option : extraire le ZIP, **Add package from disk**, sélectionner `package.json`.
3. Desktop : Settings → Local API / Unity Bridge, démarrer sur le port 17861, révéler/copier le token.
4. Unity : Tools → VRC Avatar Vault. Coller le token, conserver le même port, Connect.
5. Choisir l’avatar de la scène et son tracker desktop, puis sa plateforme. Analyze affiche les différences ; Send snapshot enregistre les données dans le desktop.
6. Desktop : avatar → Development → Inspectors pour consulter le résultat. Changes & snapshots permet de comparer les captures et baselines.

Le token Unity reste en mémoire seulement. Reconnecter après fermeture du panneau ou rechargement du domaine. L’API desktop doit être redémarrée après fermeture de l’application.

## Actions explicites
- Analyze / preview : capture locale et diff, sans envoi.
- Surveillance Unity : analyse différée après les changements, aucun envoi automatique de snapshot.
- Add reviewed changelog : ajoute le texte affiché à Unreleased.
- Mark version : crée une version **exacte** dans le tracker, peut inclure les changements, une capture et une baseline du projet déjà lié. Une erreur après création conserve l’identifiant de release pour réessayer les étapes restantes tant que le panneau reste ouvert.
- Start desktop work session : démarre le suivi, à gérer ensuite dans Work & stats.
- Open in Avatar Vault : navigation dans l’application déjà ouverte ; le bouton Launch permet de lancer l’exécutable choisi.

Les mots de passe et cookies VRChat ne sont jamais demandés par ce plugin. Il dépend du package Unity Newtonsoft JSON. La présence transmise comprend les noms du projet, de la scène et de l’avatar, pas le chemin absolu du projet.

## Fiabilité
Compilation vérifiée contre les assemblies Unity 2022.3.22f1. Le protocole desktop est testé avec SQLite et sockets localhost. Une extraction dans un vrai projet VRChat SDK reste à valider par l’utilisateur. Voir EXTENSIONS.md dans les sources desktop pour les limites d’analyse (prébuild, champs bornés, contrôleurs override, identifiants temporaires).
