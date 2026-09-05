# Frontière de compatibilité

Ce document dit ce sur quoi un développeur tiers peut s'appuyer, et ce qui bougera sans préavis.

Il est écrit **avant** qu'aucune extension tierce n'existe, et c'est délibéré : à partir du moment
où une extension lit une donnée, cette donnée devient publique de fait, qu'on l'ait voulu ou non.
Tracer la ligne coûte une heure aujourd'hui ; elle serait irrécupérable ensuite.

Règle d'asymétrie qui gouverne tout le reste : **élargir la surface publique est toujours possible,
la rétrécir ne l'est jamais.** En cas de doute sur un point, il est déclaré interne.

## Les trois niveaux d'engagement

| Niveau | Ce que c'est | Engagement |
|---|---|---|
| **Public et stable** | API REST `/api/v1` listée ci-dessous, authentification par clé, portées, format des réponses | Fort. Aucun retrait ni renommage en version mineure. Dépréciation annoncée avec fenêtre |
| **Public et instable** | Explicitement marqué ci-dessous | Aucun. Bougera, la raison et l'échéance sont données |
| **Interne** | Tout le reste, y compris le schéma de base de données | Aucun. Change sans préavis ni mention dans les notes de version |

## Public et stable

### Mécanisme d'accès

- Préfixe de version dans l'URL : `/api/v1`. Une rupture donnera `/api/v2`, jamais une
  modification de `v1`.
- Authentification par en-tête `x-api-key`. Les clés sont créées depuis le panel, hachées en base,
  révocables.
- **Une clé d'API est en lecture seule.** Elle est traitée en interne comme un rôle `READONLY` quel
  que soit le point d'entrée. Ce n'est pas un effet de bord, c'est une garantie : aucune version
  future n'accordera d'écriture à une clé sans que ce document l'annonce d'abord.
- Chaque route exige une **portée** explicite. Une clé qui ne la porte pas reçoit `403`.
- Ajouter une portée ne casse jamais l'existant : c'est le mécanisme prévu pour élargir l'API.

### Enveloppe des listes

