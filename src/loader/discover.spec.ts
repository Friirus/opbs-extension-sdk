import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverExtensions } from "./discover";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "extensions-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const MANIFEST = {
  id: "acme-pay",
  kind: "payment",
  name: "Acme Pay",
  description: "Encaisse chez Acme.",
  version: "2.1.0",
  author: "Acme SAS",
  engines: { host: "^0.1.0" },
  entry: "index.js",
};

/** Dépose un module sur le disque, comme le ferait un hébergeur par FTP. */
function drop(dirName: string, manifest: unknown, entry?: string): string {
  const dir = join(root, dirName);
  mkdirSync(dir, { recursive: true });
  if (manifest !== undefined) {
    writeFileSync(
      join(dir, "extension.json"),
      typeof manifest === "string" ? manifest : JSON.stringify(manifest),
    );
  }
  if (entry !== undefined) {
    writeFileSync(join(dir, "index.js"), entry);
  }
  return dir;
}

/**
 * Capacités toutes éteintes, pour les genres qui en exigent un objet. Un module qui n'en promet
 * aucune reste parfaitement valide — c'est le cas d'une passerelle qui se contente d'encaisser.
 */
const NO_PAYMENT_CAPABILITIES = {
  offSession: false,
  refund: false,
  webhook: false,
  storedMethods: false,
  methodSetup: false,
};

/** Descripteur minimal valide, tel qu'un module tiers l'exporterait. */
const descriptorSource = (id = "acme-pay", kind = "payment") => `
  module.exports = {
    id: ${JSON.stringify(id)},
    kind: ${JSON.stringify(kind)},
    label: "Acme Pay",
    description: "",
    configFields: [],
    ${kind === "payment" ? `capabilities: ${JSON.stringify(NO_PAYMENT_CAPABILITIES)},` : ""}
    parseConfig: (raw) => raw,
  };
`;

describe("découverte", () => {
  it("rend une liste vide quand le dossier n'existe pas — cas normal d'une instance sans module", () => {
    expect(discoverExtensions({ dir: join(root, "absent") })).toEqual([]);
  });

  it("charge un module valide et rend son descripteur", () => {
    drop("acme-pay", MANIFEST, descriptorSource());

    const [found] = discoverExtensions({ dir: root, hostVersion: "0.1.0" });

    expect(found).toMatchObject({ moduleId: "acme-pay", status: "OK", version: "2.1.0" });
    expect(found!.descriptor?.id).toBe("acme-pay");
    expect(found!.manifest?.author).toBe("Acme SAS");
  });

  /**
   * `lost+found`, un reste de copie, un `node_modules` déposé à côté : ces dossiers ne prétendent
   * pas être des modules. Les signaler en erreur noierait les vraies erreurs.
   */
  it("ignore un dossier sans manifeste au lieu de le signaler", () => {
    drop("pas-un-module", undefined);
    drop("acme-pay", MANIFEST, descriptorSource());

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" }).map((e) => e.moduleId)).toEqual([
      "acme-pay",
    ]);
  });

  /**
   * Le manifeste a d'abord porté une liste `configFields`, en double du descripteur. Un module
   * écrit contre cette version doit continuer de se charger : c'est une clé devenue inutile, pas
   * une faute.
   */
  it("tolère une clé que le manifeste ne reconnaît plus", () => {
    drop("acme-pay", { ...MANIFEST, configFields: [{ name: "x" }] }, descriptorSource());

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]!.status).toBe("OK");
  });

  /**
   * Ces défauts n'étaient relevés que par `pnpm check-extension`, c'est-à-dire seulement si
   * l'auteur pensait à le lancer. L'installation se faisant par dépôt de fichiers, c'est
   * précisément le module non relu qui pose problème : un `select` sans options donne une liste
   * vide qu'aucune erreur n'accompagne, et l'hébergeur ne peut pas activer le module.
   */
  it("signale un champ de configuration que le panel ne saurait pas rendre", () => {
    drop(
      "acme-pay",
      MANIFEST,
      `
      module.exports = {
        id: "acme-pay",
        kind: "payment",
        label: "Acme Pay",
        description: "",
        configFields: [{ name: "mode", label: "Mode", type: "select", options: [] }],
        capabilities: ${JSON.stringify(NO_PAYMENT_CAPABILITIES)},
        parseConfig: (raw) => raw,
      };
    `,
    );

    const [found] = discoverExtensions({ dir: root, hostVersion: "0.1.0" });

    // `OK`, et c'est le point : un module qui encaisse parfaitement ne doit pas être écarté pour
    // un défaut de formulaire. Il porte son message, le panel l'affiche à côté de lui.
    expect(found).toMatchObject({
      status: "OK",
      statusMessage: expect.stringMatching(/"select" sans "options"/),
    });
    expect(found!.descriptor).toBeDefined();
  });

  it("ne dit rien d'un module sain", () => {
    drop("acme-pay", MANIFEST, descriptorSource());
    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]!.statusMessage).toBeNull();
  });

  it("rend un ordre stable, quel que soit l'ordre du système de fichiers", () => {
    drop("zulu", { ...MANIFEST, id: "zulu" }, descriptorSource("zulu"));
    drop("alpha", { ...MANIFEST, id: "alpha" }, descriptorSource("alpha"));

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" }).map((e) => e.moduleId)).toEqual([
      "alpha",
      "zulu",
    ]);
  });
});

