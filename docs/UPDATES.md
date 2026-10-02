# Mises à jour de l’application

La version 0.7.0 ajoute un centre de mises à jour local dans **Settings > Application updates**. Il fonctionne sans compte GitHub, sans serveur et sans connexion VRChat.

## Utilisation

1. Installer une première fois `VRC-Avatar-Vault-0.7.0-Setup.exe`, au même emplacement que l’application précédente.
2. Créer un dossier permanent, par exemple `Documents\Avatar Vault Updates`, puis le choisir avec **Choose folder**.
3. À la réception d’un prochain paquet `VRC-Avatar-Vault-X.Y.Z-Update.zip`, extraire ses deux fichiers dans ce dossier en remplaçant le manifeste `latest.vault-update.json`.
4. Cliquer **Check now**, ou activer la vérification facultative toutes les 30 secondes. L’application doit rester ouverte. Un lien apparaît dans la barre d’état lorsqu’une version plus récente est disponible.
5. Cliquer **Review & update**, lire les changements, enregistrer les modifications en cours puis **Back up & open installer**. Suivre les étapes de l’installateur Windows et rouvrir l’application.

Le premier installateur est nécessaire : une ancienne version ne possède pas encore ce centre. Une fois en 0.7.0, le paquet 0.7.0 est affiché comme déjà installé, ce qui est normal. La vérification automatique lit seulement le dossier choisi ; elle ne télécharge et n’installe rien automatiquement.

## Vérifications et conservation des données

- Version stable strictement supérieure à la version exécutée, comparée avec SemVer.
- Identifiant de produit attendu, nom de fichier exact, manifeste limité à 64 Kio et installateur limité à 200 Mio.
- Taille, en-tête Windows et SHA-256 vérifiés avant et après copie dans le cache local, puis juste avant le lancement.
- Confirmation attachée à un paquet préparé, valide dix minutes. Le lancement ne peut pas être répété avec le même jeton.
- Sauvegarde SQLite cohérente, incluant les pages WAL validées, et contrôle `quick_check` avant de lancer l’installateur. Si la sauvegarde échoue, l’installation ne démarre pas.
- Les données restent dans `%APPDATA%\local.vrc-avatar-vault.app`, indépendamment du dossier d’installation. Images et pièces jointes ne sont pas remplacées. Les clés de compte restent dans le coffre Windows.

Le manifeste local et SHA-256 détectent un fichier corrompu ; ils ne prouvent pas l’identité de son auteur. Ces paquets ne sont pas signés. Choisir uniquement un paquet reçu d’une source de confiance. Une distribution automatique sur Internet nécessitera une source de publication et une vérification cryptographique des versions.

La sauvegarde avant installation porte sur la base SQLite. Pour une copie externe comprenant les images, utiliser aussi l’export complet du coffre dans Settings. Les sauvegardes sont dans `backups`, les copies temporaires d’installateur dans `updates`, sous le dossier de données. Aucune donnée utilisateur n’est effacée par ce centre.

## Préparer une prochaine version

Dans un environnement de développement Windows disposant de Node, Rust, MSVC et des dépendances Tauri :

```powershell
npm run release:version -- 0.8.0
npm run check
npm run desktop:build
npm run release:package -- -NotesFile docs/RELEASE-0.8.0.txt
```

`release:version` synchronise package.json, package-lock.json, Cargo.toml, Cargo.lock et tauri.conf.json. L’interface lit directement la version du package.

`release:package` vérifie que les versions embarquées dans les exécutables correspondent à la version demandée, copie les exécutables dans `release`, calcule l’empreinte et génère `latest.vault-update.json` ainsi que le ZIP contenant le manifeste et l’installateur. Les notes doivent être fournies explicitement. Les anciens installateurs versionnés sont conservés. Ce script ne publie rien sur Internet.

Dans cet espace de travail, les scripts `work/check-desktop.ps1` et `work/bundle-desktop.ps1` configurent le compilateur Windows portable ; la compilation Vite utilise les adaptateurs locaux déjà en place.
