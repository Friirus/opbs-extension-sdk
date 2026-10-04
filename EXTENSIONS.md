# Écrire un module

Ce document rassemble ce qu'il faut savoir pour écrire un module opbs, du premier fichier au
dépôt sur une instance — sans avoir besoin d'un accès à ce dépôt au-delà des fichiers publics qu'il
contient (`@opbs/extension-sdk`, ces exemples, ce document).

**Le contrat n'est pas encore figé.** Lisez `COMPATIBILITY.md` avant de publier quoi que ce soit :
il dit ce sur quoi vous pouvez vous appuyer aujourd'hui, et ce qui bougera sans préavis.

## Les sept genres

Un module se déclare `provisioning`, `payment`, `notification`, `theme`, `addon`, `registrar` ou
`dns` dans son `extension.json`. Le contrat exact de chaque genre est le type qu'il implémente —
pas une copie ici, qui divergerait tôt ou tard :

| Genre | Fait quoi | Contrat | Exemple tiers commenté |
|---|---|---|---|
| `provisioning` | Livre le service acheté (créer/suspendre/redimensionner une machine, un compte…) | type `ProvisioningDescriptor` du SDK | module d'exemple `static-pool` |
| `payment` | Encaisse un client | type `PaymentGatewayDescriptor` du SDK | module d'exemple `purchase-order` |
| `notification` | Réagit à un événement (Discord, Slack, SMTP…) | type `NotificationChannelDescriptor` du SDK | module d'exemple `slack-status` |
| `theme` | Change l'apparence de la vitrine et de l'espace client | type `ThemeDefinition` du SDK | module d'exemple `theme-kiosque` |
| `addon` | Propose ses propres options d'abonnement, avec un effet réel à l'ajout/au retrait | type `AddonDescriptor` du SDK | module d'exemple `pterodactyl-ports` |
| `registrar` | Enregistre/renouvelle/transfère des noms de domaine chez un fournisseur | type `RegistrarDescriptor` du SDK | module d'exemple `reference-registrar` |
| `dns` | Héberge des zones et enregistrements DNS pour le compte du client | type `DnsDescriptor` du SDK | module d'exemple `reference-dns` |

Deux champs du manifeste (`extension.json`) valent une clarification avant d'aller plus loin.
`entry` accepte `.js`, `.cjs` et `.mjs` : `require()` charge aussi bien un module ESM synchrone
(`export default …`) qu'un module CommonJS, sans configuration côté auteur — seule limite, un
`await` de premier niveau, que `require()` refuse par nature. `scopes` — une liste de chaînes
libres (`"customers:read"`, par exemple) — est **purement déclarative** : affichée à
l'administrateur au moment de l'activation, elle ne restreint rien côté noyau, qui ne peut de toute
façon pas faire respecter une portée à du code qui s'exécute avec les droits du processus. Elle sert
à rendre visible, avant d'actionner l'interrupteur, un canal de notification qui réclamerait l'accès
au fichier clients — pas à accorder un droit.

Chaque genre déclare des **capacités** (`capabilities`) plutôt que de tout implémenter : le panel
n'affiche que les boutons qui marchent, et le noyau n'appelle jamais une méthode qu'une capacité
n'autorise pas. Une capacité annoncée sans méthode correspondante refuse de charger — vérifiez la
vôtre avec `pnpm check-extension` (voir plus bas) avant de la déposer.

`addon` fait exception à ce dernier point : il n'a pas de `capabilities` à cocher, ses trois
méthodes (`offeringsFor`, `onAttach`, `onDetach`) sont toutes requises d'emblée. Un module qui n'a
rien à *faire* à l'ajout d'une option n'a pas sa place ici — le catalogue interne (géré depuis
Facturation › Options dans le panel, sans écrire de module) couvre déjà les options purement
tarifaires.

Un module `payment` a deux capacités distinctes autour des moyens de paiement conservés, et elles
ne se remplacent pas : `storedMethods` dit « je sais décrire et détacher la carte qu'un règlement a
laissée » (`describeStoredMethod`, `detachStoredMethod`), `methodSetup` dit « je sais faire
enregistrer une carte hors de tout paiement » (`createMethodSetup`, qui rend une URL de saisie).
La seconde est ce qui permet à un client de remplacer sa carte **avant** qu'elle n'expire, depuis
son portail. L'enregistrement n'est pas rendu par l'appel mais notifié ensuite par un événement
`method.stored` (dans `verifyWebhook`), avec `reference` = l'identifiant client transporté à
l'aller : au retour du client, le prestataire n'a pas toujours fini de valider la carte.

`verifyWebhook` reçoit `WebhookRequest.rawBody`, typé `Buffer` (corps brut, avant tout parsing —
requis pour vérifier une signature HMAC). Sous `// @ts-check`, ce type n'existe que si `@types/node`
est résolu par votre éditeur — la même dépendance de développement que celle de `@opbs/extension-sdk`
suffit, `Buffer` fait partie de ses types globaux Node.

Depuis 0.36.0, `verifyWebhook` traduit aussi ce qui se passe côté prestataire sans passer par un
appel du noyau : `payment.refunded` (un remboursement fait depuis le tableau de bord de la
passerelle, `gatewayRef` = l'encaissement d'origine, `refundRef` = le remboursement lui-même, clé
d'idempotence pour un webhook rejoué) et `payment.dispute.closed` (un `payment.disputed` antérieur
se referme, `won` ou `lost`). Sans eux, un remboursement fait chez le prestataire laisse la facture
locale `PAID` alors que l'argent est reparti. Un module qui les émet déclare `engines.host:
"^0.36.0"`.

Le noyau ne souscrit rien chez le prestataire : l'hébergeur coche, en créant l'endpoint ou le
webhook, les événements qu'il enverra, et un événement non coché n'arrive jamais, sans erreur ni
d'un côté ni de l'autre. Si votre module traduit des événements du prestataire (paiement,
remboursement, litige), sa documentation **et** l'aide (`help`) du champ de configuration qui porte
le secret ou l'identifiant du webhook doivent nommer chacun d'eux, sinon un hébergeur qui a créé son
endpoint avec une sélection ne les recevra jamais. Les modules livrés le font, et un spec compare
leur liste aux événements que `verifyWebhook` lit réellement : `stripe` lit
`checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`,
`charge.dispute.created`, `charge.dispute.closed`, `refund.created` et `refund.updated` ; `paypal`
lit `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`,
`CUSTOMER.DISPUTE.CREATED` et `CUSTOMER.DISPUTE.RESOLVED`.

Un module `provisioning` peut en plus déclarer `reportsNodeCapacity: true` et implémenter
`listNodeCapacity(ctx, provider)` s'il a une notion de nœud physique (cpu/mem/disque observés, par
opposition à `ResourceSpec` qui est ce qui est *vendu*). C'est un champ à part, hors de
`capabilities` : ce n'est pas une action par service, mais une capacité du fournisseur lui-même,
utilisée par la page de statut public du panel. Absent : le module n'a simplement pas de nœud à
rapporter, ce qui est le cas courant (livraison manuelle, panel de jeu…).

`ProvisioningTarget.network` (depuis `0.10.0`) porte l'IPv4/IPv6 déjà allouée par le noyau à ce
service, quand un pool `IpPool` est rattaché à l'offre — utile à un module qui configure lui-même
le réseau de l'invité (cloud-init) plutôt que de compter sur un DHCP côté hyperviseur. `undefined`
sans pool configuré : le module retombe alors sur son propre comportement par défaut.

### Les trois niveaux de configuration d'un module `provisioning`

Ils ne se remplacent pas, et c'est ce découpage qui permet à un même module de servir plusieurs
serveurs et plusieurs offres :

| Champ | Décrit | Saisi dans le panel |
|---|---|---|
| `configFields` | Le module lui-même, une fois pour toutes | Paramètres › Extensions, sur la carte du module |
| `providerConfigFields` | Une **instance de fournisseur** : un cluster, un serveur, une région, un compte d'API | Même carte, section « Fournisseurs » (voir ci-dessous) |
| `productConfigFields` | Ce qui est **vendu** : quel gabarit cloner, quel plan, quelle région | Facturation › Produits, formulaire de l'offre |

Un `ConfigField` de type `provider` dans `productConfigFields` est rendu comme une liste
déroulante des fournisseurs configurés pour *votre* module — le panel remplit les options, vous
n'avez rien à déclarer. C'est la valeur que `providerIdOf(config)` doit rendre, et c'est elle que le
noyau utilise pour vous restituer le bon `ProvisioningTarget.provider`. Déclarez
`providerConfigFields: []` si votre module n'a pas de fournisseur (livraison manuelle, API globale
dont la clé tient dans `configFields`) : le panel cesse alors d'en réclamer un, et le noyau
provisionne sans en attendre.

Les trois niveaux sont rendus depuis vos déclarations, pour un module déposé sur l'instance comme
pour un module livré : votre offre est sélectionnable dans le catalogue dès que le module est
activé, sans écran spécifique à écrire. `checkProvider(ctx, provider)`, si vous l'implémentez,
alimente le bouton « Tester » à côté de chaque fournisseur — rendez un message dans les deux cas,
« connecté » sans détail n'apprend rien et un échec sans la raison oblige l'hébergeur à deviner.

### Refuser une configuration

Vos trois fonctions `parse*` doivent lever quand la configuration est inexploitable — c'est tout
leur travail, et c'est ce qui fait refuser une offre mal réglée **à la création** plutôt qu'au
premier provisionnement, donc après paiement du client. Le noyau distingue votre refus d'un
plantage, et il le fait **au nom de l'erreur** :

```js
function configError(message) {
  const error = new Error(message);
  error.name = "ExtensionConfigError";
  return error;
}

