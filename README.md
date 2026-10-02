# VRC Avatar Vault

Application desktop locale pour gérer les avatars VRChat, leurs versions de développement et leurs changelogs. Tauri 2, React, TypeScript strict, Vite, Tailwind CSS 4, composants shadcn/ui fondés sur Radix, Lucide, TanStack Query, Zustand, React Hook Form, Zod, date-fns et SQLite.

## Version 0.8.1

[Télécharger la dernière version](https://github.com/KioQc/vrc-avatar-vault/releases/latest). Dépôt et versions publics ; aucun compte GitHub requis dans l’application.

Installer : `release/VRC-Avatar-Vault-0.8.1-Setup.exe`. Portable : `release/VRC-Avatar-Vault-0.8.1.exe`. Données conservées dans le même dossier AppData lors des mises à jour.

Studio disponible sous **Avatar → Development** : surveillance, snapshots/inspecteurs, bugs, sessions, dépendances et notes de version. [Fonctions et limites](EXTENSIONS.md). [Installer Unity Bridge](unity-bridge/com.vrcavatarvault.bridge/README.md). [Protocole local](docs/LOCAL-API.md).

Refonte desktop : [interface, raccourcis et vérifications](docs/UI-REDESIGN.md).

Mises à jour signées via GitHub : [fonctionnement et publication](docs/GITHUB-UPDATES.md).

Centre de mises à jour local : [utilisation et préparation des prochaines versions](docs/UPDATES.md).

## Communauté et support

Rejoins le [Discord VAV](https://discord.gg/evvAZQzjPt) pour les annonces, les patch notes, le support et les suggestions. Le serveur est actuellement francophone.

## Démarrer

### Application Windows

Ouvrir l’exécutable livré dans `release/` lorsqu’il est présent. Microsoft Edge WebView2 Runtime doit être installé. La première ouverture propose de connecter VRChat ou de continuer hors ligne.

1. Ouvrir **Settings → VRChat account** et saisir les identifiants dans l’application native.
2. Compléter le challenge TOTP, email OTP ou code de récupération si VRChat le demande.
3. Choisir **Import Avatar**, saisir un ID `avtr_<UUID>`, récupérer l’aperçu et confirmer l’import.
4. Ajouter des changements, créer une release, rafraîchir les métadonnées et exporter le changelog.

Le compte doit avoir accès à l’avatar. Un avatar privé ou supprimé peut rester inaccessible même avec un identifiant valide. L’ID donné dans le cahier des charges n’est pas présumé public.

### Depuis les sources

Prérequis : Node.js 22.12+ ou 24+, Rust stable MSVC, Visual Studio Build Tools avec **Desktop development with C++**, Windows 10/11 SDK (headers **et** bibliothèques), WebView2 Runtime.

```sh
npm ci
npm run desktop
```

Pour compiler :

```sh
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
npm run desktop:build
```

Le build Tauri produit un installeur NSIS sous `src-tauri/target/release/bundle/nsis`. Pour produire seulement le binaire autonome avec les ressources web embarquées :

```sh
npm run build
cargo build --release --features custom-protocol --manifest-path src-tauri/Cargo.toml
```

Sous Linux, installer les dépendances Tauri de la distribution (WebKitGTK 4.1, GTK, OpenSSL/libsecret et outils C/C++), disposer d’un service Secret Service actif, puis utiliser `npm run tauri -- build --bundles deb`. La découverte automatique du dossier OSC est propre à Windows ; l’import JSON OSC est disponible sur les autres plateformes. Le build Linux n’a pas été vérifié dans cette session Windows.

## Développement sans compte

```sh
npm run dev:mock
```

Un bandeau **DEVELOPMENT FIXTURES** identifie ce mode. Il utilise une base SQLite WebAssembly isolée dans le stockage du navigateur, pas la base desktop. Les trois fixtures sont dans `src/fixtures/` :

- PC + Quest : `avtr_8c63ff8d-da1e-415a-912b-585ab866938f`
- PC : `avtr_00000000-0000-4000-8000-000000000002`
- Quest privé : `avtr_00000000-0000-4000-8000-000000000003`

La première fixture réutilise volontairement l’ID de l’exemple ; son nom, son auteur et ses métadonnées sont **fictifs**. Aucune fixture n’est substituée à une réponse réseau dans le mode desktop ou dans le build de production. `npm run dev` sert l’interface normale ; les opérations natives nécessitent `npm run desktop`. Les pièces jointes et les dossiers système se testent dans l’application desktop.

## Fonctions

- Dashboard calculé sur les données locales ; favoris, recherche, grille/liste, filtres, tri, archive et opérations groupées.
- Import avec aperçu, validation des IDs, dédoublonnage SQL, import séquentiel de plusieurs IDs et lecture du presse-papiers sur action explicite.
- Connexion VRChat, restauration de session, TOTP, email OTP, recovery code et déconnexion.
- Changelog avec plusieurs catégories, importance, plateforme, date, édition, suppression, duplication et déplacement vers une release.
- Releases SemVer distinctes de la version interne VRChat, sélection des changements non publiés, comparaison entre releases.
- Snapshots immuables à chaque import/refresh, comparaison des champs significatifs et des packages, historique consulté à la demande. Aucune entrée automatique sans confirmation.
- Notes Markdown avec autosave, tâches/priorités, conversion d’une tâche terminée en changement, tags personnels.
- Lecture de la configuration OSC locale, import JSON OSC, snapshots et différences de paramètres.
- Galerie locale PNG/JPEG/WebP, catégories, couverture locale indépendante de VRChat, images Before/After associées aux changements.
- Export Markdown, messages Discord découpés à 2 000 caractères, exports JSON d’avatars ou de la base complète, restauration transactionnelle avec sauvegarde de sécurité.
- Activité filtrable, palette Ctrl+K, import Ctrl+I, thèmes et accent, cache/rafraîchissement automatique configurables, logs sans secrets.

## Architecture

```text
src/
  api/          VRChatApiClient : unique façade réseau TypeScript
  components/   AvatarCard, command palette, composants UI Radix/shadcn
  db/           bridge IPC, repository SQL, moteur SQLite de développement
  features/     avatars, changelogs, snapshots, vrchat
  hooks/        TanStack Query et mutations
  layouts/      shell desktop, navigation, scheduling des refresh
  pages/        dashboard, collection, détail, activité, tags, settings
  services/     sync, fichiers, sauvegardes
  stores/       état UI Zustand (aucun secret)
  types/        schémas Zod et types du domaine
  utils/        validation, diff, SemVer, exports et dates
src-tauri/
  src/api.rs    HTTP VRChat, cookies, keyring, queue/retries, images
  src/db.rs     connexion SQLite, transactions, migrations et safety backup
  src/files.rs  fichiers locaux, OSC, pièces jointes
  src/logs.rs   diagnostics à contenu fixe, rotation limitée
  migrations/   migrations SQL versionnées
  capabilities/ permissions Tauri de la fenêtre locale
```

Tous les appels VRChat passent par `VRChatApiClient`, puis par une commande Rust à liste d’opérations autorisées. Il n’existe aucune opération de suppression, publication ou modification d’avatar VRChat. L’accès SQLite est concentré dans le repository ; aucun SQL n’est dispersé dans les composants.

Le profil actuel utilise des colonnes indexées pour les champs locaux et un `data_json` validé pour les métadonnées API, plutôt qu’une colonne par propriété externe. Les releases, changelogs, tags, tâches, pièces jointes et relations restent normalisés. Les snapshots contiennent le JSON normalisé avec les propriétés inconnues non sensibles conservées. Le choix évite de migrer la base à chaque extension du schéma communautaire.

## SQLite et données locales

Tauri résout `app_data_dir()` pour l’identifiant `local.vrc-avatar-vault.app`. Le chemin exact est affiché dans Settings ; aucun chemin utilisateur n’est codé en dur.

```text
app_data_dir/
  database.sqlite
  attachments/
  cache/
  backups/
  logs/
```

SQLite active WAL, les foreign keys et un délai d’attente. `PRAGMA user_version` pilote les migrations. Les imports, refresh, créations de releases, suppressions et restaurations utilisent des transactions. L’unicité du VRChat ID et des versions par avatar est garantie par la base. Une clé étrangère composée empêche d’attacher une entrée à la release d’un autre avatar.

Les images sont copiées sous un nom UUID, validées par signature et limitées à 20 Mo. La base stocke seulement leur chemin relatif et leurs métadonnées. Détacher une image conserve le fichier physique pour ne pas invalider les sauvegardes SQLite de sécurité. Les fichiers orphelins peuvent donc prendre de la place ; aucun nettoyeur destructif automatique n’est activé.

La grille est paginée, le rendu de la timeline est incrémental et le JSON des snapshots VRChat n’est chargé qu’à l’ouverture d’un snapshot. Le catalogue et les entrées locales sont chargés en mémoire pour la recherche et les statistiques ; pour des volumes très supérieurs à quelques milliers d’entrées, une pagination SQL et FTS seraient la prochaine optimisation. Les vues de snapshots affichent les 500 derniers snapshots VRChat et les 100 derniers OSC ; les sauvegardes conservent tous les enregistrements.

## Authentification et sécurité

Le mot de passe sert uniquement à la requête Basic initiale. Username et password sont encodés individuellement selon le schéma communautaire, puis le couple est encodé en Base64. Le champ mot de passe est vidé à la fin de la tentative. Les codes 2FA ne sont pas persistés.

Les cookies `auth` et `twoFactorAuth` restent dans le client Rust. Leur restauration utilise Windows Credential Manager, macOS Keychain ou Linux Secret Service via `keyring`. Aucun secret ne va dans SQLite, localStorage, les exports, les logs ou le JSON technique. Le client renvoie à React seulement l’identité utile du compte. Les noms de propriétés susceptibles de contenir un secret sont retirés des métadonnées exportables.

Une erreur du coffre système est affichée, sans recours silencieux à un stockage en clair. La durée d’expiration est vérifiée par VRChat lors de la restauration de session ; les refus 401 nécessitent une reconnexion. Logout efface aussi les informations locales, même si le serveur est inaccessible ; dans ce dernier cas, la révocation distante ne peut pas être confirmée.

Les requêtes sont sérialisées côté Rust, espacées d’au moins 750 ms, avec timeout de 30 secondes. Les lectures peuvent être reprises jusqu’à trois fois sur 429/5xx avec backoff et jitter. `Retry-After` accepte secondes et date HTTP ; au-delà de 120 secondes, l’action s’arrête et indique le délai plutôt que de réessayer trop tôt. Login et vérification 2FA ne sont pas automatiquement répétés.

Les images VRChat passent par un proxy natif à domaines HTTPS autorisés et cache local de 24 h, pour utiliser la session sans exposer les cookies au navigateur. Les images dont l’hôte change vers un domaine non autorisé affichent un placeholder. Les URLs d’assets Unity ne sont pas téléchargées.

Les diagnostics journalisent seulement des événements fixes et timestamps, jamais les payloads HTTP. La CSP n’autorise pas de scripts externes ; Markdown n’exécute pas de HTML brut. Les permissions Tauri sont limitées à la fenêtre principale. La base et les backups contiennent des notes privées : leur protection au repos repose sur votre compte et le chiffrement système, ils ne sont pas chiffrés séparément.

## Snapshots et différences

Un refresh suit : fetch → validation → calcul du diff → transaction snapshot + packages + profil → affichage des différences. Si une étape échoue, le profil déjà enregistré reste disponible.

Le moteur compare version, nom, description, statut, images, tags, styles, performance et packages. Les packages sont regroupés par plateforme, variante et compatibilité Unity. Le changement d’Unity apparaît comme disparition/apparition du groupe correspondant. L’ordre des tableaux et les dates de capture ne créent pas de faux changements. Les snapshots passés ne sont jamais modifiés.

## Sauvegarde et restauration

Le format JSON est versionné : `format: "vrc-avatar-vault"`, `version: 1`, avec `scope`, tables relationnelles et images encodées en Base64 pour le transport uniquement. C’est un format de migration/export ; les images actives ne sont jamais des BLOB SQLite.

Un export d’avatar filtre ses relations et inclut ses historiques. Son import n’écrase pas un tracker déjà présent : la transaction entière échoue en cas de conflit. Un backup `scope: vault` remplace la base logique après confirmation. Avant toute restauration, SQLite crée une copie de sécurité cohérente dans `backups/`. Les pièces jointes importées reçoivent de nouveaux noms ; les anciennes restent disponibles pour les copies de sécurité. Une restauration invalide annule les écritures SQL.

Pour revenir manuellement à une copie `.sqlite`, fermer l’application, préserver la base actuelle et ses fichiers WAL/SHM dans un autre dossier, copier la sauvegarde sous `database.sqlite`, puis relancer. Garder le dossier `attachments/` associé. Préférer la restauration JSON pour une migration normale.

## API communautaire et limites

La Web API VRChat n’est pas une API développeur officiellement stable. Le 29 septembre 2026, l’implémentation a été vérifiée contre les sources du projet de spécification :

- [Authentification, cookies et endpoints 2FA](https://github.com/vrchatapi/specification/blob/master/openapi/components/paths/authentication.yaml)
- [Schéma Avatar](https://github.com/vrchatapi/specification/blob/master/openapi/components/schemas/Avatar.yaml)
- [Schéma UnityPackage](https://github.com/vrchatapi/specification/blob/master/openapi/components/schemas/UnityPackage.yaml)
- [Documentation communautaire VRChat](https://vrchat.community/)
- [Commandes Rust Tauri 2](https://v2.tauri.app/develop/calling-rust/)

Les réponses 400/401/403/404/429/5xx, timeout et réseau indisponible sont traitées explicitement. Le logiciel ne contourne pas les restrictions d’accès, ne scrape pas le site et ne promet pas de retrouver les données privées d’un avatar inaccessible. Les champs absents sont normalisés sans inventer de paramètres OSC ni de valeurs de performance.

La connexion réelle et l’import privé ont été confirmés par l’utilisateur, puis la session a été retrouvée après redémarrage. Tous les types de challenge 2FA ne sont pas testés séparément en conditions réelles. Voir `VERIFICATION.md` pour les vérifications effectivement exécutées et leurs limites.

## Évolutions

Unity/VCC, VRCX, OSC live, Git, webhooks Discord et synchronisation GitHub ne sont pas implémentés. Les services, identifiants internes et snapshots sont séparés pour pouvoir ajouter ces intégrations sans coupler l’interface à l’API VRChat.

## Mise à jour du 30 septembre 2026

- Settings > VRChat sync > Every 30 seconds : suit les uploads des avatars importés tant que l’application reste ouverte et connectée. Ignore le cache habituel ; erreurs et limites API ralentissent les requêtes. Aucun snapshot supplémentaire pour les vérifications identiques.
- Badges natifs PC/Quest/iOS, icônes, version API et performances par plateforme. Les impostors restent dans Technical/JSON sans annoncer de support natif.
- Bouton View avatar JSON et onglet JSON, valeurs originales conservées.
- Create Release génère le nom local Base v1.1.3. Une case décochée par défaut permet aussi de renommer sur VRChat : seul name est envoyé par PUT /avatars/{id}. La version API entière reste indépendante du SemVer local. Une erreur distante laisse la release locale enregistrée et permet de réessayer sans la dupliquer. Le compte propriétaire doit être connecté.
- OSC : lecture automatique à l’ouverture et toutes les 30 secondes, recherche, snapshots et import manuel. Le marqueur UTF-8 BOM du fichier réel est accepté. Sans connexion, découverte si un seul profil correspond ; sinon connexion au bon compte ou import manuel.
- OSC inspecte les configurations, pas les paquets UDP en direct. VRChat doit générer le fichier en portant l’avatar publié avec OSC activé. https://docs.vrchat.com/docs/osc-avatar-parameters
- Interface : badges colorés, cartes interactives, panneaux et transitions respectant la réduction des animations.

La connexion réelle, l’import et la restauration de session ont été validés avec l’utilisateur. Le renommage est testé avec un transport simulé ; aucun nom distant n’est changé pour effectuer un test.

## Installation Windows et conservation des données (0.2.0)

Lancer `VRC-Avatar-Vault-0.2.0-Setup.exe`. L’installation est pour le compte Windows courant, avec raccourci et désinstalleur. Pour mettre à jour, fermer l’application puis lancer le nouvel installateur au même emplacement ; ne pas effacer le dossier des données.

Les versions portable et installée emploient le même identifiant stable `local.vrc-avatar-vault.app` et le même dossier `%APPDATA%\local.vrc-avatar-vault.app`. Le programme se trouve séparément dans `%LOCALAPPDATA%\VRC Avatar Vault`. Déplacer/remplacer le programme n’efface donc pas la base, les images ni les réglages.

Au premier démarrage d’une nouvelle version sur une base existante, une copie SQLite cohérente (incluant le WAL) est créée dans `backups/before-update-*.sqlite` et vérifiée avant migration. La version appliquée est enregistrée après succès de la transaction. Une base dont le schéma est plus récent est refusée sans réinitialisation. Les pièces jointes restent dans `attachments` et ne sont jamais remplacées par l’installateur.

Settings > Storage & backup affiche les emplacements et fournit Open data folder, Safety backups et Export database backup. L’export JSON complet inclut aussi les images et peut être conservé sur un autre disque. Les copies SQLite avant mise à jour protègent la base, mais ne dupliquent pas les images. Une panne du disque ou une suppression volontaire du dossier reste possible : conserver un export externe pour s’en protéger.

Le désinstalleur conserve les données par défaut. Cocher explicitement « Supprimer les données de l’application » les supprime ; ne pas le cocher pour les retrouver après réinstallation. En mode mise à jour, le script ne supprime pas les données.

Le runtime WebView2 est utilisé s’il est déjà présent ; sinon l’installateur peut le télécharger. L’installateur est compilé, mais son installation réelle sur le compte Windows de l’utilisateur n’est pas effectuée automatiquement.

## VRChat Center et OSC — 0.3.0

Nouveau menu VRChat Center avec cinq onglets :

- Session : version du client trouvée dans le journal local, dernier monde/instance enregistré, ports OSC/OSCQuery, date de modification, événements et compte des lignes warning/error. Les données sont celles du dernier journal, pas un indicateur certain de présence en jeu. Lecture bornée au début (256 Ko) et à la fin (512 Ko), rafraîchie toutes les 10 secondes sur cet onglet.
- API : champs sélectionnés du profil connecté, inspection d’un monde par ID et métadonnées complètes d’un avatar suivi. Les champs absents restent inconnus. Aucun email, mot de passe, cookie ni champ de facturation n’est renvoyé par la commande profil. Actualisation du profil manuelle avec cache d’une minute ; les requêtes mondes sont déclenchées par le bouton Fetch world.
- OSC live : réception UDP sur 127.0.0.1, port configurable (9001 par défaut), démarrage/arrêt explicites. Affiche les valeurs reçues, types, timestamps, historique récent, courbe des valeurs numériques, filtres et export. Aucun paquet de contrôle n’est envoyé à VRChat. Un conflit de port est signalé sans interrompre les autres outils. Pour utiliser un autre port, configurer la sortie de VRChat ou le forwarding de votre outil OSC existant. Pas de découverte OSCQuery/mDNS automatique pour ce récepteur.
- OSC config : sélection de l’avatar, nombre de paramètres, directions entrée/sortie, filtres Bool/Int/Float, détails d’un paramètre, adresses copiables, JSON complet et historique. Les snapshots importés sont distingués des fichiers locaux ; le bouton Refresh OSC data reprend la lecture locale.
- OSCQuery : lit sur demande le service local annoncé dans le journal de VRChat. Affiche arborescence aplatie, chemins, types, accès, descriptions et valeurs rapportées à l’instant de la requête, avec JSON. Requête exclusivement à 127.0.0.1, sans proxy/cookies ni redirection, timeout de 4 secondes et limite de 2 Mo.

Le moniteur OSC conserve au maximum 1 024 adresses et 200 messages récents en mémoire ; il reste actif entre les onglets jusqu’à Stop ou fermeture de l’application. Les valeurs ne sont rattachées à un avatar qu’après réception de /avatar/change et sont réinitialisées lors d’un changement d’avatar. Un émetteur local quelconque peut produire des paquets : l’étiquette décrit la réception OSC, pas une authentification de l’émetteur. Les bundles sont affichés à la réception, sans exécuter leurs timetags. Types usuels VRChat supportés (f/i/s/T/F), ainsi que d/h/t/S/r/m/c/b/N/I ; les types non pris en charge, dont les tableaux OSC, sont comptés comme rejetés.

L’application ne mesure pas les FPS/GPU ni la mémoire du jeu, ne lit pas les positions d’autres joueurs et ne contourne pas les restrictions de l’API. Les rapports exportés peuvent contenir votre monde/instance et vos paramètres ; ils restent locaux tant que vous ne les partagez pas.

Références : https://docs.vrchat.com/docs/osc-overview ; https://docs.vrchat.com/docs/osc-avatar-parameters ; https://docs.vrchat.com/docs/oscquery ; https://docs.vrchat.com/docs/local-vrchat-storage ; https://opensoundcontrol.stanford.edu/spec-1_0.html


## 0.4.0 — versions cumulatives, dossiers et Unity
Le mode Increment additionne chaque composante (1.0.0 + 0.1.0 = 1.1.0 ; à nouveau = 1.2.0), sans remise à zéro des composantes suivantes. Les modes SemVer patch/minor/major conservent leurs règles classiques ; Exact version reste disponible. Les suffixes prerelease/build sont retirés en mode incrément. Un réessai de renommage distant conserve la version locale déjà créée.
Settings propose les valeurs par défaut et des sélecteurs natifs pour exports, sauvegardes JSON, racine OSC, captures, projets et Unity.exe. La base/les images restent dans AppData, pas dans les dossiers choisis pour les exports. Les anciens fichiers ne sont pas déplacés.
Development lie un projet Unity à l'avatar et conserve les snapshots de dépendances quand le contenu change. Le scan lit uniquement les fichiers de métadonnées ; le lancement explicite de Unity peut déclencher une importation par Unity. La suite du document d'extensions est planifiée dans [EXTENSIONS.md](EXTENSIONS.md), sans contrôles factices pour les fonctions futures.
