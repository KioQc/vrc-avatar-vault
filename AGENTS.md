# Consignes de livraison VAV

## Classement des builds (préférence utilisateur)

Conserver l’organisation existante : `release/build/<major>.<minor>.x/<major>.<minor>.<patch>/`.
Exemple : `release/build/0.8.x/0.8.5/`, puis `release/build/0.9.x/0.9.0/`.
Les aperçus sont rangés dans le dossier de leur version de base : `0.8.5-preview.2` va dans `0.8.x/0.8.5/`.
Y placer les exécutables, installateurs, signatures et ZIP de mise à jour, avec leurs noms versionnés. Ne pas écraser un artefact déjà livré.
Conserver les archives historiques dans `release/build/old/` ; ne pas reclasser les versions anciennes sans demande.
Les manifestes latest, documents et sommes de contrôle actuellement à la racine de release y restent. Les archives Unity Bridge conservent leur emplacement existant.
Utiliser les chemins classés pour la publication GitHub et les liens remis à l’utilisateur. Ne plus déposer de nouvelles builds desktop à la racine de release.
Le script `scripts/package-update.ps1` applique ce classement pour les versions stables.