parseProductConfig(raw) {
  if (!raw?.plan) {
    throw configError("Champ requis manquant ou vide : Gabarit");
  }
  return { plan: String(raw.plan) };
}
```

Une erreur nommée `ExtensionConfigError` devient un 400 qui affiche votre message dans le
formulaire ; toute autre erreur reste un 500, ce qui est le bon comportement pour un vrai bug —
elle ne doit pas renvoyer l'administrateur corriger un formulaire correct. Le nom plutôt que la
classe du SDK, parce qu'un module déposé sur le serveur est chargé par `require` depuis le dossier
des extensions et ne peut pas résoudre `@opbs/extension-sdk`. Tous les modules d'exemple utilisent
ce petit constructeur.

Un module `registrar` vend des noms de domaine plutôt que des machines : `RegistrarCapabilities`
(`checkAvailability, register, renew, transfer, updateNameservers, updateContact,
setTransferLock, whoisPrivacy`) suit le même principe déclaratif que `provisioning` — un module de
livraison manuelle ne sait pas verrouiller un transfert programmatiquement, et le panel n'affiche
alors pas le bouton. Deux niveaux de configuration, comme pour `provisioning`, mais avec un sens
différent : `providerConfigFields` décrit le **compte chez le registrar** (clé d'API, identifiant
revendeur — une liste vide, comme pour `manual-registrar`, signifie livraison manuelle sans
fournisseur), `productConfigFields` décrit **ce qui est vendu**, c'est-à-dire le TLD lui-même
(`.com`, `.fr`…) et sa grille de tarification ; les mélanger obligerait à un module par TLD. Comme
pour `provisioning`, aucune méthode d'exécution n'a accès à la base et toutes sont appelées depuis
une file qui rejoue en cas d'échec : **elles doivent être idempotentes** — `register` peut être
rappelé avec un `remoteId` déjà renseigné (une tentative précédente a pu aboutir côté registrar
puis échouer à s'enregistrer côté noyau), et redemander le même état de verrouillage de transfert
n'est jamais une erreur.

### Quand le fournisseur ne livre pas à l'appel

`manualActionRequired: true` laisse un service ou un domaine « en attente » et confie la suite à un
humain. Tous les fournisseurs ne fonctionnent pas ainsi : certains **prennent commande** — panier,
bon de commande, paiement — et livrent minutes ou heures plus tard, sans jamais rappeler personne.
Un module n'a ni file ni horloge, il ne peut pas se réveiller seul pour aller voir.

C'est à cela que sert `retryAfterSeconds`, sur `ProvisioningOutcome` comme sur `RegistrarOutcome` :

```js
async create(ctx, target) {
  // Idempotence : ne jamais recommander ce qui l'a déjà été.
  const orderId = target.remoteMeta.orderId ?? (await placeOrder(ctx, target));
  const delivered = await checkOrder(ctx, orderId);
  if (!delivered) {
    return { remoteMeta: { orderId }, retryAfterSeconds: 300 };
  }
  return { remoteId: delivered.serverId, remoteMeta: { orderId } };
}
```

Le noyau rappelle alors **la même opération**, avec le même `target` — `remoteMeta` compris, où le
module aura rangé de quoi se reconnaître. Le service ou le domaine reste dans son état d'attente
entre deux passages, et l'événement de fin (`service.provisioned`, `domain.registered`) n'est émis
qu'une fois le travail réellement terminé.

Trois garanties, pour qu'un module n'ait pas à s'en occuper lui-même : le délai est ramené entre
10 secondes et 1 heure ; le nombre de rappels est plafonné (96), au-delà duquel l'opération est
déclarée en échec avec un message qui nomme le module ; et un rappel dont le service n'attend plus
— résilié, supprimé, ou repris à la main entre-temps — est abandonné sans bruit.

**Le piège est l'idempotence, et il coûte cher ici.** L'exigence vaut pour toutes les méthodes
d'exécution, mais c'est avec `retryAfterSeconds` qu'on la voit : un `create` qui ne relit pas la
commande qu'il a déjà passée en passe une deuxième à chaque réveil. Chez un fournisseur payant,
cela se compte en argent réel. Rangez la référence de commande dans `remoteMeta` **avant** de
demander le rappel, et relisez-la en tête de méthode.

**Second piège, découvert seulement contre une vraie commande (jamais un schéma d'API ni un mock) :
le statut administratif d'une commande ment lui aussi**, exactement comme une tâche d'hyperviseur
peut annoncer `done` avant que la machine ne le soit vraiment. Sur le module d'exemple `ovh-cloud`,
`GET /me/order/{id}/status` a répondu `delivering` pendant plus de 15 minutes après que la
ressource elle-même (`GET /vps/{serviceName}`) était déjà `running` — un module qui n'aurait
conclu que sur `status === "delivered"` serait resté bloqué sans jamais livrer, en argent déjà
encaissé. La leçon : dès qu'un statut de commande n'exclut plus formellement la livraison
(`checking`, `delivering`, tout ce qui n'est ni un échec ni une attente de paiement/document),
**tentez de résoudre la ressource elle-même à chaque relève**, pas seulement au statut « terminé »
documenté — c'est elle qui fait foi, jamais l'état administratif qui l'accompagne.

`manual-registrar`, livré avec le noyau, est le filet par défaut : sans lui, aucun hébergeur ne
peut vendre le moindre nom de domaine tant qu'il n'a pas installé un module tiers réel — il ne fait
aucun appel réseau, `register`/`renew` renvoient `manualActionRequired: true` et le staff termine
l'opération à la main chez le registrar de son choix, en mettant à jour l'état (expiration,
nameservers, statut) depuis le panel. Le module d'exemple `reference-registrar` montre à l'inverse
une intégration HTTP réelle contre un registrar fictif, avec un sous-ensemble honnête de
capacités : ce module ne déclare ni `transfer` ni `updateContact`, deux opérations qui, chez la
plupart des registrars réels, passent par un workflow de vérification d'identité qu'une intégration
HTTP simple ne couvre pas.

À la commande d'un domaine, le noyau crée-ou-réutilise automatiquement un `Product` **caché**
(`Product.hidden: true`, exclu des listings catalogue normaux) portant le `driverId` du module
registrar et le TLD acheté — c'est ce qui permet de réutiliser tel quel le moteur de facturation
(`Subscription`, `Invoice`, renouvellement, avoirs) sans qu'il ait besoin de connaître la notion de
domaine. Un auteur de module `registrar` qui verrait dans le panel admin des « produits » qu'il n'a
jamais créés à la main n'a rien à faire : c'est ce pont, pas une anomalie.

Un module `dns` héberge des zones plutôt que des machines ou des domaines : `DnsCapabilities`
(`createZone, deleteZone, syncZone`) suit le même principe déclaratif que les autres genres, mais
avec une config à un **seul** niveau (`configFields`/`parseConfig` du socle commun, comme un
module `payment` ou `notification`) — pas de `providerConfigFields`/`productConfigFields` séparés
comme `registrar` : un module dns pilote un unique service par installation, pas plusieurs comptes
ni un catalogue de TLD. `syncZone` reçoit l'état complet voulu pour la zone (`target.records`) et
calcule lui-même ce qui doit être créé/mis à jour/supprimé côté fournisseur — pas de CRUD par
enregistrement dans le contrat, un fournisseur DNS expose presque toujours une API par zone
entière. Comme pour `registrar`, aucune méthode d'exécution n'a accès à la base et toutes sont
appelées depuis une file qui rejoue en cas d'échec : **elles doivent être idempotentes** —
`createZone` peut être rappelée avec une zone déjà créée côté fournisseur, `syncZone` pousse un
état complet donc un rejeu est par construction sans effet de bord, `deleteZone` rappelée sur une
zone déjà supprimée doit réussir.

Le service DNS est **inclus et gratuit** côté noyau : contrairement à `Domain` (registrar), une
`DnsZone` n'a pas de `Subscription` ni de `Product` caché associé — aucun pont vers le moteur de
facturation, seulement un plafond de zones par client (`InstanceSettings.maxDnsZonesPerCustomer`).
Le module livré `powerdns` est une intégration réelle contre un serveur PowerDNS Authoritative — il
n'existe pas de variante « manuelle » pour ce genre (un service DNS sans aucune automatisation
n'aurait rien à faire, le client ne pourrait éditer aucun enregistrement). Le module d'exemple
`reference-dns` montre la même chose depuis l'extérieur du dépôt, contre un fournisseur fictif.

Un module `dns` peut aussi déclarer `ptr: true` et implémenter `setPtr(ctx, target, hostname)` pour
poser/effacer le reverse DNS (PTR) d'une IP assignée à un service client — capacité bolt-on à part,
sur le même patron que `whoisPrivacy`/`setWhoisPrivacy` côté `registrar` : elle se tient par
`setPtr`, dont le nom diffère de la capacité. Contrairement aux zones classiques ci-dessus,
`PtrTarget` ne porte ni nom de zone ni enregistrements et le client n'en est jamais propriétaire —
la zone `in-addr.arpa`/`ip6.arpa` qui accueille réellement le PTR appartient à l'hébergeur (via son
bloc d'IP), c'est au module de la retrouver depuis `target.ip`/`target.ipVersion`. `hostname: null`
signifie effacer. `setPtr` doit être idempotente comme le reste : rappelée avec le même hostname (ou
`null`) déjà en place doit réussir sans effet.

## `HostContext` : ce que reçoit chaque appel

Défini dans `packages/extension-sdk/src/host.ts`. Six champs, jamais plus :

- `config` — la configuration du module, déchiffrée et déjà passée par votre propre `parseConfig`.
- `locale` — voir `SupportedLocale` (liste extensible), jamais `null`/`undefined`. Pas forcément celle
  d'un client précis. Le critère est **qui lit le texte que vous produisez** : pour un module
  `payment` ou `addon`, c'est le client, donc c'est sa locale qui vous est servie quand l'appelant
  (checkout, webhook, écran des options) la connaît — le `name` d'une `AddonOffering` est figé sur
  la ligne d'option à l'ajout, puis réapparaît sur la facture du client, où la langue de l'hébergeur
  n'aurait rien à faire. Pour un canal `notification`, qui vise une destination fixe et non un
  client, ou pour `provisioning`/`theme`, dont les textes sont lus par l'hébergeur ou arbitrés par
  le thème, c'est la langue d'exploitation de l'instance (`InstanceSettings.defaultLocale`) — qui
  reste aussi le repli des deux premiers quand l'appelant est un chemin staff. Un module qui n'en
  fait rien peut l'ignorer sans risque : le repli `fr` est toujours valide.
- `logger` — `debug`/`info`/`warn`/`error`, préfixé par votre identifiant. `info`, `warn` et
  `error` sont **enregistrés en base** et consultables depuis la carte de votre module, dans
  Paramètres › Extensions ; `debug` ne part que dans la sortie du serveur, pour ne pas remplir la
  table pendant que vous mettez votre module au point. Le second argument (`meta`) est conservé,
  sérialisé et tronqué. Le débit est plafonné par module : un module en boucle voit ses lignes
  écartées et remplacées par une ligne de synthèse.
- `http` — `fetch`, mais borné : 20 s de délai d'attente et 5 Mio de réponse maximum. « Borné » ne
  veut dire que cela — **aucune destination n'est filtrée**, et le noyau ne vous empêche pas
  d'appeler une adresse interne. Si vous posez votre propre `AbortSignal` (pour pouvoir annuler),
  il s'ajoute au nôtre au lieu de le remplacer : le plafond de 20 s tient dans tous les cas.
  Chaque appel laisse une trace `debug` dans votre journal — l'hôte appelé, le chemin et le statut,
  jamais la chaîne de requête, qui porte parfois un jeton.
- `storage` — un stockage clé-valeur cloisonné par module
  (`get`/`set`/`setIfAbsent`/`delete`/`keys`). Pas de table à réclamer au noyau : les modules
  d'exemple `static-pool` et `slack-status` l'utilisent pour tenir un état propre au module. Borné
  lui aussi, depuis le SDK 0.26.0 : **256 Kio par valeur et 500 clés par module**, au-delà desquels
  `set` et `setIfAbsent` lèvent. Ce n'est pas un cache de réponses HTTP — cette table part dans
  chaque sauvegarde de l'hébergeur. `setIfAbsent` (SDK 0.28.0) est atomique et rend `false` si la
  clé existait : c'est la seule façon correcte de **réserver** une ressource (un port, un numéro)
  quand deux appels peuvent se chevaucher — le noyau ne sérialise jamais les appels à un module, et
  un `get` suivi d'un `set` sur un blob unique ne protège de rien. `pterodactyl-ports` montre la
  forme : une clé par ressource, et le plafond de clés qui borne alors la taille du pool.
  `keys(prefix)` (SDK 0.29.0) rend, triées, les clés qui commencent par `prefix` (`""` pour tout
  lister) : c'est ce qui permet d'inventorier ce qu'on a rangé — combien de ressources restent,
  lesquelles appartiennent à quel abonnement — sans tenir un compteur à part, faux sous la même
  concurrence que `setIfAbsent` protège déjà.
- `emit(event, payload)` — remonte un événement au noyau, préfixé `extension.<votre-id>.<event>`.
  Relayé aux canaux `notification` activés, exactement comme les événements du noyau (voir plus
  bas). **Pas** relayé aux points de terminaison webhook sortants : un abonnement webhook ne peut
  cibler que le vocabulaire de `CORE_EVENTS`, et votre événement préfixé n'y figure jamais. Et
  **pas relayé du tout** quand c'est votre propre méthode qui est appelée depuis le bus — le `send`
  d'un canal `notification`, ou la résolution de la configuration SMTP avant l'envoi d'un e-mail :
  ces appels-là construisent un `HostContext` sans relais d'événement câblé, pour ne pas boucler.

**Un module ne reçoit jamais le client de base de données**, et ce `HostContext` n'est pas un bac à
sable : du code déposé sur le serveur s'exécute avec les droits du processus. Le modèle de
confiance, c'est l'installation par dépôt de fichiers — voir « Écrire, vérifier, déposer ».

## Le noyau borne vos appels, et compte vos échecs

Deux choses valent d'être connues avant d'écrire une méthode qui appelle un prestataire.

**Chaque appel du noyau vers votre module est borné à 30 secondes.** Passé ce délai, l'appelant
reprend la main sur une erreur nommée (`ModuleCallTimeoutError`) et poursuit son travail — votre
code, lui, continue de tourner : rien ne peut interrompre du code Node déjà parti. Ce que la borne
garantit, c'est qu'un module lent n'immobilise ni un worker qui enchaîne des renouvellements, ni la
requête HTTP du client qui paie. `ctx.http` a sa propre borne, plus courte (20 s), mais elle ne
protège que les appels qui passent par lui : un module qui importe le SDK officiel de son
prestataire ne dépend que de celle-ci.

**Vos échecs sont comptés.** Chaque appel qui lève — délai dépassé, clé révoquée, prestataire
injoignable — est retenu une heure et affiché sur votre carte dans Paramètres › Extensions, avec le
dernier message. C'est délibérément un compteur et non un disjoncteur : le noyau ne met jamais un
module en quarantaine de lui-même. Éteindre une passerelle empêcherait tout client de payer pour
réparer un symptôme que l'hébergeur n'a pas encore vu ; cette décision lui revient.

## Les événements

`CORE_EVENTS` (`packages/extension-sdk/src/events.ts`) est la liste des événements métier :
`order.created`, `invoice.paid`, `invoice.disputed`, `service.provisioned`,
`subscription.cancelled`, `ticket.created`, `node.capacity.warning`, `login.suspicious`,
`billing.oss_threshold.warning`, `domain.registered`, `domain.renewal.failed`,
`domain.expiring`, `domain.transfer.completed`, `service.monitor.down`, `service.monitor.up`,
`dns.zone.created`, `dns.zone.deleted`, `dns.zone.error`, `customer.registered`,
`referral.commission.earned`, `invoice.refunded`, `provisioning.approval.requested`. C'est la même liste dont se sert un point de terminaison webhook
sortant configuré depuis le panel — un module `notification` et un webhook s'abonnent au même
vocabulaire.

Un module `notification` déclare `send(ctx, event)` (`NotificationEvent { type, payload,
occurredAt }`) et, optionnellement, `supportedEvents` — la liste d'événements auxquels il réagit.
Absent, il reçoit tout (c'est le choix de Discord, livré). Restreint, il ne reçoit que ce qu'il
déclare (c'est le choix de `slack-status`, en exemple).

`payload` se resserre quand `event.type` est un littéral connu de `CoreEvent` :

```ts
async send(ctx, event) {
  if (event.type === "invoice.paid") {
    // event.payload est ici { invoiceId: string; totalCents: number } — pas Record<string, unknown>.
    return notify(`Facture réglée : ${event.payload.totalCents} centimes`);
  }
  return { delivered: false, error: `événement non géré : ${event.type}` };
}
```

`CoreEventPayloads` (exporté par le SDK) liste la forme exacte des 22 événements canoniques —
`NotificationEvent<"invoice.paid">` s'écrit directement si vous voulez ce narrowing sur une
signature explicite plutôt que sur un `if`.

`send` **ne doit jamais lever** : un canal en échec renvoie `{ delivered: false, error }`, et
n'interrompt jamais ce qui a déclenché l'événement — une facture réglée reste réglée même si le
canal qui devait l'annoncer est en panne.

Un module `notification` peut aussi déclarer `sendTest(ctx)`, appelé par le bouton « Envoyer un
essai » de sa carte dans Paramètres › Extensions — visible dès que la méthode existe, sans écran à
écrire. Même contrat que `send` : rend `{ delivered, error? }`, ne lève jamais. Le module `discord`
livré la déclare déjà, et l'expose une seconde fois depuis son propre écran contribué (une action
`send-test`) — les deux chemins appellent la même méthode, ce n'est pas une redite à corriger.

`NotificationEvent.payload` n'est jamais filtré pour un canal en particulier — le bus ne connaît
pas ses abonnés. Certains événements portent des données personnelles (`email` sur
`customer.registered`, `ipAddress`/`device` sur `login.suspicious`, `subject` sur
`ticket.created`, `target` — l'hôte ou l'URL du service du client — sur `service.monitor.down` et
`.up`, `message` — le texte d'erreur brut du registrar ou du DNS — sur `domain.renewal.failed` et
`dns.zone.error`, `reason` sur `subscription.cancelled`, `name` sur les événements de domaine, de
zone et de sonde) : un canal qui relaie vers un service tiers **ne doit jamais poster ce payload
tel quel**. `discord.ts` (livré) construit un résumé avec `event-digest.ts`
(`packages/extensions/src/bundled/`) plutôt que de sérialiser l'événement brut.

Deux règles à reprendre si vous écrivez votre propre canal. Un module tiers émet aussi sur le bus
(`extension.<moduleId>.<événement>`, charge utile libre) : comparez donc les **clés normalisées**
(minuscules, sans `_` ni `-`) et non des chaînes exactes, faute de quoi `customerEmail`,
`contactEmail`, `ip_address` ou `clientIp` passent inchangés. Et ne vous fiez pas à une liste
d'exclusion pour les événements du noyau : `event-digest.ts` tranche chaque champ de chaque
événement (`CORE_EVENT_FIELD_DECISIONS`, `masked` ou `kept`) et un spec échoue dès qu'un champ de
`CoreEventPayloads` arrive sans décision.

Le masquage de `event-digest.ts` lit les clés **et** la forme des valeurs : toute chaîne, à toute
profondeur, qui contient une adresse e-mail ou une adresse IP (v4 ou v6) voit cette sous-chaîne
remplacée par `[masqué]`, quelle que soit sa clé (`1.2.3.4` est une IPv4 valide : un numéro de
version à quatre nombres est masqué aussi). C'est un filet, pas une garantie : un nom, une raison
sociale ou un texte libre n'ont aucune forme à reconnaître. **Auteur de module, ne mettez aucune
donnée personnelle sous une clé arbitraire** (`label`, `owner`, `note2`…) dans la charge utile de
vos événements `extension.<moduleId>.<événement>` : le canal Discord livré relaie tout ce que le
bus porte, et un webhook sortant configuré vers une URL Discord reçoit la charge brute.

## Écrans contribués

Un module — de n'importe quel genre — peut ajouter un écran au panel admin, sans y déposer de
code. Deux champs optionnels sur le descripteur :

```ts
contributesScreens?: ContributedScreen[];
runScreenEntryPoint?(ctx: HostContext, entryPoint: string, input: Record<string, unknown>): Promise<unknown>;
```

Un `ContributedScreen` (type du SDK partagé par tous les genres) a un `id`, un `label`, et des
sections de trois types : `table` (lit, via un point d'entrée), `form` (soumet des champs
`ConfigField` — les mêmes types que la configuration du module), `actions` (boutons qui appellent
un point d'entrée sans saisie). Le panel rend tout ça avec le même moteur que le formulaire de
configuration.

Les modules d'exemple `purchase-order` (une table + un formulaire) et `slack-status` (une table
alimentée par `ctx.storage`) en sont des exemples complets.

### Un écran rendu par votre code

Trois types de sections ne font ni canevas, ni glisser-déposer, ni prévisualisation. Un écran peut
donc livrer son **propre rendu** : un fichier ESM que vous avez déjà construit, importé par le
panel à l'exécution.

```ts
bundle?: { entry: string; panel: string };
```

`entry` est le chemin du fichier, relatif au dossier de votre module ; `panel` la plage semver du
**contrat de panel** (`PANEL_CONTRACT_VERSION`, aujourd'hui `1.0.0`) que vous visez. Le fichier
exporte par défaut une fonction de montage :

```js
export default function mount(container, host) {
  // `container` est un élément vide qui vous appartient.
  // `host` : { moduleId, screenId, locale, callEntryPoint(entryPoint, input?) }
  return () => {
    /* démontage : intervalles, écouteurs, root.unmount() */
  };
}
```

Quatre choses à savoir avant d'écrire ce fichier.

**Le contrat ne nomme aucune bibliothèque d'interface.** Le conteneur vous appartient : vous y
créez votre propre racine React, du Preact, ou du DOM brut. Vous embarquez donc React dans votre
bundle, et ce n'est pas un accident — deux instances de React sur la même page ne se gênent que si
l'une rend des composants dans l'arbre de l'autre, ce qui n'arrive jamais ici. Vous payez ~45 Ko
gzip ; en échange, une montée de version du panel ne casse pas votre module, et vous construisez
avec l'outillage de votre choix sans configuration d'`external` à réussir. Un `vite build` en
`format: "es"` suffit.

**Le noyau ne construit rien.** Livrez le fichier construit dans votre module. L'installation reste
un dépôt de fichiers : aucune reconstruction d'image, aucune dépendance à installer chez
l'hébergeur. Corollaire : un module *livré avec l'application* ne peut pas déclarer de bundle, il
n'a pas de dossier d'où le servir.

**Aucune donnée n'arrive avec le fichier.** Ce fichier est servi au navigateur d'un
administrateur — y coder une clé d'API reviendrait à la publier. Tout passe par
`host.callEntryPoint`, c'est-à-dire par votre `runScreenEntryPoint`, côté serveur, là où vivent vos
secrets. En cas de refus, la promesse rejette avec **votre** message : c'est celui-là que l'écran
doit montrer.

**Gardez des `sections`.** Elles ne sont pas une redite : c'est le repli servi si le fichier
disparaît ou si votre plage cesse de couvrir le contrat de panel. L'écran affiche alors un bandeau
qui nomme la raison, au lieu de disparaître — et votre module continue par ailleurs de fonctionner
normalement. `pnpm check-extension` vous avertit si vous n'en déclarez aucune.

Le module d'exemple `capacity-radar` en est un exemple complet : une frise de charge par nœud
dessinée sur un canevas, avec sa table de repli.

## Pages ajoutées au portail client

Un écran contribué vit dans le **panel d'administration**. Pour parler au client final — déblocage
d'IP en self-service, gestion d'un site, tableau de règles —, un module ajoute une **page** au
portail. Trois champs optionnels sur le descripteur, quel que soit le genre :

```ts
contributesPages?: ContributedPage[];
runPageData?(ctx: HostContext, request: ModulePageRequest): Promise<ModulePageResult>;
runPageAction?(ctx: HostContext, request: ModulePageActionRequest): Promise<ModulePageActionResult>;
```

### L'URL est préfixée

`/m/<moduleId>/<pageId>` en zone client (`area: "customer"`), `/x/<moduleId>/<pageId>` en zone
publique (`area: "public"`). Le préfixe n'est pas une commodité : sans lui, un module prendrait
`/factures` et le noyau ne pourrait plus jamais créer cette route — un squat d'espace de noms est
irréversible dès qu'il existe des modules dans la nature.

Une page n'a **pas de sous-chemins** : son URL s'arrête à `<pageId>`. Un module qui a besoin d'un
état le met en paramètre de requête (`?site=42`), relayé dans `request.query`.

### Ce que votre module reçoit, et ce qu'il ne reçoit pas

En zone client, `request.customer` porte l'identifiant du client, `isContact` (sous-utilisateur ou
titulaire) et la liste réduite de ses services (`id`, `productName`, `remoteId`). Pas de nom, pas
d'adresse, pas de solde.

**L'identité vient du jeton vérifié par le noyau, jamais de l'URL.** Tout `customerId` qui
arriverait par `query` est ignoré. Corollaire : ne rangez jamais un identifiant de client dans
`ctx.storage` en croyant tenir un état de requête — `HostContext` vit pour la durée du processus,
pas de la requête.

La question « ce client peut-il agir sur ce service ? » se réduit donc à « ce service est-il dans
`request.customer.services` ? ». C'est ce que fait le module d'exemple `managed-firewall`.

Une page `area: "public"` ne reçoit **aucun** `customer`, même demandée par un visiteur connecté.

### Deux méthodes, et la raison

`runPageData` est appelée sur le chemin de rendu — donc par n'importe quel visiteur, y compris un
robot. Elle doit être **sans effet**. `runPageAction` est appelée sur un POST délibéré. Les
confondre ferait d'un passage de crawler un déclencheur d'action.

Un module qui refuse **lève**, et son message remonte tel quel au visiteur : « adresse source
invalide » vaut mieux qu'une erreur générique qui produira un ticket.

### Le rendu est une cascade

1. `templates/modules/<moduleId>/<pageId>.liquid` du **thème actif** — un thème peut donc reprendre
   votre page sans que vous ayez rien prévu ;
2. le **gabarit de votre module**, si vous déclarez `template: "templates/…"` (chemin relatif à
   votre dossier) ;
3. vos **sections déclaratives** (`sections`), rendues par les composants du portail.

Les îlots (`data-island="…"`, voir plus bas) fonctionnent dans les deux premiers cas, comme sur
n'importe quelle vue thémée.

Une section `table` lit ses lignes dans le contexte, **sous la clé de son `entryPoint`** — pas par
un appel séparé, contrairement aux écrans du panel. Une page publique exécute déjà du code tiers à
chaque visite ; un aller-retour par tableau multiplierait ce coût.

`ModulePageResult.sections` permet de renvoyer les sections **précisées** : les choix d'un `select`
« quel service ? » ne peuvent pas être écrits dans la déclaration, qui est rédigée avant de savoir
qui regarde. Elles n'ouvrent en revanche aucune action : seuls les `entryPoint` et `actions[].id`
de la **déclaration** sont acceptés.

### Deux réglages qui évitent deux erreurs

- `ownerOnly: true` refuse la page à un sous-utilisateur (`CustomerContact`). Ses cinq permissions
  fixes ne parlent pas des modules, et en inventer une supposerait une migration SQL par module
  installé.
- `cacheSeconds` met en cache le contexte d'une page **publique**. Refusé en zone client, où le
  contenu dépend du visiteur — un cache partagé y servirait les données d'un client à un autre.

`pnpm check-extension` refuse une page sans gabarit ni sections, un identifiant malformé, un
doublon, un libellé vide, un gabarit déclaré mais absent, et un `cacheSeconds` en zone client.
Aucun de ces défauts ne se voit au chargement du module.

## Le contexte des gabarits de thème

Un thème livre des gabarits Liquid évalués à la requête. Trois formes de contexte, exportées par le
SDK aux côtés de `ThemeDefinition` :

- `ThemeShellContext` — passé à l'enveloppe (`templates/partials/header.liquid`, `footer.liquid`) :
  `companyName`, `logoUrl?`, `nav`, `legalLinks`, `area` (`"marketing"` ou `"account"`),
  `authenticated`, `settings`, et sur la vitrine `catalogFamilies`. Depuis 0.34.0 :
  `supportEmail?` (adresse de support de Paramètres › Identité ; sous la marque d'un revendeur, la
  sienne, jamais celle de l'hébergeur) et `statusPageUrl?` (page de statut publique,
  absente quand l'instance n'en publie pas et sous une marque de revendeur). `authenticated` est
  exact aussi en vitrine — vrai quand le visiteur a une session —, et ne sert qu'à l'affichage
  (« Mon espace » plutôt que « Connexion ») : ce qu'il masque reste joignable.

  **`legalLinks` n'est pas facultatif à rendre.** Il porte les documents légaux que l'hébergeur a
  effectivement publiés (mentions légales, CGV, confidentialité, remboursement, cookies). Sur la
  vitrine, dès que votre thème fournit `partials/footer.liquid`, le portail cesse de rendre le
  sien : un pied de page qui ignore ce tableau rend introuvables des documents que la loi impose de
  rendre accessibles, sur toutes les instances qui installeront votre thème.

  **Votre enveloppe est aussi rendue dans l'espace client** (depuis 0.34.0), avec `area` à
  `"account"`. Le noyau n'y garde ses propres éléments que là où le vôtre ne fait pas le travail :
  sa navigation si votre en-tête ne rend rien dans cette zone, son bouton de déconnexion et son
  sélecteur de langue si vous n'y placez pas les îlots `logout` et `language-switcher`, et son pied
  de page — sous le vôtre — tant que votre pied ne pose pas `cookie-preferences` et un lien vers
  chaque document publié. Un doublon vaut mieux qu'une CGV introuvable pour le client connecté.

  ```liquid
  {% if legalLinks.size > 0 %}
    {% for link in legalLinks %}<a href="{{ link.href }}">{{ link.label }}</a>{% endfor %}
  {% endif %}
  ```

  Le tableau est vide sur une instance qui n'a rien rédigé — testez `size`, comme ci-dessus, plutôt
  que de rendre une barre vide.
- `ThemeViewContext` — passé à un gabarit de vue (`templates/pages/<nom>.liquid`) : `view` (le nom
  de la vue), `companyName`, `locale`, plus ce que la vue apporte. **Type ouvert, et le registre
  `THEME_VIEWS` fait foi** — pas une union fermée qu'il faudrait modifier pour rendre une page de
  plus thémable.
- `ThemeEmailContext` — passé à `templates/email.liquid` : `subject`, `bodyHtml`/`bodyText` (le
  corps métier, déjà composé), `companyName`, `logoUrl?`, `colors`.

**Un thème qui ne fournit pas le gabarit d'une vue retombe sur l'écran d'origine, vue par vue.**
Jamais de page blanche, et surtout : rien n'oblige à tout convertir pour publier. C'est aussi ce qui
sépare ce système de celui de WHMCS, où un thème est une copie complète des gabarits du noyau, à
refusionner à chaque mise à jour.

### Les 46 vues

Douze pour la vitrine, vingt-six pour l'espace client, huit pour l'authentification. C'est tout le
portail : aucune page ne reste hors de portée d'un thème.

#### Vitrine

| Vue | Gabarit | Reçoit | Îlots obligatoires |
|---|---|---|---|
| `home` | `pages/home.liquid` | `sections`, `bundles`, `commitments` | — |
| `catalog` | `pages/catalog.liquid` | `sections`, `bundles` | `order-button` |
| `cart` | `pages/cart.liquid` | — | `cart` |
| `domains` | `pages/domains.liquid` | — | `domain-search` |
| `kb` | `pages/kb.liquid` | `articles`, `tags`, `query`, `activeTag`, `pagination` | — |
| `kb-article` | `pages/kb-article.liquid` | `article` (`slug`, `title`, `body`, `bodyHtml`, `metaDescription`, `tags`, `updatedAtFormatted`) | — |
| `legal-privacy` | `pages/legal-privacy.liquid` | `privacyPolicy`, `address`, `contactEmail?` | — |
| `legal-terms` | `pages/legal-terms.liquid` | `termsBody`, `termsUrl` | — |
| `legal-notice` | `pages/legal-notice.liquid` | `body`, `identity`, `contactEmail?` | — |
| `legal-refund` | `pages/legal-refund.liquid` | `body`, `identity`, `contactEmail?` | — |
| `legal-cookies` | `pages/legal-cookies.liquid` | `body`, `identity`, `contactEmail?` | — |
| `content-page` | `pages/content-page.liquid` | `page` (`slug`, `title`, `blocks`) | — |

Les trois dernières partagent un seul contexte (`ThemeLegalDocumentView`) : elles n'affichent qu'un
texte publié, et `view` suffit à les distinguer. `body` vaut `nil` tant que l'hébergeur n'a rien
rédigé — testez `{% if body != blank %}`, jamais `{% if body %}` : en Liquid, une chaîne vide est
vraie.

**Le corps d'un article** (`kb-article`) est du Markdown limité, saisi au panel, que le noyau vous
remet sous deux formes. Depuis 0.35.0 :

- **`article.bodyHtml`** est le corps rendu en HTML : `{{ article.bodyHtml }}`, sans `| raw`. C'est
  l'une des trois valeurs que le moteur n'échappe pas (voir « Le rendu échappe tout »), parce que le
  noyau l'a construite. Aucune balise n'y vient de la saisie — un `<script>` écrit dans un article
  y reste du texte —, et seuls ces éléments peuvent apparaître : `h2`, `h3`, `h4` (chacun avec un
  `id` préfixé `kb-`, comme `kb-pour-commencer`, pour les liens d'ancre : le préfixe évite qu'un
  titre « Main content » reprenne l'`id` du lien d'évitement du portail), `p`, `ul`, `ol` (avec
  `start` s'il diffère de 1), `li`, `blockquote` qui contient un `p`, `pre` > `code` (avec `class="language-<langue>"` quand la
  langue est connue), `hr`, `strong`, `em`, `code`, `br`, `a` (avec `rel="noopener noreferrer"` et
  `target="_blank"` sur un lien externe) et `img` (une image téléversée au panel, `loading="lazy"`).
  Le titre de l'article est le `h1` de la page : il n'y en a pas dans le corps. **Le noyau ne style
  rien** : c'est à votre thème de mettre en forme cette prose, en bornant ses sélecteurs à
  l'élément qui l'enveloppe — voir `kb-article.liquid` dans `theme-argile`.
- **`article.body`** est le texte source (le Markdown), échappé comme toute valeur. Ne l'affichez
  plus pour lire l'article : `## Titre` et `**gras**` y apparaîtraient tels quels. Un gabarit écrit
  contre 0.34.0, qui l'affichait en `white-space: pre-wrap`, continue de se rendre, mais le
  balisage des articles qui en utilisent devient visible : passez à `bodyHtml`.
