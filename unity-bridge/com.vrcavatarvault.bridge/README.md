# Unity Bridge 0.2.0 — VRC Avatar Vault

Package Editor pour Unity 2022.3, protocole desktop v1. Lecture seule des scènes/assets ; aucun upload VRChat.

## Installer et connecter
1. Installer Avatar Vault 0.9.0. Conserver l’application précédente fermée pendant l’installation.
2. Dans Unity Package Manager, utiliser **Add package from tarball** et choisir `VRC-Avatar-Vault-Unity-Bridge-0.2.0.tgz`. Autre option : extraire le ZIP, **Add package from disk**, sélectionner `package.json`.
3. Desktop : Settings → Local API / Unity Bridge, démarrer sur le port 17861, révéler/copier le token.
4. Unity : Tools → VRC Avatar Vault. Coller le token, conserver le même port, Connect.
5. Choisir l’avatar de la scène et son tracker desktop, puis sa plateforme. Analyze affiche les différences ; Send snapshot enregistre les données dans le desktop.
6. Desktop : avatar → Unity → Parameters / Menus, puis VRCFury, pour consulter les références du Full Controller et les déclarations de toggles. Snapshots permet de comparer les captures et baselines.

## VRCFury et fichiers
- Lecture des composants VF.Model.VRCFury sur l’avatar, y compris les enfants inactifs et les composants désactivés (leur état reste indiqué).
- Lecture des assets VRCExpressionParameters et VRCExpressionsMenu référencés, des sous-menus, avec objet et fichier source. Les GuidWrapper sont résolus par objRef ou identifiant GUID:fileID.
- Lecture des déclarations Toggle : chemin du menu, slider, saved, paramètre global et valeurs par défaut. Les noms des paramètres générés restent « Generated at build ».
- Ces entrées sont séparées des paramètres du descriptor : aucun budget final n’est calculé en fusionnant des sources non transformées. Le résultat final des optimisations/fusions VRCFury après build n’est pas capturé dans cette version.
- Aucune méthode d’upgrade/build de VRCFury n’est appelée, aucun asset n’est modifié. Une version incompatible ou une inspection tronquée nécessite une vérification dans Unity.
- Copier un chemin Assets/ ou Packages/ depuis l’explorateur VAV, le coller dans Asset path from VAV, puis Locate asset pour sélectionner et surligner le fichier dans Unity.

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


## Actions depuis VAV et captures automatiques (0.2.0)
Le Bridge interroge les commandes locales toutes les deux secondes. Locate in Unity sélectionne un asset, Capture selected avatar demande une capture manuelle. Le projet ouvert et le tracker choisi doivent correspondre. Les commandes expirent après trente secondes; le résultat est visible dans VAV.
Automatic snapshots est désactivé par défaut et revient désactivé après fermeture/rechargement du panneau. Choisir un délai de 3 à 60 secondes sans modification et une rétention de 5 à 100 captures (20 par défaut). Les captures manuelles et celles associées à une release ne sont jamais supprimées par cette rétention. Le watcher n’envoie pas les changements dans un changelog automatiquement.
Le chemin absolu du projet est transmis uniquement à l’API locale pour vérifier la destination des commandes; il n’est pas envoyé aux statistiques cloud.
