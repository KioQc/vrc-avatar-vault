# Déploiement sur un VPS Linux — préparation

Ce dossier est un modèle pour un futur serveur avec systemd, Node.js 24 et Caddy 2. Il n’a pas été exécuté sur un hébergeur et aucun domaine n’a été réservé. Le service local actuel continue à fonctionner indépendamment.

## Fichiers et séparation

- `/opt/vav-owner/` : `server.mjs`, `report-schema.mjs`, `index.html`, `dashboard.js`, `style.css`, appartenant à root et lisibles par le service. Aucun fichier personnel du PC à copier.
- `/var/lib/vav-owner/` : SQLite et clé propriétaire créée au premier démarrage, dossier persistant réservé au compte système `vav-owner`.
- `/etc/vav-owner.conf` : origine HTTPS réelle, d’après le modèle fourni.
- `/etc/systemd/system/vav-owner.service` : service fourni, exécuté sans privilèges root et redémarré en cas d’échec.
- Caddy : bloc fourni à ajouter à la configuration existante après remplacement du domaine. Ne pas écraser une configuration qui héberge déjà d’autres sites.

Le fichier `owner-secret.txt` reste sur le serveur ; il ne doit être ni ajouté au dépôt GitHub ni livré dans VAV. La clé de ton panneau local n’est pas utilisée sur le serveur public. Récupérer la nouvelle clé par un accès SSH autorisé, puis la saisir dans le panneau HTTPS.

## Conditions avant démarrage

1. Disposer du serveur, de son accès SSH et d’un sous-domaine choisi. Installer Node.js 24 et Caddy via leurs instructions officielles, puis vérifier le chemin `/usr/bin/node`.
2. Faire pointer les enregistrements DNS A/AAAA du sous-domaine vers le serveur. Ne pas garder un AAAA qui pointe vers une autre machine.
3. Autoriser 80/443 vers Caddy, garder 14830 inaccessible depuis Internet et préserver l’accès SSH. Node écoute exclusivement sur 127.0.0.1.
4. Créer le compte système sans connexion `vav-owner`, installer les fichiers aux emplacements indiqués, remplacer `stats.example.com` dans les deux modèles, puis vérifier les permissions.
5. Valider le service avec `systemd-analyze verify /etc/systemd/system/vav-owner.service`, et la configuration Caddy avec `caddy validate --config /etc/caddy/Caddyfile`.
6. Démarrer le service (`systemctl daemon-reload`, puis `systemctl enable --now vav-owner`) et recharger Caddy après validation.
7. Vérifier HTTPS et l’accès privé avec `node admin/check-deployment.mjs https://VOTRE-DOMAINE`, depuis une autre machine. Tester ensuite manuellement la connexion propriétaire et un cycle consentement → envoi → retrait avec un client de test avant publication.

Caddy [gère les certificats HTTPS](https://caddyserver.com/docs/automatic-https) lorsque les prérequis réseau et DNS sont satisfaits. Le [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) conserve Host et remplace `X-VAV-Client-IP` par l’adresse de sa connexion entrante. VAV n’utilise cet en-tête que si `VAV_TRUST_LOCAL_PROXY=true` et si le pair réseau est loopback. Le mode local ignore cet en-tête par défaut. Ne pas ajouter un CDN devant Caddy sans adapter et tester les règles d’adresses de confiance.

## Données et maintenance

Ne pas stocker la base dans un répertoire temporaire ou un filesystem éphémère. Remplacer les sources dans `/opt/vav-owner` conserve les données de `/var/lib/vav-owner`. Redémarrer invalide les sessions web propriétaire, sans modifier la clé. Ne pas lancer plusieurs processus Node qui écrivent dans cette même base.

Prévoir les alertes de disponibilité, l’espace disque et les mises à jour système. Les statistiques restent indicatives : les clients ne sont pas attestés et les limites applicatives ne remplacent pas une protection réseau contre les attaques massives. Les journaux d’accès sont désactivés dans le modèle Caddy ; vérifier aussi les journaux et sauvegardes de l’hébergeur. Toute sauvegarde de statistiques nécessite une politique de rétention et de suppression cohérente avec le consentement avant la collecte publique.

## Brancher la version publique

Après validation du domaine, compiler VAV avec `VAV_TELEMETRY_URL=https://VOTRE-DOMAINE`. Tester le consentement, la réception des mesures, leur retrait et la persistance après mise à jour. Mettre à jour les informations de collecte si l’hébergeur conserve des métadonnées supplémentaires. Construire et signer une nouvelle version ; ne jamais publier l’aperçu `Owner-Local.exe` comme mise à jour publique.

Le contrôle automatique fourni vérifie HTTPS, santé, accès privé et CSP. Il ne valide pas la configuration système, le renouvellement futur des certificats, les sauvegardes ou les protections réseau du serveur.