- **`article.metaDescription`** est la description que le rédacteur a saisie pour les moteurs de
  recherche, sinon un extrait du corps (160 caractères au plus). Texte brut, échappé ; vide pour un
  article sans texte, d'où `{% if article.metaDescription != blank %}`.

Un thème qui utilise `bodyHtml` ou `metaDescription` déclare `engines.host: "^0.35.0"` : sur un noyau
plus ancien, le champ n'existe pas et l'article se rendrait vide.

Chaque offre (`ThemeProductView`, dans `sections[].products` comme dans `catalogFamilies`) porte
`featured` depuis 0.34.0 : vrai pour celle que l'hébergeur a cochée « mettre en avant » dans le
formulaire produit, toujours présent, `false` par défaut. Le libellé du badge est le vôtre.

#### Espace client

Ces vingt-six vues ne diffèrent des précédentes que sur un point, invisible depuis un gabarit :
leur contexte est assemblé par la page qui les rend, pas par l'API seule — c'est la seule façon
d'avoir les données du client connecté, déjà mises en forme dans **sa** langue et **sa** devise.
Pour vous, rien ne change : mêmes gabarits, même repli vue par vue, mêmes îlots.

| Vue | Reçoit | Îlots obligatoires |
|---|---|---|
| `dashboard` | `counters`, `recentServices`, `recentInvoices` | — |
| `services` | `services`, `pagination` | — |
| `service` | `service`, `capabilities` | `service-actions`, `service-credentials`, `service-reinstall`, `service-snapshots`, `service-backups`, `service-reverse-dns`, `service-plan-change`, `service-addons`, `service-monitoring`, `service-early-renewal`, `service-cancellation` |
| `service-console` | `service` | `service-console` |
| `invoices` | `invoices`, `creditBalances`, `pagination` | — |
| `invoice` | `invoice` (avec `items`) | `invoice-pay` |
| `tickets` | `tickets`, `newTicketHref`, `pagination` | — |
| `ticket` | `ticket` (avec `messages`, `satisfaction`) | `ticket-reply`, `ticket-satisfaction` |
| `ticket-new` | `departments`, `ticketsHref` | `ticket-new-form` |
| `domains-mine` | `domains`, `pagination` | — |
| `domain` | `domain` | `domain-settings` |
| `dns-zones` | `zones`, `pagination` | `dns-create-zone` |
| `dns-zone` | `zone` (avec `records`) | `dns-records-editor`, `dns-use-host-ns`, `dns-delete-zone` |
| `history` | `entries`, `pagination` | — |
| `account` | `sections` | — |
| `account-profile` | `email` | `account-change-email` |
| `account-security` | `isOwner`, `twoFactorEnabled`, `passkeyCount`, `linkedSsoCount`, `availableSsoProviders` | `account-change-password`, `account-two-factor`, `account-passkeys`, `account-sso`, `account-anti-phishing` |
| `account-billing` | `billing`, `baseCurrency`, `currencies` | `account-billing-identity` |
| `account-payment-methods` | `methods`, `gateways`, `canManage`, `justAdded` | `account-payment-methods` |
| `account-privacy` | `pendingErasure`, `requests` | `account-privacy` |
| `account-referral` | `referralCode`, `earned`, `referrals` | `account-referral-code` |
| `account-team` | `contacts`, `grantablePermissions` | `account-team` |
| `reseller-clients` | `isReseller`, `createHref`, `clients`, `pagination?` | — |
| `reseller-client` | `client` | `reseller-order-for-client` |
| `reseller-client-new` | `clientsHref` | `reseller-create-client` |
| `reseller-branding` | `isReseller`, `domain` | `reseller-branding` |

