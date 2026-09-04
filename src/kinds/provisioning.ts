import type { ConfigField } from "../config-fields";
import type { HostContext } from "../host";
import type { ExtensionDescriptor } from "../manifest";

/**
 * Ce qu'un module de provisioning sait faire.
 *
 * Déclaré plutôt que supposé : l'interface client masque les actions qu'un module ne prend pas en
 * charge, au lieu de les proposer et d'échouer une fois le bouton pressé. Un module de livraison
 * manuelle ne sait rien redémarrer, et un client ne doit pas découvrir ça en essayant.
 *
 * Tous les drapeaux sont obligatoires : un module qui oublie d'en déclarer un dirait « je ne sais
 * pas faire » alors qu'il sait — ou l'inverse. Autant forcer la réponse.
 */
export interface ProvisioningCapabilities {
  create: boolean;
  suspend: boolean;
  resume: boolean;
  delete: boolean;
  /** Changement d'offre appliqué à la ressource existante, sans la recréer. */
  resize: boolean;
  reboot: boolean;
  /** Accès console distant (noVNC, SPICE, série…). */
  console: boolean;
  backup: boolean;
  restore: boolean;
  reinstall: boolean;
  /** Snapshots à la demande, distincts de `backup` : instantané local rapide (rollback), pas une copie hors du cluster. */
  snapshot: boolean;
}

/** Aucune capacité. Base commode pour un module qui n'en déclare que quelques-unes. */
export const NO_CAPABILITIES: ProvisioningCapabilities = {
  create: false,
  suspend: false,
  resume: false,
  delete: false,
  resize: false,
  reboot: false,
  console: false,
  backup: false,
  restore: false,
  reinstall: false,
  snapshot: false,
};

/** Les actions du cycle de vie, nommées une fois pour que noyau et modules parlent la même langue. */
export type ProvisioningOperation = keyof ProvisioningCapabilities;

/**
 * Caractéristiques vendues avec l'offre, telles que le catalogue les annonce au client.
 *
 * Le noyau les transmet sans les interpréter : à chaque module de décider ce qu'un « disque de
 * 40 Go » veut dire chez lui — un volume qcow2, un datastore VMware, un quota cPanel. `null`
 * lorsqu'une offre n'en déclare aucune, ce qui est le cas courant d'un service sans machine
 * (nom de domaine, prestation, licence).
 */
export interface ResourceSpec {
  cpu: number;
  ramMb: number;
  diskGb: number;
}

/** Une adresse allouée, telle que le noyau la connaît (`IpPool`/`IpAssignment`) — jamais une
 *  adresse choisie par le module lui-même. */
export interface ProvisioningNetworkAddress {
  address: string;
  prefixLength: number;
  /** Absente si le pool ne déclare pas de passerelle (rare, mais valide). */
  gateway?: string;
}

/**
 * Ce que le noyau a déjà alloué à ce service au moment de l'appel, pour un module qui a besoin de
 * configurer le réseau de l'invité lui-même (cloud-init, par exemple) plutôt que de compter sur un
 * DHCP côté hyperviseur. `undefined` : le service n'a pas d'IP allouée (pas de pool rattaché à
 * l'offre, ou pas encore alloué à cet instant du cycle de vie) — le module retombe alors sur son
 * propre comportement par défaut (DHCP, ou rien).
 */
export interface ProvisioningNetwork {
  ipv4?: ProvisioningNetworkAddress;
  ipv6?: ProvisioningNetworkAddress;
}

/**
 * Ce que le noyau demande à un module d'opérer.
 *
 * Un seul type pour toutes les opérations, plutôt qu'un par action : les modules se ressemblent
 * beaucoup plus par ce dont ils ont besoin que par ce qu'ils en font, et multiplier les types
 * obligerait à en ajouter un à chaque capacité nouvelle — donc à casser le contrat.
 *
 * Rien ici ne vient du schéma de la base. C'est la contrepartie de « pas de client Prisma dans le
 * `HostContext` » : si le module ne peut pas lire la base, le noyau doit lui remettre tout ce qui
 * lui manque, sous une forme qu'il contrôle et peut faire évoluer.
 */
