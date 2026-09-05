import type { ConfigField } from "../config-fields";
import type { HostContext } from "../host";
import type { ExtensionDescriptor } from "../manifest";

/**
 * Ce qu'un module registrar sait faire.
 *
 * Même principe que `ProvisioningCapabilities` (`kinds/provisioning.ts`) : déclaré plutôt que
 * supposé, pour que l'interface masque un bouton qu'un module ne prend pas en charge au lieu de le
 * proposer et d'échouer une fois pressé. Un module de livraison manuelle ne sait pas verrouiller un
 * transfert programmatiquement, et un client ne doit pas le découvrir en cliquant.
 */
export interface RegistrarCapabilities {
  checkAvailability: boolean;
  register: boolean;
  renew: boolean;
  transfer: boolean;
  updateNameservers: boolean;
  updateContact: boolean;
  setTransferLock: boolean;
  /** Masquage des coordonnées du titulaire dans le WHOIS public. */
  whoisPrivacy: boolean;
}

export const NO_REGISTRAR_CAPABILITIES: RegistrarCapabilities = {
  checkAvailability: false,
  register: false,
  renew: false,
  transfer: false,
  updateNameservers: false,
  updateContact: false,
  setTransferLock: false,
  whoisPrivacy: false,
};

export type RegistrarOperation = keyof RegistrarCapabilities;

/**
 * Coordonnées du titulaire d'un domaine, telles qu'exigées par la plupart des registres (ICANN et
 * la majorité des ccTLD). Le noyau les transmet sans les interpréter : à chaque module de les
 * traduire vers les champs propres à son registrar.
 */
export interface DomainContact {
  firstName: string;
  lastName: string;
  organization?: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  countryCode: string;
}

/**
 * Ce que le noyau demande à un module d'opérer sur un domaine précis.
 *
 * Miroir de `ProvisioningTarget` : rien ici ne vient directement du schéma de la base, pour la
 * même raison — un module ne reçoit jamais le client Prisma.
 */
export interface RegistrarTarget<
  TProductConfig = Record<string, unknown>,
  TProviderConfig = Record<string, unknown>,
> {
  /** Identifiant local du domaine. Opaque pour le module. */
  domainId: string;
  /** Nom complet, ex. `"example.com"`. */
  name: string;
  /** TLD isolé, ex. `".com"`. */
  tld: string;
  /** Réglages de l'offre (le TLD vendu), déjà validés par `parseProductConfig`. */
  productConfig: TProductConfig;
  /** Fournisseur ciblé, déchiffré et validé par `parseProviderConfig`. `null` si le module n'en utilise pas. */
  provider: TProviderConfig | null;
  /** Référence du domaine chez le registrar, telle que `register` l'a rendue. `null` avant l'enregistrement. */
  remoteId: string | null;
  /** Ce que le module avait demandé au noyau de retenir. Vide s'il n'a rien retenu. */
  remoteMeta: Record<string, unknown>;
  registrantContact: DomainContact;
  nameservers: string[];
}

/** Ce qu'une opération rend au noyau. Tous les champs sont optionnels, sur le modèle de `ProvisioningOutcome`. */
export interface RegistrarOutcome {
  remoteId?: string;
  remoteMeta?: Record<string, unknown>;
  /**
   * Renseignée par `register`/`renew`/`transfer` : nouvelle date d'expiration chez le registrar.
   *
   * `Date | string` plutôt que `Date` seul : la plupart des API REST de registrar rendent une
   * chaîne ISO, et rien n'oblige un module à la faire passer par `new Date(...)` avant de la
   * rendre — un module `// @ts-check` qui renvoie la chaîne telle quelle a raison de le faire. Le
   * noyau normalise à la lecture (`domain-actions.processor.ts`).
   */
  expiryDate?: Date | string;
  note?: string;
  /** Même sémantique que `ProvisioningOutcome.manualActionRequired` : le domaine reste « en attente » tant que vrai. */
  manualActionRequired?: boolean;
  /**
   * Même sémantique que `ProvisioningOutcome.retryAfterSeconds`, et pour la même raison : chez la
   * plupart des registrars, un enregistrement ou un transfert n'est pas acquis au retour de
   * l'appel. Un transfert attend l'accord du registre perdant, ce qui se compte en jours.
   *
   * Le domaine reste dans son état d'attente entre deux passages, et le module est rappelé avec le
   * même `target` — `remoteMeta` compris, où il aura rangé sa référence de commande.
   */
  retryAfterSeconds?: number;
}

