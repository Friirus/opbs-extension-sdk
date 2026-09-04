import { missingRegistrarOperations, NO_REGISTRAR_CAPABILITIES } from "./registrar";

/**
 * Même raison que `missingProvisioningOperations` et `missingPaymentOperations` : une capacité
 * annoncée sans méthode produit un bouton qui échoue après coup. Sur un domaine, « après coup »
 * veut dire après une commande payée et, pour un renouvellement, à quelques jours de l'expiration —
 * c'est-à-dire au moment où l'erreur coûte le nom lui-même.
 */
describe("missingRegistrarOperations", () => {
  it("ne reproche rien à un module qui n'annonce aucune capacité", () => {
    expect(missingRegistrarOperations({ capabilities: NO_REGISTRAR_CAPABILITIES })).toEqual([]);
  });

  it("relève une capacité annoncée sans méthode correspondante", () => {
    const menteur = {
      capabilities: { ...NO_REGISTRAR_CAPABILITIES, register: true, renew: true },
      register: () => Promise.resolve({ ok: true }),
    };
    expect(missingRegistrarOperations(menteur)).toEqual(["renew"]);
  });

  it("ne reproche pas une méthode fournie au-delà de ce qui est annoncé", () => {
    const prudent = {
      capabilities: NO_REGISTRAR_CAPABILITIES,
      transfer: () => Promise.resolve({ ok: true }),
    };
    expect(missingRegistrarOperations(prudent)).toEqual([]);
  });

  /**
   * Le piège propre à ce genre : sept capacités portent le nom de leur méthode, la huitième non.
   * `whoisPrivacy` se tient par `setWhoisPrivacy`, si bien qu'une vérification naïve chercherait
   * une méthode `whoisPrivacy` qui n'existe dans aucun module et refuserait tout le monde — ou,
   * écrite dans l'autre sens, ne vérifierait jamais rien.
   */
  it("rattache whoisPrivacy à setWhoisPrivacy, dont le nom diffère", () => {
    expect(
      missingRegistrarOperations({
        capabilities: { ...NO_REGISTRAR_CAPABILITIES, whoisPrivacy: true },
      }),
    ).toEqual(["whoisPrivacy"]);
  });

  it("accepte whoisPrivacy dès que setWhoisPrivacy est là", () => {
    expect(
      missingRegistrarOperations({
        capabilities: { ...NO_REGISTRAR_CAPABILITIES, whoisPrivacy: true },
        setWhoisPrivacy: () => Promise.resolve({ ok: true }),
      }),
    ).toEqual([]);
  });

  it("ne confond pas whoisPrivacy avec une méthode du même nom", () => {
    // Un auteur qui lit la liste des capacités sans lire le contrat écrit naturellement une
    // méthode `whoisPrivacy`. Elle ne sera jamais appelée : c'est `setWhoisPrivacy` que le noyau
    // invoque, et le manque doit donc être signalé malgré les apparences.
    const trompeur = {
      capabilities: { ...NO_REGISTRAR_CAPABILITIES, whoisPrivacy: true },
      whoisPrivacy: () => Promise.resolve({ ok: true }),
    };
    expect(missingRegistrarOperations(trompeur)).toEqual(["whoisPrivacy"]);
  });

  it("rend tous les manques, pas seulement le premier", () => {
    const vantard = {
      capabilities: {
        checkAvailability: true,
        register: true,
        renew: true,
        transfer: true,
        updateNameservers: true,
        updateContact: true,
        setTransferLock: true,
        whoisPrivacy: true,
      },
    };
    expect(missingRegistrarOperations(vantard)).toEqual([
      "checkAvailability",
      "register",
      "renew",
      "transfer",
      "updateNameservers",
      "updateContact",
      "setTransferLock",
      "whoisPrivacy",
    ]);
  });
});