export interface ProvisioningTarget<
  TProductConfig = Record<string, unknown>,
  TProviderConfig = Record<string, unknown>,
> {
  /**
   * Identifiant local du service. Opaque pour le module, qui s'en sert typiquement pour nommer la
   * ressource distante (`svc-…`) et la retrouver à l'œil dans l'interface de l'hyperviseur.
   */
  serviceId: string;
  /** Réglages de l'offre, déjà validés par `parseProductConfig`. */
  productConfig: TProductConfig;
  /**
   * Fournisseur ciblé, déchiffré et validé par `parseProviderConfig`. `null` pour un module qui
   * n'en utilise pas — une livraison manuelle ne se connecte à rien.
   */
  provider: TProviderConfig | null;
  /**
   * Référence de la ressource chez le fournisseur, telle que `create` l'a rendue. `null` tant que
   * rien n'a été créé : c'est la marque, pour le module, d'un service encore vide.
   */
  remoteId: string | null;
  /** Ce que le module avait demandé au noyau de retenir. Vide s'il n'a rien retenu. */
  remoteMeta: Record<string, unknown>;
  /** Caractéristiques de l'offre **courante** — celle d'après, lors d'un changement de formule. */
  spec: ResourceSpec | null;
  /** IP déjà allouée par le noyau à ce service, si l'offre a un pool rattaché — voir
   *  `ProvisioningNetwork`. `undefined` hors de `create`/`resume` ou sans pool configuré. */
  network?: ProvisioningNetwork;
}

/**
 * Ce qu'une opération rend au noyau.
 *
 * Tous les champs sont optionnels : la plupart des actions n'ont rien à signaler, et les rendre
 * obligatoires forcerait chaque module à écrire `return {}` sous une forme plus longue.
 */
export interface ProvisioningOutcome {
  /** Renseigné par `create`. Le noyau le persiste et le restituera à chaque appel suivant. */
  remoteId?: string;
  /**
   * Remplace intégralement les métadonnées retenues, il ne les complète pas. Une fusion silencieuse
   * empêcherait un module d'oublier une clé devenue fausse — un nœud après migration, par exemple.
   */
  remoteMeta?: Record<string, unknown>;
  /**
   * Ce que l'opération **n'a pas pu** appliquer, en une phrase destinée à un humain.
   *
   * Existe parce que le demi-succès est le cas normal ici, pas l'exception : Proxmox refuse de
   * réduire un disque, un hyperviseur refuse de baisser la RAM à chaud. Lever une erreur annulerait
   * un changement d'offre déjà facturé ; ne rien dire laisserait le client avec une machine qui ne
   * correspond pas à ce qu'il paie. Le noyau consigne cette note dans l'historique du changement.
   */
  note?: string;
  /**
   * `true` quand l'opération attend une intervention humaine pour être réellement effectuée.
   *
   * Le service reste alors « en attente » au lieu de passer actif. C'est ce qui distingue une
   * livraison manuelle d'une livraison automatique réussie : sans ce drapeau, un module sans
   * automatisation rendrait un succès et le client verrait « actif » un serveur que personne n'a
   * encore commandé. Le noyau ne suppose rien du travail restant, il se contente de ne pas
   * annoncer une livraison qui n'a pas eu lieu.
   */
  manualActionRequired?: boolean;
  /**
   * Délai après lequel le noyau doit **rappeler la même opération**, parce que le module a engagé
   * un travail dont il ne maîtrise pas le rythme.
   *
   * Existe parce que tous les fournisseurs ne livrent pas à l'appel. Une API qui prend commande —
   * panier, bon de commande, paiement — répond « c'est enregistré », puis livre des minutes ou des
   * heures plus tard, sans jamais rappeler personne : c'est au noyau d'aller voir.
   * `manualActionRequired` ne couvrait pas ce cas, il laisse le service en attente sans rien pour
   * l'en sortir, et un module ne peut pas se réveiller tout seul — il n'a ni file ni horloge.
   *
   * Le service reste « en attente » entre deux passages, exactement comme avec
   * `manualActionRequired`. Les deux disent la même chose au client, et ne diffèrent que sur qui
   * reprend la main : un humain, ou le noyau lui-même.
   *
   * **C'est ici que l'idempotence exigée plus haut se paie.** Le module est rappelé avec le même
   * `target`, `remoteMeta` compris — c'est là qu'il range de quoi se reconnaître au réveil. Un
   * `create` qui ne relit pas la commande qu'il a déjà passée en passe une deuxième, et chez un
   * fournisseur payant cela se compte en argent réel.
   *
   * Le noyau borne la valeur et plafonne le nombre de rappels : au-delà, l'opération est déclarée
   * en échec plutôt que rejouée sans fin. Un module n'a donc ni à compter ses passages, ni à se
   * défendre d'une boucle.
   */
  retryAfterSeconds?: number;
}