export interface AvailabilityResult {
  available: boolean;
  /** `true` si le domaine est soumis à un tarif premium, distinct du tarif catalogue habituel du TLD. */
  premium?: boolean;
  /** Prix constaté chez le registrar pour ce nom précis, s'il diffère du tarif catalogue (cas premium). */
  priceCents?: number;
}

/**
 * Contrat *catalogue* d'un module registrar : décrire sa configuration, la valider, et résumer un
 * TLD pour la grille de tarification. Les méthodes d'exécution sont optionnelles en TypeScript,
 * mais leur présence est imposée par les `capabilities` — voir `missingRegistrarOperations`.
 *
 * Comme pour `ProvisioningDescriptor`, aucune méthode d'exécution n'a accès à la base, et toutes
 * sont appelées depuis une file qui rejoue en cas d'échec : **elles doivent être idempotentes**.
 */
export interface RegistrarDescriptor<
  TProductConfig = Record<string, unknown>,
  TProviderConfig = Record<string, unknown>,
> extends ExtensionDescriptor<Record<string, unknown>> {
  kind: "registrar";
  capabilities: RegistrarCapabilities;
  /** Réglages d'un compte registrar (clé API, identifiant revendeur…). Liste vide = module sans fournisseur (livraison manuelle). */
  providerConfigFields: ConfigField[];
  parseProviderConfig?(raw: unknown): TProviderConfig;
  checkProvider?(
    ctx: HostContext,
    provider: TProviderConfig,
  ): Promise<{ ok: boolean; message: string }>;
  /** Réglages saisis par TLD vendu (ex. le TLD lui-même). */
  productConfigFields: ConfigField[];
  parseProductConfig(raw: unknown): TProductConfig;
  providerIdOf(config: TProductConfig): string | null;
  summarize(config: TProductConfig): string;

  // --- Exécution -------------------------------------------------------------------------------

  checkAvailability?(
    ctx: HostContext,
    name: string,
    provider: TProviderConfig | null,
  ): Promise<AvailabilityResult>;
  register?(
    ctx: HostContext,
    target: RegistrarTarget<TProductConfig, TProviderConfig>,
    years: number,
  ): Promise<RegistrarOutcome>;
  renew?(
    ctx: HostContext,
    target: RegistrarTarget<TProductConfig, TProviderConfig>,
    years: number,
  ): Promise<RegistrarOutcome>;
  transfer?(
    ctx: HostContext,
    target: RegistrarTarget<TProductConfig, TProviderConfig>,
    authCode: string,
  ): Promise<RegistrarOutcome>;
  updateNameservers?(
    ctx: HostContext,
    target: RegistrarTarget<TProductConfig, TProviderConfig>,
    nameservers: string[],
  ): Promise<RegistrarOutcome>;
  updateContact?(
    ctx: HostContext,
    target: RegistrarTarget<TProductConfig, TProviderConfig>,
    contact: DomainContact,
  ): Promise<RegistrarOutcome>;
  setTransferLock?(
    ctx: HostContext,
    target: RegistrarTarget<TProductConfig, TProviderConfig>,
    locked: boolean,
  ): Promise<RegistrarOutcome>;
  setWhoisPrivacy?(
    ctx: HostContext,
    target: RegistrarTarget<TProductConfig, TProviderConfig>,
    enabled: boolean,
  ): Promise<RegistrarOutcome>;
}

const OPERATION_NAMES: readonly RegistrarOperation[] = [
  "checkAvailability",
  "register",
  "renew",
  "transfer",
  "updateNameservers",
  "updateContact",
  "setTransferLock",
];

/**
 * Vérifie qu'un module tient ce que ses capacités annoncent, et rend les manques. Appelé au
 * chargement plutôt qu'à l'appel — voir `missingProvisioningOperations`, même raison.
 *
 * Noms d'opération et de méthode coïncident ici (contrairement à `snapshot`/`ProvisioningCapabilities`
 * qui recouvre quatre méthodes) : pas besoin d'indirection entre les deux.
 */
export function missingRegistrarOperations(
  descriptor: Pick<RegistrarDescriptor<never, never>, "capabilities"> &
    Partial<Record<RegistrarOperation | "setWhoisPrivacy", unknown>>,
): RegistrarOperation[] {
  const missing = OPERATION_NAMES.filter(
    (name) => descriptor.capabilities[name] && typeof descriptor[name] !== "function",
  );
  const whoisPrivacyIncomplete =
    descriptor.capabilities.whoisPrivacy && typeof descriptor.setWhoisPrivacy !== "function";
  return whoisPrivacyIncomplete ? [...missing, "whoisPrivacy"] : missing;
}
