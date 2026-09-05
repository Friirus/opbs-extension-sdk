import type { HostContext } from "../host";
import type { ExtensionDescriptor } from "../manifest";

/**
 * Une option proposée par ce module pour un abonnement donné.
 *
 * `id` est stable *dans* le module, pas globalement — le noyau le combine avec l'identifiant du
 * module pour former une référence unique, sur le même principe que
 * `ProvisioningTarget.serviceId` : le module ne connaît que son propre espace de noms.
 */
export interface AddonOffering {
  id: string;
  name: string;
  description?: string;
  /** Hors taxe, comme `Product.priceCents` — même raison : la TVA dépend du client. */
  priceCents: number;
  currency: string;
}

/**
 * Ce que le noyau communique au module pour qu'il décide s'il propose une option et l'applique.
 *
 * Miroir de `ProvisioningTarget` (`kinds/provisioning.ts`) : rien ici ne vient directement du
 * schéma de la base, pour la même raison — un module ne reçoit jamais le client Prisma.
 */
export interface AddonSubscriptionContext {
  subscriptionId: string;
  productId: string;
  /**
   * Module de provisioning livrant ce produit (ex. `"proxmox-ve"`), ou `null` pour un produit sans
   * machine. Permet à un module d'options de ne se proposer que pour les abonnements d'un pilote
   * donné : une allocation de port supplémentaire n'a de sens que pour un serveur de jeu livré par
   * un panel comme Pterodactyl, pas pour une VM Proxmox — c'est au module d'options d'en décider,
   * le noyau ne fait que le lui dire.
   */
  driverId: string | null;
  /**
   * Identifiant du service chez le fournisseur qui le livre (`ProvisioningResult.remoteId` tel que
   * le module de provisioning l'a rendu), ou `null` tant que le service n'est pas livré — ou pour
   * un produit sans machine. C'est ce qui permet à un module d'options d'**agir** réellement chez
   * le prestataire (rattacher un port à ce serveur-là, activer une licence sur cette machine-là)
   * plutôt que de tenir une simple comptabilité interne. Un module qui en a besoin et le reçoit
   * `null` doit lever : l'échec est visible du support (`SubscriptionAddon.provisioningNote`), un
   * silence ne l'est pas.
   */
  remoteId: string | null;
  quantity: number;
}

/**
 * Ce que `onAttach` peut rendre en plus de réussir — additif, sur le modèle de
 * `ProvisioningOutcome` (`kinds/provisioning.ts`). Sans elle, un module qui alloue une ressource
 * portant une identité pour le client (un numéro de port, une adresse) n'avait aucun moyen de la
 * lui communiquer : `SubscriptionAddon.provisioningNote` n'était renseignée qu'en cas d'échec, et
 * le portail l'affiche pourtant quel que soit l'état.
 */
export interface AddonOutcome {
  /** Message destiné au client, posé dans `SubscriptionAddon.provisioningNote` — ex. « Port alloué : 25565 ». */
  note?: string;
}

/**
 * Contrat d'un module qui propose ses propres options d'abonnement, avec un effet réel à
 * l'ajout/au retrait — par opposition au catalogue interne (`AddonProduct`), purement tarifaire et
 * géré par le staff. Un module qui n'a rien à *faire* à l'ajout n'a pas sa place ici : autant créer
 * une entrée dans le catalogue interne.
 */
export interface AddonDescriptor<
  TConfig = Record<string, unknown>,
> extends ExtensionDescriptor<TConfig> {
  kind: "addon";
  /**
   * Options que ce module propose pour cet abonnement précis. Peut en écarter selon `driverId` ou
   * tout autre critère propre au module — c'est lui qui juge de sa pertinence, pas le noyau.
   */
  offeringsFor(ctx: HostContext, subscription: AddonSubscriptionContext): Promise<AddonOffering[]>;
  /**
   * Effet réel de l'ajout — ex. allouer un port chez Pterodactyl. Appelé après que la facture
   * d'ajustement (ou son absence) soit posée côté commercial : un échec ici ne doit jamais faire
   * disparaître une ligne déjà facturée, seulement laisser une note pour le support.
   *
   * Rejouable : appelée depuis un chemin qui peut être retenté après un échec réseau, elle doit
   * pouvoir s'exécuter deux fois sur la même offre sans dupliquer l'allocation — même exigence que
   * `ProvisioningDescriptor.create`.
   *
   * Le retour est optionnel : un module qui n'a rien à communiquer peut toujours ne rien rendre.
   */
  onAttach(
    ctx: HostContext,
    offeringId: string,
    subscription: AddonSubscriptionContext,
  ): Promise<AddonOutcome | void>;
  /** Symétrique : libère ce que `onAttach` avait alloué. Même exigence d'idempotence. */
  onDetach(
    ctx: HostContext,
    offeringId: string,
    subscription: AddonSubscriptionContext,
  ): Promise<void>;
}

/**
 * Vérifie qu'un module du genre `addon` expose bien les trois méthodes du contrat, et rend les
 * manques.
 *
 * Contrairement aux autres genres, aucune n'est optionnelle et il n'y a pas de `capabilities` à
 * cocher : un module qui n'implémenterait pas les trois n'a rien à faire ici — le catalogue
 * interne (`AddonProduct`) couvre déjà les options purement tarifaires, sans passer par une
 * extension.
 */
export function missingAddonOperations(
  descriptor: Partial<Pick<AddonDescriptor, "offeringsFor" | "onAttach" | "onDetach">>,
): string[] {
  return (["offeringsFor", "onAttach", "onDetach"] as const).filter(
    (name) => typeof descriptor[name] !== "function",
  );
}
