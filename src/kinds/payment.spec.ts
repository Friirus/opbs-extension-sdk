import { missingPaymentOperations, NO_PAYMENT_CAPABILITIES as NO_CAPABILITIES } from "./payment";

/**
 * Même raison que `missingProvisioningOperations` (`kinds/provisioning.spec.ts`) : une capacité
 * annoncée sans méthode correspondante produit un bouton qui échoue après que le client a payé.
 */
describe("missingPaymentOperations", () => {
  it("ne reproche rien à un module qui n'annonce aucune capacité", () => {
    expect(missingPaymentOperations({ capabilities: NO_CAPABILITIES })).toEqual([]);
  });

  it("relève une capacité annoncée sans méthode correspondante", () => {
    const menteur = {
      capabilities: { ...NO_CAPABILITIES, offSession: true, refund: true },
      chargeOffSession: () => Promise.resolve({ status: "succeeded" as const, gatewayRef: "x" }),
    };
    expect(missingPaymentOperations(menteur)).toEqual(["refund"]);
  });

  it("ne reproche pas une méthode fournie au-delà de ce qui est annoncé", () => {
    const prudent = {
      capabilities: NO_CAPABILITIES,
      refund: () => Promise.resolve({ gatewayRef: "x" }),
    };
    expect(missingPaymentOperations(prudent)).toEqual([]);
  });

  it("associe chaque capacité à sa propre méthode, pas au même nom", () => {
    // Contrairement au provisioning, les noms de capacité et de méthode diffèrent
    // (offSession → chargeOffSession, webhook → verifyWebhook) : c'est ce que ce test verrouille.
    const complet = {
      capabilities: { ...NO_CAPABILITIES, offSession: true, webhook: true, refund: true },
      chargeOffSession: () => Promise.resolve({ status: "succeeded" as const, gatewayRef: "x" }),
      verifyWebhook: () => Promise.resolve({ type: "ignored" as const }),
      refund: () => Promise.resolve({ gatewayRef: "x" }),
    };
    expect(missingPaymentOperations(complet)).toEqual([]);
  });

  /**
   * `methodSetup` est ce qui permet à un client de remplacer sa carte avant qu'elle n'expire :
   * l'annoncer sans la tenir laisserait un bouton « Ajouter un moyen de paiement » qui échoue,
   * c'est-à-dire un client bloqué exactement au moment où il essaie de se débloquer.
   */
  it("relève methodSetup annoncée sans createMethodSetup", () => {
    expect(
      missingPaymentOperations({ capabilities: { ...NO_CAPABILITIES, methodSetup: true } }),
    ).toEqual(["createMethodSetup"]);
  });

  /**
   * `storedMethods` recouvre deux méthodes au lieu d'une, ce qui l'avait fait sortir du périmètre
   * de cette fonction : elle n'était vérifiée que par `pnpm check-extension`, donc seulement si
   * l'auteur pensait à le lancer. `detachStoredMethod` est pourtant ce que le noyau appelle à
   * l'effacement d'un client (art. 17 RGPD) — un module qui annonçait la capacité sans l'écrire
   * échouait au pire moment possible.
   */
  it("exige les deux méthodes que storedMethods recouvre", () => {
    expect(
      missingPaymentOperations({ capabilities: { ...NO_CAPABILITIES, storedMethods: true } }),
    ).toEqual(["describeStoredMethod", "detachStoredMethod"]);
  });

  it("ne reproche que la méthode manquante quand l'autre est là", () => {
    const moitie = {
      capabilities: { ...NO_CAPABILITIES, storedMethods: true },
      describeStoredMethod: () => Promise.resolve(null),
    };
    expect(missingPaymentOperations(moitie)).toEqual(["detachStoredMethod"]);
  });

  it("ne réclame rien tant que storedMethods n'est pas annoncée", () => {
    expect(missingPaymentOperations({ capabilities: NO_CAPABILITIES })).toEqual([]);
  });
});
