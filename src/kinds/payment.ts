import type { HostContext } from "../host";
import type { ExtensionDescriptor } from "../manifest";

/**
 * Ce qu'une passerelle sait faire. Déclaré, jamais supposé.
 *
 * L'interface client n'affiche que ce qui est réellement possible : proposer « rembourser » à un
 * module de virement bancaire, qui n'a aucune prise sur le compte du client, produirait un bouton
 * qui échoue. Et le renouvellement automatique ne retient que les passerelles capables de
 * prélever hors session — sans quoi il attendrait indéfiniment un encaissement qui ne viendra pas.
 */
export interface PaymentCapabilities {
  /** Prélever sans que le client soit devant son écran. Condition du renouvellement automatique. */
  offSession: boolean;
  /** Rembourser depuis le panel. */
  refund: boolean;
  /** Recevoir et vérifier des notifications du prestataire. */
  webhook: boolean;
  /** Conserver un moyen de paiement réutilisable pour ce client. */
  storedMethods: boolean;
  /**
   * Enregistrer un moyen de paiement **hors de tout paiement**, pour le réutiliser ensuite.
   *
   * Distincte de `storedMethods`, qui ne dit que « je sais décrire et détacher ce qu'un règlement
   * a laissé derrière lui ». Sans celle-ci, un client dont la carte expire n'a aucun moyen de la
   * remplacer avant l'échec : il lui faut attendre une facture due pour repasser par un paiement.
   * Optionnelle parce que toutes les passerelles n'en sont pas capables — un virement bancaire n'a
   * rien à enregistrer, et une passerelle sans page d'empreinte ne peut rien proposer.
   */
  methodSetup: boolean;
}

/**
 * Aucune capacité. Même rôle que `NO_DNS_CAPABILITIES`/`NO_REGISTRAR_CAPABILITIES` : jusqu'ici
 * chaque genre en avait redéfini une localement dans son fichier de test au lieu de l'exporter
 * d'ici, et `provisioning.ts` l'exportait sous le nom générique `NO_CAPABILITIES`, jamais
 * `NO_PROVISIONING_CAPABILITIES` — une incohérence sans conséquence pour un module tiers, qui n'a
 * jamais besoin de ces constantes, mais qui gênait quiconque cherchait le même nom d'un genre à
 * l'autre.
 */
export const NO_PAYMENT_CAPABILITIES: PaymentCapabilities = {
  offSession: false,
  refund: false,
  webhook: false,
  storedMethods: false,
  methodSetup: false,
};

/** Ce qui est réglé, du point de vue du noyau. */
export type PaymentPurpose = "invoice" | "order";

export interface CheckoutRequest {
  purpose: PaymentPurpose;
  /**
   * Identifiant local de ce qui est payé (facture ou produit commandé). La passerelle le
   * transporte sans l'interpréter et le restitue dans l'événement : c'est ce qui permet au noyau
   * de retrouver la facture sans que la passerelle connaisse son schéma.
   */
  reference: string;
  /**
   * Référence telle qu'un humain la recopie : numéro de facture, numéro de commande.
   *
   * Distincte de `reference`, qui est un identifiant technique. Un virement bancaire se pointe à
   * la main sur le libellé saisi par le client — et personne ne recopie correctement un
   * identifiant de vingt-cinq caractères aléatoires dans le champ « motif » de sa banque. Absente
   * quand le noyau n'a encore rien numéroté (une commande dont la facture naîtra au paiement) :
   * le module retombe alors sur `reference`.
   */
  displayReference?: string;
  /** Montant **toutes taxes comprises** : c'est ce que le client débourse. */
  amountCents: number;
  currency: string;
  /** Libellé montré au client sur la page de paiement. */
  description: string;
  customer: {
    id: string;
    email: string;
    name?: string | null;
    /** Référence du client chez ce prestataire, si le noyau en a déjà mémorisé une. */
    gatewayCustomerRef?: string | null;
  };
  returnUrl: string;
  cancelUrl: string;
  /** Réémises telles quelles dans l'événement — le noyau y range ce dont il aura besoin. */
  metadata?: Record<string, string>;
}