Toutes les routes de liste renvoient la même forme, et elle est stable :

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 20 }
```

Paramètres `page` (≥ 1, défaut 1) et `pageSize` (1 à 100, défaut 20). Le plafond de 100 fait partie
du contrat.

Le format d'erreur est celui de NestJS (`statusCode`, `message`, `error`) et fait partie du contrat.

### Routes publiques

Quatre routes, toutes en lecture seule. C'est l'intégralité de la surface publique actuelle.

| Route | Portée requise | Stabilité |
|---|---|---|
| `GET /api/v1/invoices` | `invoices:read` | Stable |
| `GET /api/v1/tickets` | `tickets:read` | Stable |
| `GET /api/v1/subscriptions` | `subscriptions:read` | Stable |
| `GET /api/v1/services` | `servers:read` | **Instable** — voir ci-dessous |

`GET /api/v1/health` est joignable sans authentification et sa forme est stable : elle sert aux
sondes de disponibilité.

## Public et instable

### `GET /api/v1/services`

**Ne vous appuyez pas encore sur la charge utile de cette route.** Les champs suivants disparaîtront
ou changeront de nom :

| Champ ou paramètre | Devient |
|---|---|
| `vmid` | `remoteId` — identifiant opaque chez le fournisseur, quel qu'il soit |
| `node` | entrée de `remoteMeta`, dont le contenu appartient au module |
| `clusterId`, `clusterName` | `providerId`, `providerName` |
| filtre `?clusterId=` | `?providerId=` |

**Pourquoi** : ces noms supposent que tout service est une machine virtuelle Proxmox. Le découplage
du provisioning (lot 4 du plan d'extensions) rend le fournisseur interchangeable — Proxmox, VMware,
cPanel, ou une livraison manuelle — et ces champs n'ont alors plus de sens.

**Quand** : la route passe en stable à la livraison du lot 5, une fois qu'un second hyperviseur réel
aura validé la forme définitive. Elle sera alors gelée aux mêmes conditions que les trois autres.

La *route* elle-même, sa portée et son enveloppe de pagination sont stables dès maintenant. Seule la
forme de chaque élément est concernée.

## Interne

Tout ce qui n'est pas listé ci-dessus. Explicitement, et sans que la liste soit limitative :

- **Les autres routes HTTP.** `customers`, `products`, `product-categories`, `orders`, `checkout`,
  `credit-notes`, `settings`, `users`, `api-keys`, `audit-logs`, `reports`, `metrics`, `search`,
  `export`, `privacy`, `backup-jobs`, `proxmox-clusters`, `webhook-endpoints`, les routes `auth/*`
  et les routes `:id` de détail des quatre contrôleurs publics. Elles servent les deux interfaces
  web du produit et suivent leurs besoins.
- **Le schéma de base de données.** Noms de tables, de colonnes, énumérations, index. Il change à
  chaque migration.
- **Les autres paquets `@opbs/*`.** Ils restent `private` et internes au dépôt — seul
  `@opbs/extension-sdk` est publié (voir plus bas).
- **La structure des fichiers**, les noms de modules NestJS, les files d'attente BullMQ.

## Identifiants de modules réservés

Un identifiant de module est unique sur une instance : il sert de clé en base, et le registre
refuse bruyamment un doublon plutôt que d'absorber le second — celui-ci écraserait la configuration
du premier. Les modules livrés étant enregistrés en premier, **c'est toujours le module tiers qui
est refusé.**

Conséquence pour un auteur : donner à son module l'un des identifiants ci-dessous le rend
ininstallable, et ajouter un module livré à cette liste peut désactiver un module tiers déjà en
place, à la mise à jour. D'où cette liste, et le contrôle `pnpm check-mirrors` qui la tient à jour.

| Identifiant | Genre |
|---|---|
| `bank-transfer` | payment |
| `classic` | theme |
| `cpanel` | provisioning |
| `discord` | notification |
| `encre` | theme |
| `manual` | provisioning |
| `manual-registrar` | registrar |
| `paypal` | payment |
| `powerdns` | dns |
| `proxmox-ve` | provisioning |
| `smtp` | notification |
| `stripe` | payment |

Cette liste s'allongera. Un identifiant préfixé du nom de son éditeur (`acme-pay` plutôt que `pay`)
ne risque rien.

## Règles d'évolution de ce qui est public

Ces quatre règles gouvernent l'API REST et `@opbs/extension-sdk` (voir plus bas) — un seul jeu de
règles, pas un par surface publique.

1. **Purement additif en version mineure.** On ajoute des champs et des routes. On ne retire pas, on
   ne renomme pas, et surtout **on ne recycle pas** un champ existant pour un sens nouveau : c'est
   pire qu'un retrait, parce que ça casse en silence.
2. **Dépréciation avant retrait.** Un élément déprécié est signalé dans ce document, dans les notes
   de version et dans le panel, puis retiré au plus tôt deux versions mineures plus tard.
3. **La version majeure précédente reste supportée** le temps de la transition, en parallèle.
4. **Ce qui n'est pas testé n'est pas promis.** Toute promesse de ce document est couverte par un
   test automatisé. Une promesse qu'on ne sait pas vérifier est une promesse qu'on brisera.

## La soupape : accès direct à la base

Un contrat étroit finit toujours par bloquer quelqu'un. Plutôt que d'élargir la surface publique à
chaque cas particulier — ce qui reviendrait à tout promettre — l'accès direct à PostgreSQL reste
possible.

Il est **explicitement non supporté**. Le schéma change à chaque migration, sans préavis et sans
mention dans les notes de version. Une extension qui lit ou écrit directement en base assume de
suivre chaque mise à jour du noyau.

C'est un choix : la soupape évite que chaque développeur bloqué devienne une demande d'engagement
supplémentaire, et elle ne coûte aucune promesse.

## `@opbs/extension-sdk`

Le SDK d'extension est publié sur npm sous licence MIT depuis le 2026-09-05, en semver `0.x`. Le
miroir public en lecture seule est `Friirus/opbs-extension-sdk` ; la source de vérité reste
`packages/extension-sdk/` dans ce dépôt, qui la synchronise à chaque push sur `main`.

**Il n'est pas encore figé.** Le contrat a été éprouvé sur trois passerelles de paiement réelles,
mais sur un seul hyperviseur : le second, qui devait le confronter à autre chose que Proxmox, a été
reporté faute de simulateur vSphere REST utilisable. Sa surface peut donc encore changer. Un
contrat publié ne se corrige plus sans casser tout le monde qui l'a déjà installé : mieux vaut le
figer tard et bien.

En attendant, la discipline `0.x` s'applique pour de bon : `HOST_CONTRACT_VERSION`
(`packages/extension-sdk/src/version.ts`) suit chaque modification de la surface, `CHANGELOG.md` la
documente avec `package.json`, et `public-surface.spec.ts` fait échouer la suite de tests si l'un
des trois diverge. Ce qui décide qu'un module reste chargé n'est pas cette version courante mais
`HOST_CONTRACT_COMPATIBLE_SINCE`, un plancher qui ne monte que sur une rupture non additive : sans
lui, une instance de longue durée éteindrait un module tiers à chaque mineure du contrat, même celles
qui n'affectent rien de ce qu'il utilise. Cette mécanique a existé sur le papier avant d'exister en
pratique : la constante est restée à `0.1.0` du 2 au 17 août 2026 pendant que le contrat gagnait
deux genres entiers.

### Ce que le semver signifie

Applicable depuis la publication du 2026-09-05.

- **Majeure** : un descripteur qui compilait ou se chargeait cesse de le faire. Retirer un genre,
  rendre un champ optionnel obligatoire, changer la signature d'une méthode existante, renommer
  quoi que ce soit dans `packages/extension-sdk/src/`.
- **Mineure** : purement additif, même règle que le reste de ce document — nouveau genre, nouveau
  champ optionnel de `HostContext`, nouvel événement ajouté à `CORE_EVENTS`, nouvelle méthode
  optionnelle sur un descripteur existant. Un module qui ignore l'ajout continue de fonctionner à
  l'identique.
- **Correctif** : documentation, types resserrés sans changer la forme observable à l'exécution
  (par exemple un type `unknown` précisé en union), corrections de bugs du chargeur lui-même.
- **`engines.host` reste la garde-fou, avant comme après 1.0.** Un module qui déclare `^1.2.0` ne
  charge jamais contre un noyau en `2.0.0` : le mécanisme ne change pas après la publication,
  seulement son rythme. Aujourd'hui, en 0.x, `HOST_CONTRACT_VERSION`
  (`packages/extension-sdk/src/version.ts`) monte à chaque changement de forme, mais c'est
  `HOST_CONTRACT_COMPATIBLE_SINCE` — un plancher qui ne bouge que sur une rupture non additive — qui
  décide si un module reste chargé. Demain, seule une majeure fera avancer ce plancher.
- **Dépréciation** : même règle que le reste de ce document — signalée ici, retirée au plus tôt
  deux mineures plus tard, jamais recyclée pour un sens nouveau.

### Ce que les trois passerelles ont déjà changé

Le contrat de paiement a été écrit d'après les appels réels du noyau, puis corrigé **deux fois**
par ses propres implémentations. C'est la démonstration de ce que vaut la période de flottement.

- Le **virement bancaire** a ajouté `CheckoutRequest.displayReference`. Le contrat n'offrait qu'un
  identifiant technique, alors qu'un virement se pointe sur ce que le client recopie dans le
  libellé de sa banque — et personne ne recopie correctement vingt-cinq caractères aléatoires.
- **PayPal** a ajouté `RefundRequest.currency`. Un prestataire refuse un remboursement libellé
  autrement que l'encaissement, et tous ne la déduisent pas de la transaction visée : l'omission
  revenait à supposer que l'hébergeur n'encaisse qu'en euros.

- Le **portail client** a ajouté `PaymentCapabilities.methodSetup`, `createMethodSetup(...)` et
  l'événement `method.stored`. Le contrat savait décrire et détacher une carte laissée par un
  règlement, mais pas en faire enregistrer une hors de tout paiement : un client dont la carte
  expirait devait attendre une facture due pour la remplacer, c'est-à-dire attendre l'échec du
  prélèvement qu'il cherchait à éviter. `methodSetup` est une capacité comme les autres — un module
  de virement n'a rien à enregistrer et la déclare `false` ; le noyau n'appelle jamais
  `createMethodSetup` sans elle.

Les trois passerelles livrées (virement, Stripe, PayPal) déclarent trois profils de capacités
distincts. C'était le but : un contrat éprouvé sur trois variantes du même prestataire n'aurait
rien prouvé.

### Un sixième genre : `registrar`

`EXTENSION_KINDS` (`packages/extension-sdk/src/manifest.ts`) a gagné `"registrar"`, aux côtés de
`notification`/`theme`/`addon` avant lui — un nouveau genre reste un ajout purement additif au sens
de ce document : un module `provisioning`/`payment`/`notification`/`theme`/`addon` existant n'a
rien à changer, il ignore simplement l'existence de `registrar`. `CORE_EVENTS` a gagné les
événements associés (`domain.registered`, `domain.renewal.failed`, `domain.expiring`,
`domain.transfer.completed`), même règle. Comme pour les genres précédents, ce n'est pas une
promesse figée : tant que le SDK n'a pas rejoint le niveau « public et stable » (voir plus bas), la
forme exacte de `RegistrarDescriptor` peut encore changer sans préavis d'une version à l'autre du
noyau — seule la règle d'additivité mineure s'applique déjà, pas le gel complet.

La même discipline que `GET /api/v1/services` (vocabulaire Proxmox à effacer avant de figer la
route) s'appliquera le jour où une route publique exposera des domaines : aucun vocabulaire propre
à un registrar précis (code EPP, nom d'un fournisseur de confidentialité WHOIS particulier…) ne
doit y fuiter. Le contrat `registrar` transporte déjà cette discipline via `remoteId`/`remoteMeta`,
exactement comme `provisioning` — au module d'y ranger ce qui lui est propre, au noyau de ne
jamais l'interpréter.

### Un septième genre : `dns`

`EXTENSION_KINDS` a gagné `"dns"`, aux côtés de `registrar` avant lui — même règle d'additivité
pure : un module `provisioning`/`payment`/`notification`/`theme`/`addon`/`registrar` existant n'a
rien à changer, il ignore simplement l'existence de `dns`. `CORE_EVENTS` a gagné les événements
associés (`dns.zone.created`, `dns.zone.deleted`, `dns.zone.error`), même règle. Comme pour les
genres précédents, ce n'est pas une promesse figée : tant que le SDK n'a pas rejoint le niveau
« public et stable » (voir plus bas), la forme exacte de `DnsDescriptor` peut encore changer sans
préavis d'une version à l'autre du noyau.

### `dns` gagne `ptr` : additif, même les deux exceptions à la règle générale du genre

`DnsCapabilities` gagne `ptr: boolean` et `DnsDescriptor` gagne `setPtr?(ctx, target, hostname)` —
additif comme le reste : un module dns existant qui ignore `ptr` continue de fonctionner à
l'identique, `missingDnsOperations` ne lui reproche rien tant qu'il ne déclare pas la capacité.
Deux écarts délibérés par rapport à `createZone`/`deleteZone`/`syncZone` : la capacité se tient par
`setPtr`, un nom différent (même cas que `whoisPrivacy`/`setWhoisPrivacy` côté `registrar`), et son
type `PtrTarget` ne suit pas le patron `*Target` des autres genres (pas de nom de zone, pas
d'enregistrements) — parce que la zone qui accueille réellement un PTR n'appartient jamais au
client, contrairement à une `DnsZone`. Aucun nouvel événement `CORE_EVENTS` : un job PTR en échec
ne remonte que dans `PtrRecord.status`/`errorLog`, lu par le client et par le staff, pas par un
canal de notification.

### Programme de parrainage : deux nouveaux événements

Aucun genre supplémentaire, aucune interface modifiée — le programme de parrainage (inscription
publique + commission créditée en wallet) est un chantier interne au noyau, sans module concerné.
`CORE_EVENTS` a gagné `customer.registered` et `referral.commission.earned`, même règle d'additivité
que les événements de domaine/DNS ci-dessus : un module `notification` existant n'a rien à changer,
il ignore simplement ces deux événements tant qu'il ne les liste pas dans `supportedEvents`.

Contrairement à `registrar`, `DnsDescriptor` n'a qu'un seul niveau de configuration
(`configFields`/`parseConfig` du socle commun) — pas de `providerConfigFields`/`productConfigFields`
séparés : un module dns pilote un unique service par installation, sur le même modèle qu'un module
`payment` ou `notification`, pas sur celui d'un module `provisioning`/`registrar` à plusieurs
fournisseurs. `remoteId`/`remoteMeta` transportent la même discipline que pour `registrar` : au
module d'y ranger ce qui lui est propre (identifiant PowerDNS, métadonnées de synchronisation…), au
noyau de ne jamais l'interpréter.

### `theme` : `ThemePageContext` supprimé, remplacé par un registre de vues (rupture)

La première rupture non additive de ce contrat, et elle est assumée : `ThemePageContext` était une
**union fermée** de trois types (`ThemeHomePageContext`, `ThemeCatalogPageContext`,
`ThemeLegalPrivacyPageContext`). Conséquence mécanique : rendre une quatrième page thémable exigeait
de modifier le SDK, donc de sortir une version du contrat. Le portail compte 42 pages ; trois
étaient thémables, et elles le sont restées.

Ce qui remplace, dans `packages/extension-sdk/src/kinds/theme.ts` :

- `ThemeViewContext` — type **ouvert** (`view`, `companyName`, plus ce que la vue apporte). Le nom
  de la vue et son contenu sont décidés par le noyau qui les sérialise, pas par le contrat.
- `THEME_VIEWS` — le registre des vues rendables (`templates/pages/<nom>.liquid`), chacune avec ses
  îlots obligatoires. Ajouter une vue est désormais une entrée de données.
- `THEME_ISLANDS` — les emplacements qu'un gabarit marque (`data-island="<nom>"`) et que le noyau
  remplit d'un composant compilé dans l'application. Liste fermée, elle : un nom d'îlot désigne du
  code réel.
- `missingRequiredIslands`/`unknownIslands` — le contrôle qu'applique `pnpm check-extension`.

Un thème qui n'avait que des gabarits d'enveloppe (`partials/header.liquid`, `footer.liquid`) n'est
pas concerné : ce contexte-là (`ThemeShellContext`) n'a pas bougé. Un thème qui fournissait un
gabarit de page doit renommer sa variable de discrimination (`page` → `view`) s'il la lit, et, pour
le catalogue, remplacer `data-order-product="…"` par
`data-island="order-button" data-product="…"`. Le repli n'a pas changé de nature et reste la
garantie principale : pas de gabarit pour une vue ⇒ l'écran React du noyau, vue par vue.

`ThemeDefinition` gagne `script?` (le JS du thème, servi par une route dédiée
`GET /themes/:id/script.js` avec sa propre politique de sécurité) et lit enfin `templates?`, qui
était déclaré depuis le début sans être appliqué. Un script ne peut venir que d'un fichier déposé
sur le serveur, jamais d'un réglage saisi dans le panel — même distinction que pour les valeurs de
tokens.

Côté API, `GET /themes/render/page/:name` devient `GET /themes/render/view/:name` (+ paramètres de
requête pour les vues qui listent ou détaillent). Aucune de ces deux routes n'est publique au sens
de ce document : elles ne sont joignables par aucune clé d'API et ne figurent pas dans la liste des
routes stables ci-dessus.

### `content-page` : une vue de plus, et rien à faire pour un thème existant (0.17.0)

Ajout pur. `THEME_VIEWS` gagne `content-page`, et le SDK deux types documentaires
(`ThemeContentPageView`, `ThemePageBlock`). Un thème écrit contre `0.16.0` reste juste : il ne
fournit simplement pas ce gabarit, et les pages concernées se rendent avec les composants du noyau,
comme toute vue absente d'un thème. La version monte parce qu'en 0.x toute modification du contrat
est une rupture au sens de semver, pas parce qu'il y a quoi que ce soit à corriger.

Ce que cette vue apporte vaut d'être compris avant d'écrire le gabarit : elle ne rhabille pas une
page du produit mais **les pages que l'hébergeur crée depuis son back-office**, à un slug libre.
Elle est donc générique — un seul gabarit pour toutes ces pages, présentes et futures — et son
contexte est une suite de blocs typés plutôt qu'un ensemble de champs nommés. Voir `EXTENSIONS.md`
pour la table des blocs.

Un seul comportement change en dehors de cette vue : `unknownIslands` (et donc `pnpm
check-extension`) **ignore désormais un `data-island` dont le nom est calculé par le gabarit**
(`data-island="{{ block.island }}"`), là où il le signalait comme un nom inconnu. Nécessaire pour
un gabarit générique, qui ne peut pas écrire ces noms en clair, et sans perte réelle : un nom
d'îlot invalide est refusé à la saisie côté panel, et n'aurait de toute façon rien monté.
`missingRequiredIslands` n'est pas assoupli — un nom calculé ne prouve pas qu'un îlot obligatoire
est en place.

### Un revendeur applique sa marque à ses clients (0.23.0)

Ajout pur au registre des vues et des îlots : un thème écrit contre `0.22.0` reste juste, et rien
de ce qu'il fournit ne change de sens.

- vue `reseller-branding` (`area: "account"`), contexte `ThemeResellerBrandingView`, îlot
  obligatoire `reseller-branding`.
- îlot `reseller-branding` (`area: "account"`).

Un thème qui ne fournit pas `templates/pages/reseller-branding.liquid` rend la page React
d'origine — repli par vue, comme partout ailleurs.

**Ce qui n'entre pas dans le contrat, délibérément.** La marque d'un revendeur ne traverse jamais
`HostContext` et n'apparaît dans aucune interface de module. Elle est résolue côté noyau, puis
arrive aux gabarits par les `companyName`/`logoUrl`/tokens qui existaient déjà : un thème sert
correctement les clients d'un revendeur sans rien savoir de l'existence des revendeurs. C'est la
même discipline que pour les locales — le gabarit reçoit le résultat, pas la règle qui l'a produit.

### Un écran de panel peut être rendu par le module (0.22.0)

Ajout pur : un module écrit contre `0.21.0` reste juste, ses écrans restent déclaratifs. Ce qui
change est la nature de ce qu'un module peut mettre dans le panel — jusqu'ici trois types de
sections, donc ni canevas, ni glisser-déposer, ni prévisualisation.

- `ScreenBundle` sur `ContributedScreen.bundle` : `entry` (fichier ESM déjà construit, relatif au
  dossier du module) et `panel` (plage semver du contrat de panel).
- `PANEL_CONTRACT_VERSION` (`1.0.0`), `PanelScreenMount`, `PanelScreenHost`, `PanelScreenUnmount`,
  `PanelScreenModule`, `invalidContributedScreens()`.
- `ContributedScreen.sections` devient facultatif.

**Le contrat de panel a sa propre version, et c'est le cœur de la décision.** Les deux ne bougent
pas pour les mêmes raisons : le contrat d'hôte gagne un genre ou une capacité toutes les semaines,
le contrat de panel ne parle que de `mount` et de ce qu'il reçoit. Les lier obligerait à republier
un bundle parfaitement valide à chaque ajout de capacité DNS. Il démarre en `1.0.0` — il le peut
parce qu'il promet peu, et il le doit pour qu'une plage `^1.0.0` couvre les ajouts à venir.

**Aucune bibliothèque d'interface n'est nommée par le contrat**, et rien n'est exposé au bundle : il
reçoit un conteneur vide et y crée ce qu'il veut, sa propre instance de React comprise. Deux
instances ne se gênent que si l'une rend dans l'arbre de l'autre, ce qui n'arrive jamais ici. Le
prix est la taille du bundle ; le gain est qu'une montée de React côté panel ne casse rien, et
qu'aucun `external` n'est à configurer côté auteur.

**Le noyau ne construit rien** : le fichier est importé tel quel, servi par une route dédiée avec
ses propres en-têtes (jamais `sandbox`, qui neutraliserait le script sans un message — le piège déjà
consigné pour `/themes/:id/script.js`). L'installation reste un dépôt de fichiers. Un module livré
avec l'application ne peut pas déclarer de bundle : il n'a pas de dossier.

**Un bundle refusé n'éteint pas le module.** Plage non couverte, fichier absent, chemin hors du
dossier : l'écran retombe sur ses `sections` avec un bandeau qui nomme la raison. Un module de
provisionnement dont l'écran a pris du retard doit continuer à livrer des machines. `pnpm
check-extension` avertit d'un bundle sans repli, et refuse un `entry` absent, un `panel` manquant
ou un écran qui n'a ni l'un ni l'autre.

**Ce que le bundle ne reçoit pas** : ni secrets, ni client HTTP, ni jeton de session. Il passe par
`host.callEntryPoint`, c'est-à-dire par `runScreenEntryPoint` côté serveur — même chemin qu'une
section déclarative, même journal d'audit.

### Un module peut ajouter des pages au portail client (0.21.0)

Ajout pur : un module écrit contre `0.20.0` reste juste, il ne déclare simplement aucune page.
C'est la première fois qu'un module à code atteint le **client final** — `contributesScreens` vit
derrière le garde du panel d'administration, et toute une famille de modules du marché (déblocage
d'IP en self-service, gestion d'un site, gestionnaire de mots de passe) n'avait aucun chemin.

- `ContributedPage` sur `ExtensionDescriptor.contributesPages`, plus `runPageData` et
  `runPageAction`. `ModulePageRequest`, `ModulePageActionRequest`, `ModulePageCustomer`,
  `ModulePageService`, `ModulePageResult`, `ModulePageActionResult`, `ContributedLabel`.
- `invalidContributedPages()`, `modulePageHref()`, `modulePageThemeTemplatePath()` et
  `resolveContributedLabel()` accompagnent la déclaration.

**L'URL est préfixée** — `/m/<moduleId>/<pageId>` en zone client, `/x/<moduleId>/<pageId>` en zone
publique. Les deux segments étaient réservés dans `RESERVED_PAGE_SLUGS` avant d'être implémentés,
et c'est le point : un squat d'espace de noms est irréversible dès qu'il existe des modules dans la
nature. Une page n'a pas de sous-chemins ; un état se passe en paramètre de requête.

**L'identité vient du jeton, jamais de l'URL.** Le noyau renseigne `request.customer` à partir de
la session vérifiée et écrase tout `customerId` qui arriverait par les paramètres. Elle n'est
délibérément pas dans `HostContext`, qui vit pour la durée du processus et non de la requête. Ce
que le module reçoit est arbitré — identifiant, `isContact`, et la liste réduite des services —
sans l'identité de facturation.

**Deux méthodes plutôt qu'un point d'entrée unique**, contrairement à `runScreenEntryPoint` qui ne
distingue pas lecture et écriture : la lecture arrive par un GET que n'importe qui peut provoquer,
l'écriture par un POST délibéré. Les confondre ferait d'un passage de robot un déclencheur.

**Le rendu est une cascade** — gabarit du thème (`templates/modules/<moduleId>/<pageId>.liquid`),
gabarit du module, sections déclaratives. Un thème peut donc rhabiller la page d'une extension sans
que son auteur ait rien prévu, ce qui est la parité relevée avec Paymenter
(`vendor/<type>/<nom>/<vue>.blade.php`).

Défauts refusés par `pnpm check-extension` avant le dépôt, parce qu'aucun ne se voit au chargement :
page sans gabarit ni sections, identifiant malformé, doublon, libellé vide, gabarit déclaré mais
absent, `cacheSeconds` en zone client. Le noyau, lui, écarte la page fautive en journalisant plutôt
que d'éteindre le module — une page de trop ne doit pas coûter le module entier.

### Un thème peut apporter ses propres pages (0.20.0)

Ajout pur : un thème écrit contre `0.19.0` reste juste, il ne déclare simplement aucune page.
Nouveauté de nature plutôt que d'ampleur — partout ailleurs un thème rhabille une page qui existe,
ici il en crée une, à une URL que le noyau ne connaît pas.

- `ThemeDefinition.pages?: ThemePageDeclaration[]` — slug, titre, lien de nav facultatif,
  métadonnées. Le gabarit vit dans `templates/custom/<slug>.liquid` et n'a **aucun îlot
  obligatoire** : personne d'autre que l'auteur ne sait ce que cette page raconte. Les îlots y
  restent utilisables — une page de thème peut porter un vrai bouton de commande.
- `invalidThemePages()` et `themePageTemplatePath()` accompagnent la déclaration.
- `RESERVED_PAGE_SLUGS` et `isReservedPageSlug()` **ont déménagé de l'API vers le SDK**. Aucun
  module ne les importait (ils n'étaient pas exportés), donc rien à corriger pour un auteur ; c'est
  désormais la liste à consulter avant de choisir une URL.

**Ce qu'un thème ne peut pas prendre.** Tout slug de `RESERVED_PAGE_SLUGS`, et — plus important au
quotidien — tout slug qu'une page créée au back-office occupe déjà : celle de l'hébergeur l'emporte,
sans un mot, et son lien de nav est le seul écrit. C'est la même règle que les réglages de marque
face aux tokens du thème, et l'ordre de la navigation la dit à voix haute : le noyau, puis ce que
l'hébergeur a saisi, puis ce que le thème propose.

Trois défauts de déclaration ne se voient jamais au rendu — slug réservé, doublon, gabarit
manquant — et produisent tous un thème qui paraît complet. `pnpm check-extension` les refuse avant
le dépôt. Le noyau, lui, ignore la page fautive en journalisant plutôt que d'éteindre le thème
entier : une page de trop ne doit pas coûter l'apparence de toute l'instance.

### Les pages d'authentification deviennent thémables : 8 vues de plus (0.19.0)

Ajout pur, de la même famille que les deux précédents : un thème écrit contre `0.18.0` reste juste,
il ne fournit aucun de ces gabarits et les pages concernées gardent les écrans du noyau. Le portail
est désormais thémable en entier — 42 pages sur 42.

Deux élargissements de champs existants, aucun retrait :

- `ThemeViewSpec.area` accepte `"auth"`. Une vue `auth` est rendue par l'API seule, comme une vue
  `marketing` : ces écrans sont servis sans session. Zone distincte malgré la source commune, parce
  que la distinction porte pour l'auteur d'un thème.
- `ThemeIslandSpec.area` accepte `"auth"`. Le sens du champ ne change pas — un îlot portant une
  `area` est refusé dans une page créée au panel — mais **un module qui testait `area === "account"`
  doit désormais tester la présence de la clé**. C'est le seul point de vigilance de cette version,
  et il ne concerne qu'un module qui inspecterait `THEME_ISLANDS`, ce qu'aucun ne fait aujourd'hui.

Le point qui mérite d'être lu avant d'écrire un gabarit de connexion : **aucun contexte de vue
`auth` ne porte de jeton, de ticket ni de code.** `reset-password` reçoit `hasToken`, `sso-link`
reçoit `hasTicket`, `sso-callback` reçoit `providerFailed` — des booléens, jamais le secret. Celui-ci
va de la page du portail directement à l'îlot, sans passer par la route de rendu. Un gabarit obtient
donc de quoi choisir ce qu'il affiche (le formulaire, ou un message « ce lien est incomplet »),
jamais de quoi agir à la place du visiteur.

La garde qui existait déjà est étendue, pas assouplie : les îlots `auth-*` montent les composants
d'origine du portail, avec leur URL de soumission, leur gestion du second facteur et leur
redirection compilées. Un gabarit choisit où le formulaire apparaît, rien d'autre, et
`pnpm check-extension` refuse un gabarit de connexion qui oublierait `auth-login`. Ce que cette
garde ne prétend pas être : une barrière contre un thème hostile. Un gabarit Liquid produit du HTML
arbitraire, donc un faux formulaire y tient en six lignes ; ce qui l'en empêche est le chemin de
dépôt (SSH/FTP, donc un accès serveur), pas ce mécanisme. La garde porte sur l'autre source — un
réglage de marque saisi au panel ne peut ni fournir de gabarit, ni de script.

### L'espace client devient thémable : 25 vues de plus (0.18.0)

Ajout pur, du même genre que `content-page` : un thème écrit contre `0.17.0` reste juste, il ne
fournit aucun de ces gabarits et les pages concernées gardent les écrans du noyau. Ce qui change est
l'ampleur — un thème pouvait rhabiller 9 pages sur 42, il peut en rhabiller 34. Restent hors du
registre les 8 pages d'authentification.

Deux champs nouveaux, et le second est le seul point d'attention réel pour un auteur :

- `ThemeIslandSpec.area?: "account"` — l'îlot s'adresse à un client connecté, et le panel le refuse
  donc dans une page créée par l'hébergeur, qui est publique.
- `ThemeViewSpec.area: "marketing" | "account"` — **qui** assemble le contexte de la vue. Une vue
  `marketing` est rendue par l'API seule (`GET /themes/render/view/:name`) ; une vue `account`
  reçoit son contexte de la page du portail, qui vient de le charger avec le jeton du visiteur
  (`POST /themes/render/view/:name`, authentifiée client). Ce champ est obligatoire sur
  `ThemeViewSpec` : un module qui construirait ses propres `ThemeViewSpec` — cas qui n'existe pas
  aujourd'hui, le registre appartenant au noyau — devrait l'ajouter.

Pourquoi deux producteurs de contexte plutôt qu'un : tout ce qu'affiche l'espace client dépend du
client connecté, et la page vient de charger ces données, déjà mises en forme dans sa langue et sa
devise. Les refaire descendre côté API aurait voulu dire les charger deux fois, les formater deux
fois, et entretenir un miroir de plus entre ce que la page affiche et ce que le gabarit reçoit.
`scripts/check-mirrors.ts` vérifie désormais que chaque vue déclarée a bien son producteur, et
qu'aucune page de l'espace client n'est restée sans vue.

`ThemeViewContext` gagne `locale` : le noyau ne fournit toujours aucun dictionnaire de libellés —
un gabarit écrit les siens — mais il dit désormais dans quelle langue rendre.

Aucune des deux routes de rendu n'est publique au sens de ce document : ni l'une ni l'autre n'est
joignable par une clé d'API.

### `reportsNodeCapacity` : un ajout mineur en pratique

La page de statut public a ajouté `reportsNodeCapacity?: boolean` et `listNodeCapacity?(...)` à
`ProvisioningDescriptor` (`packages/extension-sdk/src/kinds/provisioning.ts`) — champs optionnels,
hors de `capabilities` puisqu'il ne s'agit pas d'une action par service. Un module existant qui les
ignore continue de charger et de fonctionner à l'identique ; c'est l'exemple concret de ce que
« mineure » veut dire ci-dessus. Comme pour `capabilities`, annoncer `reportsNodeCapacity: true`
sans fournir `listNodeCapacity` est une incohérence structurelle détectée dès le chargement réel du
module par `discoverExtensions` (`packages/extension-sdk/src/loader/discover.ts`, même appel à
`missingNodeCapacityReporting`) — pas seulement par `pnpm check-extension`, qui ne fait ici que
rejouer localement ce que verrait une instance au démarrage.

### Le nom du scope fait partie du contrat

Le renommage en `@opbs` a été fait avant cette publication (2026-08-29) — c'est donc sous ce nom,
définitif, que le SDK a été publié sur npm le 2026-09-05.

Le scope vit désormais dans l'`import` et le `package.json` de chaque module tiers. Le changer
serait une rupture pour l'écosystème entier, sans autre voie de sortie que publier les deux scopes
en parallèle pendant une version majeure.
