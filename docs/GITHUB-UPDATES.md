# Mises à jour signées via GitHub

Le dépôt de code est `KioQc/vrc-avatar-vault`. Le flux intégré est `https://github.com/KioQc/vrc-avatar-vault/releases/latest/download/latest.json`.

Le dépôt doit être **public** pour que l’application puisse lire ce flux et télécharger les versions sans compte GitHub. Tant qu’il est privé, les accès anonymes échouent. Aucun jeton GitHub n’est embarqué dans le programme.

## Dans l’application

Installer une première fois la version 0.8.0. Les versions précédentes ne contiennent pas l’updater GitHub.

Settings > GitHub automatic updates propose deux réglages indépendants : recherche automatique et téléchargement automatique. Tous deux sont activés par défaut. La recherche a lieu au démarrage puis toutes les quinze minutes, sans bloquer l’accès aux données locales en cas de panne réseau. Check GitHub now permet une recherche manuelle.

La version téléchargée est vérifiée par le plugin officiel Tauri avec la clé publique intégrée. La barre d’état signale une mise à jour disponible/prête. Install & restart demande d’enregistrer les brouillons puis crée une sauvegarde SQLite vérifiée avant d’ouvrir l’installateur. Sur Windows, le plugin ferme l’application et l’installateur la relance. Aucune installation automatique au milieu du travail.

Les avatars, images, réglages et clés de compte restent dans leurs emplacements actuels. Les sauvegardes sont dans `%APPDATA%\local.vrc-avatar-vault.app\backups`. Les téléchargements préparés sont conservés en mémoire et peuvent être retéléchargés après fermeture. Le mode dossier local de 0.7.0 reste disponible dans une section repliable.

## Publier la prochaine version

1. Modifier et tester le code.
2. Exécuter `npm run release:version -- 0.9.0` et rédiger `docs/RELEASE-0.9.0.txt`.
3. Committer les modifications, pousser main, puis créer et pousser le tag `v0.9.0`.
4. Attendre le succès de **Publish signed Windows update** dans GitHub Actions.

Le workflow valide les versions, lance les tests TypeScript et Rust, compile Windows x64, signe l’installateur et crée une release brouillon. Il publie seulement après présence de l’exécutable, de sa signature et de `latest.json`. Les secrets ne sont accessibles qu’au job de livraison, jamais aux tests des pull requests. Les actions externes sont épinglées à des commits.

Le secret GitHub Actions `TAURI_SIGNING_PRIVATE_KEY` contient la clé de signature des mises à jour. Sa copie de secours locale est **hors du dépôt**, dans le dossier de travail de livraison. Elle doit être conservée : la remplacer sans migration empêcherait les versions installées de vérifier les suivantes. Seule la clé publique figure dans `tauri.conf.json`.

Cette signature Tauri protège l’authenticité des mises à jour ; ce n’est pas un certificat Windows Authenticode. L’avertissement Windows lié à un éditeur non certifié peut donc encore apparaître.

Références : [updater Tauri](https://v2.tauri.app/plugin/updater/), [publication GitHub Tauri](https://v2.tauri.app/distribute/pipelines/github/).
