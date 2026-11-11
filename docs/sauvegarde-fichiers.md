# Sauvegarde des fichiers (Supabase Storage)

La sauvegarde hebdomadaire (`supabase/functions/sauvegarde-hebdomadaire`) envoie par e-mail les
**tables** de la base. Les **fichiers** des buckets ne sont pas inclus (plusieurs Go) :

| Bucket | Contenu | Taille approx. |
|---|---|---|
| `assets` | photos d'articles, documents, messagerie, frais pro | 1,4 Go |
| `album` | photos des enfants | 300 Mo |
| `documents-admin` | pièces administratives des familles | 150 Mo |
| `stagiaires`, `carnets`, `documents-employes`, `sante`, `famille-docs`, `rgpd`… | pièces personnelles | 250 Mo |

## Copie manuelle (à faire de temps en temps, ou avant un changement important)

Avec la CLI Supabase (`supabase login` puis, depuis un dossier vide) :

```bash
supabase storage ls --linked --experimental ss:///documents-admin -r
supabase storage cp --linked --experimental -r ss:///documents-admin ./copie/documents-admin
```

Répéter pour chaque bucket. Conserver la copie sur un disque chiffré, hors du dépôt.

## Chiffrement de l'archive e-mail

Définir le secret `BACKUP_ENCRYPTION_KEY` (phrase d'au moins 16 caractères) dans Supabase › Edge Functions ›
Secrets. L'archive arrive alors en `.json.gz.enc` ; pour l'ouvrir :

```bash
BACKUP_ENCRYPTION_KEY='la phrase' node tools/dechiffrer-sauvegarde.mjs sauvegarde-koalakids-AAAA-MM-JJ.json.gz.enc
gunzip sauvegarde-koalakids-AAAA-MM-JJ.json.gz
```

**Garder la phrase dans un gestionnaire de mots de passe** : sans elle, l'archive est illisible.
