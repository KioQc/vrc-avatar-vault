# Panneau propriétaire VAV — aperçu local 0.8.4-preview.1

Ce document décrit l’aperçu local initial. Le [panneau Cloudflare et l’aperçu 0.8.4-preview.2](CLOUDFLARE-OWNER.md) sont disponibles séparément avec le sous-domaine validé par le propriétaire.
La release publique reste 0.8.3. Le panneau propriétaire est un service séparé ; aucune clé propriétaire n’entre dans l’exécutable VAV.

## Utiliser sur ce PC

1. Lancer `admin/Ouvrir-le-panel.cmd` (Node.js 24 requis). Garder sa fenêtre ouverte.
2. Ouvrir <http://127.0.0.1:14830>.
3. Copier la clé du fichier `.vav-admin/owner-secret.txt` dans le champ de connexion. Ne pas partager cette clé. Elle est créée aléatoirement au premier démarrage, jamais affichée dans les journaux ni versionnée.
4. Fermer VAV avant d’ouvrir `release/VRC-Avatar-Vault-0.8.4-preview.1-Owner-Local.exe`. Cette version portable utilise le même dossier de données que la version installée et les sauvegardes de sécurité habituelles.
5. Dans **Settings → Confidentialité · Statistiques facultatives**, lire les données proposées, puis activer le partage si souhaité. Le destinataire de cet aperçu est uniquement `http://127.0.0.1:14830`.

La première session apparaît immédiatement après l’activation. Les compteurs API sont envoyés toutes les 15 minutes ; le panneau relit ses données toutes les 30 secondes. Ils ne sont pas des mesures en temps réel de VRChat. La collecte reste désactivée tant que le consentement n’est pas activé.

Le service écoute uniquement l’interface locale du PC. Arrêt : Ctrl+C dans sa fenêtre. Relancer le script conserve les statistiques et la clé, mais invalide les connexions propriétaire précédentes. Les données du panneau sont dans `.vav-admin/stats.sqlite`, séparées du coffre d’avatars. Pour déplacer ce dossier, définir `VAV_ADMIN_DATA` lors du lancement direct du serveur.

## Mesures disponibles

- Installations participantes actives sur 30 jours et sur les dernières 24 heures ; ce ne sont pas des personnes uniques.
- Sessions de VAV avec consentement, activité quotidienne UTC et versions utilisées. Une installation mise à jour peut apparaître dans plusieurs versions.
- Requêtes vers l’API VRChat principale : login, session, profile, world, verify2fa, logout, avatar, rename_avatar.
- Réponses 2xx, erreurs client, erreurs serveur, 429, délais dépassés et problèmes réseau. Les nouvelles tentatives sont comptées comme des requêtes physiques distinctes.
- Durée moyenne jusqu’à réception des en-têtes HTTP. Le décodage du JSON, les téléchargements d’images et les API IA/GitHub ne sont pas mesurés.
- Export JSON des agrégats du panneau après authentification.

Il n’y a aucune donnée historique des versions 0.8.3 ou antérieures. Pas de liste de noms, comptes VRChat, e-mails ou avatars d’autres personnes. Pas d’inférence « téléchargements = utilisateurs ». Les statistiques sont déclarées par les clients et peuvent être incomplètes ou falsifiées.

## Consentement et conservation

- Désactivé par défaut ; sans collecteur configuré, impossible d’activer le partage et aucun envoi.
- Identifiant aléatoire de 256 bits par participation, sans identifiant matériel ou VRChat. Le serveur ne conserve que son empreinte SHA-256 ; elle permet la déduplication et la suppression.
- Corps JSON strictement limité à schema, session aléatoire, jour UTC, version VAV et compteurs par opération/résultat. Champs inconnus, valeurs excessives et doublons de catégories refusés.
- Aucun cookie VRChat, jeton API, URL de requête, contenu de requête/réponse, journal, chemin local ou donnée d’avatar transmis.
- Préférence et justificatif de retrait dans un fichier `participation-<empreinte du collecteur>.json` du dossier AppData. Ils sont séparés des exports de coffre et des ZIP de diagnostic. Un nouveau collecteur exige un nouveau consentement.
- Retrait : arrêt immédiat des mesures, suppression des agrégats de cette installation et abandon des compteurs locaux. Si le serveur est indisponible, demande conservée et réessayée toutes les 15 minutes lorsque VAV fonctionne, y compris après redémarrage. Impossible de réactiver avant la confirmation de suppression.
- Conservation des rapports : 90 jours à compter du dernier envoi de leur session/jour, nettoyage horaire et au démarrage. Le panneau affiche les 30 derniers jours. L’empreinte d’une participation retirée reste 90 jours pour bloquer d’anciens envois en retard ; elle ne contient aucun compteur.
- Les adresses IP sont nécessaires au transport et utilisées temporairement pour limiter les requêtes, sans journalisation ni stockage dans SQLite. Un futur hébergeur/proxy peut avoir ses propres journaux : les configurer et mettre à jour l’information de consentement avant ouverture publique.
- Les compteurs non encore envoyés sont en mémoire seulement : fermer/crasher VAV ou changer de jour UTC peut perdre le dernier intervalle. Pas de tentative d’envoi bloquante à la fermeture.