/**
 * Accès console, sous les deux formes qu'on rencontre réellement.
 *
 * `url` couvre les fournisseurs qui rendent un lien signé prêt à ouvrir ; `vnc-ticket` couvre ceux
 * qui, comme Proxmox, délivrent un billet à présenter à un client noVNC que l'hôte héberge
 * lui-même. Réduire les deux à une URL obligerait le second à en fabriquer une, donc à connaître
 * l'adresse publique de l'hôte — ce qu'un module n'a aucun moyen de savoir.
 */
export type ConsoleSession =
  | { kind: "url"; url: string; expiresAt?: Date }
  | { kind: "vnc-ticket"; host: string; port: number; ticket: string; expiresAt?: Date };

/** Sauvegarde déclenchée. La taille n'est connue qu'une fois l'opération terminée, d'où l'optionnel. */
export interface BackupOutcome {
  /** Référence de la sauvegarde chez le fournisseur, si elle en porte une. */
  remoteRef?: string;
  sizeBytes?: number;
}

/**
 * Un instantané tel que le fournisseur le connaît — jamais persisté côté noyau : la liste vient à
 * chaque fois du module, comme `NodeCapacitySnapshot`, pour ne jamais désynchroniser d'un état
 * distant que le client peut aussi modifier ailleurs (panel Proxmox direct, par exemple).
 */
export interface SnapshotInfo {
  /** Référence chez le fournisseur (nom du snapshot Proxmox, par ex.) — opaque pour le noyau. */
  id: string;
  label: string;
  createdAt: Date;
}

/**
 * Ce qu'un fournisseur observe sur un nœud physique, à l'instant du relevé — jamais ce qui est
 * vendu (`ResourceSpec`), toujours ce qui est mesuré. `nodeId` est l'identifiant technique du
 * fournisseur (nom d'hôte Proxmox, etc.) : le noyau ne l'expose jamais tel quel côté public, il
 * s'en sert pour retrouver/attribuer un libellé public choisi par l'hébergeur.
 */
export interface NodeCapacitySnapshot {
  nodeId: string;
  online: boolean;
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
}

/**
 * Contrat *catalogue* d'un module de provisioning : décrire sa configuration, la valider, dire quel
 * fournisseur elle cible et la résumer pour la liste des produits.
 *
 * Les méthodes d'exécution sont optionnelles en TypeScript, mais leur présence est **imposée par
 * les `capabilities`** : un module qui déclare `suspend: true` sans écrire `suspend` sera refusé au
 * chargement. Le noyau n'appelle jamais une opération qu'une capacité n'autorise pas, ce qui rend
 * le `?` sûr côté module — et l'incohérence bruyante côté auteur, au lieu de produire un bouton qui
 * échoue une fois pressé.
 */
export interface ProvisioningDescriptor<
  TProductConfig = Record<string, unknown>,
  TProviderConfig = Record<string, unknown>,