**Tout îlot qui est le seul chemin vers une fonction est obligatoire** (0.34.0). Un thème de
référence ne posait sur `service` que `service-actions` : sous lui, un client ne pouvait ni
réinstaller, ni résilier, ni gérer sa 2FA, et rien à l'écran ne le signalait. Vous placez ces îlots
où vous voulez — un onglet, un repli `<details>`, le bas de page —, vous ne les retirez pas.

#### Authentification

Contexte assemblé par l'API, comme la vitrine — ces écrans sont servis sans session, il n'y a rien
à charger avec le jeton d'un visiteur qui n'est pas encore connecté.

| Vue | Reçoit | Îlots obligatoires |
|---|---|---|
| `login` | `publicSignupEnabled`, `ssoEnabled` | `auth-login` |
| `register` | `passwordPolicy` | `auth-register` |
| `forgot-password` | — | `auth-forgot-password` |
| `reset-password` | `passwordPolicy`, `hasToken` | `auth-reset-password` |
| `verify-email` | `verified` | — |
| `accept-invite` | `passwordPolicy`, `hasToken` | `auth-accept-invite` |
| `sso-link` | `hasTicket` | `auth-sso-link` |
| `sso-callback` | `providerFailed` | `auth-sso-callback` |

Deux choses à savoir avant d'écrire l'un de ces gabarits.

**Vous ne recevez jamais le jeton, le ticket ni le code.** Un lien de réinitialisation porte un
secret à usage unique qui vaut le compte qu'il ouvre ; votre gabarit obtient `hasToken`, de quoi
choisir entre le formulaire et un message « ce lien est incomplet », et rien de plus. Le secret va
de la page du portail directement à l'îlot. Ce n'est pas une méfiance envers vous : c'est une valeur
de moins à faire transiter, donc une de moins à retrouver un jour dans un journal d'accès.

**L'îlot du formulaire est obligatoire, et c'est le seul endroit où l'oublier ferme le portail.**
Un catalogue sans `order-button` ne vend rien ; une page de connexion sans `auth-login` verrouille
l'instance, y compris pour l'hébergeur venu constater le problème. `pnpm check-extension` refuse un
tel gabarit. Vous ne pouvez pas écrire le formulaire vous-même — l'îlot monte le composant du
portail, avec son URL de soumission, son second facteur et sa redirection compilés dedans.

Trois règles valent pour tous ces contextes, et les connaître évite de chercher une clé qui
n'existera jamais :

1. **Ce qui est dérivé arrive déjà mis en forme.** `totalFormatted` et non des centimes,
   `dueDateFormatted` et non une date ISO, `statusLabel` à côté de `status` (le premier pour
   afficher, le second pour styler). Ces valeurs dépendent de la devise, de la locale et parfois de
   l'instant du rendu : un gabarit Liquid n'a pas de quoi les produire.
2. **Ce qui est secret n'y est pas.** Ni jeton de session, ni phrase anti-hameçonnage, ni secret
   2FA. Ce qu'un formulaire a besoin de connaître va à son îlot, jamais au gabarit.
3. **Les libellés restent les vôtres.** Le noyau ne vous fournit pas de dictionnaire : le vôtre
   (`locales/<langue>.json`) arrive sous `t`, dans la langue de la page — voir « Traduire les
   libellés d'un thème ». `locale` reste là pour un gabarit qui veut choisir lui-même.

La question longtemps laissée ouverte — ce qu'un thème peut placer autour d'un formulaire
d'authentification sans jamais pouvoir l'écrire lui-même — est tranchée depuis `0.19.0`, et sa
réponse est le tableau ci-dessus : tout ce qui l'entoure, rien de ce qu'il fait.

### Apporter vos propres pages

Tout ce qui précède rhabille une page qui existe. Un thème peut aussi en **ajouter** une, à une URL
que le produit ne connaît pas : « Nos garanties », « Notre infrastructure », le genre de contenu qui
fait partie du thème et n'a pas à être ressaisi par chaque hébergeur qui l'installe.

```json
"theme": {
  "pages": [
    {
      "slug": "nos-garanties",
      "title": "Nos garanties",
      "showInNav": true,
      "metaDescription": "Disponibilité, sauvegardes et délais d'intervention."
    }
  ]
}
```

Le gabarit va dans `templates/custom/nos-garanties.liquid` et sert `/nos-garanties`. Il est **libre** :
aucun îlot obligatoire, et le contexte le plus pauvre du système — `companyName`, `locale`, et
`page` qui vous rend votre propre déclaration (`{{ page.title }}`), pour que le titre soit écrit une
seule fois. Les îlots restent utilisables : une page de thème peut porter un vrai bouton de commande.

Trois choses à savoir, chacune correspondant à un défaut que rien ne signale au rendu :

- **Le slug ne peut pas être une route du produit.** `RESERVED_PAGE_SLUGS` (SDK) fait foi. En App
  Router une route statique gagne toujours sur l'attrape-tout, donc une page nommée `catalog` ne
  s'afficherait tout simplement jamais. `pnpm check-extension` refuse ce manifeste.
