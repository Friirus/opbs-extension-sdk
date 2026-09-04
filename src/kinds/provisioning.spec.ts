import {
  missingNodeCapacityReporting,
  missingProvisioningOperations,
  missingStorageUsageReporting,
  missingUsageReporting,
  NO_CAPABILITIES,
} from "./provisioning";

/**
 * Les `capabilities` sont une promesse faite à l'interface, qui s'en sert pour décider quels
 * boutons afficher. Un module qui annonce plus qu'il ne sait faire produit un bouton qui échoue
 * après la commande — d'où un contrôle au chargement plutôt qu'à l'appel.
 */
describe("missingProvisioningOperations", () => {
  it("ne reproche rien à un module qui n'annonce aucune capacité", () => {
    expect(missingProvisioningOperations({ capabilities: NO_CAPABILITIES })).toEqual([]);
  });

  it("relève une capacité annoncée sans méthode correspondante", () => {
    const menteur = {
      capabilities: { ...NO_CAPABILITIES, create: true, suspend: true },
      create: () => Promise.resolve({}),
    };
    expect(missingProvisioningOperations(menteur)).toEqual(["suspend"]);
  });

  it("ne reproche pas une méthode fournie au-delà de ce qui est annoncé", () => {
    // L'inverse est inoffensif : le noyau n'appelle jamais une opération qu'une capacité
    // n'autorise pas, donc une méthode en trop ne sera simplement jamais atteinte.
    const prudent = {
      capabilities: NO_CAPABILITIES,
      reboot: () => Promise.resolve({}),
    };
    expect(missingProvisioningOperations(prudent)).toEqual([]);
  });

  it("couvre la console et la sauvegarde comme le reste du cycle de vie", () => {
    const partiel = { capabilities: { ...NO_CAPABILITIES, console: true, backup: true } };
    expect(missingProvisioningOperations(partiel)).toEqual(["console", "backup"]);
  });

  it("réclame les quatre méthodes de snapshot ensemble, pas une par une", () => {
    const incomplet = {
      capabilities: { ...NO_CAPABILITIES, snapshot: true },
      listSnapshots: () => Promise.resolve([]),
      createSnapshot: () => Promise.resolve({ id: "x", label: "x", createdAt: new Date() }),
      // deleteSnapshot et rollbackSnapshot manquent.
    };
    expect(missingProvisioningOperations(incomplet)).toEqual(["snapshot"]);
  });

  it("ne reproche rien à un module qui fournit les quatre méthodes de snapshot", () => {
    const complet = {
      capabilities: { ...NO_CAPABILITIES, snapshot: true },
      listSnapshots: () => Promise.resolve([]),
      createSnapshot: () => Promise.resolve({ id: "x", label: "x", createdAt: new Date() }),
      deleteSnapshot: () => Promise.resolve(),
      rollbackSnapshot: () => Promise.resolve({}),
    };
    expect(missingProvisioningOperations(complet)).toEqual([]);
  });
});

/**
 * Même logique que `missingProvisioningOperations`, pour un champ séparé de `capabilities` : le
 * reporting de nœuds n'est pas une action par service.
 */
describe("missingNodeCapacityReporting", () => {
  it("ne reproche rien à un module qui ne rapporte pas de nœuds", () => {
    expect(missingNodeCapacityReporting({})).toBe(false);
  });

  it("ne reproche rien à un module qui déclare et implémente le reporting", () => {
    expect(
      missingNodeCapacityReporting({
        reportsNodeCapacity: true,
        listNodeCapacity: () => Promise.resolve([]),
      }),
    ).toBe(false);
  });

  it("relève une capacité annoncée sans méthode correspondante", () => {
    expect(missingNodeCapacityReporting({ reportsNodeCapacity: true })).toBe(true);
  });
});

/**
 * Même logique, pour un compteur par service au lieu de par fournisseur.
 */
describe("missingUsageReporting", () => {
  it("ne reproche rien à un module qui ne rapporte pas d'usage", () => {
    expect(missingUsageReporting({})).toBe(false);
  });

  it("ne reproche rien à un module qui déclare et implémente le reporting", () => {
    expect(
      missingUsageReporting({
        reportsUsage: true,
        reportUsage: () => Promise.resolve({ bandwidthBytesCumulative: 0 }),
      }),
    ).toBe(false);
  });

  it("relève une capacité annoncée sans méthode correspondante", () => {
    expect(missingUsageReporting({ reportsUsage: true })).toBe(true);
  });
});

/**
 * Même logique, pour la jauge de stockage occupé — une capacité à part de `reportsUsage` parce
 * que la sémantique (jauge vs compteur cumulé) diffère.
 */
describe("missingStorageUsageReporting", () => {
  it("ne reproche rien à un module qui ne rapporte pas de stockage", () => {
    expect(missingStorageUsageReporting({})).toBe(false);
  });

  it("ne reproche rien à un module qui déclare et implémente le reporting", () => {
    expect(
      missingStorageUsageReporting({
        reportsStorageUsage: true,
        reportStorageUsage: () => Promise.resolve({ storageBytes: 0 }),
      }),
    ).toBe(false);
  });

  it("relève une capacité annoncée sans méthode correspondante", () => {
    expect(missingStorageUsageReporting({ reportsStorageUsage: true })).toBe(true);
  });
});
