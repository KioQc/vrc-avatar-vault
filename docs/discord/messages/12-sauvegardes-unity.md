# 📚 Guide — Données, sauvegardes et Unity

**Données locales**
VAV conserve ses données dans `%APPDATA%\local.vrc-avatar-vault.app`, séparément du programme. Une mise à jour conserve cet emplacement.

Les sauvegardes SQLite avant installation protègent la base. Pour une copie externe incluant les images, utilise l'export complet du coffre dans Settings et conserve le fichier ailleurs.

Changer un dossier dans les réglages ne déplace pas automatiquement tes anciennes données. Lis le résumé d'une restauration : remplacer un coffre et importer un avatar ne sont pas la même action.

**Unity**
Associe ton projet depuis les outils Unity de l'avatar. Vérifie le chemin et l'éditeur sélectionnés avant de l'ouvrir.

Le Unity Bridge dispose de son propre guide :
https://github.com/KioQc/vrc-avatar-vault/tree/main/unity-bridge/com.vrcavatarvault.bridge

Les versions locales que tu attribues à un avatar sont distinctes de la version interne remontée par VRChat.