/**
 * Comment le client règle, selon la passerelle.
 *
 * Deux formes irréductibles l'une à l'autre : une redirection vers le prestataire, ou des
 * instructions à afficher. Le virement bancaire n'a pas d'URL et n'encaisse rien tout de suite —
 * forcer une redirection pour tout le monde reviendrait à l'exclure du système.
 */
export type CheckoutOutcome =
  | {
      kind: "redirect";
      url: string;
      /** Référence de la transaction chez le prestataire, quand elle existe déjà. */
      gatewayRef?: string;
      /** Référence client créée à cette occasion, à mémoriser pour les prélèvements suivants. */
      gatewayCustomerRef?: string;
    }
  | {
      kind: "instructions";
      heading: string;
      lines: string[];
      /** Référence que le client doit rappeler — c'est la clé du rapprochement bancaire. */
      gatewayRef: string;
      /**
       * `true` quand la facture reste due après cette étape. Le virement n'encaisse rien : la
       * marquer payée à l'affichage des coordonnées livrerait le service avant l'argent.
       */
      stillDue: true;
    };

export interface ChargeRequest {
  /** Facture à régler. Restituée dans l'événement et dans les métadonnées du prestataire. */
  reference: string;
  amountCents: number;
  currency: string;
  gatewayCustomerRef: string;
  gatewayMethodRef: string;
}

/**
 * Issue d'un prélèvement hors session.
 *
 * `requires_action` est distinct de `failed` à dessein : une banque européenne qui réclame une
 * authentification forte ne refuse pas le paiement, elle veut voir le client. Confondre les deux
 * suspendrait des clients parfaitement solvables.
 *
 * `pending` est du même ordre, pour un moyen dont le règlement prend plusieurs jours (un mandat
 * SEPA, typiquement) : ni un succès immédiat, ni un refus — le noyau doit attendre un événement
 * ultérieur (`payment.succeeded`/`payment.failed`) avant de savoir. Confondre `pending` avec
 * `failed` ferait échouer une tentative de prélèvement qui, en réalité, suit son cours.
 */
export type ChargeOutcome =
  | { status: "succeeded"; gatewayRef: string }
  | { status: "failed"; gatewayRef?: string; message?: string }
  | { status: "requires_action"; gatewayRef?: string; message?: string }
  | { status: "pending"; gatewayRef: string }
  /** Aucun moyen de paiement mémorisé : ce n'est pas un échec de paiement, rien n'a été tenté. */
  | { status: "no_method" };

/**
 * Demande d'enregistrement d'un moyen de paiement, sans rien encaisser.
 *
 * Ne porte ni montant ni référence de facture : ce n'est pas un paiement. Le client y est identifié
 * pour que la passerelle rattache la carte au bon dossier chez le prestataire — c'est ce
 * rattachement, et lui seul, qui rendra le prélèvement hors session possible ensuite.
 */
export interface MethodSetupRequest {
  customer: {
    id: string;
    email: string;
    name?: string | null;
    /** Référence du client chez ce prestataire, si le noyau en a déjà mémorisé une. */
    gatewayCustomerRef?: string | null;
  };
  returnUrl: string;
  cancelUrl: string;
  /** Réémises telles quelles dans l'événement — le noyau y range ce dont il aura besoin. */
  metadata?: Record<string, string>;
}

/**
 * Où envoyer le client pour qu'il saisisse son moyen de paiement.
 *
 * Une seule forme, contrairement à `CheckoutOutcome` : des « instructions » n'ont pas de sens ici.
 * Une passerelle qui n'a rien à faire saisir n'a pas à déclarer `methodSetup`.
 */
export interface MethodSetupOutcome {
  kind: "redirect";
  url: string;
  /**
   * Référence client créée à cette occasion, à mémoriser. Souvent le premier contact avec le
   * prestataire pour ce client : la carte est enregistrée avant qu'aucune facture n'ait été réglée.
   */
  gatewayCustomerRef?: string;
}