describe("manifeste illisible", () => {
  /**
   * Le point de tout le chargeur : un module cassé qui disparaît de l'écran est indiscernable
   * d'un module jamais installé, et l'hébergeur qui vient de le déposer cherche une erreur de
   * chemin là où il y a une erreur de code.
   */
  it("décrit quand même le module, sous le nom de son dossier", () => {
    drop("acme-pay", "{ ceci n'est pas du JSON", descriptorSource());

    const [found] = discoverExtensions({ dir: root, hostVersion: "0.1.0" });

    expect(found).toMatchObject({ moduleId: "acme-pay", status: "LOAD_ERROR", manifest: null });
    expect(found!.statusMessage).toBeTruthy();
  });

  it("refuse un manifeste auquel il manque un champ, en nommant lequel", () => {
    drop("acme-pay", { ...MANIFEST, version: undefined }, descriptorSource());

    const [found] = discoverExtensions({ dir: root, hostVersion: "0.1.0" });

    expect(found!.status).toBe("LOAD_ERROR");
    expect(found!.statusMessage).toMatch(/"version"/);
  });

  /**
   * La version n'était vérifiée que comme « texte non vide », si bien que `"dernière"` s'inscrivait
   * en base et s'affichait dans le panel. C'est pourtant ce que l'hébergeur compare pour savoir
   * s'il a bien déployé la mise à jour qu'il vient de télécharger — et une chaîne libre ne se
   * compare pas.
   */
  it("refuse une version qui n'est pas du semver", () => {
    drop("acme-pay", { ...MANIFEST, version: "dernière" }, descriptorSource());

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/semver/),
    });
  });

  it("accepte une version semver complète, préversion comprise", () => {
    drop("acme-pay", { ...MANIFEST, version: "2.1.0-beta.3" }, descriptorSource());

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "OK",
      version: "2.1.0-beta.3",
    });
  });

  /** Cet identifiant devient une clé en base et un segment d'URL de webhook. */
  it("refuse un identifiant qui n'en est pas un", () => {
    drop("mauvais", { ...MANIFEST, id: "../../etc" }, descriptorSource());

    expect(discoverExtensions({ dir: root })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/identifiant/),
    });
  });

  it("n'exécute rien d'un module dont le manifeste est refusé", () => {
    drop("acme-pay", "{ cassé", descriptorSource());
    const load = jest.fn();

    discoverExtensions({ dir: root, hostVersion: "0.1.0", load });

    expect(load).not.toHaveBeenCalled();
  });
});

