# Journal du contrat d'extension

Ce fichier retrace `HOST_CONTRACT_VERSION` (`src/version.ts`), c'est-à-dire la version que
`engines.host` encadre dans le manifeste d'un module — **pas** la version du produit. Un module
hors plage n'est pas chargé du tout : mieux vaut un module éteint qu'un module qui appelle un
contrat qu'il croit connaître.

**En 0.x, `HOST_CONTRACT_VERSION` monte à chaque modification du contrat**, additive ou non — ce
fichier reste ainsi une liste complète de ce qu'un auteur peut observer depuis le paquet. Ce qui
éteint réellement un module, en revanche, c'est le franchissement de
`HOST_CONTRACT_COMPATIBLE_SINCE` (`src/version.ts`), le plancher de compatibilité : il ne monte que
sur une rupture non additive, si bien qu'une mineure purement additive (comme `0.29.0` ci-dessous)
n'éteint aucun module existant. C'est délibéré tant que la surface n'est pas figée — voir
`COMPATIBILITY.md`.

> **Sur les versions 0.2 à 0.5 : elles n'ont jamais été publiées.** La constante est restée à
> `0.1.0` du 2 au 17 août 2026 pendant que le contrat gagnait deux genres entiers et une demi-
> douzaine de capacités. Les entrées ci-dessous sont une reconstitution, écrite après coup pour que
> l'histoire des ruptures soit lisible ; seule `0.6.0` a réellement circulé sous ce numéro. Un
> module qui déclare `^0.1.0` cesse donc de se charger à partir de cette version — c'est l'effet
> recherché, il a été écrit contre un contrat qui n'existe plus.

## 0.36.0 — 2026-10-04

Additif, aucune rupture de signature : `GatewayEvent` gagne deux variantes,
`payment.refunded` et `payment.dispute.closed`. Un module qui ne les émet pas se comporte
exactement comme avant. Un module `payment` qui les émet déclare `^0.36.0`, pour qu'un noyau plus
ancien le refuse au lieu de jeter ses événements.