export interface WebhookRequest {
  /**
   * Corps **brut**, non parsé. Toute vérification de signature porte sur les octets reçus : un
   * JSON re-sérialisé ne produit pas la même empreinte.
   */
  rawBody: Buffer;
  headers: Record<string, string | undefined>;
}

/**
 * Événement normalisé, tel que le noyau le comprend — quel que soit le prestataire.
 *
 * `ignored` est une réponse à part entière : les prestataires envoient quantité d'événements qui
 * ne concernent pas l'encaissement, et un module doit pouvoir dire « rien à faire » sans que le
 * noyau ait à connaître son vocabulaire.
 */
export type GatewayEvent =
  | {
      type: "payment.succeeded";
      purpose: PaymentPurpose;
      reference: string;
      gatewayRef: string;
      gatewayCustomerRef?: string | null;
      gatewayMethodRef?: string | null;
      metadata: Record<string, string>;
    }
  | { type: "payment.disputed"; gatewayRef: string }
  /**
   * Un paiement précédemment `pending` (voir `ChargeOutcome`) échoue finalement — un mandat SEPA
   * rejeté par la banque du client, par exemple, quelques jours après la tentative.
   *
   * Distinct de `payment.disputed`, qui suppose un règlement déjà validé (facture `PAID`) et
   * contesté après coup. Ici, la facture n'a jamais quitté son état `SENT`/`OVERDUE` — seul le
   * `Payment` en attente doit être débloqué pour que le cycle de relance reprenne son cours normal.
   */
  | { type: "payment.failed"; gatewayRef: string }
  /**
   * Un moyen de paiement vient d'être enregistré, sans qu'un centime ait changé de main.
   *
   * Volontairement séparé de `payment.succeeded` : les confondre ferait passer une facture pour
   * réglée alors que le client n'a fait que déposer une carte. `reference` porte l'identifiant que
   * le noyau avait confié à `createMethodSetup` (l'identifiant du client) — la passerelle le
   * transporte sans l'interpréter, comme pour un paiement.
   */
  | {
      type: "method.stored";
      reference: string;
      gatewayCustomerRef: string;
      gatewayMethodRef: string;
      metadata: Record<string, string>;
    }
  | { type: "ignored" };

/**
 * Moyen de paiement mémorisé, réduit à ce qui sert à l'affichage.
 *
 * `type`, `ibanLast4` et `bankCode` sont optionnels — pour rester additif : les modules déjà
 * compilés contre une version antérieure du contrat, qui ne renseignent que les champs carte,
 * continuent de fonctionner sans modification. `type` absent vaut `"card"`. `ibanLast4`/`bankCode`
 * sont absents ou `null` pour une carte, `brand`/`last4`/`expMonth`/`expYear` le sont pour un
 * mandat SEPA (sans marque ni expiration).
 */
export interface StoredMethodDetails {
  ref: string;
  type?: "card" | "sepa_debit";
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  /** Quatre derniers caractères de l'IBAN. Absent/`null` hors mandat SEPA. */
  ibanLast4?: string | null;
  /** Code de la banque du client (ex. code BIC/guichet). Absent/`null` hors mandat SEPA. */
  bankCode?: string | null;
}

export interface RefundRequest {
  gatewayRef: string;
  amountCents: number;
  /**
   * Devise de l'encaissement d'origine.
   *
   * Un prestataire refuse un remboursement libellé autrement, et tous ne la déduisent pas de la
   * transaction visée : sans elle, un module devrait la deviner, ce qui revient à supposer que
   * l'hébergeur n'encaisse qu'en euros.
   */
  currency: string;
  reason?: string;
}

/**
 * Contrat d'une passerelle de paiement.
 *
 * Les méthodes optionnelles le sont conformément aux `capabilities` déclarées : un module qui
 * annonce `offSession: true` doit implémenter `chargeOffSession`. Le noyau ne fait jamais d'appel
 * qu'une capacité n'autorise pas.
 *
 * Aucune méthode ne reçoit d'accès à la base : la passerelle reçoit ce dont elle a besoin en
 * paramètre et rend un résultat normalisé. C'est ce qui permet au noyau de faire évoluer son
 * schéma sans casser les modules — voir `COMPATIBILITY.md`.
 */