- **Une page créée au back-office l'emporte sur la vôtre.** Si l'hébergeur a publié `/nos-garanties`
  depuis son panel, c'est la sienne qui s'affiche et le lien de nav est le sien. Règle générale du
  produit : ce qu'un administrateur saisit passe avant ce qu'un thème propose. L'ordre de la
  navigation le montre — les liens du noyau, puis ceux de l'hébergeur, puis les vôtres.
- **Un gabarit manquant donne un 404** sur un lien que vous avez vous-même mis en navigation.
  `check-extension` vérifie que chaque page déclarée a le sien.

Un piège de Liquid qui coûte une soirée, et qui n'est pas propre à ce produit : **une chaîne vide
est vraie**. Seuls `nil` et `false` sont faux. Le noyau passe toujours une chaîne pour
`companyName` — jamais `nil` — donc `{% if companyName %}` est vrai même sur une instance qui n'a
pas renseigné sa raison sociale, et votre phrase sort à trou. Écrivez `{% if companyName != blank %}`,
ou `{{ companyName | default: "…" }}`.

Le titre et le libellé de nav sortent du manifeste tels quels, dans une seule langue. Le corps, lui,
reçoit `locale` et peut donc être bilingue. Un hébergeur qui a besoin des deux langues jusque dans sa
navigation créera la page depuis son back-office — et elle l'emportera sur la vôtre, ce qui est le
bon résultat.

### `content-page` : la vue générique

Les huit premières vues rhabillent une page que le noyau possède. `content-page` est différente et
vaut d'être lue avant d'écrire le gabarit : elle rend **les pages que l'hébergeur crée lui-même
depuis son back-office** — « À propos », « Nos engagements », une landing page de campagne — à un
slug libre à la racine du site (`/a-propos`).

Conséquence directe : le gabarit ne connaît pas sa page. Elle est rédigée après la publication du
thème et peut changer tous les jours. Il ne connaît que la **forme d'un bloc**. Écrire ce seul
fichier rhabille d'un coup toutes les pages de contenu de l'instance, présentes et futures.

Un bloc (`ThemePageBlock`) porte `type` et les clés propres à ce type, **déjà résolues dans une
langue** — un gabarit Liquid n'a pas de quoi en choisir une :

| `block.type` | Clés | Notes |
|---|---|---|
| `heading` | `text`, `level` | `2` ou `3`. Jamais `1` : le titre de la page l'occupe. |
| `text` | `text` | Une ligne vide sépare deux paragraphes. |
| `image` | `src`, `alt` | `alt` peut être vide (image décorative). |
| `button` | `label`, `href` | `href` est validé à la saisie : chemin interne, `https:`, `mailto:` ou `tel:`. |
| `island` | `island`, `params` | Un îlot placé par le rédacteur — voir ci-dessous. |

```liquid
<h1>{{ page.title }}</h1>
{% for block in page.blocks %}
  {% case block.type %}
    {% when "heading" %}<h2>{{ block.text }}</h2>
    {% when "text" %}<p>{{ block.text | newline_to_br }}</p>
    {% when "image" %}<img src="{{ block.src }}" alt="{{ block.alt }}">
    {% when "button" %}<a href="{{ block.href }}">{{ block.label }}</a>
    {% when "island" %}<div data-island="{{ block.island }}" data-product="{{ block.params.product }}"></div>
  {% endcase %}
{% endfor %}
```

C'est le seul gabarit où un `data-island` porte un nom **calculé** plutôt qu'écrit en clair —
`check-extension` ne le signale donc pas comme un nom inconnu, faute de pouvoir le résoudre sans
rendre la page. La garantie n'est pas perdue : le panel refuse à l'enregistrement tout îlot absent
de `THEME_ISLANDS`, et un nom qui arriverait quand même ne monte rien.

Le contenu saisi n'est **jamais du HTML** : les blocs sont structurés, Liquid échappe `{{ }}`, et
personne ne peut injecter de script en rédigeant une page. C'est pourquoi il n'existe pas d'éditeur
de gabarits dans le panel — un gabarit Liquid, lui, autorise le HTML arbitraire, et se dépose donc
par SSH.

### Les îlots : le thème place, le noyau fait

Un gabarit Liquid ne peut pas produire un bouton de commande — derrière lui il y a le choix de la
passerelle, une redirection, un panier persisté, un jeton de session. Le gabarit écrit donc un
marqueur, et le noyau y monte un composant qu'il a compilé lui-même :

```liquid
{% for product in section.products %}
  <article>
    <h3>{{ product.name }}</h3>
    <p>{{ product.priceFormatted }}/{{ product.recurringLabel }}</p>
    <div data-island="order-button" data-product="{{ product.id }}"></div>
  </article>
{% endfor %}
```

Vous décidez de la position, de ce qui l'entoure, de ce qui n'y est pas. Vous ne décidez pas de ce
qui s'y monte — et **aucun îlot ne fabrique un formulaire d'authentification à partir de ce que
vous lui dites** : les îlots `auth-*` montent les composants du portail, avec leur URL de
soumission et leur redirection compilées. Vous placez le champ de mot de passe, vous ne l'écrivez
pas, et vous ne recevez pas le jeton qui accompagne un lien de réinitialisation.

**Vitrine** (`THEME_ISLANDS`) : `order-button` (`data-product`), `bundle-order-button`
(`data-bundle`), `cart`, `domain-search`, `language-switcher`, `cookie-preferences`. Les quatre
derniers ne prennent aucun paramètre, et les deux derniers s'utilisent aussi dans l'enveloppe.

`cookie-preferences` rouvre le choix de consentement aux traceurs. **Placez-le dans votre pied de
page**, à côté de `legalLinks` : le portail rend le sien tant qu'aucun thème ne fournit
`partials/footer.liquid`, et l'oublier retire au visiteur son seul moyen de revenir sur sa réponse.
Un consentement qu'on ne peut pas retirer n'en est pas un.

**Espace client** : `logout` · `invoice-pay` (`data-invoice`) · `service-actions`,
`service-credentials`, `service-reinstall`, `service-snapshots`, `service-backups`,
`service-reverse-dns`, `service-plan-change`, `service-addons`, `service-monitoring`,
`service-early-renewal`, `service-cancellation`, `service-console` · `ticket-reply`,
`ticket-satisfaction`, `ticket-new-form` · `domain-settings` · `dns-create-zone`,
`dns-records-editor`, `dns-use-host-ns`, `dns-delete-zone` · `account-change-email`,
`account-change-password`, `account-two-factor`, `account-passkeys`, `account-sso`,
`account-anti-phishing`, `account-billing-identity`, `account-payment-methods`, `account-privacy`,
`account-referral-code`, `account-team` · `reseller-create-client`, `reseller-order-for-client`.

**Authentification** : `auth-login`, `auth-register`, `auth-forgot-password`,
`auth-reset-password`, `auth-accept-invite`, `auth-sso-link`, `auth-sso-callback`. Aucun ne prend
de paramètre, et c'est la règle du groupe : ce dont ils ont besoin — jeton, ticket, code — vient de
l'URL et leur est passé par la page. Un gabarit ne peut donc ni le fournir, ni le détourner.

Deux choses à savoir sur les îlots d'espace client :

- **Un seul prend un paramètre : `invoice-pay`.** Les autres vivent sur une page qui connaît déjà
  l'objet concerné et le leur passe — vous écrivez `<div data-island="service-actions"></div>`, sans
  identifiant. C'est aussi une garantie : un gabarit ne peut pas désigner le service d'un autre.
- **Ils sont réservés à leur zone.** Le panel refuse dans une page créée par l'hébergeur — qui est
  publique — tout îlot d'espace client ou d'authentification : un éditeur de zone DNS n'y saurait
  qu'échouer en 401 sous les yeux du visiteur, et un formulaire de réinitialisation y serait privé
  du jeton qui le rend utilisable.

`logout` et `language-switcher` se placent dans l'enveloppe. Le noyau pose les siens tant que votre
en-tête ou votre pied ne les rend pas — le marqueur doit figurer dans le HTML rendu : écrit sous une
condition fausse ou dans un commentaire, il ne compte pas.

Pour `language-switcher`, ne laissez pas le repli faire le travail : c'est un bloc flottant
(`position: fixed`, en haut à droite) qui se pose par-dessus ce que votre en-tête y a mis. Le thème
`classic` a eu ce défaut, son sélecteur recouvrait son propre lien « Connexion ».

`account-change-password` mérite une phrase, parce qu'il paraît contredire la règle : c'est un
composant **de l'hôte** que vous placez, exactement comme `order-button`. Ce qui reste interdit est
qu'un gabarit écrive lui-même un champ de mot de passe.

`pnpm check-extension` refuse un gabarit qui oublie un îlot obligatoire ou qui en nomme un
inexistant. C'est le seul défaut de ce système qu'une relecture visuelle ne rattrape pas : un
catalogue sans `order-button` s'affiche parfaitement et ne vend rien. Le noyau, lui, ne vérifie
pas les îlots au chargement — un thème qui les oublie se charge, et prive le client de la fonction
sans un message.

### Donner une page de configuration à son thème

`theme.settings` dans le manifeste déclare ce que l'hébergeur pourra modifier **depuis le panel**,
sans toucher un fichier. Ce sont les mêmes `ConfigField` que la configuration d'un module, donc la
même validation — et `group` les range en sections, que `settingGroups` décrit (voir « Sections,
sous-groupes et blocs ») :

```json
"settings": [
  { "name": "heroTitle", "label": "Titre", "type": "textarea", "required": false,
    "group": "Accueil", "maxLength": 90, "defaultValue": "Vos serveurs, prêts en une minute" },
  { "name": "heroImage", "label": "Image", "type": "image", "required": false, "group": "Accueil" },
  { "name": "showSteps", "label": "Afficher les étapes", "type": "boolean", "required": false,
    "group": "Accueil", "defaultValue": "true" }
]
```

Les valeurs arrivent dans **tous** les contextes — enveloppe, vues de la vitrine, vues de l'espace
client, pages du thème — sous `settings` :

```liquid
<h1>{{ settings.heroTitle }}</h1>
{% if settings.showSteps %}…{% endif %}
{% if settings.heroImage %}<img src="{{ settings.heroImage }}" alt="{{ settings.heroImageAlt }}">{% endif %}
```

Trois règles à connaître :

- **La déclaration en cours fait loi.** Un réglage que le thème ne déclare plus disparaît du
  contexte, même si une valeur traîne en base.
- **Un champ vide prend son `defaultValue`.** Un hébergeur qui efface un titre revient au texte
  d'origine, il n'obtient pas un trou.
- **Les booléens sont de vrais booléens.** Un formulaire HTML envoie `"false"`, qui est *vrai* en
  Liquid : le noyau convertit, sans quoi décocher une case allumerait la section.

Deux attributs servent surtout aux thèmes :

- **`type: "image"`** : l'hébergeur téléverse une image depuis le panel, ou en colle l'adresse. La
  valeur reste une adresse, à écrire telle quelle dans un `src`. Ce type n'existe que pour les
  thèmes.
- **`maxLength`** : le panel affiche un compteur et le noyau refuse une valeur plus longue. À
  déclarer sur tout texte que votre mise en page ne tient pas au-delà d'une certaine longueur.

Une valeur `url` ou `image` qui n'est ni `https:`, ni `http:`, ni un chemin du site (`/catalog`)
n'arrive jamais au gabarit : Liquid échappe le HTML, pas le protocole, et un `javascript:` dans un
`href` s'exécuterait.

`password` et `provider` sont refusés — un thème n'exécute aucun code, il n'a ni secret à garder ni
fournisseur à piloter — et `pnpm check-extension` le dit, comme il refuse un nom en doublon ou un
`select` sans option.

#### Des réglages qui atteignent la feuille de style (0.33.0)

Jusqu'ici, un réglage n'arrivait qu'aux gabarits : une couleur choisie au panel n'avait aucun chemin
vers le CSS. Deux liaisons le lui donnent, au choix sur chaque champ :

- **`token`** remplace un token du thème — `"colors.primary"`, `"radii.md"`,
  `"typography.headingFamily"`, `"density"`, `"colorScheme"`… Empilement, du plus faible au plus
  fort : défauts du noyau, tokens du manifeste, réglages publiés du thème, marque d'un revendeur
  (sur ses domaines et pour ses clients seulement). Paramètres › Identité ne porte plus ni couleur
  ni police depuis 0.34.0 : sur l'instance de l'hébergeur, votre réglage a le dernier mot. Passer
  par un token, c'est hériter de tout ce que le noyau en dérive : la couleur lisible sur un aplat
  (`--brand-color-on-primary`), l'échelle d'espacement d'une densité. L'assistant d'installation
  écrit la couleur principale qu'il demande dans le réglage `color` lié à `colors.primary` (palette
  claire) : déclarez-en un si votre thème veut la recevoir.
- **`cssVar`** pose une variable propre au thème (`"--ag-hero-tint"`), émise dans le même bloc
  `:root`. Pour ce qu'aucun token ne décrit. Les préfixes du noyau (`--brand-`, `--radius-`,
  `--space-`, `--font-size-`, et depuis 0.34.0 `--shadow-` et `--layout-`) sont refusés. Sans
  valeur, la variable n'est pas émise : écrivez `var(--ag-hero-tint, var(--brand-color-primary))`
  et le repli s'applique.

Et les types et attributs qui vont avec :

