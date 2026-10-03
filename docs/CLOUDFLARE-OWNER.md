# VAV Owner sur Cloudflare — 0.8.4

Remis en ligne le 3 octobre 2026 avec le sous-domaine choisi par le propriétaire : <https://vav-owner.kioqc.workers.dev>. Les URL de prévisualisation restent désactivées.

## Utilisation

1. Ouvrir le panneau HTTPS et saisir la clé du fichier local `.vav-admin/cloudflare-owner-secret.txt`. Cette clé diffère de celle du panneau local. Ne jamais la publier ni la transmettre dans un rapport de bug.
2. Fermer VAV, puis lancer `release/VRC-Avatar-Vault-0.8.4-Setup.exe`, recompilé avec la nouvelle adresse.
3. Dans **Settings → Confidentialité · Statistiques facultatives**, vérifier le destinataire Cloudflare et lire les informations de collecte, puis choisir explicitement de participer.

L’activation envoie une première session, puis les compteurs sont envoyés toutes les 15 minutes pendant l’exécution de VAV. Le panneau se rafraîchit toutes les 30 secondes. Aucun consentement de ce PC n’a été activé automatiquement. Les préférences sont propres à l’adresse du collecteur : un accord donné pour le serveur local n’est pas transféré vers Cloudflare.

Les versions publiques antérieures à 0.8.4 ne transmettent aucune statistique. La version 0.8.4 propose une participation facultative, désactivée par défaut.

## Déploiement réalisé

- Worker `vav-owner`, adresse workers.dev fournie par le compte Cloudflare, HTTPS géré par Cloudflare.
- Base D1 `vav-owner-stats`, créée dans la région ENAM ; cela ne garantit pas une résidence exclusive au Canada.
- Migration initiale : rapports agrégés, empreintes de retraits et sessions propriétaire.
- Clé propriétaire stockée comme secret Worker, jamais dans les fichiers publics ou le client desktop.
- Sessions propriétaire en base, cookie Secure/HttpOnly/SameSite=Strict, expiration d’une heure. Déconnexion et rotation de clé invalident l’accès.
- Corps strictement validés, limités à 16 Kio, sans noms, avatars, IDs VRChat, contenus API ni cookies VRChat.
- Déduplication atomique des snapshots ; retrait atomique et refus des envois tardifs pendant 90 jours.
- Nettoyage horaire à la minute 17 UTC. Journaux d’observabilité Worker désactivés. Cloudflare traite néanmoins les métadonnées nécessaires à son infrastructure.

Un rapport cumulé est stocké en une ligne JSON par installation/session/jour pour réduire les écritures D1. Les totaux sont calculés par SQL, sans télécharger les identifiants d’installation dans le navigateur. Les limites applicatives utilisent les bindings Rate Limiting Cloudflare ; ce sont des limites par point de présence, pas des quotas globaux exacts. Les clients restent déclaratifs : ces statistiques ne prouvent pas un nombre de personnes uniques.

## Offre gratuite et limites

Le déploiement utilise les fonctions proposées dans l’offre gratuite ; aucun abonnement payant n’a été souscrit par cette tâche. Les quotas s’appliquent à l’ensemble du compte, y compris ses autres applications. L’accès OAuth limité utilisé ici ne permet pas de consulter les abonnements du compte : vérifier le plan et la consommation dans le tableau de bord Cloudflare reste nécessaire.

- Workers Free : 100 000 requêtes par jour, avec limites CPU.
- D1 Free : 5 millions de lignes lues/jour et 100 000 lignes écrites/jour ; 500 Mo maximum pour une base, 5 Go au total sur le compte.
- D1 Time Travel Free conserve un historique de restauration jusqu’à 7 jours. Une suppression dans la base active n’efface pas instantanément cet historique géré par Cloudflare.
- Sur le plan gratuit, l’épuisement des quotas D1 entraîne des erreurs jusqu’au rétablissement du quota ; VAV affiche l’échec et réessaie sans bloquer les fonctions locales.

Sources : [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [limites et restauration D1](https://developers.cloudflare.com/d1/platform/limits/).

## Maintenance depuis le dépôt

La configuration utilise le sous-domaine validé par le propriétaire et conserve `preview_urls: false`.

Avec Node.js 24 et Wrangler installé/authentifié :

```powershell
node admin/cloudflare/prepare.mjs
wrangler d1 migrations apply vav-owner-stats --remote --config admin/cloudflare/wrangler.jsonc
wrangler deploy --no-bundle --config admin/cloudflare/wrangler.jsonc
node admin/check-deployment.mjs https://vav-owner.kioqc.workers.dev
```

`prepare.mjs` copie uniquement les trois fichiers d’interface publics et le validateur de schéma ; les clés et bases locales restent exclues. La configuration contient l’adresse et l’ID de D1, qui ne sont pas des secrets. Ne pas remplacer le secret à chaque déploiement. Pour une rotation volontaire, utiliser `wrangler secret put OWNER_SECRET --config admin/cloudflare/wrangler.jsonc` et conserver la nouvelle clé de manière privée.

Compiler le client avec `VAV_TELEMETRY_URL=https://vav-owner.kioqc.workers.dev` dans l’environnement de compilation Rust. L’adresse sera visible dans le client : elle ne doit contenir aucune information personnelle. Ne jamais utiliser la clé propriétaire pour configurer le client.

## Vérifications réalisées

Le nouveau domaine a été vérifié en HTTPS : protection du panneau, connexion propriétaire, déduplication, retrait et refus des envois après retrait. Les données de test ont été supprimées.

- Tests SQL locaux du Worker : authentification, rotation et révocation des sessions, snapshots répétés ou anciens, retrait, refus des replays, payloads inconnus/trop grands, Origin, limitation de débit, nettoyage et erreurs D1 sans fuite de détails.
- Tests HTTPS sur le vrai déploiement : santé, refus des statistiques sans connexion, en-têtes de sécurité, connexion propriétaire, deux envois identiques, suppression de la participation et refus d’un nouvel envoi avec sa clé retirée.
- Les données de l’installation synthétique de vérification ont été supprimées et sa session propriétaire déconnectée. Seule l’empreinte de retrait temporaire reste selon la politique prévue.
- Le parcours visuel natif, les vraies requêtes VRChat et le consentement dans le nouvel exécutable restent à tester manuellement. Les tests HTTP ne remplacent pas cette validation.

Les sauvegardes, la montée en charge et les protections contre une attaque distribuée doivent être évaluées avec l’usage réel. Il n’y a pas de garantie de disponibilité illimitée sur une offre gratuite.