## Accès propriétaire et protection du service

Authentification côté serveur avec clé aléatoire privée ; comparaison d’empreintes en temps constant. Aucun accès aux statistiques sans authentification. Session d’une heure, cookie HttpOnly et SameSite=Strict (Secure en HTTPS), déconnexion qui révoque la session, pas de clé dans localStorage ni dans l’URL. Rotation : arrêter le service, remplacer la clé privée et redémarrer ; les anciennes sessions sont invalidées.

Vérification de Host et Origin, CSP restrictive, aucune ouverture CORS, requêtes de collecte refusées si elles proviennent d’un navigateur, schéma strict, limite de corps 16 Kio, délais de lecture, quotas de requêtes et de stockage. Les limites par IP utilisent l’adresse du socket et n’accordent aucune confiance aux en-têtes X-Forwarded-For. À adapter au proxy avant usage à grande échelle. Le collecteur public ne peut pas prouver qu’une requête vient d’une vraie installation : ces métriques ne doivent pas servir à la facturation ou à un contrôle d’accès.

## Préparer le futur hébergement

Choisir un serveur Node.js 24 avec stockage persistant et une adresse HTTPS. Garder Node sur 127.0.0.1 derrière un reverse proxy ; définir `VAV_ADMIN_ORIGIN=https://stats.votre-domaine` et faire préserver ce Host par le proxy. Ne jamais exposer directement le port HTTP sur Internet. Restreindre idéalement `/owner/*` au VPN/IP du propriétaire en plus de la connexion. Adapter les limites réseau, les sauvegardes et leur rétention, la supervision et les journaux du proxy.

Configurer `VAV_TELEMETRY_URL=https://stats.votre-domaine` **au moment de compiler VAV**, puis reconstruire et tester l’exécutable signé. Cette adresse n’est pas un secret. Ne jamais inclure `VAV_OWNER_SECRET` dans la compilation desktop. Sans `VAV_TELEMETRY_URL`, les versions compilées restent sans collecte. L’aperçu local ne doit pas être publié comme mise à jour publique : 127.0.0.1 désignerait le PC de chaque utilisateur.

Le panneau utilise le module SQLite fourni par Node ([documentation officielle](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)), encore signalé expérimental par Node 24.11.1 testé ici. Aucun paquet npm serveur supplémentaire.

## Vérifications

Tests Node : authentification, refus sans clé, origine étrangère, Host invalide, déconnexion, déduplication HTTP, séparation des installations, suppression et refus des envois après retrait, changement de jour, expiration, persistance SQLite après redémarrage, schéma strict.

Tests Rust : aucune mesure sans consentement, liste de champs autorisés, changement de collecteur, émission HTTP, échec de suppression puis reprise après redémarrage. Tests de régression de l’application et compilation frontend/backend également exécutés. Le parcours natif manuel et les véritables requêtes VRChat de l’aperçu restent à valider sur le PC ; aucun consentement de l’utilisateur n’a été activé automatiquement.

Résultat local : **122 tests réussis** (74 frontend, 40 Rust, 5 panneau propriétaire et 3 Discord), TypeScript et ESLint sans erreur, builds Vite et Rust release réussis. L’exécutable portable de l’aperçu fait 19 147 776 octets ; SHA-256 : `FAE3208C682A7AD306C5180C2C22792BB10D59B6B47A06D683C755C11579A4D3`. Il n’est pas publié dans le flux de mises à jour.

```powershell
npm run test:admin
npm run typecheck
npm run lint
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
```