describe("compatibilité", () => {
  /**
   * La décision structurante du chargement : un contrat changé ne se manifeste pas par une erreur
   * claire mais par un `undefined` qui voyage jusqu'à l'encaissement.
   */
  it("ne charge pas un module prévu pour un autre noyau", () => {
    drop("acme-pay", { ...MANIFEST, engines: { host: "^2.0.0" } }, descriptorSource());
    const load = jest.fn();

    const [found] = discoverExtensions({ dir: root, hostVersion: "0.1.0", load });

    expect(found).toMatchObject({ status: "INCOMPATIBLE" });
    expect(load).not.toHaveBeenCalled();
  });

  /** « Incompatible » sans dire avec quoi ne laisse rien à faire à l'hébergeur. */
  it("dit quelle version le module réclame et laquelle tourne", () => {
    drop("acme-pay", { ...MANIFEST, engines: { host: "^2.0.0" } }, descriptorSource());

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]!.statusMessage).toBe(
      "module prévu pour un noyau ^2.0.0, celui-ci est en 0.1.0",
    );
  });

  /** Une plage illisible n'est pas une plage permissive. */
  it("refuse une plage de compatibilité qu'il ne sait pas lire", () => {
    drop("acme-pay", { ...MANIFEST, engines: { host: "à peu près la 1" } }, descriptorSource());

    expect(discoverExtensions({ dir: root })[0]).toMatchObject({
      status: "INCOMPATIBLE",
      statusMessage: expect.stringMatching(/illisible/),
    });
  });

  it("en 0.x, une mineure de plus est une rupture — et doit l'être", () => {
    drop("acme-pay", { ...MANIFEST, engines: { host: "^0.1.0" } }, descriptorSource());

    expect(discoverExtensions({ dir: root, hostVersion: "0.2.0" })[0]!.status).toBe("INCOMPATIBLE");
  });
});