export interface PaymentGatewayDescriptor<
  TConfig = Record<string, unknown>,
> extends ExtensionDescriptor<TConfig> {
  kind: "payment";
  capabilities: PaymentCapabilities;
  /** Libellé du bouton présenté au client, ex. « Payer par carte ». */
  checkoutLabel: string;
  createCheckout(ctx: HostContext, request: CheckoutRequest): Promise<CheckoutOutcome>;
  chargeOffSession?(ctx: HostContext, request: ChargeRequest): Promise<ChargeOutcome>;
  /**
   * Ouvre une saisie de moyen de paiement sans encaissement.
   *
   * L'enregistrement effectif n'est pas rendu ici mais notifié plus tard par `method.stored` :
   * quand le client revient sur `returnUrl`, le prestataire n'a pas toujours fini de valider la
   * carte (authentification forte), et lui répondre « c'est enregistré » à ce moment-là serait
   * parfois faux.
   */
  createMethodSetup?(ctx: HostContext, request: MethodSetupRequest): Promise<MethodSetupOutcome>;
  verifyWebhook?(ctx: HostContext, request: WebhookRequest): Promise<GatewayEvent>;
  /** Détail d'affichage d'un moyen de paiement mémorisé. `null` s'il n'existe plus. */
  describeStoredMethod?(ctx: HostContext, methodRef: string): Promise<StoredMethodDetails | null>;
  /** Détache un moyen de paiement — appelé à l'effacement d'un client (art. 17 RGPD). */
  detachStoredMethod?(ctx: HostContext, methodRef: string): Promise<void>;
  refund?(ctx: HostContext, request: RefundRequest): Promise<{ gatewayRef: string }>;
}

/** Les capacités adossées à une seule méthode optionnelle. */
const OPERATION_NAMES = ["chargeOffSession", "verifyWebhook", "refund", "createMethodSetup"] as const;

const CAPABILITY_BY_OPERATION: Record<(typeof OPERATION_NAMES)[number], keyof PaymentCapabilities> = {
  chargeOffSession: "offSession",
  verifyWebhook: "webhook",
  refund: "refund",
  createMethodSetup: "methodSetup",
};

/**
 * `storedMethods` est la seule capacité qui en recouvre deux : afficher un moyen mémorisé et le
 * détacher. Elle est donc vérifiée à part de la table ci-dessus, mais **par la même fonction** —
 * ce contrôle a longtemps vécu dans `scripts/check-extension.ts` seul, si bien qu'un module qui
 * annonçait `storedMethods` sans savoir détacher passait le chargement et n'échouait qu'à
 * l'effacement d'un client, au titre de l'article 17 du RGPD.
 */
const STORED_METHOD_NAMES = ["describeStoredMethod", "detachStoredMethod"] as const;

type PaymentOperationName =
  | (typeof OPERATION_NAMES)[number]
  | (typeof STORED_METHOD_NAMES)[number];

/**
 * Vérifie qu'un module de paiement tient ce que ses capacités annoncent, et rend les manques.
 *
 * Miroir de `missingProvisioningOperations` (`kinds/provisioning.ts`) : découvrir qu'un module
 * ment sur ses capacités au moment où un client clique, c'est déjà trop tard — la commande est
 * payée. Appelée au chargement (`discover.ts`) **et** par l'outil de vérification que lance un
 * auteur tiers : les deux doivent juger à l'identique, sinon `pnpm check-extension` cesse de
 * prédire ce que fera l'instance.
 */
export function missingPaymentOperations(
  descriptor: Pick<PaymentGatewayDescriptor, "capabilities"> &
    Partial<Record<PaymentOperationName, unknown>>,
): string[] {
  const missing: string[] = OPERATION_NAMES.filter(
    (name) =>
      descriptor.capabilities[CAPABILITY_BY_OPERATION[name]] &&
      typeof descriptor[name] !== "function",
  );
  if (descriptor.capabilities.storedMethods) {
    missing.push(...STORED_METHOD_NAMES.filter((name) => typeof descriptor[name] !== "function"));
  }
  return missing;
}
