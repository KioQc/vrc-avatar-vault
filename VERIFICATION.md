# Vérification 0.7.0 — 1 octobre 2026

- TypeScript strict et ESLint : réussis.
- Vitest : 67 tests réussis, 9 fichiers. Nouveaux cas : dossier non configuré, manifeste manquant, notes de version échappées.
- Rust : 25 tests réussis. Nouveaux cas : identité du produit, traversée de chemin, taille/empreinte invalides, préversions refusées, comparaison numérique et installateur altéré.
- Vite production : réussi, avertissements existants de taille de chunk et annotations Zod.
- Build Rust release et NSIS x64 : réussis. Script release:package exécuté avec succès ; versions embarquées 0.7.0 contrôlées. ZIP à deux fichiers vérifié, taille et SHA-256 du manifeste identiques à l’installateur, archive intègre.
- Les tests existants de conservation des données et de sauvegarde WAL lors des migrations passent toujours.
- L’installation réelle et le redémarrage sur les données personnelles n’ont pas été exécutés. La revue du nouveau panneau repose sur les tests de rendu, sans nouvelle validation visuelle native.
- Aucun compte, dépôt GitHub ou endpoint de publication n’a été créé. Mise à jour locale seulement ; vérification automatique désactivée par défaut, lancement manuel après revue.

---

# Vérification 0.6.0 — 1 octobre 2026

- TypeScript strict : réussi.
- ESLint : réussi sans avertissement.
- Vitest : 64 tests réussis, 8 fichiers. Les nouveaux tests couvrent les vues techniques avec données et le rendu des pages globales, de la bibliothèque grille/liste et de ses états vides.
- Rust : 21 tests réussis, couvrant toujours migrations, conservation des données, protocole Unity/local HTTP, OSC, API et sessions.
- Vite production : réussi. Avertissements non bloquants de taille de chunk et annotations de commentaires Zod.
- Revue visuelle 1280×720 : Overview, fiche avatar compacte, bugs/drawer. Parcours de toutes les sections avatar sans écran d’erreur. Palette filtrée, flèche/Entrée, création de changement par Ctrl+Entrée puis présence dans Unreleased vérifiées avec base de test séparée.
- Pas de données utilisateur remplacées. Aucun upload ou renommage VRChat, ni écriture dans un projet Unity pour vérifier l’interface.

## Limite de la revue visuelle
Après une reprise de session, le navigateur a refusé l’accès à la fenêtre de test en invoquant sa politique URL. La vérification finale à 1920×1080/2560×1440 et des variantes d’apparence n’a donc pas été exécutée. Les tests de rendu ne remplacent pas cette revue. Voir docs/UI-REDESIGN.md.

## Livraison

Build Rust release et installateur NSIS Windows x64 : réussis. Installateur généré, non installé automatiquement ; binaire non signé.
La version 0.6.0 utilise le même identifiant Tauri et le même dossier AppData. Unity Bridge 0.1.0 et protocole v1 restent compatibles. Aucun nouveau schéma de base introduit par la refonte ; les réglages d’apparence utilisent la table settings existante. Les empreintes finales sont dans release/SHA256SUMS.txt.

---

# Vérification 0.5.0 — 1 octobre 2026

## Résultats
- TypeScript strict et ESLint : succès.
- Vitest : 42 tests, 6 fichiers, succès. Versions cumulatives, plateformes natives/impostors, performances, sauvegardes anciennes et Studio, bugs, durées restaurées, diff identifiants et paramètres inconnus.
- Rust : 21 tests, succès. Migrations avec conservation/backup, OSC UDP loopback et décodage, HTTP local authentifié/rejets, création de release/changelog/snapshot, association invalide rejetée, scan de fichiers/hash, validation IA, récupération de session et unicité de la session active.
- Vite production, Rust release Windows x64 et NSIS : succès.
- Plugin C# compilé avec les assemblies de Unity 2022.3.22f1. Compileur Mono, C# 7.3 ; avertissement de correspondance Newtonsoft netstandard 2.0/2.1 masqué pour cette vérification externe à Unity.
- Interface testée dans le navigateur avec base SQLite de fixtures séparée : navigation Development, création d’un bug/known issue, affichage des détails, statistiques et état vide des inspecteurs. Capture docs/studio-0.5.png.
- Les écrans sans projet/baseline retournent null et non undefined pour TanStack Query.

## Vérifications réelles antérieures
L’utilisateur a confirmé la connexion VRChat et l’import réels. Les versions antérieures ont permis de vérifier les données API et les fichiers OSC. Cette livraison n’a pas effectué de renommage distant ni d’upload de test sur son compte.

## À valider en environnement utilisateur
Le package Unity n’a pas encore été exécuté dans un véritable projet VRChat SDK. L’extraction et l’aller-retour d’un avatar complet nécessitent ce test. Aucun fournisseur IA ni second compte réel n’a été utilisé. Le nouvel installateur a été généré, pas installé automatiquement sur l’environnement utilisateur. Binaire non signé.

Les fonctionnalités et limites (prébuild, contrôleurs override, pas de WebSocket) sont détaillées dans EXTENSIONS.md. Les données restent dans %APPDATA%/local.vrc-avatar-vault.app, indépendamment de l’installation. Une sauvegarde SQLite vérifiée précède les migrations.

## Empreintes SHA-256

```
5caa2d39b479cf2102597f1c04ce836c53aec3d28987579d9684b265928e79c2  VRC-Avatar-Vault-0.5.0-Setup.exe
4ad866d87c210a8aa6d7cac2f61ca3c1630dc7fb4f3774b2ca17b8bc8f03ffb0  VRC-Avatar-Vault-0.5.0.exe
e1bd2c81d9cf4265c518d8b4d1e79200399837feeecd17bb97e449800be39c88  VRC-Avatar-Vault-Unity-Bridge-0.1.0.tgz
752b43944e3577bcd2e341908e4fe361f7d64e7f2f5a04de0778dae00e48bdf5  VRC-Avatar-Vault-Unity-Bridge-0.1.0.zip
```
