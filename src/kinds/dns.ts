import type { HostContext } from "../host";
import type { ExtensionDescriptor } from "../manifest";

/**
 * Ce qu'un module dns sait faire.
 *
 * Grosses mailles plutôt que CRUD par enregistrement : `syncZone` reçoit l'état complet voulu pour
 * la zone et fait le diff lui-même (créer/mettre à jour/supprimer les rrsets), sur le modèle de
 * `RegistrarDescriptor` — un fournisseur DNS expose presque toujours une API par zone entière
 * (PowerDNS, la plupart des registrars), jamais un enregistrement isolé.
 */
export interface DnsCapabilities {
  createZone: boolean;
  deleteZone: boolean;
  syncZone: boolean;
  /** Pose/efface un enregistrement PTR pour une IP assignée à un client — voir `setPtr`. */
  ptr: boolean;
}

export const NO_DNS_CAPABILITIES: DnsCapabilities = {
  createZone: false,
  deleteZone: false,
  syncZone: false,
  ptr: false,
};

export type DnsOperation = keyof DnsCapabilities;

/** Types d'enregistrement pris en charge en v1. Validés côté noyau — voir la validation dans `apps/api/src/dns`. */
export const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"] as const;
export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

/**
 * Un enregistrement DNS tel que le noyau le transmet à un module. Toujours *relatif* à la zone :
 * `name: "@"` désigne l'apex, `name: "www"` désigne `www.<zone>`. Le module reconstruit le nom
 * qualifié lui-même — il connaît déjà la zone (`DnsZoneTarget.name`).
 */
export interface DnsRecordInput {
  type: DnsRecordType;
  name: string;
  content: string;
  ttl: number;
  /** Requis pour MX/SRV, `null` pour tout autre type — imposé par la validation côté noyau. */
  priority: number | null;
}

/**
 * Ce que le noyau demande à un module de synchroniser pour une zone précise.
 *
 * Miroir de `RegistrarTarget` : rien ici ne vient directement du schéma de la base, un module ne
 * reçoit jamais le client Prisma.
 */
export interface DnsZoneTarget {
  /** Identifiant local de la zone. Opaque pour le module. */
  zoneId: string;
  /** Nom de la zone, ex. `"example.com"` — jamais de point final. */
  name: string;
  /** Référence de la zone chez le fournisseur, telle que `createZone` l'a rendue. `null` avant. */
  remoteId: string | null;
  /** Ce que le module avait demandé au noyau de retenir. Vide s'il n'a rien retenu. */
  remoteMeta: Record<string, unknown>;
  /** État complet voulu pour la zone — `syncZone` fait le diff, jamais un appel incrémental. */
  records: DnsRecordInput[];
}

/** Ce qu'une opération rend au noyau. Tous les champs sont optionnels, sur le modèle de `RegistrarOutcome`. */
export interface DnsOutcome {
  remoteId?: string;
  /** Remplace, ne fusionne pas — même règle que `Domain.registrarRemoteMeta`. */
  remoteMeta?: Record<string, unknown>;
  note?: string;
}

/**
 * Ce que le noyau demande à un module de poser/effacer pour une IP précise.
 *
 * Contrairement à `DnsZoneTarget`, ne porte ni nom de zone ni enregistrements : la zone
 * `in-addr.arpa`/`ip6.arpa` qui accueille réellement un PTR appartient à l'hébergeur, jamais au
 * client (voir `ROADMAP.md`), et c'est au module de la retrouver depuis `ip`/`ipVersion` — le
 * noyau ne qualifie jamais de nom reverse à sa place, même règle que `DnsZoneTarget.name` qui
 * reste relatif et laisse le module reconstruire ce que son fournisseur précis attend.
 */
export interface PtrTarget {
  /** Identifiant local de la demande. Opaque pour le module. */
  ptrRecordId: string;
  ip: string;
  ipVersion: 4 | 6;
  /** Référence chez le fournisseur, telle qu'un appel précédent l'a rendue. `null` avant. */
  remoteId: string | null;
  /** Ce que le module avait demandé au noyau de retenir. Vide s'il n'a rien retenu. */
  remoteMeta: Record<string, unknown>;
}

/**
 * Contrat d'un module dns : héberger des zones et leurs enregistrements pour le compte du client.
 *
 * Config à un seul niveau (`configFields`/`parseConfig` du socle commun), pas de fournisseur
 * séparé comme `RegistrarDescriptor` — un module dns pilote un unique service DNS par
 * installation (patron Stripe/SMTP), pas plusieurs comptes registrar.
 *
 * Comme pour `RegistrarDescriptor`, aucune méthode d'exécution n'a accès à la base, et toutes sont
 * appelées depuis une file qui rejoue en cas d'échec : **elles doivent être idempotentes** —
 * `createZone` peut être rappelée avec une zone déjà créée côté fournisseur (à traiter comme un
 * succès, pas une erreur), `syncZone` pousse un état complet donc un rejeu est par construction
 * sans effet de bord, `deleteZone` rappelée sur une zone déjà supprimée doit réussir.
 */
export interface DnsDescriptor<TConfig = Record<string, unknown>>
  extends ExtensionDescriptor<TConfig> {
  kind: "dns";
  capabilities: DnsCapabilities;
  /** Serveurs de noms publics à annoncer au client, pour qu'il les pointe chez son registrar. */
  nameserversOf(config: TConfig): string[];

  createZone?(ctx: HostContext, target: DnsZoneTarget): Promise<DnsOutcome>;
  deleteZone?(ctx: HostContext, target: DnsZoneTarget): Promise<DnsOutcome>;
  syncZone?(ctx: HostContext, target: DnsZoneTarget): Promise<DnsOutcome>;
  /**
   * Pose (`hostname` renseigné) ou efface (`hostname: null`) le PTR de `target.ip`. Rappelée avec
   * le même `hostname` déjà en place doit réussir sans effet (idempotence, même règle que
   * `createZone`/`syncZone`) ; rappelée sur un PTR déjà absent (`hostname: null` répété) doit
   * réussir aussi.
   */
  setPtr?(ctx: HostContext, target: PtrTarget, hostname: string | null): Promise<DnsOutcome>;
}

const OPERATION_NAMES: readonly DnsOperation[] = ["createZone", "deleteZone", "syncZone"];

/**
 * Vérifie qu'un module tient ce que ses capacités annoncent, et rend les manques. Appelé au
 * chargement plutôt qu'à l'appel — voir `missingRegistrarOperations`, même raison. `ptr` est
 * traitée à part, sur le même patron que `whoisPrivacy`/`setWhoisPrivacy` côté registrar : elle se
 * tient par `setPtr`, dont le nom diffère de la capacité.
 */
export function missingDnsOperations(
  descriptor: Pick<DnsDescriptor<never>, "capabilities"> &
    Partial<Record<DnsOperation | "setPtr", unknown>>,
): DnsOperation[] {
  const missing = OPERATION_NAMES.filter(
    (name) => descriptor.capabilities[name] && typeof descriptor[name] !== "function",
  );
  const ptrIncomplete = descriptor.capabilities.ptr && typeof descriptor.setPtr !== "function";
  return ptrIncomplete ? [...missing, "ptr"] : missing;
}
