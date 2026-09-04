import { missingDnsOperations, NO_DNS_CAPABILITIES } from "./dns";

/**
 * Même raison que `missingRegistrarOperations` : une capacité annoncée sans méthode produit un
 * bouton qui échoue après coup — ici, une zone que le client croit synchronisée mais qui ne l'est
 * jamais côté fournisseur.
 */
describe("missingDnsOperations", () => {
  it("ne reproche rien à un module qui n'annonce aucune capacité", () => {
    expect(missingDnsOperations({ capabilities: NO_DNS_CAPABILITIES })).toEqual([]);
  });

  it("relève une capacité annoncée sans méthode correspondante", () => {
    const menteur = {
      capabilities: { ...NO_DNS_CAPABILITIES, createZone: true, syncZone: true },
      createZone: () => Promise.resolve({}),
    };
    expect(missingDnsOperations(menteur)).toEqual(["syncZone"]);
  });

  it("ne reproche pas une méthode fournie au-delà de ce qui est annoncé", () => {
    const prudent = {
      capabilities: NO_DNS_CAPABILITIES,
      deleteZone: () => Promise.resolve({}),
    };
    expect(missingDnsOperations(prudent)).toEqual([]);
  });

  it("rend tous les manques, pas seulement le premier", () => {
    const vantard = {
      capabilities: { createZone: true, deleteZone: true, syncZone: true, ptr: true },
    };
    expect(missingDnsOperations(vantard)).toEqual([
      "createZone",
      "deleteZone",
      "syncZone",
      "ptr",
    ]);
  });

  /**
   * Le piège propre à `ptr`, même famille que `whoisPrivacy`/`setWhoisPrivacy` côté registrar :
   * la capacité se tient par `setPtr`, un nom différent. Une vérification naïve chercherait une
   * méthode `ptr` qui n'existe dans aucun module et refuserait tout le monde.
   */
  it("rattache ptr à setPtr, dont le nom diffère", () => {
    expect(
      missingDnsOperations({ capabilities: { ...NO_DNS_CAPABILITIES, ptr: true } }),
    ).toEqual(["ptr"]);
  });

  it("accepte ptr dès que setPtr est là", () => {
    expect(
      missingDnsOperations({
        capabilities: { ...NO_DNS_CAPABILITIES, ptr: true },
        setPtr: () => Promise.resolve({}),
      }),
    ).toEqual([]);
  });

  it("ne confond pas ptr avec une méthode du même nom", () => {
    const trompeur = {
      capabilities: { ...NO_DNS_CAPABILITIES, ptr: true },
      ptr: () => Promise.resolve({}),
    };
    expect(missingDnsOperations(trompeur)).toEqual(["ptr"]);
  });
});