**Ce que ça ouvre.** Un remboursement ou la clôture d'un litige faits depuis le tableau de bord du
prestataire (Stripe, PayPal) plutôt que par un appel à `refund()` n'avaient aucun chemin vers le
noyau : la facture restait `PAID`, l'argent était pourtant reparti. `payment.refunded` porte
`gatewayRef` (l'encaissement d'origine) et `refundRef` (le remboursement lui-même, clé
d'idempotence pour un webhook rejoué) ; `payment.dispute.closed` referme un `payment.disputed`
dans un sens (`won`, la facture reste ce qu'elle était) ou dans l'autre (`lost`, comptablement un
remboursement, mais qu'aucun des deux prestataires ne notifie par leur événement de remboursement
habituel).

**Pourquoi maintenant, et pas au moment de dessiner le contrat.** Constat de l'audit du
2026-09-05 sur les sept modules bundled : `stripe.ts` traduisait `charge.dispute.created` en
`payment.disputed` mais rien côté clôture ni côté remboursement, et `paypal.ts` n'écoutait ni
`PAYMENT.CAPTURE.REFUNDED` ni `CUSTOMER.DISPUTE.RESOLVED`. C'est un cas réel d'argent, pas un
raffinement de forme — levée nommée du moratoire du 2026-08-28, sur le même principe que
`retryAfterSeconds` (0.27.0) et `setIfAbsent` (0.28.0) : un manque découvert en éprouvant le
contrat contre un prestataire réel, pas en l'imaginant à l'avance.

**Numérotation.** Ce lot a été écrit le 2026-09-05 sur une branche à part sous le numéro `0.29.0`,
pris entre-temps par les réglages de thème liés au CSS ; il est repris sur `main` en `0.36.0`. Les
modules d'exemple dont la branche d'origine déclarait `^0.29.0` pour ce lot (`ovh-cloud`,
`one-click-installer`, `pterodactyl-ports`, `reference-dns`, `reference-registrar`) n'ont rien à
adapter : la plage `^0.29.0` reste couverte par la fenêtre de compatibilité.

## 0.35.0 — 2026-10-03

Additif, aucune rupture : un thème écrit contre `0.34.0` se charge et se rend comme avant. Il
déclare `^0.35.0` dès qu'il utilise un ajout, pour qu'un noyau plus ancien le refuse au lieu de lui
rendre un champ vide.

- **Base de connaissances : les articles ne sont plus du texte brut.** Le corps d'un article est
  désormais un Markdown limité (titres, listes, citations, blocs de code, gras, italique, liens,
  images téléversées au panel), jamais du HTML : une balise saisie reste du texte.
  - **`ThemeKbArticle.bodyHtml`** : le corps rendu en HTML par le noyau, que `kb-article.liquid`
    place avec `{{ article.bodyHtml }}`. C'est la troisième valeur de contexte que le moteur n'échappe
    pas (avec `bodyHtml` d'un e-mail et le filtre `markdown`), parce que le noyau l'a construite : le
    marqueur de confiance est posé côté rendu, sur le contexte que le noyau vient d'assembler, et ne
    survit pas à une sérialisation JSON — un contexte posté par une page ne peut pas en fabriquer un.
    Éléments et attributs possibles : voir la documentation du champ. Le noyau ne pose aucun style
    dessus.
  - **`ThemeKbArticle.metaDescription`** : la description saisie par le rédacteur, sinon un extrait
    du corps (160 caractères au plus). Texte brut, échappé.
  - **`ThemeKbArticle.body` change de nature, pas de type** : c'est le texte source (Markdown),
    toujours échappé. Un thème qui l'affichait avec `white-space: pre-wrap` (l'ancien contrat disait
    « texte brut ») rend désormais le balisage tel quel (`## Titre`, `**gras**`) pour les articles
    qui en utilisent ; il passe à `bodyHtml` pour profiter de la mise en forme. Les articles écrits
    avant ce format ne changent pas d'aspect : leurs marqueurs `- ` et `1. ` sont des listes
    Markdown valides.
  - Les gabarits `kb-article.liquid` d'Encre et d'Argile rendent `bodyHtml`. Les thèmes tiers
    gardent le leur tel quel jusqu'à ce que leur auteur le change ; une vue sans gabarit retombe sur
    la page du noyau, qui rend le Markdown (c'est le cas de `theme-kiosque`).

## 0.34.0 — 2026-09-22

Personnalisation de thème poussée (plan : `docs/plans/plan-themes-personnalisation.md`). Levée
nommée du moratoire du 2026-08-28 pour la surface « thèmes » du contrat, sur demande de
l'utilisateur. Entrée complétée tranche par tranche.

- **Consignés ici faute de l'avoir été à leur sortie** (lot des réglages de thème, 2026-09-17) :
  `ConfigFieldType` `image` (téléversement au panel, réservé aux thèmes), `ConfigField.maxLength`
  (compteur au panel, refus au noyau), `ThemeDefinition.screenshot`, `isSafeSettingUrl`.

### Tranche 0 — socle et correctifs

- **Durcissement : îlots obligatoires.** `THEME_VIEWS` exige désormais tous les îlots qui sont le
  seul chemin vers une fonction. Un thème peut les placer où il veut, jamais les retirer.
  - `service` : `service-actions`, `service-credentials`, `service-reinstall`, `service-snapshots`,
    `service-backups`, `service-reverse-dns`, `service-plan-change`, `service-addons`,
    `service-monitoring`, `service-early-renewal`, `service-cancellation`.
  - `account-security` : `account-change-password`, `account-two-factor`, `account-passkeys`,
    `account-sso`, `account-anti-phishing`.
  - `ticket` : `ticket-reply`, `ticket-satisfaction`.
  - `dns-zone` : `dns-records-editor`, `dns-use-host-ns`, `dns-delete-zone`.

  `check-extension` échoue sur un thème qui ne les pose pas ; le moteur, lui, ne vérifie pas les
  îlots au chargement, si bien que le thème continue de se charger. C'est la seule exception au
  caractère additif de cette version.
- **Échappement sans exception.** Le moteur échappe toute sortie : `| raw` est réenregistré sans
  son drapeau, les balises `echo` et `cycle` (y compris dans `{% liquid %}`) passent par la même
  fonction que `{{ }}`. `check-extension` signale un `| raw`, désormais sans effet.
- **`isSafeTokenValue`** ignore la casse et refuse en plus `@` et les fonctions CSS qui chargent une
  ressource ou exécutent du code : `url(`, `image(`, `image-set(` (donc `-webkit-image-set(`),
  `cross-fade(`, `element(`, `src(`, `expression(`. Un token, une valeur d'option ou un réglage lié
  au CSS qui en contient est refusé à la lecture du manifeste et ignoré au rendu.
- **`mergeThemeTokens`** : `typography.headingFamily` suit `fontFamily` tant qu'aucune couche ne la
  déclare ; un thème qui ne déclare que `fontFamily` n'a plus ses titres en Inter.
- **`DEFAULT_THEME_TOKENS.typography.headingWeight`** passe de `"600"` à `"700"` : le noyau lit
  désormais `--brand-weight-heading` sur `h1`-`h3`, et 700 est la graisse que le navigateur leur
  donnait déjà. Une instance sur les défauts ne change pas d'apparence ; un thème qui déclare
  `headingWeight` voit enfin ce choix appliqué.
- **Paramètres › Identité ne porte plus ni couleur ni police** et ne recouvre plus les réglages de
  thème liés à un token. Empilement : défauts du noyau → tokens du thème → réglages publiés du thème
  → marque d'un revendeur (sur ses domaines et pour ses clients). L'assistant d'installation écrit
  sa couleur principale dans le réglage publié du thème actif lié à `colors.primary` (palette
  claire) : un thème qui veut la recevoir déclare un tel réglage.
- **Documentation** : `ThemeFont.src` est relatif au dossier de ressources du thème ; `ConfigField.group`
  décrit le regroupement réel (champs consécutifs de même groupe) ; la documentation de
  `ResolvedTheme`, orpheline, est remise sur son symbole.
- **Correctifs de revue de la tranche 0.**
  - `isSafeThemeFont(font)` (nouveau) : la liste blanche que le noyau applique avant d'émettre le
    `@font-face` d'une police livrée — famille en lettres ASCII, chiffres, espaces, `_` ou `-`
    (64 caractères, guillemets de bord ignorés), graisse `normal`, `bold` ou de 1 à 1000 (deux
    valeurs pour une police variable), style `normal`/`italic`, `display` énuméré. Une police
    refusée est omise en entier et `check-extension` en avertit.
  - `isSafeSettingUrl` (durcissement) : un blanc, un caractère de contrôle ou une barre oblique
    inverse est refusé n'importe où dans un chemin (`/<tabulation>/hote` devenait `//hote` pour le
    navigateur), et une adresse absolue ne peut contenir ni blanc ni caractère de contrôle.
  - `{{ bodyHtml }}` dans `templates/email.liquid` rend le corps en HTML : c'est la seule valeur de
    contexte que le moteur n'échappe pas, parce que le noyau l'a construite. Un filtre qui la
    transforme rend une chaîne ordinaire, échappée.
  - Le pied de thème généré par `create-extension theme` boucle `legalLinks` et pose l'îlot
    `cookie-preferences`.
  - Hôte : la palette sombre reprend les réglages sans `scheme` qui ne sont pas des couleurs
    (polices, graisses, rayons, densité, taille de base), et les `cssVar` sans `scheme` restent
    servies en mode `dark`. Dans l'espace client, `LegalFooter` ne s'efface que devant un pied de
    thème qui pose `cookie-preferences` et renvoie à chaque document légal publié.

### Tranche A — structure des réglages

- **Changement de type : `ConfigFieldCondition` devient une union** `{ field, equals }` |
  `{ field, notEquals }` | `{ field, in: string[] }`, un seul opérateur par condition.
  `ConfigField.visibleWhen` et `ConfigFieldOption.visibleWhen` acceptent aussi un tableau de
  conditions, qui doivent toutes tenir. Un code TypeScript qui lisait `visibleWhen.equals` sans
  rétrécir le type ne compile plus ; tout manifeste existant reste valide.
- **Visibilité transitive, évaluée par le SDK** : `conditionHolds`, `isConfigFieldVisible` (un
  champ dont le champ de référence est masqué l'est aussi ; une boucle masque ses membres sans
  tourner), `configFieldConditions`, type `ConfigFieldValues`. Exportés par la racine, sans
  dépendance Node.
- **Lecteur de manifeste** : une condition mal formée (aucun ou plusieurs opérateurs, `in` non
  tableau ou vide, `field` absent) est écartée sans refuser le thème, puis signalée par
  `invalidThemeSettings` — avant, elle disparaissait sans un mot.
- `ThemeDefinition.settingGroups` (`ThemeSettingGroup` : `name`, `description`,
  `category: "appearance" | "content"`, `previewPath`) et `ThemeDefinition.settingsLocale` (langue
  des textes du manifeste, défaut `"en"`).
- `ConfigField.subgroup` (intertitre repliable dans la section) et `ConfigField.block` (rattache un
  réglage à un élément d'un `order` de la même section). `ConfigField.previewPath` est **déprécié** :
  il ne sert plus que de repli quand la section ne déclare pas le sien.
- `invalidThemeSettings(fields, theme?)` : second paramètre facultatif ; nouvelles erreurs (renvois,
  boucles, `subgroup`/`block` mal placés, sections en double, `category` inconnue, `previewPath`
  refusé, `settingsLocale` inconnue). `themeSettingWarnings(theme)` : section déclarée qu'aucun
  réglage ne nomme.
- `THEME_PREVIEW_PATHS` gagne `/legal/notice`, `/legal/refund`, `/legal/cookies`. Nouveaux
  `THEME_ACCOUNT_PREVIEW_PATHS` (pages statiques de l'espace client) et
  `isThemePreviewPath(path, themePageSlugs)`. `RESERVED_PAGE_SLUGS` gagne `theme-preview`.
- `THEME_RESERVED_SETTING_KEYS` (`$customCss`, `$texts`) : toute clé commençant par `$` appartient au
  noyau ; la règle de nom d'un réglage ne peut pas en produire, et l'hôte écarte un tel champ.
- **Traductions du panel** : `<locales>/panel/<langue>.json`, fichier plat dont la clé est la chaîne
  source exacte du manifeste. `themePanelStrings(theme)` liste les chaînes attendues ;
  `check-extension` avertit d'un fichier absent, d'une chaîne non traduite ou d'une clé orpheline
  pour chaque langue autre que `settingsLocale`. `locales/panel/` n'est jamais une langue des
  gabarits.
- Hôte : l'API des réglages traduit les textes du manifeste dans la langue du staff (`?locale=`),
  renvoie les sections ordonnées, toutes les erreurs de validation avec un code stable, et ne stocke
  plus une valeur égale au défaut du thème — une valeur jamais choisie suit donc une mise à jour du
  thème.

### Tranche B — aperçu vivant

- `themeFontFaces(theme)` est désormais exporté par le SDK (déplacé depuis `@opbs/ui`, qui le
  réexporte) : les `@font-face` des polices qu'un thème livre, filtrés par `isSafeThemeFont`.
- **Zones réglables** : convention `data-theme-setting="nomA nomB"` sur un élément existant d'un
  gabarit ; l'aperçu du panel y propose « Modifier » et ouvre le réglage, ou fait défiler jusqu'à la
  zone d'une section ouverte. `check-extension` avertit d'un nom qui ne désigne aucun réglage déclaré.
- `THEME_PREVIEW_PATHS` ne sert plus qu'au sélecteur du panel : le portail ouvre tout chemin de même
  origine. Les pages de `THEME_ACCOUNT_PREVIEW_PATHS` s'ouvrent désormais en aperçu — avec des données
  d'exemple sans session client, sur les vraies pages avec une session.
- Hôte : pont `postMessage` entre le panel et le portail cadré (origine et source vérifiées des deux
  côtés, schéma de messages fermé), schéma clair/sombre et langue forcés en aperçu, données d'exemple
  pour les 26 vues de l'espace client (`GET /themes/render/sample/:name`, îlots inertes), et payload
  `preview` des réglages pour un style recalculé sans rechargement.

### Tranche C — liens, texte riche, textes du thème

- `ConfigFieldType` gagne `link` (réservé aux thèmes, admis en sous-champ de liste) : une
  destination de navigation — chemin de l'instance, `https:`, `http:`, `mailto:` ou `tel:` —, là où
  `url` désigne une ressource. **Un seul validateur**, `isSafeLinkValue` (sans blanc, caractère de
  contrôle ni barre oblique inverse, jamais `//hote`), qu'appliquent aussi le panel, l'API et les
  blocs des pages de contenu.
- `ConfigField.format: "markdown"` sur un `textarea` (et un sous-champ `textarea`) :
  `parseThemeMarkdown` (pur, linéaire, borné à `THEME_MARKDOWN_MAX_LENGTH`) reconnaît paragraphes,
  sauts de ligne, gras, italique, liens filtrés et listes, rien d'autre. Le filtre Liquid `markdown`
  du moteur en produit un HTML dont tout texte est échappé et chaque attribut encodé ;
  `check-extension` avertit d'un `| markdown` placé dans une balise ouverte. Types
  `ThemeMarkdownBlock`, `ThemeMarkdownInline`.
- **Textes du thème** : l'hébergeur peut surcharger, par langue, toute clé de `t` que le thème
  livre ; clé réservée `$texts` des réglages, conservée d'un enregistrement à l'autre.
  `ThemeSettingGroup.texts` nomme les clés qu'une section affiche ; `THEME_TEXT_KEY_PATTERN`,
  `THEME_TEXT_MAX_LENGTH`, `themeTranslationReads(source)` (clés lues par un gabarit).
- **Zones de texte** : convention `data-theme-text="clé"`, vérifiée par `check-extension` ; l'aperçu
  y propose « Modifier » et révèle le texte au panel (message `select-texts` du pont).
- **Ordre des textes sous `t`** : fichier du thème dans la langue de l'instance, réécriture dans
  cette langue, fichier du thème dans la langue de la page, réécriture dans cette langue — la
  dernière couche l'emporte. Une réécriture vaut pour sa langue : une traduction que le thème livre
  dans la langue demandée passe devant une réécriture faite dans une autre langue.

### Tranche D — tokens

- `typography.lineHeight`, `headingLineHeight`, `letterSpacing`, `headingLetterSpacing` et
  `headingScale` (défauts `1.5`, `1.2`, `0em`, `-0.01em`, `1.25`). Les titres `h1`-`h3` du portail
  prennent leur taille de `baseSize × headingScale^n` (`--font-size-h1/h2/h3`) ; `--font-size-sm/lg/xl`
  restent fixes. Un réglage `number` lié à `lineHeight`, `headingLineHeight` ou `headingScale` se
  déclare sans `unit` (une unité y est refusée).
- `colors.link` et `colors.focus` (optionnels, repli sur l'accent résolu), `radii.button`
  (optionnel, repli sur `md`).
- Groupe `layout` (`containerMax`, défaut `72rem` ; `accountNav` `"sidebar"` ou `"top"`) et token
  `elevation` (`"flat"`, `"soft"`, `"raised"`, défaut `soft`) ; types `ThemeLayout`,
  `ThemeAccountNav`, `ThemeElevation`. Les ombres `--shadow-sm/md/lg` sont teintées par la couleur du
  texte ; `soft` garde la géométrie et l'opacité d'avant.
- `--shadow-` et `--layout-` sont réservés au noyau (plus de `cssVar` de thème sous ces préfixes).
  Le manifeste refuse une valeur hors liste pour `elevation` et `layout.accountNav`.
- `check-extension` avertit d'une clé inconnue dans `theme.tokens` et `theme.tokensDark`.
- Hôte : liens nus, anneau de focus et rayon des boutons du design system lisent
  `--brand-color-link`, `--brand-color-focus`, `--radius-button` ; titres du portail en
  `--brand-font-heading` ; l'espace client passe en barre supérieure avec `layout.accountNav: "top"`.
  Aux défauts, aucune variable existante ne change de valeur (un spec le fige).
- **Changé : le portail sur les défauts ne s'affiche plus exactement comme avant.** Le texte courant
  prend une hauteur de ligne de `1.5` (`--brand-line-height`, posée sur `<body>`) ; les titres
  `h1`-`h3`, une hauteur de ligne de `1.2`, un interlettrage de `-0.01em` et des tailles dérivées de
  `baseSize × 1.25^n` (`h1` ≈ 1,95 fois la taille de base, `h2` ≈ 1,56, `h3` 1,25) au lieu des tailles
  du navigateur (2, 1,5 et 1,17 em). Écart assumé à la règle « les défauts reproduisent le rendu
  actuel », aucune instance n'étant en service : des défauts calqués sur le navigateur (hauteur de
  ligne `normal`, échelle irrégulière) n'auraient laissé à ces tokens aucune valeur de départ
  exprimable. Les règles des titres passent par `:where([data-theme])`, de spécificité minimale :
  une classe de thème qui fixe sa taille ou son interlignage l'emporte toujours. Seul le portail
  pose `data-theme` : la page de statut et le panel ne changent pas.

### Tranche E — CSS additionnel, identité du site

- Hôte : **CSS additionnel** offert à tout thème, saisi au panel (permission dédiée `themes.css`),
  stocké sous la clé réservée `$customCss` et émis après la feuille du thème sur la vitrine et
  l'espace client — jamais sur les pages de connexion. Analysé par postcss puis resérialisé : at-rules
  en liste blanche, aucune fonction qui charge une ressource ou exécute du code, `url()` limitée aux
  médias téléversés de l'instance qui existent. Un thème n'a rien à faire pour le recevoir ; sa feuille
  est chargée avant, le CSS additionnel l'emporte donc à spécificité égale.
- Hôte : `ThemeDefinition.favicon` est **enfin émis** (il était déclaré et vérifié, jamais servi) :
  l'icône du site vient du favicon de Paramètres › Identité, sinon de celui du thème actif. L'Identité
  gagne aussi le titre du site et son motif (`{page} · {site}`), une description par langue et une
  image de partage, émis par les métadonnées du portail.
- `ConfigFieldType` gagne `font` (réservé aux thèmes, liable à `typography.fontFamily` et
  `headingFamily`) : sa valeur est une option du thème ou une police téléversée par l'hébergeur ; les
  validateurs reçoivent la liste des familles téléversées (`isAllowedFontValue`). Nouveaux exports :
  `uploadedFontFaces`, `isSafeUploadedFontFamily`, type `ThemeUploadedFont`, `ResolvedTheme.uploadedFonts`.
  Hôte : polices WOFF2 seulement (en-tête vérifié), famille en liste blanche, licence de diffusion web
  confirmée, quota distinct, suppression refusée tant qu'un réglage ou le CSS additionnel la cite ;
  `@font-face` émis après ceux du thème et avant les tokens.
- Hôte : **historique des publications** (20 par thème, auteur, date, version du thème), restaurable
  dans le brouillon — jamais en ligne — par le chemin d'un enregistrement : ce qui ne passe plus
  (image supprimée, réglage retiré par une mise à jour du thème) est écarté et listé.

### Tranche G — contenus

- `ThemeProductView.featured: boolean` : l'offre que l'hébergeur a cochée « mettre en avant » dans
  le formulaire produit. Toujours présent, `false` par défaut ; le thème écrit le libellé du badge.
- `ThemeShellContext.supportEmail?` (adresse de support de l'Identité, ou celle du revendeur sous sa
  marque, sans repli sur celle de l'hébergeur) et `ThemeShellContext.statusPageUrl?` (URL publique de
  la page de statut, absente sous une marque de revendeur).
- `ThemeShellContext.authenticated` est désormais exact en vitrine (vrai quand le portail demande
  l'enveloppe avec la session du visiteur). Pour l'affichage seulement.

**Ce qu'un auteur de thème doit faire.** Pour rester chargé, rien, sauf s'il écrit un token refusé
(voir plus bas) : le plancher `HOST_CONTRACT_COMPATIBLE_SINCE` reste à `0.16.0`, un thème qui
déclare `^0.33.0` se charge toujours. Pour rester juste, en revanche :

- **Poser les îlots devenus obligatoires** dans `service`, `account-security`, `ticket` et
  `dns-zone`, si le thème fournit ces gabarits. Sans eux `check-extension` échoue, et sur une
  instance le thème se charge quand même — le client perd alors 2FA, résiliation ou édition DNS.
- **Relire ses tokens et valeurs d'option** : un `@` ou une fonction refusée par
  `isSafeTokenValue` (`url(`, `image-set(`…) fait refuser le thème entier au chargement.
- **Ne plus compter sur `| raw`, `{% echo %}` ni `{% cycle %}`** pour écrire du HTML : tout est
  échappé. Un texte mis en forme passe par `format: "markdown"` et le filtre `markdown`.
- **Vérifier son pied de page dans l'espace client**, où il est désormais rendu : `legalLinks` et
  l'îlot `cookie-preferences`, faute de quoi le pied du noyau s'affiche en dessous.
- **Vérifier sa typographie** : hauteurs de ligne et tailles de titres par défaut ont changé (voir
  la tranche D), et `headingWeight` est enfin appliqué.
- `ThemeFont.src` part du dossier de ressources ; une famille hors liste blanche (`isSafeThemeFont`)
  n'est pas émise. Plus de `cssVar` sous `--shadow-` ni `--layout-`.
- **S'il utilise un ajout de cette version** (sections, blocs, sous-groupes, conditions `notEquals`,
  `in` ou en tableau, types `link` et `font`, `format: "markdown"`, `settingsLocale`, nouveaux
  tokens), passer `engines.host` à `^0.34.0` : un noyau plus ancien le refuse alors au lieu
  d'ignorer ces clés en silence.
- Déclarer `settingsLocale` si les libellés du manifeste ne sont pas en anglais, et livrer
  `locales/panel/<langue>.json` pour les autres langues du noyau. Ranger `previewPath` sur la
  section (`settingGroups`) plutôt que sur un champ.
- Pour recevoir la couleur principale choisie à l'installation, déclarer un réglage `color` lié à
  `colors.primary` (sans `scheme`, ou `light`).

## 0.33.0 — 2026-09-20

Les réglages de thème atteignent la feuille de style. Jusqu'ici une couleur, un rayon ou une police
choisis au panel n'avaient aucun chemin vers le CSS ; un thème « paramétrable » l'était par ses
textes et ses interrupteurs, jamais par son apparence.

- **Ajoutés** :
  - `ConfigFieldType` : `color` (hexadécimal, sélecteur + contraste au panel) et `order` (ordre d'une
    liste fermée, valeur `"a,b,c"` toujours complète). Réservés aux réglages de thème.
  - `ConfigField.token` : le réglage remplace un token (`colors.primary`, `radii.md`,
    `typography.headingFamily`, `density`, `colorScheme`…), fusionné entre les tokens du thème et la
    marque de l'hébergeur. `ConfigField.cssVar` : variable propre au thème, préfixes du noyau
    refusés. L'un ou l'autre, pas les deux.
  - `ConfigField.min` / `max` / `step` / `unit` (curseur, bornes appliquées par le noyau),
    `ConfigField.visibleWhen` (affichage conditionnel au panel), `ConfigFieldOption.sets` (un choix
    qui remplit d'autres champs — une palette), `ConfigFieldOption.visibleWhen` (dans un `order`,
    l'élément est marqué « masqué » quand son interrupteur est décoché).
  - `ConfigFieldType` : `list` (éléments composés de `ConfigField.fields`, bornés par `maxItems`),
    réservé aux thèmes, avec un contenu d'origine en JSON dans `defaultValue` ; `ConfigField.localized` (une valeur par langue sur `text`/`textarea`).
    Les gabarits reçoivent un tableau d'objets pour l'un, une chaîne dans la langue de la page
    pour l'autre : `ThemeShellContext.settings` et `ThemeViewContext.settings` passent de
    `Record<string, string | number | boolean>` à `Record<string, ThemeSettingValue>`.
  - **Aperçu dirigé** : `ConfigField.previewPath` — la page que l'aperçu du panel ouvre pour la
    section de ce réglage — et `THEME_PREVIEW_PATHS`, la liste fermée des pages qu'un aperçu sait
    servir, désormais partagée au lieu d'être recopiée dans le portail et dans le panel.
  - **Traductions** : `ThemeDefinition.locales` + type `ThemeTranslations`. Un fichier JSON plat
    par langue dans le dossier du thème, posé sous `t` dans tous les contextes de gabarit, avec
    repli clé par clé sur la langue de l'instance. Jusqu'ici un thème n'avait que
    `{% if locale == "en" %}`, intenable au-delà de quelques phrases.
  - **Mode sombre** : `ThemeDefinition.tokensDark` (palette déclarée, empilée sur `tokens`),
    `ConfigField.scheme` (`"dark"` alimente la palette sombre), `ThemeColorScheme` gagne `"auto"`,
    `ResolvedTheme.tokensDark` / `cssVarsDark`. `themeToCss(tokens, cssVars, dark?)` émet un bloc
    `@media (prefers-color-scheme: dark)` qui redéclare tout, valeurs dérivées comprises.
  - `ResolvedTheme.cssVars`, `themeSettingStyle`, `themeSettingEditable`, `isHexColor`,
    `CONFIG_FIELD_UNITS`, `MAX_LIST_ITEMS`, `ConfigFieldCondition`, `ConfigFieldUnit`,
    `ThemeSettingValue`, `ThemeSettingItem`, `ThemeSettingScalar`, `ThemeSettingResolveOptions`.
  - `themeSettingValues` prend des options `{ locale, fallbackLocale }`.
- **Changé** : `themeSettingValues` borne un `number` à `min`/`max`, complète un `order`, écarte une
  couleur invalide et ramène un `select` dont l'option a disparu à son défaut ; `invalidThemeSettings`
  vérifie tout ce qui précède.

**Ce qu'un auteur de thème doit faire.** Passer `engines.host` à `^0.33.0`. Rien d'autre n'est
obligatoire.

## 0.32.0 — 2026-09-05

Additif, aucune rupture de signature — pas même pour `HostContext.emit`, qui reste
`(event: string, payload: Record<string, unknown>)`.

- **`CoreEventPayloads`** : la forme exacte des 22 événements de `CORE_EVENTS`, reconstituée à
  partir de chacun de ses points de publication réels
  (`apps/api/src/events/events.service.ts`, `apps/worker/src/events/publish-event.ts`). Un module
  `notification` narrowe désormais `event.payload` sur `event.type` (`NotificationEvent<E>`) plutôt
  que de lire `Record<string, unknown>` et deviner. Verrouillé par un type d'exhaustivité interne :
  un événement ajouté à `CORE_EVENTS` sans entrée correspondante ici (ou l'inverse) fait échouer la
  compilation du SDK lui-même, pas seulement `public-surface.spec.ts`.
- **`publish()`/`publishEvent()` typés** (`EventsService` côté API, `publish-event.ts` côté worker) :
  deux surcharges — un littéral de `CoreEvent` exige `CoreEventPayloads[E]`, tout le reste
  (`Exclude<E, CoreEvent>`, donc un événement propre à un module) garde `Record<string, unknown>`.
  A révélé un site où le typage de Prisma masquait un `string | null` réel
  (`referral-commissions.ts`), corrigé par l'assertion déjà utilisée deux lignes plus haut dans le
  même fichier.
- **`NO_PAYMENT_CAPABILITIES`, `NO_PROVISIONING_CAPABILITIES`** : les deux derniers genres à
  capacités qui n'exportaient pas cette constante sous le nom que portent ses équivalents
  (`NO_DNS_CAPABILITIES`, `NO_REGISTRAR_CAPABILITIES`) — `payment` la redéfinissait localement dans
  son propre fichier de test, `provisioning` l'exportait sous le nom générique `NO_CAPABILITIES`
  (conservé, pour ne rien casser).
- **`RegistrarOutcome.expiryDate`, `SnapshotInfo.createdAt`, `ConsoleSession.expiresAt`** :
  `Date | string` plutôt que `Date` seul. Un module qui relit une date depuis une réponse JSON n'a
  aucune raison de la faire passer par `new Date(...)` avant de la rendre. Le noyau normalise à la
  lecture (`domain-actions.processor.ts`, `self-service.service.ts`) pour que le format qui
  atteint la base ou le client reste stable quelle que soit la forme rendue par le module.
- **`SupportedLocale`, `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`** enfin exportés depuis `src/index.ts` :
  `HostContext.locale` référençait un type qu'un auteur tiers ne pouvait nommer nulle part.
- `EXTENSIONS.md` documente que `WebhookRequest.rawBody: Buffer` requiert `@types/node` sous
  `// @ts-check`, et illustre le narrowing de `NotificationEvent` sur un événement canonique.

## 0.31.0 — 2026-09-05

Rien ne change dans les types exportés — cette version documente et outille le contrat existant,
elle n'en modifie aucune signature.

- **CLI publiée** : `npx @opbs/extension-sdk check <dossier>` et `create <genre> <id> [--dir]`,
  déplacées de `scripts/` (qui n'étaient utilisables que depuis ce dépôt) vers `src/cli/` et un
  `bin` unique (`opbs-extension`). `pnpm check-extension`/`pnpm create-extension` gardent leur
  usage, désormais un simple appel au binaire compilé.
- **Squelettes générés typés** : chaque fichier que `create` écrit porte `// @ts-check` et un
  `@type` JSDoc nommant son descripteur (`ProvisioningDescriptor`, `PaymentGatewayDescriptor`…) —
  un auteur qui installe `@opbs/extension-sdk` en `devDependency` voit son éditeur souligner un
  champ manquant avant même de lancer `check`. Le squelette `notification` fournit désormais un
  `send` réel (`{ delivered: false, error: "TODO" }`) plutôt qu'un exemple en commentaire : `send`
  est une méthode requise par le type, même si un canal comme `smtp` s'en passe légitimement à
  l'exécution.
- **Rapport d'API** (`api-report/extension-sdk.api.d.ts`) : instantané des `.d.ts` que `tsc` produit
  réellement pour `src/index.ts` et `src/loader/index.ts`, comparé à chaque `pnpm test`
  (`api-report.spec.ts`). Complète `public-surface.spec.ts`, qui verrouille les noms exportés mais
  pas la forme complète d'une signature (un paramètre optionnel devenu requis, par exemple).
  `UPDATE_API_REPORT=1` régénère l'instantané après un changement voulu.

## 0.30.0 — 2026-09-05

**Introduit un plancher de compatibilité.** Jusqu'ici, `satisfies(hostVersion, engines.host)` était
le seul critère : une mineure additive comme `0.29.0` ci-dessous aurait quand même éteint tout
module déclarant `^0.28.0`, puisqu'en semver `^0.28.0` ne couvre pas `0.29.0`. `version.ts` gagne
`HOST_CONTRACT_COMPATIBLE_SINCE` — la plus ancienne version du contrat encore acceptée. Un module
reste chargé tant que la version minimale que sa plage `engines.host` accepte se situe entre ce
plancher et `HOST_CONTRACT_VERSION`, quel que soit l'écart avec la version courante. Vaut `0.16.0` :
dernière rupture non additive du contrat (voir cette entrée plus bas) — le plancher lui-même ne
remonte que sur une rupture de cette nature, jamais sur un ajout.

- `loader/compatibility.ts` (`incompatibilityReason`) : deuxième chemin vers `null`, après le
  `satisfies` classique — `minVersion(range)` compris dans `[compatibleSince, hostVersion]`. Les
  bornes hautes explicites d'une plage (`<0.25.0`) sont ignorées par ce chemin, comme par le
  premier : en 0.x elles ne disent rien de plus que le caret.
- `loader/discoverExtensions` gagne l'option `compatibleSince`, injectable pour les tests sur le
  même principe que `hostVersion` — `HOST_CONTRACT_COMPATIBLE_SINCE` par défaut.
- Purement du côté du chargeur : aucun descripteur, aucune interface de `kinds/` ne change.

## 0.29.0 — 2026-09-05

Additif, aucune rupture de signature : `ExtensionStorage.keys(prefix): Promise<string[]>` et
`AddonOutcome { note?: string }`, rendu optionnellement par `AddonDescriptor.onAttach`. Un module
qui ignore les deux se comporte exactement comme avant.

**`keys`.** Clés du module commençant par `prefix` (`""` pour tout lister), triées, plafonnées à
`MAX_STORAGE_KEYS_PER_MODULE` comme `set`. Sans elle, un module tenant une ressource par clé — un
port par `port:<n>`, comme `pterodactyl-ports` depuis le SDK 0.28.0 — ne pouvait ni compter ce
qu'il lui restait, ni retirer son offre une fois la plage pleine, ni proposer à l'hébergeur un
écran listant ce qu'il a alloué. Requête triviale : la clé primaire du magasin est déjà
`(moduleId, key)`.

**`AddonOutcome`.** `onAttach` rendait `Promise<void>` : un module qui alloue une ressource portant
une identité pour le client (un numéro de port, une adresse) n'avait aucun moyen de la lui
communiquer. `SubscriptionAddon.provisioningNote` n'était renseignée qu'en échec, alors que le
portail l'affiche quel que soit l'état — un succès muet restait muet. `onAttach` peut désormais
rendre `{ note?: string }`, posé dans cette même colonne. Le contournement en place jusqu'ici — une
page de portail dédiée par module — reste valide, ce n'est plus la seule option.


## 0.28.0 — 2026-09-02

Additif, aucune rupture de signature : `ExtensionStorage.setIfAbsent(key, value): Promise<boolean>`
et `AddonSubscriptionContext.remoteId: string | null`. Un module qui les ignore se comporte
exactement comme avant.

**`setIfAbsent`.** Écrit seulement si la clé n'existe pas encore, et dit si l'écriture a eu lieu.
Atomique côté base — une insertion sur la clé primaire `(moduleId, key)`, jamais un `upsert` — et
soumis aux mêmes plafonds que `set`. C'est la primitive qui manquait à tout module tenant un
registre de ressources rares : le noyau ne sérialise jamais les appels à un module, et un `get`
suivi d'un `set` sur un blob unique laissait deux rattachements simultanés choisir le même port, le
second écrasant le premier. `pterodactyl-ports` en montre l'usage, une clé par port ; `static-pool`
a la même faille et reste à convertir. La forme `compareAndSet` envisagée dans la roadmap a été
écartée : une réservation nommée par sa clé se lit et se rend une par une, un blob à recomparer se
rejoue en boucle sous contention.

**`remoteId`.** Ce que le module de provisioning a rendu à la livraison
(`ProvisioningResult.remoteId`), ou `null` tant qu'elle n'a pas eu lieu. Sans lui, un module
`addon` ne pouvait qu'écrire dans son propre stockage : il ne savait pas sur quel serveur agir chez
le prestataire. Il est aussi transmis à la libération à la résiliation, où il est souvent déjà nul
— la résiliation immédiate détruit le service avant d'enfiler la libération — et un module doit
savoir rendre ce qu'il tient sans le serveur en face.

Seconde levée nommée du moratoire, sur la même demande que la première : faire d'un module
d'exemple un consommateur réel du contrat plutôt qu'un registre. `createTestHost` implémente
`setIfAbsent` en mémoire. Les manifestes des exemples passent à `^0.28.0`.

## 0.27.0 — 2026-08-30

Additif, aucune rupture de signature : `ProvisioningOutcome` et `RegistrarOutcome` gagnent
`retryAfterSeconds`. Un module qui l'ignore se comporte exactement comme avant.

**Ce que ça ouvre.** Jusqu'ici, un module dont le fournisseur ne livre pas à l'appel n'avait que
`manualActionRequired` : le service restait « en attente », et rien ne l'en sortait sans un
humain. Un module n'a ni file ni horloge, il ne peut pas se réveiller seul. En renvoyant
`retryAfterSeconds`, il demande au noyau de rappeler la même opération plus tard — le service
reste en attente entre deux passages, et l'automatisation reprend là où elle s'arrêtait.

**Pourquoi maintenant, et pas au moment de dessiner le contrat.** Proxmox, cPanel et les modules
d'exemple livrent tous à l'appel : le manque ne pouvait pas se voir. Il est apparu en cartographiant
l'API OVHcloud, où l'on ne crée pas une machine mais où l'on passe commande — panier, bon de
commande, paiement — pour une livraison en minutes sur un VPS et en heures sur un dédié. C'est la
demande nommée que le moratoire du 2026-08-28 attendait pour rouvrir la surface du contrat.

**Ce que le noyau garantit, pour qu'un module n'ait pas à s'en occuper.** Le délai est borné et le
nombre de rappels plafonné : passé le plafond, l'opération est déclarée en échec avec un message
qui nomme le module, plutôt que rejouée sans fin. Un rappel dont le service n'attend plus — résilié,
supprimé, repris à la main entre-temps — est abandonné sans bruit.

**Le piège, écrit noir sur blanc.** L'idempotence était déjà exigée de toutes les méthodes
d'exécution ; c'est ici qu'elle se paie. Le module est rappelé avec le même `target`, `remoteMeta`
compris — c'est là qu'il range de quoi se reconnaître. Un `create` qui ne relit pas la commande
qu'il a déjà passée en passe une deuxième, et chez un fournisseur payant cela se compte en argent
réel.

Les manifestes des exemples passent à `^0.27.0`.

## 0.26.0 — 2026-08-30

Additif, aucune rupture de signature : `inspectDescriptor` (et son `InspectDescriptorOptions`)
rejoint l'entrée `@opbs/extension-sdk/loader`, et `discoverExtensions` l'appelle désormais sur
tout module qu'il vient de charger.

**Ce que ça change pour un module déjà écrit.** Rien à son code. Ce qui change, c'est que les
défauts structurels jusqu'ici visibles de la seule CLI (`pnpm check-extension`) le sont maintenant
depuis le panel de l'hébergeur : champ de configuration sans libellé, `select` sans `options`,
champ déclaré deux fois, écran ou page contribués dont le gabarit ou le bundle n'est pas au bout
du chemin déclaré. Le module reste chargé et `OK` — ces défauts ne justifient pas de l'écarter,
le noyau sait se rabattre sur les sections d'un écran dont le bundle manque — mais il porte un
`statusMessage` que le panel affiche à côté de lui.

**Pourquoi maintenant.** Le modèle d'installation est le dépôt de fichiers sur le serveur : rien
ne garantit qu'un module tiers ait jamais vu la CLI, et c'est précisément le module non relu qui
pose problème. Ces contrôles ne « manquaient » pas au chargeur, ils y étaient volontairement
absents faute d'endroit où en parler ; `statusMessage` sur un module `OK` est cet endroit.

Effet de bord voulu : la CLI et le noyau partagent désormais le même code de contrôle. La
duplication précédente avait déjà commencé à dériver — la CLI refusait des champs de configuration
que le chargeur acceptait sans un mot.

Les manifestes des exemples passent à `^0.26.0`. En 0.x, `^0.25.0` ne couvre pas `0.26.0` : un
module qui reste sur l'ancienne plage cesse d'être chargé, comme à chaque jalon.

## 0.25.0 — 2026-08-29

Additif, aucune rupture : le chargeur réel rejoint le SDK — `discoverExtensions`, `parseManifest`,
`incompatibilityReason`, `inspectThemeTemplates`, et les types qui les accompagnent
(`DiscoveredExtension`, `DiscoveredStatus`, `DiscoverOptions`, `ManifestError`,
`ThemeTemplateFinding`). Jusqu'ici ce code vivait dans `@opbs/extensions`, un paquet interne
qui dépend de `@opbs/database` (schéma Prisma complet) et n'est donc pas publiable — sans lui,
un auteur tiers récupérant le SDK publié n'avait aucun moyen de valider son module avant dépôt, la
seule vérification existante (`pnpm check-extension`) exigeant le monorepo entier. Déplacé plutôt
que dupliqué : ces quatre fichiers ne dépendaient déjà que de `node:fs`/`node:path`/`semver`/du
contrat lui-même (voir ROADMAP.md, entrée P1). `@opbs/extensions` continue de tout réexporter
à l'identique pour ses appelants internes (`apps/api`, `apps/worker`) — rien n'y change.

**Sur une entrée séparée, `@opbs/extension-sdk/loader`, pas la racine.** `@opbs/ui`
importe le SDK principal pour les jetons de thème (`isSafeTokenValue`, `ResolvedTheme`) et
alimente ainsi les bundles **navigateur** des trois apps Next.js (web-admin, web-portal,
status-page) : y laisser un module qui lit `node:fs` et charge du code avec un `require()`
dynamique faisait échouer leur build (Turbopack refuse de résoudre l'argument dynamique, même mort
côté client — trouvé en vérifiant ce changement, pas anticipé). `src/loader/index.ts` porte son
propre verrou de surface (`public-surface.spec.ts`, section « chargeur »), même mécanique que la
racine.

`package.json` passe de `0.1.0` à `0.25.0`, aligné sur `HOST_CONTRACT_VERSION` pour la première
fois depuis la création du paquet — l'écart était resté sans conséquence tant que rien n'était
publié, mais aurait fait foi sur npm dès la première publication. Il gagne aussi un champ
`exports` (`.` et `./loader`), jusqu'ici absent : `main`/`types` seuls ne peuvent pas exposer une
seconde entrée.

## 0.24.0 — 2026-08-28

Additif, aucune rupture : `createTestHost()`, un `HostContext` de test prêt à l'emploi.
`check-extension` valide la forme d'un module, jamais son comportement — tester `send()`,
`createCheckout()` ou `syncZone()` obligeait jusqu'ici chaque auteur à refabriquer un `HostContext`
à la main. `storage` est une vraie `Map` en mémoire (seul membre adossé à Prisma dans
l'implémentation réelle) ; `logger` et `emit` capturent dans des tableaux consultables sans mock ;
`http` est substituable, avec un stub par défaut qui rejette explicitement plutôt que de tenter une
requête réseau depuis une suite de tests ; `locale` reste paramétrable, défaut `"fr"`.

## 0.23.0 — 2026-08-27

Additif au registre des vues et des îlots : un revendeur peut appliquer **sa** marque aux clients
qu'il gère (roadmap P4, « La marque blanche n'a pas de marque »). Le lot reseller livrait les
sous-comptes et la remise négociée, mais ses clients voyaient le nom et le logo de l'hébergeur sur
le portail comme dans chaque notification.

- **Ajoutés** (`kinds/theme.ts`) :
  - vue `reseller-branding` (`area: "account"`, îlot requis `reseller-branding`) et son contexte
    `ThemeResellerBrandingView` — l'écran où un revendeur règle nom, logo, couleurs et domaine.
  - îlot `reseller-branding` (`area: "account"`) : le formulaire lui-même, comme pour les autres
    écrans à effet, le gabarit choisissant seulement où il apparaît.

Rien n'est retiré ni renommé, et aucun genre d'extension ne change. Un thème qui ne fournit pas
`templates/pages/reseller-branding.liquid` rend la page React d'origine, comme pour toute vue.

**Ce qui n'est *pas* dans le contrat, et n'y sera pas** : la marque d'un revendeur ne traverse
jamais `HostContext`. Elle est résolue côté noyau et arrive aux gabarits par les mêmes
`companyName`/`logoUrl`/tokens qu'avant — un thème n'a donc rien à savoir de l'existence des
revendeurs pour les servir correctement.

## 0.22.0 — 2026-08-27

Additif : un écran de panel peut désormais être **rendu par le code du module**, et non plus
seulement par le moteur déclaratif. Jusqu'ici `ContributedScreen` ne connaissait que trois types
de sections — table, formulaire, actions : ni canevas, ni glisser-déposer, ni prévisualisation.
Toute une famille d'écrans du marché n'y rentrait pas.

- **Ajoutés** (`kinds/ui.ts`) :
  - `ScreenBundle` et `ContributedScreen.bundle?: ScreenBundle` — chemin d'un fichier **ESM déjà
    construit** par l'auteur, plus la plage du contrat de panel qu'il vise.
  - `PANEL_CONTRACT_VERSION` (`1.0.0`) : le contrat de panel a sa propre version, indépendante de
    `HOST_CONTRACT_VERSION`. Un ajout de capacité DNS ne doit pas obliger à republier un bundle.
  - `PanelScreenMount` (l'export par défaut du fichier), `PanelScreenHost` (ce que le noyau lui
    remet), `PanelScreenUnmount`, `PanelScreenModule`.
  - `invalidContributedScreens(screens, fileExists?)`, pendant de `invalidContributedPages`.
- **Modifié** : `ContributedScreen.sections` devient facultatif. Un écran à bundle n'a pas à
  déclarer de sections — mais celles qu'il déclare quand même servent de **repli** si le fichier
  manque ou si sa plage ne couvre plus le panel.

**Le contrat ne nomme aucune bibliothèque d'interface.** Le module monte dans un conteneur qui lui
appartient et y crée ce qu'il veut : sa propre racine React, du DOM brut, du Preact. Deux
instances de React sur la même page ne se gênent que si l'une rend dans l'arbre de l'autre, ce qui
n'arrive jamais ici. Conséquence assumée : le bundle embarque son interface (~45 Ko gzip pour
React), et en échange une montée de version du panel ne casse pas d'un coup tous les modules
installés.

**Le noyau ne construit rien.** Le fichier est importé tel quel à l'exécution, servi par une route
dédiée — l'installation reste un dépôt de fichiers, sans reconstruction d'image ni installation de
dépendances chez l'hébergeur. Un module livré avec l'application ne peut pas déclarer de bundle :
il n'a pas de dossier d'où le servir.

**Un bundle refusé n'éteint pas le module** : l'écran retombe sur ses sections avec un bandeau qui
nomme la raison. Un module de provisionnement dont l'écran a pris du retard doit continuer à
livrer des machines.

## 0.21.0 — 2026-08-26

Additif : un module peut désormais **ajouter des pages au portail client**. Jusqu'ici il ne pouvait
contribuer qu'un écran d'administration (`ContributedScreen`), servi derrière
`StaffJwtAuthGuard` — toute une famille de modules du marché, ceux qui parlent au client final
(déblocage d'IP en self-service, gestion d'un site, gestionnaire de mots de passe), n'avait aucun
chemin.

- **Ajoutés** (`kinds/ui.ts`) :
  - `ContributedPage` et `ExtensionDescriptor.contributesPages?: ContributedPage[]` — identifiant,
    libellé, zone, lien de nav facultatif, gabarit Liquid et/ou sections déclaratives.
  - `ExtensionDescriptor.runPageData?(ctx, request)` → `ModulePageResult` : le contexte de la page.
  - `ExtensionDescriptor.runPageAction?(ctx, request)` → `ModulePageActionResult` : un bouton ou un
    formulaire de cette page.
  - `ModulePageRequest`, `ModulePageActionRequest`, `ModulePageCustomer`, `ModulePageService`,
    `ContributedLabel`.
  - `invalidContributedPages(pages, fileExists?)`, `modulePageHref(moduleId, page)`,
    `modulePageThemeTemplatePath(moduleId, pageId, templatesDir?)`,
    `resolveContributedLabel(label, locale)`.

**L'URL est préfixée** : `/m/<moduleId>/<pageId>` en zone client, `/x/<moduleId>/<pageId>` en zone
publique. Les deux segments étaient déjà réservés dans `RESERVED_PAGE_SLUGS` avant d'être
implémentés, et c'est le point — un squat d'espace de noms est irréversible dès qu'il existe des
modules dans la nature. Second effet : les préfixes étant statiques, le middleware du portail n'a
rien à savoir des modules installés.

**L'identité vient du jeton, jamais de l'URL.** Le noyau renseigne `request.customer` à partir de
la session vérifiée et écrase tout ce qui arriverait par les paramètres. `customerId` n'est
délibérément **pas** dans `HostContext`, qui vit pour la durée du processus et non de la requête :
y ranger un état de requête serait, sur une page client, une fuite d'un client vers un autre. Ce
que le module reçoit est arbitré — identifiant, `isContact`, et la liste réduite des services
(id, nom du produit, `remoteId`) — sans l'identité de facturation.

**Deux méthodes plutôt qu'un point d'entrée unique**, contrairement à `runScreenEntryPoint` qui ne
distingue pas lecture et écriture. Ici la lecture arrive par un GET que n'importe qui peut
provoquer et l'écriture par un POST délibéré : les confondre ferait d'un passage de robot un
déclencheur d'action.

**Le rendu est une cascade** : gabarit du thème
(`templates/modules/<moduleId>/<pageId>.liquid`) → gabarit du module → sections. Un thème peut donc
rhabiller la page d'une extension sans que son auteur ait rien prévu, et les îlots y fonctionnent
comme ailleurs. `pnpm check-extension` refuse une page sans gabarit ni sections, un identifiant
malformé, un doublon, un libellé vide et un `cacheSeconds` en zone client — aucun de ces défauts ne
se voit au chargement du module.

## 0.20.0 — 2026-08-26

Additif : un thème peut désormais **apporter ses propres pages**, à des URL que le noyau ne connaît
pas. Partout ailleurs dans ce contrat, un thème rhabille une page qui existe ; ici il en ajoute une.

- **Ajoutés** :
  - `ThemeDefinition.pages?: ThemePageDeclaration[]` — slug, titre, lien de nav facultatif,
    métadonnées. Le gabarit est libre : `templates/custom/<slug>.liquid`, aucun îlot exigé, un
    contexte réduit à `companyName`, `locale` et la déclaration elle-même (`ThemeCustomPageView`).
  - `invalidThemePages(pages, templateExists?, templatesDir?)` — ce qui empêche ces pages de
    fonctionner, en clair. Utilisé par `pnpm check-extension`.
  - `themePageTemplatePath(slug, templatesDir?)`.
  - `RESERVED_PAGE_SLUGS` et `isReservedPageSlug(slug)` — **déplacés depuis l'API**. La liste
    contraignait un seul producteur de slug (le back-office de l'hébergeur) ; elle en contraint
    deux depuis que les thèmes déclarent des pages, et `check-extension` doit pouvoir refuser un
    manifeste fautif sans avoir l'API sous la main. C'est aussi ce qu'un auteur de thème a besoin
    de lire avant de choisir une URL.

**L'hébergeur passe avant le thème.** Une page créée au back-office au même slug l'emporte, sans un
mot, et son lien de nav est le seul écrit. Même règle que les réglages de marque face aux tokens
(`resolveActiveTheme`) : ignorer ce qu'un administrateur vient de saisir est le pire des deux
mondes. L'ordre de la navigation le dit à voix haute — noyau, puis hébergeur, puis thème.

Trois défauts ne se voient jamais au rendu et produisent tous un thème qui paraît complet : un slug
réservé donne une page que la route statique du noyau masque en permanence, un doublon en fait
disparaître une, un gabarit manquant donne un 404 sur un lien que le thème a lui-même mis en
navigation. `pnpm check-extension` les refuse avant le dépôt. Le service, lui, se contente de les
ignorer en journalisant : éteindre un thème entier pour une page de trop coûterait à l'hébergeur
plus que ça ne lui épargne.

## 0.19.0 — 2026-08-26

Additif : les 8 pages d'authentification entrent au registre, et le portail devient thémable en
entier — 42 pages sur 42. C'était la dernière zone hors de portée d'un thème, celle qui faisait
qu'un visiteur cliquant « Connexion » quittait visuellement l'instance qu'il croyait connaître.

- **Ajoutés** (`kinds/theme.ts`) :
  - 8 vues dans `THEME_VIEWS` : `login`, `register`, `forgot-password`, `reset-password`,
    `verify-email`, `accept-invite`, `sso-link`, `sso-callback`.
  - 7 îlots dans `THEME_ISLANDS`, tous `area: "auth"` et tous sans `params` : `auth-login`,
    `auth-register`, `auth-forgot-password`, `auth-reset-password`, `auth-accept-invite`,
    `auth-sso-link`, `auth-sso-callback`.
  - `ThemePasswordPolicy` et un type documentaire par vue (`ThemeLoginView`,
    `ThemeResetPasswordView`, `ThemeSsoCallbackView`…).
- **Élargis, sans rien retirer** :
  - `ThemeViewSpec.area` accepte `"auth"` en plus de `"marketing"` et `"account"`. Une vue `auth`
    est rendue par l'API seule, comme une vue `marketing` : ces écrans sont servis sans session, il
    n'y a rien à charger avec le jeton d'un visiteur qui n'est pas encore connecté. Zone distincte
    malgré la source commune, parce que la distinction porte pour l'auteur : ces vues exigent
    l'îlot de leur formulaire et n'ont aucune navigation de client connecté.
  - `ThemeIslandSpec.area` accepte `"auth"` en plus de `"account"`. Le sens du champ ne change
    pas — îlot refusé dans une page créée au panel — mais un module qui testait `area === "account"`
    doit désormais tester la présence de la clé.

**Ce que le contrat ne transmet toujours pas, et c'est le fond de ce lot.** Aucun contexte de vue
`auth` ne porte de jeton, de ticket ni de code : `reset-password` reçoit `hasToken`, `sso-link`
reçoit `hasTicket`, `sso-callback` reçoit `providerFailed`. Le secret va de la page directement à
l'îlot (`islandProps`), sans passer par la route de rendu — il n'apparaît donc ni dans les journaux
d'accès de l'API, ni dans un fichier écrit par un tiers. Un gabarit obtient la conclusion dont il a
besoin pour choisir quoi afficher, jamais le moyen d'agir.

Et la garde du lot 1 est inchangée, seulement étendue : les îlots `auth-*` montent les composants
d'origine du portail, avec leur URL de soumission, leur second facteur et leur redirection
compilés. Un gabarit place, il n'écrit pas. `pnpm check-extension` refuse un gabarit de connexion
qui oublierait `auth-login` — ce défaut-là ferme le portail à tout le monde, hébergeur compris.

## 0.18.0 — 2026-08-26

Additif : les 25 vues de l'espace client entrent au registre. Un thème pouvait rhabiller 9 pages
(8 vitrine + les pages créées au panel) ; il peut désormais en rhabiller 34 sur 42 — tout sauf les
8 pages d'authentification. Rien n'est supprimé ni renommé : un thème écrit contre `0.17.0` reste
juste, il ne fournit simplement aucun de ces gabarits et ses pages restent en React.

- **Ajoutés** (`kinds/theme.ts`) :
  - 25 vues dans `THEME_VIEWS` : `dashboard`, `services`, `service`, `service-console`,
    `invoices`, `invoice`, `tickets`, `ticket`, `ticket-new`, `domains-mine`, `domain`,
    `dns-zones`, `dns-zone`, `history`, `account`, `account-profile`, `account-security`,
    `account-billing`, `account-payment-methods`, `account-privacy`, `account-referral`,
    `account-team`, `reseller-clients`, `reseller-client`, `reseller-client-new`.
  - `ThemeViewSpec.area` (`"marketing" | "account"`) — **qui** assemble le contexte de la vue. Une
    vue `marketing` est rendue par l'API seule (`GET /themes/render/view/:name`) ; une vue
    `account` reçoit son contexte de la page, qui vient de le charger avec le jeton du visiteur
    (`POST /themes/render/view/:name`). Sans cette distinction, un gabarit d'espace client serait
    rendu avec un contexte vide, c'est-à-dire une page blanche là où le repli React était attendu.
  - `ThemeViewContext.locale` — la langue du rendu. Un gabarit écrit toujours ses propres libellés
    (le noyau ne les lui fournit pas), mais il peut désormais en avoir plusieurs.
  - `ThemeIslandSpec.area` (`"account"`, facultatif) — îlot réservé au client connecté, refusé
    dans une page créée au panel : ces pages sont publiques, et un éditeur de zone DNS n'y saurait
    qu'échouer en 401 sous les yeux du visiteur.
  - 35 îlots d'espace client dans `THEME_ISLANDS` (`invoice-pay`, `service-actions`,
    `ticket-reply`, `dns-records-editor`, `account-two-factor`, `logout`…), et un type documentaire
    par vue (`ThemeInvoicesView`, `ThemeServiceView`, `ThemeAccountSecurityView`…).
  - `isProvidedContextView(name)` — la vue reçoit-elle son contexte de l'appelant.
- **Sur la garde du lot 1, qui ne bouge pas** : `account-change-password` est un îlot légitime —
  c'est un composant *de l'hôte* que le thème place. Ce qui reste interdit est qu'un gabarit écrive
  lui-même un champ de mot de passe, et c'est pourquoi les 8 pages d'authentification n'ont
  toujours aucune vue au registre.

## 0.17.0 — 2026-08-26

Additif : l'hébergeur peut créer ses propres pages depuis le back-office, et un thème peut les
rhabiller. Aucune suppression, aucun renommage — un thème écrit contre `0.16.0` reste juste, il
n'exploite simplement pas la nouvelle vue. La version monte quand même : en 0.x, toute modification
du contrat est une rupture au sens de semver, et un thème qui déclare `^0.16.0` doit être relu par
son auteur plutôt que chargé au hasard.

- **Ajoutés** (`kinds/theme.ts`) :
  - `content-page` dans `THEME_VIEWS` — gabarit **générique** des pages créées au panel, sans îlot
    obligatoire. Une seule entrée pour toutes ces pages : elles n'existent pas au moment où le
    thème est écrit, donc il n'y a pas de gabarit par page à prévoir.
  - `ThemeContentPageView` — le contexte reçu : `page.slug`, `page.title`, `page.blocks`.
  - `ThemePageBlock` — un bloc **déjà résolu dans une langue** (`type`, plus les clés propres au
    type). La forme stockée, localisée, est `PageBlock` dans `@opbs/shared-types` ; le contrat
    d'un thème ne voit que la forme résolue, parce qu'un gabarit Liquid n'a pas de quoi choisir une
    langue.
- **Inchangé et volontairement** : `THEME_ISLANDS` reste la même liste fermée. Une page créée au
  panel peut poser un îlot (`type: "island"`), mais seulement parmi ceux qui existent déjà — un
  contenu saisi dans le panel ne crée jamais de composant.

## 0.16.0 — 2026-08-25

**Première rupture non additive du contrat.** Un thème ne pouvait rhabiller que 3 pages sur 42, et
la cause n'était pas un oubli : `ThemePageContext` était une union fermée de trois types, donc
ajouter une page thémable exigeait de modifier le SDK. Le registre remplace l'union.

- **Supprimés** (`kinds/theme.ts`) : `ThemePageContext`, `ThemeHomePageContext`,
  `ThemeCatalogPageContext`, `ThemeLegalPrivacyPageContext`.
- **Ajoutés** à leur place :
  - `ThemeViewContext`, type **ouvert** — `view` (nom de la vue), `companyName`, et ce que la vue
    apporte. Le contenu est sérialisé par le noyau, plus décrit par le contrat.
  - `THEME_VIEWS` / `ThemeViewSpec` / `themeViewSpec` / `THEME_VIEW_NAMES` — le registre des vues
    rendables (`templates/pages/<nom>.liquid`) et, pour chacune, ses îlots obligatoires. Huit vues
    livrées : `home`, `catalog`, `cart`, `domains`, `kb`, `kb-article`, `legal-privacy`,
    `legal-terms`. Ajouter une vue n'est plus une modification du contrat mais une entrée de
    données.
  - `THEME_ISLANDS` / `ThemeIslandSpec` / `themeIslandSpec` — les emplacements qu'un gabarit marque
    (`data-island="<nom>"`) et que le noyau remplit d'un composant compilé dans l'application :
    `order-button`, `bundle-order-button`, `cart`, `domain-search`, `language-switcher`. **Le thème
    place, le noyau fait** : un thème n'exécute aucun code et ne peut pas fabriquer un formulaire
    d'authentification.
  - `declaredIslands`, `missingRequiredIslands`, `unknownIslands` — le contrôle qu'applique
    `pnpm check-extension` sur la source d'un gabarit. Un catalogue sans `order-button` s'affiche
    parfaitement et ne vend rien : c'est le seul défaut de ce système qu'une relecture visuelle ne
    rattrape pas.
  - Types de contexte documentaires par vue (`ThemeHomeView`, `ThemeCatalogView`, `ThemeCartView`,
    `ThemeDomainsView`, `ThemeKbView`, `ThemeKbArticleView`, `ThemeLegalPrivacyView`,
    `ThemeLegalTermsView`) et les formes qu'ils transportent (`ThemeBundleView`,
    `ThemeKbArticleSummary`, `ThemeKbArticle`, `ThemePagination`). Aides à l'écriture, pas
    barrières : le noyau ne les impose nulle part.
- **`ThemeDefinition` gagne `script?`** — le JS du thème, relatif à son dossier, chargé en `defer`
  sur toutes les pages du portail. Servi par une route dédiée (`GET /themes/:id/script.js`) avec sa
  propre politique : la route des ressources applique `sandbox`, ce qui neutralise tout script.
  **Ne peut venir que d'un fichier déposé sur le serveur, jamais d'un réglage saisi dans le
  panel** — même distinction que pour les valeurs de tokens (`isSafeTokenValue`).
- **`ThemeDefinition.templates` est enfin lu.** Le champ figurait au contrat depuis le début sans
  être appliqué : un thème qui rangeait ses gabarits ailleurs voyait sa déclaration ignorée en
  silence. `ResolvedTheme` gagne `scriptUrl?` en conséquence de `script`.

Migration pour un thème existant : rien à faire s'il n'a que des gabarits d'enveloppe
(`ThemeShellContext` n'a pas bougé). S'il fournit un gabarit de page, renommer `page` en `view`
là où il le lit, et remplacer `data-order-product="…"` par
`data-island="order-button" data-product="…"` dans le catalogue.

## 0.15.0 — 2026-08-25

- **Garde-fou anti-fraude paiement→provisioning** (`events.ts`), additif :
  - `CORE_EVENTS` gagne `"provisioning.approval.requested"`, publié quand une commande dont le
    produit exige une validation manuelle attend une décision staff (Catalogue › Produits ›
    « Validation avant livraison », ou le réglage global par défaut). Un module `notification`
    peut s'y abonner pour alerter le staff (Discord/Slack) qu'une commande attend.
  - Aucun changement sur `HostContext` ni sur les genres existants — un module qui ne s'abonne pas
    à ce nouvel événement continue de fonctionner à l'identique.

## 0.14.0 — 2026-08-24

- **Reverse DNS (PTR)** (`kinds/dns.ts`), entièrement additif :
  - `DnsCapabilities` gagne `ptr: boolean`.
  - Nouvelle méthode `setPtr?(ctx, target: PtrTarget, hostname: string | null): Promise<DnsOutcome>`
    — pose (`hostname`) ou efface (`null`) le PTR d'une IP. `ptr` se tient par `setPtr`, dont le
    nom diffère de la capacité, même cas particulier que `whoisPrivacy`/`setWhoisPrivacy` côté
    `registrar` — voir `missingDnsOperations`.
  - Nouveau type `PtrTarget` : ne porte ni nom de zone ni enregistrements (contrairement à
    `DnsZoneTarget`), parce que la zone `in-addr.arpa`/`ip6.arpa` qui accueille le PTR appartient à
    l'hébergeur, jamais au client — au module de la retrouver depuis `ip`/`ipVersion`.
  - Un module qui ne déclare pas `ptr: true` continue de fonctionner sans y répondre.

## 0.13.0 — 2026-08-24

- **Restauration de sauvegarde** (`kinds/provisioning.ts`), entièrement additive :
  - `ProvisioningCapabilities` gagne `restore: boolean`.
  - Nouvelle méthode `restore?(ctx, target, remoteRef): Promise<ProvisioningOutcome>` — restaure en
    place la sauvegarde désignée par `remoteRef` (`BackupOutcome.remoteRef`, tel que persisté par
    le noyau sur `BackupJob`). Capacité autonome comme `backup`/`reinstall`, pas bundlée avec
    `snapshot`. Un module qui ne déclare pas `restore: true` continue de fonctionner sans y
    répondre — le noyau applique alors l'état commercial sans action distante.

## 0.12.0 — 2026-08-22

- **Prélèvement SEPA** (`kinds/payment.ts`), entièrement additif :
  - `ChargeOutcome` gagne le statut `"pending"` (`{status:"pending", gatewayRef}`) — un prélèvement
    hors session dont le règlement prend plusieurs jours (mandat SEPA), ni un succès immédiat ni un
    refus. Un module qui ne le renvoie jamais n'est pas affecté.
  - `GatewayEvent` gagne `"payment.failed"` (`{type:"payment.failed", gatewayRef}`) — un paiement
    précédemment `pending` qui échoue finalement.
  - `StoredMethodDetails` gagne trois champs optionnels : `type?: "card" | "sepa_debit"` (absent =
    `"card"`), `ibanLast4?: string | null`, `bankCode?: string | null`. Un module qui ne les
    renseigne pas continue de décrire une carte comme avant.
  - Aucune nouvelle capacité sur `PaymentCapabilities` : SEPA réutilise `offSession`/`webhook`/
    `storedMethods`/`methodSetup`, déjà existantes.

## 0.11.0 — 2026-08-21

- **`CORE_EVENTS` gagne `invoice.refunded`** : émis quand le noyau écrit un remboursement (voir
  `InvoicesService.refund`, apps/api). La capacité `refund` du contrat `payment` existait déjà
  depuis `0.1.0` (deux passerelles bundled l'implémentent), mais aucun appelant ne l'invoquait —
  ce lot ajoute l'appelant, pas la capacité.

## 0.10.0 — 2026-08-20

- **Nouveau champ sur `ProvisioningTarget`** : `network?: ProvisioningNetwork`
  (`kinds/provisioning.ts`), avec les nouveaux types `ProvisioningNetwork` et
  `ProvisioningNetworkAddress`. Porte l'IPv4/IPv6 déjà allouée par le noyau à ce service (via
  `IpPool`/`IpAssignment`), pour un module qui doit configurer lui-même le réseau de l'invité
  (cloud-init) plutôt que de compter sur un DHCP côté hyperviseur. `undefined` hors de
  `create`/`resume`, ou sans pool IP configuré : comportement inchangé pour tout module qui ignore
  ce champ.

## 0.9.0 — 2026-08-20

- Deux nouveaux `CORE_EVENTS` du programme de parrainage (cœur uniquement, aucune interface de
  module concernée) : `customer.registered` (inscription publique validée) et
  `referral.commission.earned` (première facture payée d'un filleul, commission créditée au
  parrain). Un module `notification` qui s'y abonne reçoit le payload publié par le worker/l'API.

## 0.8.0 — 2026-08-19

- **Nouveau genre `dns`** (`kinds/dns.ts`) : zones et enregistrements DNS. `DnsCapabilities`
  (3 capacités : `createZone`, `deleteZone`, `syncZone`), `DnsDescriptor`, `DnsZoneTarget`,
  `DnsRecordInput`/`DNS_RECORD_TYPES`, `DnsOutcome`, et `missingDnsOperations` — les trois
  capacités portent ici exactement le nom de leur méthode, pas de cas particulier comme
  `whoisPrivacy` côté `registrar`. Config à un seul niveau (`configFields`/`parseConfig` du socle
  commun), pas de fournisseur séparé : un module dns pilote un unique service par installation.
  Trois nouveaux `CORE_EVENTS` (`dns.zone.created`, `dns.zone.deleted`, `dns.zone.error`).

## 0.7.0 — 2026-08-19

- Deux nouveaux `CORE_EVENTS` de monitoring applicatif (`service.monitor.down`,
  `service.monitor.up`) : franchissement d'état d'une sonde HTTP/TCP créée par un client sur son
  propre service (`ServiceMonitor`, cœur uniquement — aucune interface de module concernée). Un
  module `notification` qui s'y abonne reçoit `{ monitorId, subscriptionId, name, target }`.

## 0.6.0 — 2026-08-17

- **Nouveau genre `registrar`** (`kinds/registrar.ts`) : noms de domaine. `RegistrarCapabilities`
  (8 capacités), `RegistrarDescriptor`, `RegistrarTarget`, `DomainContact`, `AvailabilityResult`,
  et `missingRegistrarOperations` — dont le cas particulier `whoisPrivacy` → `setWhoisPrivacy`,
  seule capacité dont le nom diffère de sa méthode.
- **`HostContext.locale`** (2026-08-11) : locale pertinente pour l'appel en cours. Un module qui
  n'en fait rien peut l'ignorer, le repli `fr` est toujours valide — mais le champ est apparu dans
  un objet que tous les modules reçoivent, c'est donc bien une rupture.
- Quatre nouveaux `CORE_EVENTS` de domaine (`domain.registered`, `domain.renewal.failed`,
  `domain.expiring`, `domain.transfer.completed`).

## 0.5.0 — 2026-08-16

- **`reportsUsage` / `reportUsage`** sur `ProvisioningDescriptor` : relève de consommation par
  service, pour la facturation à l'usage.
- **`reportsStorageUsage` / `reportStorageUsage`** : même principe pour le stockage.
- Ces deux drapeaux sont séparés de `capabilities` à dessein : ils décrivent ce que le module
  *rapporte*, pas ce qu'il sait *faire*.

## 0.4.0 — 2026-08-15

- **`methodSetup` / `createMethodSetup`** : enregistrement d'un moyen de paiement sans encaissement.
- **`storedMethods` / `describeStoredMethod` / `detachStoredMethod`** : affichage et détachement
  d'un moyen mémorisé. `detachStoredMethod` est appelé à l'effacement d'un client (art. 17 RGPD).
- `MethodSetupRequest`, `MethodSetupOutcome`, `StoredMethodDetails`.

## 0.3.0 — 2026-08-14

- **Capacité `snapshot`** : une seule capacité pour quatre méthodes (`listSnapshots`,
  `createSnapshot`, `deleteSnapshot`, `rollbackSnapshot`), plus le type `SnapshotInfo`.
- **`reportsNodeCapacity` / `listNodeCapacity`** (2026-08-11) et `NodeCapacitySnapshot` : alertes
  anti-survente. Un ajout mineur en pratique — voir `COMPATIBILITY.md` — mais qui reste une rupture
  au sens de la règle 0.x.

## 0.2.0 — 2026-08-03

- **Nouveau genre `addon`** (`kinds/addon.ts`) : options d'abonnement à effet réel. Seul genre sans
  `capabilities` — ses trois méthodes (`offeringsFor`, `onAttach`, `onDetach`) sont toutes
  obligatoires.
- `AddonDescriptor`, `AddonOffering`, `AddonSubscriptionContext`, `missingAddonOperations`.

## 0.1.0 — 2026-08-02

Première version publiée du contrat : `HostContext`, `ExtensionManifest`, `ExtensionDescriptor`,
`ConfigField`, `CORE_EVENTS`, et les genres `provisioning`, `payment`, `notification`, `theme`.

## Comment faire évoluer ce contrat

1. Modifier la surface publique (`src/index.ts` et ce qu'il exporte).
2. `pnpm --filter @opbs/extension-sdk test` échoue sur `public-surface.spec.ts` : c'est le
   garde-fou, il rappelle que la version doit suivre.
3. Incrémenter `HOST_CONTRACT_VERSION` (mineure, en 0.x), ajouter une entrée ici, et aligner
   `"version"` dans `package.json` — resté oublié du 2 août au 28 août 2026, sans conséquence tant
   que le paquet n'était pas publié, mais c'est ce champ qui fait foi sur npm dès la première
   publication.
4. Si le changement **n'est pas additif** (signature changée, champ devenu obligatoire, genre
   retiré), relever aussi `HOST_CONTRACT_COMPATIBLE_SINCE` à la nouvelle version : c'est ce qui
   éteint les modules écrits contre l'ancien contrat plutôt que de les laisser appeler une
   interface qui a changé sous eux. Un ajout pur, lui, ne touche pas au plancher — c'est le point de
   son existence : `engines.host` des exemples n'a besoin d'aucune mise à jour dans ce cas.
5. Mettre à jour l'instantané attendu (`public-surface.spec.ts`).