> extends ExtensionDescriptor<Record<string, unknown>> {
  kind: "provisioning";
  capabilities: ProvisioningCapabilities;
  /**
   * Réglages d'une **instance de fournisseur** : un cluster Proxmox, un vCenter, un serveur cPanel.
   *
   * Troisième niveau de configuration, et le seul qui porte des identifiants d'accès. Il est
   * distinct des deux autres parce qu'un hébergeur exploite plusieurs clusters avec un seul module,
   * et vend plusieurs offres sur chaque cluster. Liste vide = module sans fournisseur, et le panel
   * cesse alors d'en réclamer un.
   */
  providerConfigFields: ConfigField[];
  /** Valide les réglages d'un fournisseur. Lève `ExtensionConfigError` s'ils sont inexploitables. */
  parseProviderConfig?(raw: unknown): TProviderConfig;
  /**
   * Éprouve la liaison avec un fournisseur, sur demande depuis le panel.
   *
   * Rend un message dans les deux cas : « connecté » sans détail n'apprend rien, et un échec sans
   * la raison oblige l'hébergeur à deviner entre une URL fausse, un jeton révoqué et un certificat
   * refusé.
   */
  checkProvider?(
    ctx: HostContext,
    provider: TProviderConfig,
  ): Promise<{ ok: boolean; message: string }>;
  /**
   * Réglages saisis **par offre du catalogue** : quel template cloner, quel gabarit de ressources.
   *
   * Distincts de `configFields`, qui règle le module une fois pour toutes. Un même module de
   * provisioning sert autant d'offres que l'hébergeur en vend, chacune avec son propre template —
   * les mélanger obligerait à un module par offre.
   */
  productConfigFields: ConfigField[];
  /** Valide la configuration d'une offre. Lève `ExtensionConfigError` si elle est inexploitable. */
  parseProductConfig(raw: unknown): TProductConfig;
  /**
   * Identifiant du fournisseur (cluster, vCenter, serveur…) ciblé par cette offre, ou `null` si le
   * module n'en utilise pas. Permet au noyau de déclencher un provisioning sans rien savoir du
   * module.
   */
  providerIdOf(config: TProductConfig): string | null;
  /** Résumé court pour la liste des produits, ex. « template 9000 · qemu ». */
  summarize(config: TProductConfig): string;

  // --- Exécution -------------------------------------------------------------------------------
  //
  // Aucune de ces méthodes ne reçoit d'accès à la base : elles reçoivent une cible en paramètre et
  // rendent un résultat normalisé. C'est ce qui permet au noyau de faire évoluer son schéma sans
  // casser les modules installés — voir `COMPATIBILITY.md`.
  //
  // Elles sont appelées depuis une file de travaux qui rejoue en cas d'échec : **elles doivent être
  // idempotentes**. `create` reçoit un `remoteId` déjà renseigné lorsqu'une tentative précédente a
  // abouti puis échoué à l'enregistrer ; supprimer une ressource déjà disparue est un succès, pas
  // une erreur.

  create?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
  ): Promise<ProvisioningOutcome>;
  suspend?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
  ): Promise<ProvisioningOutcome>;
  resume?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
  ): Promise<ProvisioningOutcome>;
  delete?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
  ): Promise<ProvisioningOutcome>;
  /** Applique à la ressource existante l'offre courante, sans la recréer. Voir `note`. */
  resize?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
  ): Promise<ProvisioningOutcome>;
  reboot?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
  ): Promise<ProvisioningOutcome>;
  reinstall?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
  ): Promise<ProvisioningOutcome>;
  console?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
  ): Promise<ConsoleSession>;
  backup?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
  ): Promise<BackupOutcome>;
  /**
   * Restaure une sauvegarde déclenchée via `backup`, en place — écrase l'état courant de la
   * ressource, ne crée jamais de nouvelle ressource. `remoteRef` vient de `BackupOutcome.remoteRef`,
   * tel que persisté par le noyau sur `BackupJob` : opaque, seul le module qui l'a produit sait le
   * lire (URL vzdump Proxmox, snapshot ID vCenter…).
   */
  restore?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
    remoteRef: string,
  ): Promise<ProvisioningOutcome>;
  /**
   * Les quatre méthodes suivantes ne forment qu'une seule capacité (`snapshot`) : un module qui la
   * déclare doit toutes les fournir, pas un sous-ensemble — voir `missingProvisioningOperations`,
   * qui les vérifie ensemble plutôt qu'une par une comme le reste du cycle de vie.
   */
  listSnapshots?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
  ): Promise<SnapshotInfo[]>;
  createSnapshot?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
    params: { label?: string },
  ): Promise<SnapshotInfo>;
  deleteSnapshot?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
    snapshotId: string,
  ): Promise<void>;
  /** Restaure l'état capturé. La machine cible se retrouve dans l'état du snapshot, pas l'inverse. */
  rollbackSnapshot?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
    snapshotId: string,
  ): Promise<ProvisioningOutcome>;

  /**
   * Rapporte-t-il l'usage de ses nœuds physiques (CPU/RAM/disque) ? Séparé de `capabilities` à
   * dessein : ce n'est pas une action *par service* comme `suspend`/`resize`, mais une capacité du
   * fournisseur lui-même, interrogée indépendamment de tout service provisionné — la mélanger à
   * `ProvisioningCapabilities` la ferait apparaître à tort dans le dispatch d'actions par service.
   * Absent ou `false` : le module n'a simplement pas de notion de nœud physique (livraison
   * manuelle, panel de jeu sans accès à l'hôte…), ce qui est le cas courant.
   */
  reportsNodeCapacity?: boolean;
  /** Présent et exploitable si et seulement si `reportsNodeCapacity` vaut `true`. */
  listNodeCapacity?(
    ctx: HostContext,
    provider: TProviderConfig,
  ): Promise<NodeCapacitySnapshot[]>;

  /**
   * Rapporte-t-il l'usage d'un service livré (bande passante) ? Même principe que
   * `reportsNodeCapacity`, mais par service au lieu de par fournisseur : ce n'est toujours pas une
   * action déclenchée depuis le dispatch par service (`suspend`/`resize`…), donc hors de
   * `capabilities`, mais cette fois interrogée pour une cible précise plutôt que pour tout le
   * fournisseur. Absent ou `false` : le module n'a pas de compteur exploitable (livraison
   * manuelle, service sans notion de trafic réseau), ce qui reste le cas courant.
   */
  reportsUsage?: boolean;
  /**
   * Relevé instantané d'un compteur cumulé, jamais un delta — au noyau de comparer avec le relevé
   * précédent pour en tirer une consommation sur la période. Présent et exploitable si et
   * seulement si `reportsUsage` vaut `true`.
   */
  reportUsage?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
  ): Promise<ServiceUsageSnapshot>;

  /**
   * Rapporte-t-il l'espace de stockage occupé par un service livré ? Même principe que
   * `reportsUsage`, mais une capacité à part plutôt qu'un second champ sur `ServiceUsageSnapshot` :
   * le stockage occupé est une **jauge** (valeur instantanée), pas un compteur cumulé qui repart de
   * zéro au redémarrage — le mélanger à `reportUsage` obligerait le noyau à deviner laquelle des
   * deux sémantiques s'applique à quel champ. Absent ou `false` : le module n'a pas de mesure
   * fiable de l'espace occupé (le cas le plus courant : Proxmox ne le rapporte que pour un
   * conteneur LXC, pas pour une VM QEMU sans agent invité).
   */
  reportsStorageUsage?: boolean;
  /** Présent et exploitable si et seulement si `reportsStorageUsage` vaut `true`. */
  reportStorageUsage?(
    ctx: HostContext,
    target: ProvisioningTarget<TProductConfig, TProviderConfig>,
  ): Promise<StorageUsageSnapshot>;
}

