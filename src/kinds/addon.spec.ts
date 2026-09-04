import { missingAddonOperations } from "./addon";

/**
 * Contrairement aux autres genres, aucune méthode n'est optionnelle et il n'y a pas de
 * `capabilities` à cocher : un module `addon` qui n'implémenterait pas les trois n'a rien à faire
 * ici — voir le commentaire de tête dans `addon.ts`.
 */
describe("missingAddonOperations", () => {
  const complet = {
    offeringsFor: () => Promise.resolve([]),
    onAttach: () => Promise.resolve(undefined),
    onDetach: () => Promise.resolve(undefined),
  };

  it("ne reproche rien à un module qui implémente les trois méthodes", () => {
    expect(missingAddonOperations(complet)).toEqual([]);
  });

  it("relève chaque méthode manquante", () => {
    expect(missingAddonOperations({ offeringsFor: complet.offeringsFor })).toEqual([
      "onAttach",
      "onDetach",
    ]);
  });

  it("relève les trois sur un descripteur vide", () => {
    expect(missingAddonOperations({})).toEqual(["offeringsFor", "onAttach", "onDetach"]);
  });
});