- **`type: "color"`** : sélecteur de couleur, hexadécimal (`#rrggbb`) et rien d'autre ; le panel
  mesure le contraste pendant que l'hébergeur choisit.
- **`type: "order"`** : l'ordre d'une liste fermée (`options`), pour placer les blocs d'une page.
  La valeur est `"families,steps,account"`, toujours **complète** — un bloc ajouté par une mise à
  jour du thème apparaît en fin, jamais perdu — et un gabarit la lit par `split` :

  ```liquid
  {% assign order = settings.homeOrder | split: "," %}
  {% for block in order %}{% case block %}
    {% when "families" %}…{% when "steps" %}…
  {% endcase %}{% endfor %}
  ```

  Chaque option peut porter `visibleWhen` : le panel marque « masqué » un bloc dont l'interrupteur
  est décoché, sans le retirer de la liste. Nommez les options par ce que le visiteur lit (« Déroulé
  — “De la commande à la mise en service” »), pas par un nom interne : l'hébergeur doit
  reconnaître le bloc sur sa page.
- **`min` / `max` / `step` / `unit`** sur un `number` : avec `min` et `max`, un curseur ; `unit`
  (`px`, `rem`, `%`…) est accolée à la valeur quand le champ est lié à un token ou une variable, et
  obligatoire dans ce cas — sauf pour les tokens sans unité (`typography.lineHeight`,
  `headingLineHeight`, `headingScale`), où elle est au contraire refusée. Le gabarit reçoit le
  nombre nu.
- **`visibleWhen: { "field": "showSteps", "equals": "true" }`** : le champ n'apparaît au panel que si
  la condition tient. Pur confort d'écran — la valeur est conservée et le gabarit la reçoit
  toujours. Opérateurs et combinaisons : voir « Conditions composables ».
- **`options[].sets`** : un choix qui remplit d'autres champs (`{ "value": "nuit", "label": "Nuit",
  "sets": { "colorPrimary": "#9dc3a8", … } }`) — une palette. Le panel applique, les champs remplis
  restent modifiables un à un ; le noyau n'en sait rien.

Et pour écrire du vrai contenu d'hébergeur dans un thème :

- **`type: "list"`** : une liste d'éléments, chacun composé des sous-champs de `fields` (`text`,
  `textarea`, `number`, `boolean`, `select`, `url`, `image`, `color`, `link`), bornée par `maxItems`.
  L'hébergeur ajoute, retire et ordonne les éléments au panel ; le gabarit reçoit un tableau
  d'objets. `defaultValue` porte le **contenu d'origine du thème**, en JSON — c'est ce qui permet
  de livrer quatre étapes rédigées et de les laisser réécrire, au lieu d'afficher un trou sur une
  instance neuve. Une liste que l'hébergeur vide reste vide : « rien en base » prend le défaut,
  « `[]` en base » est un choix. Le gabarit teste donc toujours la taille avant de rendre sa
  section :

  ```json
  { "name": "steps", "label": "Étapes", "type": "list", "required": false, "maxItems": 6,
    "fields": [{ "name": "title", "label": "Titre", "type": "text", "required": false }],
    "defaultValue": "[{\"title\":\"Vous choisissez\"},{\"title\":\"Vous réglez\"}]" }
  ```

  ```liquid
  {% if settings.steps.size > 0 %}
  {% for step in settings.steps %}<h3>{{ forloop.index }}. {{ step.title }}</h3>{% endfor %}
  {% endif %}
  ```

  Un sous-champ `select` dont les options sont les noms de votre jeu d'icônes donne un choix
  d'icône par élément — le noyau n'a pas de type `icon`, et redessiner vos icônes pour les
  prévisualiser au panel créerait un miroir de plus à tenir à jour.

- **`localized: true`** sur un `text` ou `textarea` (au premier niveau ou dans une liste) : une
  valeur par langue de l'instance, saisie par onglets au panel. Le gabarit reçoit **une** chaîne :
  celle de la langue de la page, sinon celle de la langue par défaut de l'instance, sinon la
  première renseignée, sinon `defaultValue`. La langue de la page est celle du visiteur, relayée
  par le portail (`?locale=`) sur l'enveloppe, les vues publiques et les pages du thème — le
  contexte `locale` la porte aussi, pour un gabarit qui écrit lui-même deux langues.

#### Sections, sous-groupes et blocs (0.34.0)

`group` range un réglage dans une section ; `theme.settingGroups` décrit ces sections — leur ordre
dans le rail du panel, une description, une catégorie (`appearance` ou `content`, défaut
`content`) et la page que l'aperçu ouvre :

```json
"settingGroups": [
  { "name": "Couleurs", "category": "appearance", "description": "Palette claire et sombre." },
  { "name": "Accueil", "category": "content", "previewPath": "/", "texts": ["heroKicker"] }
],
"settings": [
  { "name": "colorPrimaryDark", "label": "Couleur principale", "type": "color", "required": false,
    "group": "Couleurs", "subgroup": "Mode sombre", "token": "colors.primary", "scheme": "dark" },
  { "name": "homeOrder", "label": "Blocs de la page", "type": "order", "required": false,
    "group": "Accueil", "defaultValue": "hero,steps",
    "options": [
      { "value": "hero", "label": "Bandeau" },
      { "value": "steps", "label": "Étapes", "visibleWhen": { "field": "showSteps", "equals": "true" } }
    ] },
  { "name": "showSteps", "label": "Afficher les étapes", "type": "boolean", "required": false,
    "group": "Accueil", "defaultValue": "true" },
  { "name": "stepsTitle", "label": "Titre", "type": "text", "required": false,
    "group": "Accueil", "block": "steps" }
]
```

- `name` est la valeur de `group` : une chaîne source du manifeste, jamais traduite (le panel reçoit
  le libellé traduit à côté). Une section déclarée reste dans le rail même quand tous ses champs
  sont masqués.
- **`subgroup`** range un réglage sous un intertitre repliable de sa section. Il exige `group` et
  exclut `block`.
- **`block`** rattache un réglage à un élément d'un `order` de la même section — la `value` d'une de
  ses options. Le panel rend alors l'`order` en blocs dépliables, réordonnables au glisser-déposer
  comme au clavier, chacun portant ses réglages ; le booléen que vise le `visibleWhen` d'une option
  devient l'interrupteur de son bloc. Un `order` ne porte lui-même ni `block` ni `subgroup`.
- `texts` nomme les textes du thème que la section affiche (voir « Les textes du thème »).

`pnpm check-extension` refuse un renvoi vers une section ou un bloc inexistant, une section en
double, une `category` inconnue, et avertit d'une section déclarée qu'aucun réglage ne nomme.

#### Conditions composables (0.34.0)

Une condition nomme un champ et **un seul** opérateur : `equals`, `notEquals` ou `in` (liste non
vide). `visibleWhen` — sur un champ comme sur une option d'`order` — accepte aussi un tableau, dont
toutes les conditions doivent tenir :

```json
"visibleWhen": [
  { "field": "heroStyle", "in": ["image", "split"] },
  { "field": "showHero", "notEquals": "false" }
]
```

Les valeurs se comparent en texte : un booléen vaut `"true"` ou `"false"`. La visibilité est
**transitive** — un champ dont le champ de référence est masqué l'est aussi — et une boucle masque
ses membres au lieu de faire tourner le panel. Une condition mal formée (aucun ou plusieurs
opérateurs, `in` vide, `field` absent) est écartée sans refuser le thème, et `check-extension` la
signale avec les renvois vers un champ inconnu et les boucles. `isConfigFieldVisible(field, fields,
values)` est la fonction pure que le panel et le noyau appliquent, exportée par le SDK.

#### Liens, polices, texte riche (0.34.0)

- **`type: "link"`** : une destination de navigation — chemin du site (`/catalog`), `https:`,
  `http:`, `mailto:` ou `tel:` —, là où `url` désigne une ressource. Le panel propose les pages de
  la vitrine, celles de l'hébergeur et celles du thème, ou une adresse libre. Un seul validateur,
  `isSafeLinkValue` (ni blanc, ni caractère de contrôle, ni barre oblique inverse, jamais `//hote`),
  appliqué par le panel, l'API et les blocs des pages de contenu. Admis en sous-champ de liste.
- **`type: "font"`**, liable à `typography.fontFamily` ou `headingFamily` : la valeur est une des
  `options` du champ — une pile de familles que votre thème livre — ou une police que l'hébergeur a
  téléversée au panel (WOFF2, licence de diffusion web confirmée à l'envoi). Vous n'avez rien à
  prévoir pour ces dernières : le noyau émet leurs `@font-face` après les vôtres.

  ```json
  { "name": "fontHeading", "label": "Police des titres", "type": "font", "required": false,
    "group": "Typographie", "token": "typography.headingFamily",
    "defaultValue": "\"Instrument Sans\", system-ui, sans-serif",
    "options": [{ "value": "\"Instrument Sans\", system-ui, sans-serif", "label": "Instrument Sans" }] }
  ```
- **`format: "markdown"`** sur un `textarea` (ou un sous-champ `textarea`) : paragraphes, sauts de
  ligne, gras, italique, liens et listes, rien d'autre — pas de titre, pas d'image, pas de HTML. Le
  panel affiche une barre d'édition et un aperçu ; le gabarit applique le filtre `markdown`, seul
  filtre du moteur qui produise du HTML, à partir d'un texte qu'il a lui-même échappé :

  ```liquid
  <div class="intro">{{ settings.intro | markdown }}</div>
  ```

  La sortie commence par une balise de bloc (`<p>`, `<ul>`, `<ol>`) : placez le filtre dans un
  élément qui peut la contenir, jamais dans un attribut ni dans une balise ouverte, ce que
  `check-extension` signale. Les liens ne passent que s'ils sont sûrs, et reçoivent
  `rel="noopener noreferrer"`.

#### Diriger l'aperçu du panel

`settingGroups[].previewPath` dit quelle page l'aperçu ouvre quand l'hébergeur entre dans la
section : `"/login"` pour les pages de connexion, `"/invoices"` pour l'espace client. Une section
sans page garde celle qu'on regarde. Le sélecteur de page reste utilisable — la valeur le pousse,
elle ne le verrouille pas.

Les chemins admis sont ceux de `isThemePreviewPath` : la vitrine, les documents légaux et
l'authentification (`THEME_PREVIEW_PATHS`), les pages statiques de l'espace client
(`THEME_ACCOUNT_PREVIEW_PATHS`) et `/<slug>` des pages que votre thème déclare. `pnpm
check-extension` refuse le reste.

`ConfigField.previewPath` est **déprécié** : il ne sert plus que de repli quand la section ne
déclare pas sa page — le premier réglage de la section qui en porte un décide alors. Déplacez-le
sur la section.

#### L'aperçu : zones réglables et données d'exemple (0.34.0)

Deux attributs, posés sur un élément que votre gabarit rend déjà, relient la page au panel :

```liquid
<section class="hero" data-theme-setting="heroTitle heroImage">
  <p data-theme-text="heroKicker">{{ t.heroKicker }}</p>
  <h1>{{ settings.heroTitle }}</h1>
</section>
```

Dans l'aperçu, survoler la zone propose « Modifier » : `data-theme-setting` (un ou plusieurs noms de
réglages, séparés par des espaces) ouvre la section et le réglage, `data-theme-text` (une clé de
`t`) ouvre le texte. Ni l'un ni l'autre n'a d'effet hors de l'aperçu, et le calque de surlignage
est posé par le noyau sur `body`, jamais dans votre HTML. `check-extension` avertit d'un nom qui ne
désigne aucun réglage déclaré, ou d'une clé absente de vos traductions.

Ce que vous pouvez supposer de l'aperçu :

- **Les réglages liés à un token ou à une `cssVar` s'appliquent sans recharger la page**, glisser de
  couleur compris : le panel recalcule la feuille des tokens avec les fonctions mêmes du portail.
  Le HTML, lui, n'est pas rendu à nouveau : un gabarit qui lit aussi `settings.<nom>` d'un tel
  réglage ne se met à jour qu'au rechargement suivant — faites passer l'effet par la variable CSS.
  Les autres réglages rechargent la page, au même chemin et à la même position de défilement.
- **L'espace client s'ouvre sans session client**, sur des données d'exemple produites par le noyau
  pour chacune des 26 vues, dans la langue et la devise de l'aperçu ; ses îlots y sont inertes. Même
  contexte, mêmes clés que sur une vraie page : un gabarit n'a rien à distinguer. Avec une session
  client dans le même navigateur, l'aperçu montre ses vraies pages.
