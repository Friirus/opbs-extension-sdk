# @opbs/extension-sdk

Contrat public pour écrire un module tiers OPBS (provisioning, payment, notification, dns,
registrar, theme, addon). Voir [EXTENSIONS.md](https://github.com/Friirus/opbs/blob/main/EXTENSIONS.md)
et [COMPATIBILITY.md](https://github.com/Friirus/opbs/blob/main/COMPATIBILITY.md) dans le dépôt
principal pour la documentation complète.

**Ce dépôt est un miroir en lecture seule.** La source de vérité est
`packages/extension-sdk` dans [Friirus/opbs](https://github.com/Friirus/opbs) (privé) ;
son contenu est resynchronisé ici automatiquement à chaque changement sur `main`. Toute
pull request ouverte directement ici sera ignorée — ouvre-la sur le dépôt principal.

Il n'existe que pour que la publication npm (`pnpm publish --provenance`) puisse s'exécuter
depuis un dépôt GitHub public, condition requise par npm pour l'attestation de provenance
Sigstore/OIDC.