describe("chargement du code", () => {
  it("ne fait pas tomber l'instance quand le module lève à l'import", () => {
    drop("acme-pay", MANIFEST, 'throw new Error("oups");');

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/oups/),
    });
  });

  it("accepte un export par défaut aussi bien qu'un module.exports direct", () => {
    drop(
      "acme-pay",
      MANIFEST,
      `exports.default = ${descriptorSource().replace(/^\s*module\.exports = /, "")}`,
    );

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]!.status).toBe("OK");
  });

  it("refuse un point d'entrée qui n'exporte pas de descripteur", () => {
    drop("acme-pay", MANIFEST, "module.exports = 42;");

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/n'exporte pas de descripteur/),
    });
  });

  /**
   * La clé de rattachement en base vient du manifeste ; le code viendrait d'ailleurs. Un
   * descripteur qui s'identifie autrement ferait lire à ce module la configuration — et les
   * secrets — d'un autre.
   */
  it("refuse un descripteur dont l'identifiant contredit son manifeste", () => {
    drop("acme-pay", MANIFEST, descriptorSource("stripe"));

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/s'identifie "stripe".*"acme-pay"/),
    });
  });

  it("refuse un descripteur dont le genre contredit son manifeste", () => {
    drop("acme-pay", MANIFEST, descriptorSource("acme-pay", "provisioning"));

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/genre "provisioning"/),
    });
  });

  /**
   * `reportsNodeCapacity` est un champ à part de `capabilities` (ce n'est pas une action par
   * service), mais le même principe s'applique : une promesse sans méthode correspondante doit
   * être détectée au chargement, ici par le vrai loader et non seulement par la fonction pure
   * `missingNodeCapacityReporting` (déjà couverte dans `packages/extension-sdk`).
   */
  it("refuse un module provisioning qui annonce reportsNodeCapacity sans listNodeCapacity", () => {
    const provisioningManifest = { ...MANIFEST, id: "acme-node", kind: "provisioning" };
    drop(
      "acme-node",
      provisioningManifest,
      `
      module.exports = {
        id: "acme-node",
        kind: "provisioning",
        label: "Acme Node",
        description: "",
        configFields: [],
        parseConfig: (raw) => raw,
        capabilities: {
          create: false, suspend: false, resume: false, delete: false,
          resize: false, reboot: false, console: false, backup: false, reinstall: false,
        },
        providerConfigFields: [],
        productConfigFields: [],
        parseProductConfig: (raw) => raw,
        providerIdOf: () => null,
        summarize: () => "",
        reportsNodeCapacity: true,
        // listNodeCapacity manquant
      };
    `,
    );

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/reportsNodeCapacity.*listNodeCapacity/),
    });
  });

  /** Même principe, pour un compteur par service au lieu de par fournisseur. */
  it("refuse un module provisioning qui annonce reportsUsage sans reportUsage", () => {
    const provisioningManifest = { ...MANIFEST, id: "acme-usage", kind: "provisioning" };
    drop(
      "acme-usage",
      provisioningManifest,
      `
      module.exports = {
        id: "acme-usage",
        kind: "provisioning",
        label: "Acme Usage",
        description: "",
        configFields: [],
        parseConfig: (raw) => raw,
        capabilities: {
          create: false, suspend: false, resume: false, delete: false,
          resize: false, reboot: false, console: false, backup: false, reinstall: false,
        },
        providerConfigFields: [],
        productConfigFields: [],
        parseProductConfig: (raw) => raw,
        providerIdOf: () => null,
        summarize: () => "",
        reportsUsage: true,
        // reportUsage manquant
      };
    `,
    );

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/reportsUsage.*reportUsage/),
    });
  });

  /** Même principe, pour la jauge de stockage occupé. */
  it("refuse un module provisioning qui annonce reportsStorageUsage sans reportStorageUsage", () => {
    const provisioningManifest = { ...MANIFEST, id: "acme-storage", kind: "provisioning" };
    drop(
      "acme-storage",
      provisioningManifest,
      `
      module.exports = {
        id: "acme-storage",
        kind: "provisioning",
        label: "Acme Storage",
        description: "",
        configFields: [],
        parseConfig: (raw) => raw,
        capabilities: {
          create: false, suspend: false, resume: false, delete: false,
          resize: false, reboot: false, console: false, backup: false, reinstall: false,
        },
        providerConfigFields: [],
        productConfigFields: [],
        parseProductConfig: (raw) => raw,
        providerIdOf: () => null,
        summarize: () => "",
        reportsStorageUsage: true,
        // reportStorageUsage manquant
      };
    `,
    );

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/reportsStorageUsage.*reportStorageUsage/),
    });
  });

  /**
   * Le genre où l'écart coûtait le plus cher, et le dernier à avoir été protégé. Ce contrôle
   * n'existait que dans `pnpm check-extension`, c'est-à-dire seulement si l'auteur pensait à le
   * lancer : une passerelle qui annonçait `offSession` sans l'écrire se chargeait sans un mot, et
   * le mensonge se découvrait au prélèvement d'un renouvellement — après la commande, sur de
   * l'argent qu'on croyait pouvoir encaisser.
   */
  it("refuse une passerelle qui annonce une capacité sans l'implémenter", () => {
    drop(
      "acme-pay",
      MANIFEST,
      `
      module.exports = {
        id: "acme-pay",
        kind: "payment",
        label: "Acme Pay",
        description: "",
        configFields: [],
        checkoutLabel: "Payer",
        capabilities: { offSession: true, refund: false, webhook: false, storedMethods: false, methodSetup: false },
        parseConfig: (raw) => raw,
        createCheckout: () => Promise.resolve({ kind: "redirect", url: "https://x.test" }),
        // chargeOffSession manquant, alors que offSession est annoncée
      };
    `,
    );

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/chargeOffSession/),
    });
  });

  /**
   * `storedMethods` recouvre deux méthodes, ce qui l'avait tenue hors du contrôle commun.
   * `detachStoredMethod` est pourtant ce que le noyau appelle à l'effacement d'un client
   * (art. 17 RGPD) : l'annoncer sans l'écrire, c'est échouer au pire moment possible.
   */
  it("refuse une passerelle qui annonce storedMethods sans savoir détacher", () => {
    drop(
      "acme-pay",
      MANIFEST,
      `
      module.exports = {
        id: "acme-pay",
        kind: "payment",
        label: "Acme Pay",
        description: "",
        configFields: [],
        checkoutLabel: "Payer",
        capabilities: { offSession: false, refund: false, webhook: false, storedMethods: true, methodSetup: false },
        parseConfig: (raw) => raw,
        createCheckout: () => Promise.resolve({ kind: "redirect", url: "https://x.test" }),
        describeStoredMethod: () => Promise.resolve(null),
        // detachStoredMethod manquant
      };
    `,
    );

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/detachStoredMethod/),
    });
  });

  it("nomme la capacité manquante plutôt que de laisser fuiter une erreur de lecture", () => {
    // Un descripteur sans `capabilities` du tout échouait déjà — mais sur un « Cannot read
    // properties of undefined » recopié tel quel dans le panel, qui ne dit ni quoi corriger ni
    // dans quel module.
    drop(
      "acme-pay",
      MANIFEST,
      `
      module.exports = {
        id: "acme-pay",
        kind: "payment",
        label: "Acme Pay",
        description: "",
        configFields: [],
        parseConfig: (raw) => raw,
      };
    `,
    );

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/capabilities/),
    });
  });

  /**
   * Contrairement aux autres genres, un module `addon` n'a pas de `capabilities` à cocher : les
   * trois méthodes sont toutes requises, et leur absence doit être détectée au chargement plutôt
   * qu'au premier abonnement qui tente d'ajouter son option.
   */
  it("refuse un module addon auquel il manque une méthode du contrat", () => {
    const addonManifest = { ...MANIFEST, kind: "addon" };
    drop(
      "acme-addon",
      addonManifest,
      `
      module.exports = {
        id: "acme-pay",
        kind: "addon",
        label: "Acme Addon",
        description: "",
        configFields: [],
        parseConfig: (raw) => raw,
        offeringsFor: () => Promise.resolve([]),
        onAttach: () => Promise.resolve(),
        // onDetach manquant
      };
    `,
    );

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/onDetach/),
    });
  });

  it("charge un module addon qui implémente les trois méthodes du contrat", () => {
    const addonManifest = { ...MANIFEST, id: "acme-addon", kind: "addon" };
    drop(
      "acme-addon",
      addonManifest,
      `
      module.exports = {
        id: "acme-addon",
        kind: "addon",
        label: "Acme Addon",
        description: "",
        configFields: [],
        parseConfig: (raw) => raw,
        offeringsFor: () => Promise.resolve([]),
        onAttach: () => Promise.resolve(),
        onDetach: () => Promise.resolve(),
      };
    `,
    );

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]!.status).toBe("OK");
  });

  it("refuse un entry qui pointe hors du dossier du module", () => {
    drop("acme-pay", { ...MANIFEST, entry: "../../../etc/passwd" }, descriptorSource());

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/hors du dossier/),
    });
  });

  it("exige un point d'entrée pour un module qui doit exécuter du code", () => {
    drop("acme-pay", { ...MANIFEST, entry: undefined }, descriptorSource());

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      status: "LOAD_ERROR",
      statusMessage: expect.stringMatching(/"entry" manquant/),
    });
  });

  /** Un thème n'expose aucun code : lui réclamer un point d'entrée l'exclurait du système. */
  it("accepte un thème sans point d'entrée", () => {
    drop("joli", { ...MANIFEST, id: "joli", kind: "theme", entry: undefined });

    expect(discoverExtensions({ dir: root, hostVersion: "0.1.0" })[0]).toMatchObject({
      moduleId: "joli",
      status: "OK",
    });
  });
});
