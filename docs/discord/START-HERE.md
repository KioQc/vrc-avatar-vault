# Lancement du Discord VAV

La structure du serveur est déjà créée. Les messages d’ouverture, release 0.8.1, patch notes 0.8.1, roadmap et problèmes connus ont été publiés et vérifiés. Les autres textes français sont prêts à copier dans leurs salons.

## Étape 2 — Remplir les salons

Copier les fichiers `messages/` dans les salons correspondants, puis épingler accueil, règlement, modèles de support et guides. Les messages sont séparés pour rester sous 2 000 caractères.

| Fichier              | Salon                          |
| -------------------- | ------------------------------ |
| 01-bienvenue         | bienvenue                      |
| 02-reglement         | règlement                      |
| 03-notifications     | rôles                          |
| 04-release-0.8.1     | releases                       |
| 05-patch-notes-0.8.1 | patch-notes                    |
| 06-problemes-connus  | problèmes-connus               |
| 07-support           | sujet épinglé dans support     |
| 08-bugs              | sujet épinglé dans bugs        |
| 09-suggestions       | sujet épinglé dans suggestions |
| 10-installation      | guides                         |
| 11-vrchat-osc        | guides                         |
| 12-sauvegardes-unity | guides                         |
| 13-roadmap           | roadmap                        |
| 14-ouverture         | annonces                       |

Dans le salon rôles, associer effectivement les choix aux rôles avant de publier le message 03. Ne pas promettre un sélecteur qui n'existe pas encore.

## Étape 3 — Première version

Les textes concernent VAV 0.8.1. Le lien Releases/latest mène toujours à la dernière version. Les notes détaillées de 0.8.1 utilisent une adresse versionnée.

Ne pas annoncer le support Linux/macOS comme vérifié, l'envoi de commandes OSC, ni une compilation automatique GitHub actuellement opérationnelle.

## Étape 4 — Test avant invitations

- Utiliser un compte membre sans rôle d'administration : il voit l'accueil et les guides, mais ne peut pas modifier les annonces ni voir la catégorie équipe.
- Ouvrir une demande de support, ajouter son tag, répondre puis la marquer résolue.
- Vérifier qu'un membre peut joindre une capture au support et ne peut pas mentionner everyone/here.
- Vérifier les liens de téléchargement et l'invitation permanente hors connexion au compte administrateur.
- Tester le rôle de notifications avec un petit groupe volontaire ; ne pas ping tout le serveur.
- Les cinq annonces initiales ont été publiées et relues via l’API Discord ; contrôler leur présentation dans les salons.

Ces vérifications nécessitent l'accès au serveur ; elles ne sont pas encore réalisées.

## Étape 5 — Ouverture et premiers utilisateurs

Voir `LAUNCH-30-DAYS.md`. Le lien https://discord.gg/evvAZQzjPt est intégré au README et aux paramètres de l’application à partir de VAV 0.8.2. Les publications dans des serveurs tiers doivent respecter leurs salons de promotion et l'accord de leurs équipes.

## Étape 6 — Annonces automatiques

Voir `AUTOMATION.md`. Un outil d'annonce depuis le PC est fourni avec aperçu et protection locale contre les doublons. Il nécessite un webhook dédié ; ne jamais mettre son URL dans un salon ou dans Git.

État : cinq premiers messages publiés et vérifiés, cinq webhooks configurés hors du dépôt, deux secrets GitHub configurés pour les releases et patch notes. Ne pas republier les messages 04, 05, 06, 13 et 14. Il reste à copier et épingler les neuf autres textes, puis à tester les permissions comme membre. Le blocage de facturation GitHub Actions reste distinct du fonctionnement des téléchargements de VAV.
