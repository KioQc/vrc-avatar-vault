# Annonces de versions

Le script `scripts/discord-release.mjs` lit une release stable déjà publiée de `KioQc/vrc-avatar-vault`, puis prépare un message pour releases et un pour patch-notes. Il refuse les brouillons, préversions et versions sans installateur. Les mentions automatiques sont désactivées.

## Depuis le PC

Prévisualiser sans envoyer :

```powershell
node scripts/discord-release.mjs v0.8.2
```

Après publication de cette version, envoyer avec le fichier privé de configuration :

```powershell
$env:VAV_DISCORD_WEBHOOKS_FILE = 'CHEMIN_DU_FICHIER_PRIVE_HORS_DEPOT'
node scripts/discord-release.mjs v0.8.2 --send
```

Le fichier contient les clés `releases` et `patch-notes` associées aux webhooks. Ne pas mettre les adresses dans le terminal, les captures ou Git. Le fichier effectivement configuré pour cette session est conservé dans le dossier de travail, hors du dépôt de l’application.

Le dossier `.discord-delivery`, ignoré par Git, conserve les confirmations. Un second envoi identique est ignoré. Si le contenu a changé, le script demande de modifier le message existant. Une coupure réseau laisse une confirmation « pending » : vérifier le salon avant de supprimer ce fichier et de réessayer. Cette protection est locale ; conserver ce dossier.

## GitHub Actions

Le workflow Discord utilise les secrets `DISCORD_RELEASES_WEBHOOK` et `DISCORD_PATCH_NOTES_WEBHOOK`. Il est prévu pour les publications manuelles de releases et pour les publications du pipeline. GitHub Actions reste bloqué par le problème de facturation du compte : aucun envoi automatique en arrière-plan n'est actuellement opérationnel.

Les confirmations sont sauvegardées comme artefact du run pour permettre un contrôle après un échec. Les relances manuelles ne récupèrent pas automatiquement les confirmations d'un ancien run : vérifier les salons avant une relance pour éviter les doublons. Le script local constitue le mode d'envoi actuellement utilisable.

## Configuration Discord

Les webhooks doivent cibler des salons texte. Ils permettent d'écrire dans leur salon, pas de gérer les rôles, d'épingler les messages, ni de configurer les forums. Les guides, le règlement et les sujets d'aide restent à copier dans leurs salons respectifs.

Références : [webhooks Discord](https://docs.discord.com/developers/resources/webhook), [limites de requêtes](https://docs.discord.com/developers/topics/rate-limits).
