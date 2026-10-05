# Aperçu 0.8.5-preview.3 — ouverture réelle via VCC

Open project via VCC démarre Creator Companion puis transmet l’identifiant du projet enregistré à son service local : POST /api/commands/openUnityProject. VCC choisit l’éditeur selon ses propres réglages. VAV ne lance plus Unity.exe et ne demande plus de chemin d’éditeur pour cette action.

Le contrat a été vérifié dans le frontend installé de VCC 2.4.5 : GET /api/projects fournit ProjectId et Path, et la commande d’ouverture reçoit id. Origin/Referer du frontend local sont nécessaires. API attendue sur localhost:5477, interface sur localhost:5476 ; une configuration différente ou une API future incompatible affiche une erreur. Pas de repli vers Unity directement, pas de migration ni ajout implicite d’un projet.

Le projet doit déjà être enregistré dans VCC (Add Existing Project sinon). La comparaison utilise les chemins canoniques. Un échec de communication lors de l’ouverture ne provoque pas de nouvelle tentative automatique du POST, afin d’éviter un double lancement.

Vérification réelle effectuée : lecture réussie de la liste des projets VCC. L’ouverture interactive d’un projet utilisateur reste à confirmer dans cet aperçu. La version publique reste 0.8.4.