/**
 * Compteur cumulé observé à l'instant du relevé sur un service livré — jamais persisté tel quel
 * côté noyau, qui n'en retient que le dernier relevé pour calculer un delta au relevé suivant
 * (`ProvisionedService.lastUsageCounterBytes`). Repart de zéro à chaque redémarrage de la
 * ressource distante (comportement des compteurs d'interface réseau habituels) : une chute du
 * compteur d'un relevé à l'autre signale ce redémarrage, pas une erreur.
 */
export interface ServiceUsageSnapshot {
  bandwidthBytesCumulative: number;
}

/**
 * Espace occupé, relevé à l'instant du sondage — une jauge, pas un compteur : contrairement à
 * `ServiceUsageSnapshot`, le noyau ne calcule pas de delta entre deux relevés, il retient le
 * maximum observé sur la période (voir `ProvisionedService.periodStorageGbPeak`), pour facturer
 * fidèlement un pic de consommation même redescendu avant la fin de la période.
 */
export interface StorageUsageSnapshot {
  storageBytes: number;
}

/**
 * Opérations dont l'absence contredirait une capacité déclarée.
 *
 * `console` et `backup` en font partie au même titre que le cycle de vie : une capacité est une
 * promesse faite à l'interface, qui s'en sert pour afficher un bouton.
 */