- **Le mode sombre et la langue sont forcés** par le panel (sélecteur Clair / Sombre / Système quand
  le brouillon vaut `auto`, langue de l'aperçu qui suit la langue éditée).

#### Traduire les libellés d'un thème

`locales/fr.json`, `locales/en.json`, `locales/de.json` dans le dossier du thème (`theme.locales`
pour un autre nom) : des clés plates, des valeurs texte. Le noyau les pose sous `t` dans les contextes
de gabarit servis à un visiteur — enveloppe, vues de la vitrine et de l'espace client, pages du
thème :

```liquid
<button type="submit">{{ t.search }}</button>
<input placeholder="{{ t.searchPlaceholder }}" aria-label="{{ t.searchLabel }}">
```

La langue de la page d'abord, celle de l'instance ensuite, **clé par clé** : une chaîne pas encore
traduite s'affiche dans la langue de l'hébergeur au lieu de disparaître. Une clé inconnue rend du
vide, jamais son propre nom.

C'est la seule façon tenable de livrer un thème multilingue. `locale` permet bien d'écrire
`{% if locale == "en" %}…{% endif %}`, mais à cent libellés près de trois langues, un thème reste
écrit dans une seule — et ses libellés se mélangent alors à ceux du noyau, eux traduits, sur la
même page.

Un réglage peut encore l'emporter sur le dictionnaire (`{{ settings.kbTitle | default: t.kbTitle }}`),
mais ce n'est plus nécessaire pour laisser l'hébergeur réécrire un texte : les textes du thème le
font pour toutes vos clés, sans un réglage de plus.

`pnpm check-extension` refuse une clé lue par un gabarit et absente de toutes les traductions, et
signale les clés qu'aucun gabarit ne lit ainsi que les langues incomplètes.

Une exception : `templates/email.liquid` reçoit `t` vide. Le sujet et le corps d'un e-mail sont
déjà rendus dans la langue du destinataire avant d'arriver au gabarit, et le point d'envoi ne
transporte pas cette langue jusqu'ici. Un gabarit d'e-mail n'a donc pas de libellé propre à
traduire — il enveloppe un texte déjà écrit.

#### Les textes du thème (0.34.0)

L'hébergeur peut réécrire, **par langue**, toute clé de `t` que votre thème livre, depuis la section
« Textes du thème » que le noyau ajoute à tout thème qui a des traductions. Il n'y a rien à
déclarer pour en profiter. Deux gestes rendent l'édition plus directe :

- `settingGroups[].texts` range des clés dans une section, sous l'intertitre « Textes », à côté des
  réglages qui façonnent le même bloc. Une clé ne se range que dans une section.
- `data-theme-text="clé"` sur l'élément qui l'affiche : l'aperçu y propose « Modifier » (voir plus
  haut).

Ce que le gabarit reçoit sous `t`, du plus faible au plus fort : votre fichier dans la langue de
l'instance, la réécriture dans cette langue, votre fichier dans la langue de la page, la réécriture
dans cette langue. **Une réécriture vaut pour sa langue** : la traduction que vous livrez dans la
langue demandée passe devant une réécriture faite dans une autre langue. Une valeur vide rend le
texte du thème, jamais un trou. Les réécritures sont stockées sous la clé réservée `$texts` des
réglages — toute clé commençant par `$` appartient au noyau, et la règle de nom d'un réglage ne peut
pas en produire.

Conséquence pour vous : **n'écrivez plus un réglage `text` qui ne fait que surcharger une de vos
traductions.** Argile en avait 43 ; les textes du thème les ont remplacés.

#### Traduire le panel : `settingsLocale` et `locales/panel/` (0.34.0)

Les libellés du manifeste (réglages, aides, placeholders, sections, sous-groupes, options,
sous-champs, descriptions de section) sont écrits dans une langue, que `settingsLocale` déclare
(défaut `"en"`). Pour les autres langues du noyau (`fr`, `en`, `de`), un fichier plat par langue
dont **la clé est la chaîne source exacte**, à la manière de gettext :

Pour un thème dont `settingsLocale` vaut `"fr"`, `locales/panel/en.json` :

```json
{ "Couleurs": "Colours", "Couleur principale": "Primary colour", "Mode sombre": "Dark mode" }
```

Le panel affiche chaque libellé dans la langue du membre du staff, et retombe sur la chaîne source
quand une traduction manque. `themePanelStrings(theme)` liste les chaînes attendues ;
`check-extension` avertit d'un fichier absent, d'une chaîne non traduite ou d'une clé orpheline.
`locales/panel/` n'est jamais une langue des gabarits : `t` ne le lit pas.

#### Un mode sombre qui suit le visiteur

`theme.tokensDark` déclare la palette sombre — **déclarée, jamais dérivée** : inverser
mécaniquement une palette claire donne des gris boueux et des aplats de marque illisibles. Elle
s'empile sur `tokens`, donc ne redéclarez que ce qui change (les couleurs, en général) ; rayons,
polices et densité restent ceux du thème.

`tokens.colorScheme` décide de ce qui est servi, et c'est un réglage comme un autre
(`"token": "colorScheme"`, type `select`) :

| Valeur | Ce que le visiteur reçoit |
|---|---|
| `light` | la palette claire, quel que soit son système |
| `auto` | la palette claire, plus un bloc `@media (prefers-color-scheme: dark)` |
| `dark` | la palette sombre seule |

Sans `tokensDark`, `auto` et `dark` retombent en clair : un thème qui n'a pas pensé son mode
sombre n'en reçoit pas un de force. Un réglage marqué `"scheme": "dark"` alimente la palette
sombre au lieu de la claire — c'est ainsi qu'on expose deux couleurs principales, une par
apparence. Les deux blocs redéclarent tout : les valeurs dérivées (`--brand-color-on-primary`)
sont recalculées pour chaque palette, et la marque d'un revendeur, sur ses domaines, l'emporte sur
les deux.

Une feuille de style de thème qui veut corriger quelque chose en sombre ne peut pas se contenter
de `@media (prefers-color-scheme: dark)` : la requête ignore le choix de l'hébergeur et
s'appliquerait à un site réglé sur « toujours claire ». `theme-argile` pose donc
`data-ag-scheme="{{ settings.colorScheme }}"` sur son marqueur d'enveloppe et s'en sert comme
garde.

Ce que la liaison ne permet pas, et c'est voulu : un `boolean` ou un `text` lié à une variable, une
variable du noyau, une couleur qui ne serait pas un hexadécimal. Pour un réglage qui change la
**forme** d'un bloc (une barre pleine largeur, un pied compact), une classe posée par le gabarit
reste le bon outil ; pour un réglage global sans gabarit sur chaque page, `theme-argile` montre le
marqueur `data-ag-*` recopié sur `<html>` par son script, et lu par `:has()` sans lui.

#### Typographie, relief et mise en page (0.34.0)

Onze tokens de plus, tous liables à un réglage, chacun émis dans une variable que le portail lit
déjà :

| Token | Défaut | Variable | Ce qui la lit |
|---|---|---|---|
| `typography.lineHeight` | `1.5` | `--brand-line-height` | le `<body>` du portail |
| `typography.headingLineHeight` | `1.2` | `--brand-line-height-heading` | `h1`-`h3` |
| `typography.letterSpacing` | `0em` | `--brand-letter-spacing` | le `<body>` du portail |
| `typography.headingLetterSpacing` | `-0.01em` | `--brand-letter-spacing-heading` | `h1`-`h3` |
| `typography.headingScale` | `1.25` | `--font-size-h1`, `-h2`, `-h3` | `h3` = `baseSize` × ratio, `h2` × ratio², `h1` × ratio³ |
| `colors.link` | l'accent résolu | `--brand-color-link` | les liens sans classe |
| `colors.focus` | l'accent résolu | `--brand-color-focus` | l'anneau de focus clavier |
| `radii.button` | `radii.md` | `--radius-button` | les boutons du noyau |
| `layout.containerMax` | `72rem` | `--layout-container-max` | la largeur du contenu de la vitrine |
| `layout.accountNav` | `sidebar` | — | `top` met la navigation de l'espace client en barre au-dessus du contenu |
| `elevation` | `soft` | `--shadow-sm`, `-md`, `-lg` | `flat`, `soft` ou `raised`, ombres teintées par la couleur du texte |

`lineHeight`, `headingLineHeight` et `headingScale` sont **sans unité** : un `number` qui s'y lie
ne déclare pas d'`unit`. `elevation` et `layout.accountNav` refusent au chargement une valeur hors
liste, et `check-extension` avertit d'une clé inconnue dans `tokens` ou `tokensDark`
(`typography.lineheight` ne produit sinon ni erreur ni effet).

Trois tokens existants changent de comportement :

- `typography.headingWeight` est enfin lu (`--brand-weight-heading` sur `h1`-`h3`, défaut `700`).
- `typography.headingFamily` suit `fontFamily` tant qu'aucune couche ne la déclare : un thème qui
  ne déclare que `fontFamily` a ses titres dans sa police, et non en Inter.
- `baseSize` fait maintenant varier les titres, par l'échelle. `--font-size-sm`, `-lg` et `-xl`
  restent fixes.

**Les défauts changent le rendu.** Sur un thème qui ne déclare rien, le texte courant passe en
hauteur de ligne `1.5` et les titres en `1.2`, `-0.01em`, avec les tailles de l'échelle au lieu de
celles du navigateur (`h1` ≈ 1,95 fois la taille de base au lieu de 2, `h3` 1,25 au lieu de 1,17).
Les règles des titres passent par `:where([data-theme])`, de spécificité minimale : la classe d'un
gabarit qui fixe sa propre taille ou son interlignage l'emporte toujours.

#### L'écran de réglages

Il s'ouvre depuis **Paramètres › Système › Thèmes**, par le lien de la carte du
thème — proposé pour tout thème, même sans réglage déclaré ni appliqué : l'hôte y ajoute le CSS
additionnel, les textes du thème et l'historique des publications (voir « Ce que l'hôte fournit à
tout thème »). C'est un éditeur plein écran : réglages à gauche, aperçu sur le reste. Les
modifications y sont enregistrées en brouillon, que seul l'aperçu lit, jusqu'à ce que l'hébergeur
les publie : un gabarit peut donc recevoir, dans l'aperçu, des valeurs que la vitrine n'affiche pas
encore. Un gabarit n'a rien à faire pour en profiter.

### Une capture pour le sélecteur

`theme.screenshot` désigne une image relative au **dossier du thème** (pas au dossier `assets`,
contrairement à `logo`) : PNG, JPEG ou WebP, 1200 × 750 recommandé, 400 Ko au plus. Le panel
l'affiche sur la carte du thème, pour qu'un hébergeur voie ce qu'il applique. Sans capture, il
dessine une vignette à partir de vos tokens.

### Le catalogue dans l'enveloppe

`templates/partials/header.liquid` reçoit `catalogFamilies` sur la vitrine : **l'arbre des
catégories publiées**, chacune avec `products` (ses offres et leurs prix), `children` (ses
sous-familles), `productCount` (sa branche entière) et `fromPriceFormatted` (son prix d'appel, déjà
mis en forme). De quoi écrire un menu déroulant à colonnes sans rien coder en dur :

```liquid
{% for family in catalogFamilies %}
<details>
  <summary>{{ family.name }}</summary>
  {% for column in family.children %}
    <a href="/catalog#cat-{{ column.id }}">{{ column.name }} — dès {{ column.fromPriceFormatted }}</a>
    {% for product in column.products limit: 5 %}
      <a href="/catalog#cat-{{ column.id }}">{{ product.name }} {{ product.priceFormatted }}</a>
    {% endfor %}
  {% endfor %}
</details>
{% endfor %}
```

Absent dans l'espace client, et vide si aucune offre n'est publiée : un gabarit teste
`catalogFamilies.size` avant de dérouler quoi que ce soit. Le noyau ne tronque pas la liste des
offres — il ne saurait pas où —, c'est au gabarit de limiter.

### Découper ses gabarits

Un thème peut factoriser ce qui se répète — un jeu d'icônes, une carte, un pied de section — dans
un fichier appelé par `{% render %}` ou `{% include %}`. Le chemin part de la **racine du thème**,
pas du gabarit qui l'écrit :

```liquid
{% render "templates/partials/icon", name: "server" %}   {% comment %} oui {% endcomment %}
{% render "partials/icon", name: "server" %}             {% comment %} non : ENOENT {% endcomment %}
```

Écrit en relatif, LiquidJS lève une erreur, le noyau retombe sur son écran React et la page reste
parfaitement présentable — en apparence seulement, plus une ligne du thème ne s'affiche. Rien à
l'écran ne le signale ; le journal de l'API, si. `pnpm check-extension` refuse désormais ce cas.

`{% render %}` isole la portée : le fichier appelé ne voit que les paramètres qu'on lui passe, pas
le contexte de la page. C'est ce qui en fait le bon outil pour un composant sans état comme une
icône.

### Ce qu'un gabarit ne doit pas promettre

La page d'accueil (`pages/home.liquid`) et les pages apportées par le thème (`pages` du manifeste,
`templates/custom/<slug>.liquid`) reçoivent `commitments` : la disponibilité, la rétention des
sauvegardes et le délai de réponse du support que l'hébergeur a saisis dans ses réglages. Chaque
champ est **absent** tant qu'il n'a rien saisi.

```liquid
{% if commitments.uptime %}Disponibilité : {{ commitments.uptime }}{% endif %}
```

Le thème livré `encre` a longtemps annoncé « 99,9 % », « quatorze jours » et « quatre heures »
écrits en dur dans son gabarit. Chaque hébergeur qui l'installait publiait donc, sous sa propre
signature, des engagements qu'il n'avait jamais pris et qu'il ne pouvait corriger qu'en éditant un
fichier du thème. Un thème décide *où* un chiffre apparaît ; seul l'hébergeur décide *lequel*, et
son silence est une réponse valable — la section ne s'affiche pas.

La règle vaut au-delà de ces trois champs : n'écrivez dans un gabarit aucune affirmation qui
engage l'exploitant du site. Prix, délais, garanties, certifications, avis de clients — rien de
tout cela n'est connu de l'auteur d'un thème.

### Le CSS et le JS

