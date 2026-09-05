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
  `companyName`, `logoUrl?`, `nav`, `area` (`"marketing"` ou `"account"`), `authenticated`.
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

### Les 42 vues

Neuf pour la vitrine, vingt-cinq pour l'espace client, huit pour l'authentification. C'est tout le
portail : aucune page ne reste hors de portée d'un thème.

#### Vitrine

| Vue | Gabarit | Reçoit | Îlots obligatoires |
|---|---|---|---|
| `home` | `pages/home.liquid` | — | — |
| `catalog` | `pages/catalog.liquid` | `sections`, `bundles` | `order-button` |
| `cart` | `pages/cart.liquid` | — | `cart` |
| `domains` | `pages/domains.liquid` | — | `domain-search` |
| `kb` | `pages/kb.liquid` | `articles`, `tags`, `query`, `activeTag`, `pagination` | — |
| `kb-article` | `pages/kb-article.liquid` | `article` | — |
| `legal-privacy` | `pages/legal-privacy.liquid` | `privacyPolicy`, `address`, `contactEmail?` | — |
| `legal-terms` | `pages/legal-terms.liquid` | `termsBody`, `termsUrl` | — |
| `content-page` | `pages/content-page.liquid` | `page` (`slug`, `title`, `blocks`) | — |

#### Espace client

Ces vingt-cinq vues ne diffèrent des précédentes que sur un point, invisible depuis un gabarit :
leur contexte est assemblé par la page qui les rend, pas par l'API seule — c'est la seule façon
d'avoir les données du client connecté, déjà mises en forme dans **sa** langue et **sa** devise.
Pour vous, rien ne change : mêmes gabarits, même repli vue par vue, mêmes îlots.

| Vue | Reçoit | Îlots obligatoires |
|---|---|---|
| `dashboard` | `counters`, `recentServices`, `recentInvoices` | — |
| `services` | `services`, `pagination` | — |
| `service` | `service`, `capabilities` | `service-actions` |
| `service-console` | `service` | `service-console` |
| `invoices` | `invoices`, `creditBalances`, `pagination` | — |
| `invoice` | `invoice` (avec `items`) | `invoice-pay` |
| `tickets` | `tickets`, `newTicketHref`, `pagination` | — |
| `ticket` | `ticket` (avec `messages`, `satisfaction`) | `ticket-reply` |
| `ticket-new` | `departments`, `ticketsHref` | `ticket-new-form` |
| `domains-mine` | `domains`, `pagination` | — |
| `domain` | `domain` | `domain-settings` |
| `dns-zones` | `zones`, `pagination` | `dns-create-zone` |
| `dns-zone` | `zone` (avec `records`) | `dns-records-editor` |
| `history` | `entries`, `pagination` | — |
| `account` | `sections` | — |
| `account-profile` | `email` | `account-change-email` |
| `account-security` | `isOwner`, `twoFactorEnabled`, `passkeyCount`, `linkedSsoCount`, `availableSsoProviders` | `account-change-password` |
| `account-billing` | `billing`, `baseCurrency`, `currencies` | `account-billing-identity` |
| `account-payment-methods` | `methods`, `gateways`, `canManage`, `justAdded` | `account-payment-methods` |
| `account-privacy` | `pendingErasure`, `requests` | `account-privacy` |
| `account-referral` | `referralCode`, `earned`, `referrals` | `account-referral-code` |
| `account-team` | `contacts`, `grantablePermissions` | `account-team` |
| `reseller-clients` | `isReseller`, `createHref`, `clients`, `pagination?` | — |
| `reseller-client` | `client` | `reseller-order-for-client` |
| `reseller-client-new` | `clientsHref` | `reseller-create-client` |
| `reseller-branding` | `isReseller`, `domain` | `reseller-branding` |

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
3. **Les libellés restent les vôtres.** Le noyau ne vous fournit pas de dictionnaire ; `locale` vous
   dit dans quelle langue rendre — `{% if locale == "en" %}Invoices{% else %}Factures{% endif %}`.

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
(`data-bundle`), `cart`, `domain-search`, `language-switcher`. Les trois derniers ne prennent aucun
paramètre. `language-switcher` s'utilise aussi dans l'enveloppe.

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

`account-change-password` mérite une phrase, parce qu'il paraît contredire la règle : c'est un
composant **de l'hôte** que vous placez, exactement comme `order-button`. Ce qui reste interdit est
qu'un gabarit écrive lui-même un champ de mot de passe.

`pnpm check-extension` refuse un gabarit qui oublie un îlot obligatoire ou qui en nomme un
inexistant. C'est le seul défaut de ce système qu'une relecture visuelle ne rattrape pas : un
catalogue sans `order-button` s'affiche parfaitement et ne vend rien.

### Le CSS et le JS

`theme.stylesheet` est chargé en dernier, après les tokens et les styles de l'application : il peut
tout redéfinir. `theme.script` est un fichier `.js` chargé en `defer` sur toutes les pages du
portail, servi par une route dédiée. Aucune étape de build : ce que vous déposez est ce qui est
servi.

Trois limites à connaître avant d'écrire un script :

1. **Les îlots sont montés après lui.** Un script qui lirait le DOM d'un îlot au chargement le
   trouverait vide. Observez (`MutationObserver`) ou tenez-vous-en à ce que votre gabarit produit.
2. **Ne réécrivez pas le DOM d'un îlot.** React le réconcilie ; vos modifications disparaîtront au
   premier rendu, de façon intermittente et impossible à diagnostiquer.
3. **Vous êtes seul responsable de la conformité de ce que vous injectez.** La bannière de
   consentement du portail (accepter/refuser) ne couvre que les cookies posés par le noyau — elle
   ne sait rien d'un traceur ajouté par `theme.script`. Un thème qui pose un cookie de mesure
   d'audience ou publicitaire doit gérer son propre consentement (ne se déclencher qu'après un
   choix explicite, lu par exemple dans `localStorage["cookie-consent-dismissed"]`) : c'est
   l'hébergeur qui répond de la conformité de ce qu'il installe.

Le module d'exemple `theme-kiosque` fournit tous les niveaux — tokens, polices livrées, CSS libre,
enveloppe, gabarits de vue avec îlots, et son script — sans rien connaître du noyau au-delà de ce
contrat. Il ne couvre volontairement que 6 vues sur 42 : les 36 autres retombent sur les écrans de
l'hôte, et c'est ce qui rend un thème publiable avant d'être complet. La sixième est `login`, qui
n'est là que pour montrer un point du contrat — un thème tiers rhabille l'écran de connexion sans
pouvoir en écrire le formulaire.

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
Le SDK d'extension y a sa propre section, avec la politique de version qui s'appliquera une fois
qu'il sera publié.

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