const OPERATION_NAMES: readonly ProvisioningOperation[] = [
  "create",
  "suspend",
  "resume",
  "delete",
  "resize",
  "reboot",
  "console",
  "backup",
  "restore",
  "reinstall",
];

/**
 * Vérifie qu'un module tient ce que ses capacités annoncent, et rend les manques.
 *
 * Appelé au chargement plutôt qu'à l'appel : découvrir qu'un module ment sur ses capacités au
 * moment où un client clique, c'est déjà trop tard — la commande est payée. Rendre la liste plutôt
 * que lever laisse l'appelant choisir entre refuser le module et l'afficher en rouge dans le panel.
 */
/** Méthodes que `snapshot: true` engage — noms distincts de la capacité, donc vérifiés à part. */
const SNAPSHOT_METHOD_NAMES = [
  "listSnapshots",
  "createSnapshot",
  "deleteSnapshot",
  "rollbackSnapshot",
] as const;

export function missingProvisioningOperations(
  descriptor: Pick<ProvisioningDescriptor<never, never>, "capabilities"> &
    Partial<Record<ProvisioningOperation, unknown>> &
    Partial<Record<(typeof SNAPSHOT_METHOD_NAMES)[number], unknown>>,
): ProvisioningOperation[] {
  const missing = OPERATION_NAMES.filter(
    (name) => descriptor.capabilities[name] && typeof descriptor[name] !== "function",
  );
  const snapshotIncomplete =
    descriptor.capabilities.snapshot &&
    SNAPSHOT_METHOD_NAMES.some((name) => typeof descriptor[name] !== "function");
  return snapshotIncomplete ? [...missing, "snapshot"] : missing;
}

/**
 * `true` si le module déclare `reportsNodeCapacity: true` sans fournir `listNodeCapacity` —
 * même défaut de cohérence que `missingProvisioningOperations`, pour une capacité hors du dispatch
 * par service.
 */
export function missingNodeCapacityReporting(
  descriptor: Pick<
    ProvisioningDescriptor<never, never>,
    "reportsNodeCapacity" | "listNodeCapacity"
  >,
): boolean {
  return Boolean(descriptor.reportsNodeCapacity) && typeof descriptor.listNodeCapacity !== "function";
}

/**
 * `true` si le module déclare `reportsUsage: true` sans fournir `reportUsage` — même défaut de
 * cohérence que `missingNodeCapacityReporting`, pour un compteur par service au lieu de par
 * fournisseur.
 */
export function missingUsageReporting(
  descriptor: Pick<ProvisioningDescriptor<never, never>, "reportsUsage" | "reportUsage">,
): boolean {
  return Boolean(descriptor.reportsUsage) && typeof descriptor.reportUsage !== "function";
}

/**
 * `true` si le module déclare `reportsStorageUsage: true` sans fournir `reportStorageUsage` —
 * même défaut de cohérence que `missingUsageReporting`, pour la jauge de stockage.
 */
export function missingStorageUsageReporting(
  descriptor: Pick<
    ProvisioningDescriptor<never, never>,
    "reportsStorageUsage" | "reportStorageUsage"
  >,
): boolean {
  return (
    Boolean(descriptor.reportsStorageUsage) && typeof descriptor.reportStorageUsage !== "function"
  );
}