`theme.stylesheet` est chargé après les tokens et les styles de l'application : il peut tout
redéfinir. Seul le CSS additionnel de l'hébergeur vient après lui (voir « Ce que l'hôte fournit à
tout thème »). `theme.script` est un fichier `.js` chargé en `defer` sur toutes les pages du
portail, servi par une route dédiée. Aucune étape de build : ce que vous déposez est ce qui est
servi.

Trois limites à connaître avant d'écrire un script :

1. **Les îlots sont montés après lui.** Un script qui lirait le DOM d'un îlot au chargement le
   trouverait vide. Observez (`MutationObserver`) ou tenez-vous-en à ce que votre gabarit produit.
2. **Ne réécrivez pas le DOM d'un îlot.** React le réconcilie ; vos modifications disparaîtront au
   premier rendu, de façon intermittente et impossible à diagnostiquer.
3. **Un script qui dépose un traceur doit attendre le consentement.** C'est la seule des trois
   limites qui n'est pas technique.

#### Le consentement, pour un script de thème

Le portail ne dépose de lui-même que des traceurs strictement nécessaires (session, langue, panier,
et le choix de consentement lui-même). Un script de thème, lui, peut en charger d'autres — une
mesure d'audience, une carte, un chat. L'état du consentement se lit à deux endroits, et les deux
sont nécessaires :

```js
// À l'exécution du script : l'attribut existe dès l'hydratation du bandeau.
const consent = document.documentElement.dataset.cookieConsent; // "unset" | "granted" | "denied"
if (consent === "granted") loadTracker();

// Et ensuite, quand le visiteur répond ou revient sur sa réponse.
window.addEventListener("nw:cookie-consent", (event) => {
  if (event.detail === "granted") loadTracker();
});
```

Deux règles à ne pas contourner. **`"unset"` vaut refus** : tant que personne n'a répondu, rien ne
doit être chargé — c'est le seul état où le visiteur n'a pas eu l'occasion de dire non. Et un
traceur chargé ne se décharge pas : si vous en avez posé un, un passage à `"denied"` doit au moins
cesser d'envoyer, sans quoi le bouton « Refuser » ne refuse rien.

Ce que vous chargez doit aussi figurer dans la politique de cookies de l'instance. Le modèle
proposé à l'hébergeur (Paramètres › Légal) énumère les traceurs du produit et se termine par une
ligne lui rappelant d'y ajouter les vôtres — dites-le dans le README de votre thème, il n'a aucun
autre moyen de le savoir.

#### Polices : les livrer, pas les emprunter

`theme.fonts` déclare les polices que le thème veut voir chargées : `family`, `src`, `weight`,
`style`, `display` (défaut `swap`). **`src` part du dossier de ressources** du thème (`assets`, par
défaut `assets/`), pas du dossier du thème : il est servi sous la même adresse que vos autres
ressources, et le noyau en fabrique le `@font-face`.

```json
"fonts": [{ "family": "Figtree", "src": "fonts/figtree-latin-wght-normal.woff2", "weight": "300 900" }]
```

Livrez vos fichiers WOFF2 plutôt qu'un `href` vers Google Fonts : une feuille externe est chargée
avant toute réponse au bandeau de consentement, et transmet l'adresse IP de chaque visiteur à un
tiers. Argile et Encre embarquent les leurs depuis 0.34.0.

Chaque valeur finit dans un `<style>` posé tel quel dans la page. D'où une liste blanche
(`isSafeThemeFont`) : famille en lettres ASCII, chiffres, espaces, `_` ou `-` (64 caractères,
guillemets de bord ignorés — `"Libre Franklin 2.0"` est écartée pour son point), graisse `normal`,
`bold` ou de 1 à 1000 (deux valeurs pour une police variable), style `normal` ou `italic`,
`display` parmi les cinq du CSS. Une police refusée est omise en entier, le texte retombe sur la
suite de la pile, et `check-extension` le signale.

### Le rendu échappe tout

Le moteur échappe **toute** sortie d'un gabarit, sans exception que vous puissiez invoquer :

- `{{ x }}`, bien sûr ;
- `{{ x | raw }}` : `raw` est réenregistré sans effet, et `check-extension` le signale ;
- `{% echo x %}`, `{% liquid echo x %}` et `{% cycle %}` passent par la même fonction que `{{ }}`.

Trois sorties seulement arrivent en HTML, parce que le noyau les a construites : `{{ bodyHtml }}`
dans `templates/email.liquid` (un filtre qui la transforme rend une chaîne ordinaire, échappée),
`{{ article.bodyHtml }}` dans `templates/pages/kb-article.liquid` (depuis 0.35.0, même règle pour
les filtres), et le résultat du filtre `markdown`. Pour un texte mis en forme par l'hébergeur, c'est
`format: "markdown"` ; il n'y a pas d'autre chemin. Le marqueur qui les distingue est posé par le
noyau côté rendu, sur un contexte qu'il vient d'assembler : il n'existe pas en JSON, et un contexte
que votre page ou un module envoie ne peut donc pas en fabriquer un.

Même principe pour ce qui va dans une feuille de style. `isSafeTokenValue` refuse, sans égard à la
casse, ce qui sortirait d'une déclaration ou de la balise `<style>` (`<`, `>`, `;`, `{`, `}`, `\`,
caractère de contrôle), `@`, et les fonctions qui font charger une adresse ou exécutaient du script
(`url(`, `image(`, `image-set(`, `cross-fade(`, `element(`, `src(`, `expression(`). Dans `tokens`
ou `tokensDark`, une telle valeur fait **refuser le thème au chargement**, avec le nom du token en
cause ; dans une option ou un réglage lié au CSS, elle est refusée à la lecture du manifeste puis
ignorée au rendu. Une image de fond passe par un gabarit (`<img>`, `style` d'un élément), pas par
un token.

### Ce que l'hôte fournit à tout thème

Sans une ligne de votre part, et sur l'écran de réglages de n'importe quel thème :

- **CSS additionnel** (permission `themes.css`) : une feuille saisie par l'hébergeur, émise après
  la vôtre sur la vitrine et l'espace client, jamais sur les pages d'authentification. Elle est
  analysée puis resérialisée : at-rules en liste blanche, aucune fonction qui charge une ressource,
  `url()` limitée aux images téléversées de l'instance. À spécificité égale, elle l'emporte sur
  votre feuille — c'est son rôle.
- **Textes du thème** : voir plus haut.
- **Polices téléversées** : proposées par tout réglage `font` (voir plus haut).
- **Historique des publications** : les 20 dernières, chacune restaurable dans le brouillon, jamais
  directement en ligne. Ce qui ne passe plus (un réglage retiré par une mise à jour du thème, une
  image supprimée) est écarté et listé.
- **Identité du site**, dans Paramètres › Identité : raison sociale, logo, favicon, titre du site et
  son motif (`{page} · {site}`), description par langue, image de partage. Le portail les émet dans
  ses métadonnées. Le favicon de l'Identité passe devant `theme.favicon`, qui sert de repli — et
  qui est enfin émis depuis 0.34.0 : il était déclaré et vérifié, jamais servi.

Le module d'exemple `theme-kiosque` fournit tous les niveaux — tokens, polices livrées, CSS libre,
enveloppe, gabarits de vue avec îlots, et son script — sans rien connaître du noyau au-delà de ce
contrat. Il ne couvre volontairement que 9 vues sur 46 : les 37 autres retombent sur les écrans de
l'hôte, et c'est ce qui rend un thème publiable avant d'être complet. Parmi elles, `login` n'est là
que pour montrer un point du contrat — un thème tiers rhabille l'écran de connexion sans pouvoir en
écrire le formulaire. Il déclare encore `^0.33.0` et n'utilise aucun ajout de 0.34.0 au-delà des
îlots devenus obligatoires sur `service`.

`theme-argile`, versionné dans le dépôt du produit, est la référence complète du contrat 0.35.0 :
les 46 vues, des sections, sous-groupes et blocs, des conditions chaînées, des liens, des polices
livrées et le type `font`, du texte en markdown, des textes du thème rangés par section, les
traductions du panel, et des zones `data-theme-setting` sur ses régions réglables.

## Écrire, vérifier, déposer

```
npx @opbs/extension-sdk create <provisioning|payment|notification|theme|addon|registrar|dns> <identifiant>
npx @opbs/extension-sdk check <dossier-du-module>
```

Le premier écrit un squelette structurellement valide (capacités à `false`, TODO explicites — rien
à effacer), avec `// @ts-check` et un `@type` JSDoc nommant son descripteur : installez
`@opbs/extension-sdk` en `devDependency` (`npm i -D @opbs/extension-sdk`) et votre éditeur souligne
un champ manquant ou mal nommé avant même de lancer `check`. Le second réutilise le **même
chargeur** que l'application réelle (`discoverExtensions`) : le rapport qu'il affiche est ce que
verrait Paramètres › Extensions sur une vraie instance. Depuis le SDK 0.26.0 ce n'est plus une
formule — les contrôles structurels sont littéralement le même code (`inspectDescriptor`), et le
chargeur les applique au dépôt : un champ sans libellé, un `select` sans `options`, un gabarit de
page ou un bundle d'écran absent du chemin déclaré apparaissent désormais sur la carte du module
dans le panel de l'hébergeur, même si vous n'avez jamais lancé la CLI. Le module reste chargé et
actif — ces défauts ne justifient pas de l'écarter —, mais ils ne sont plus invisibles. Dans ce
dépôt, les deux commandes restent disponibles sous `pnpm create-extension`/`pnpm check-extension`
— un simple appel au même binaire compilé.

**Ni l'un ni l'autre ne teste le comportement** contre un vrai prestataire — seulement la forme.
Au-delà, votre intégration reste votre responsabilité (voir la « soupape » dans
`COMPATIBILITY.md`) — mais tester `send()`, `createCheckout()` ou `syncZone()` ne demande plus de
refabriquer un `HostContext` à la main : `createTestHost()` (SDK 0.24.0) en construit un complet,
sans Prisma ni réseau.

```ts
import { createTestHost } from "@opbs/extension-sdk";

const host = createTestHost({ config: { apiKey: "test" }, locale: "de" });
const outcome = await monModule.createCheckout(host, checkout);

// storage est une vraie Map en mémoire ; logger et emit capturent dans host.logs / host.events,
// consultables sans mock. Un http non fourni rejette explicitement plutôt que d'appeler le réseau.
expect(host.logs).toContainEqual({ level: "info", message: "checkout créé" });
```

**Le dépôt lui-même se fait par FTP/SSH, jamais par téléversement d'archive depuis le panel.** Ce
refus est délibéré : une prise de contrôle du compte administrateur ne doit pas suffire à faire
exécuter du code arbitraire sur le serveur. Installer un module équivaut à installer un paquet npm,
et demande le même niveau de confiance.

```
/extensions/
  votre-module/
    extension.json     ← lu en premier, sans qu'aucune ligne de code ne soit exécutée
    index.js           ← chargé seulement si le manifeste est valide et compatible
```

Un redémarrage est nécessaire : la découverte a lieu une fois au démarrage, et `require` met le
code en cache — un module rechargé à chaud le serait à moitié, ancien code et nouveau manifeste.
**Redémarrez les deux services, `api` *et* `worker`.** Ils lisent le même dossier, mais chacun à
son propre démarrage : ne redémarrer que l'API donne un module vert dans le panel — c'est le
registre de l'API qu'il affiche — et ignoré par le worker, donc une passerelle proposée au portail
dont aucun renouvellement automatique ne se sert. Le panel signale cet écart sur la carte du module
(« le worker ne le connaît pas »), mais mieux vaut ne pas le provoquer.

Ce que le noyau vérifie avant d'exécuter quoi que ce soit :

1. `extension.json` est un JSON valide, avec un identifiant, un genre, un nom, une version et une
   plage `engines.host`.
2. Cette plage couvre la version du contrat de cette instance (voir le plancher de compatibilité
   plus haut). Sinon le module est signalé **incompatible** dans le panel et **n'est pas chargé**.
3. Le fichier `entry` est dans le dossier du module.
4. Ce qu'il exporte s'identifie par le même `id` et le même `kind` que le manifeste — sans quoi un
   module lirait la configuration, et les secrets, d'un autre.

Un module qui échoue à l'une de ces étapes apparaît en rouge dans Paramètres › Extensions, avec le
motif. Il n'empêche jamais l'application de démarrer.

## Ce qui est promis

`COMPATIBILITY.md` dit ce qui est stable, ce qui ne l'est pas encore, et ce qui ne le sera jamais.
Le SDK d'extension y a sa propre section, avec la politique de version qui s'applique depuis sa
publication sur npm (`@opbs/extension-sdk`, 2026-09-05).

## Vos droits sur votre module

`@opbs/extension-sdk` est sous licence **MIT** : vous pouvez l'utiliser, le modifier et le
redistribuer librement, y compris dans un produit commercial.

**Votre module vous appartient.** Il n'est pas une œuvre dérivée de opbs, et vous le
distribuez sous la licence de votre choix — libre ou commerciale — sans autorisation ni redevance.
C'est écrit noir sur blanc à l'article 6 du `LICENSE` à la racine du dépôt, qui régit le reste du
produit (propriétaire, celui-là).

Une conséquence pratique, qui est aussi la raison de ce découpage : écrire un module ne demande
aucun accès au code de opbs. Le SDK, ces exemples et ce document suffisent. Si vous vous
retrouvez à avoir besoin de lire le noyau pour écrire un module, c'est un manque du contrat —
signalez-le plutôt que de contourner.
