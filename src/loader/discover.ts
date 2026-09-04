import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { missingAddonOperations } from "../kinds/addon";
import { missingDnsOperations } from "../kinds/dns";
import { missingPaymentOperations } from "../kinds/payment";
import {
  missingNodeCapacityReporting,
  missingProvisioningOperations,
  missingStorageUsageReporting,
  missingUsageReporting,
} from "../kinds/provisioning";
import { missingRegistrarOperations } from "../kinds/registrar";
import type { ExtensionDescriptor, ExtensionManifest } from "../manifest";
import { incompatibilityReason } from "./compatibility";
import { inspectDescriptor } from "./inspect";
import { MANIFEST_FILENAME, parseManifest } from "./manifest";

/** État d'un module trouvé sur le disque. Reprend l'énumération stockée en base. */
export type DiscoveredStatus = "OK" | "INCOMPATIBLE" | "LOAD_ERROR";

/**
 * Un module déposé sur l'instance, tel que le chargeur l'a trouvé.
 *
 * Un module en échec est **décrit quand même**. C'est le point de tout ce fichier : un module
 * cassé qui disparaît de l'écran est indiscernable d'un module jamais installé, et l'hébergeur
 * qui vient de le déposer cherche alors une erreur de chemin là où il y a une erreur de code.
 */
export interface DiscoveredExtension {
  moduleId: string;
  /** Dossier d'où il vient, pour que le message d'erreur désigne un endroit réel. */
  path: string;
  /** `null` quand le manifeste lui-même est illisible : on ne sait alors rien du module. */
  manifest: ExtensionManifest | null;
  version: string;
  status: DiscoveredStatus;
  statusMessage: string | null;
  /** Présent uniquement quand `status` vaut `OK`. Rien d'autre n'a été exécuté. */
  descriptor?: ExtensionDescriptor<unknown>;
}

export interface DiscoverOptions {
  /** Dossier scanné. Chaque sous-dossier portant un `extension.json` est un module. */
  dir: string;
  /** Version du contrat à confronter aux `engines.host`. Injectable pour les tests. */
  hostVersion?: string;
  /** Chargement du code. Injectable pour les tests, `require` en production. */
  load?: (entryPath: string) => unknown;
}

/**
 * Parcourt le dossier des extensions et rend ce qu'on y trouve.
 *
 * **Ne lève jamais.** Un module tiers ne doit pas pouvoir empêcher l'application de démarrer : ni
 * par un manifeste illisible, ni par une exception au chargement, ni en revendiquant l'identifiant
 * d'un autre. Chaque échec devient une ligne rouge dans le panel, et le reste de l'instance
 * continue de fonctionner — y compris d'encaisser.
 */
export function discoverExtensions(options: DiscoverOptions): DiscoveredExtension[] {
  const { dir, hostVersion, load = requireEntry } = options;

  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    // Dossier absent : c'est le cas normal d'une instance sans module tiers, pas une anomalie.
    return [];
  }

  const found: DiscoveredExtension[] = [];
  for (const name of entries) {
    const moduleDir = join(dir, name);
    if (!hasManifest(moduleDir)) {
      // Un dossier sans manifeste ne prétend pas être un module : `lost+found`, un reste de copie,
      // un `node_modules` déposé à côté. Le signaler en erreur noierait les vraies erreurs.
      continue;
    }
    found.push(inspect(moduleDir, name, hostVersion, load));
  }
  return found;
}

function hasManifest(moduleDir: string): boolean {
  try {
    return statSync(join(moduleDir, MANIFEST_FILENAME)).isFile();
  } catch {
    return false;
  }
}

function inspect(
  moduleDir: string,
  dirName: string,
  hostVersion: string | undefined,
  load: (entryPath: string) => unknown,
): DiscoveredExtension {
  // Le nom du dossier tient lieu d'identifiant tant que le manifeste n'a pas parlé : sans lui, un
  // manifeste illisible n'aurait rien à afficher, et l'hébergeur ne saurait pas lequel corriger.
  const broken = (message: string): DiscoveredExtension => ({
    moduleId: dirName,
    path: moduleDir,
    manifest: null,
    version: "0.0.0",
    status: "LOAD_ERROR",
    statusMessage: message,
  });

  let manifest: ExtensionManifest;
  try {
    manifest = parseManifest(
      JSON.parse(readFileSync(join(moduleDir, MANIFEST_FILENAME), "utf8")),
      MANIFEST_FILENAME,
    );
  } catch (error) {
    return broken(error instanceof Error ? error.message : String(error));
  }

  const base = {
    moduleId: manifest.id,
    path: moduleDir,
    manifest,
    version: manifest.version,
  };

  const incompatible = incompatibilityReason(manifest.engines.host, hostVersion);
  if (incompatible) {
    // Rien n'est chargé : c'est la raison d'être de la vérification. Un contrat changé ne se
    // manifeste pas par une erreur claire, mais par un `undefined` qui voyage jusqu'à
    // l'encaissement.
    return { ...base, status: "INCOMPATIBLE", statusMessage: incompatible };
  }

  if (!manifest.entry) {
    // Légitime pour un thème, qui n'expose aucun code. Les autres genres ont un point d'entrée.
    return manifest.kind === "theme"
      ? { ...base, status: "OK", statusMessage: null }
      : {
          ...base,
          status: "LOAD_ERROR",
          statusMessage: `"entry" manquant : un module de genre ${manifest.kind} doit désigner le fichier à charger`,
        };
  }

  let entryPath: string;
  try {
    entryPath = containedPath(moduleDir, manifest.entry);
  } catch (error) {
    return { ...base, status: "LOAD_ERROR", statusMessage: (error as Error).message };
  }

  let descriptor: ExtensionDescriptor<unknown>;
  try {
    descriptor = asDescriptor(load(entryPath), manifest);
  } catch (error) {
    return {
      ...base,
      status: "LOAD_ERROR",
      statusMessage: error instanceof Error ? error.message : String(error),
    };
  }

  // Chargé, mais pas forcément sain. Ces défauts ne justifient pas d'écarter le module — le noyau
  // sait se rabattre sur les sections d'un écran dont le bundle manque — mais ils étaient
  // jusqu'ici visibles de la seule CLI, que l'auteur d'un module déposé n'a peut-être jamais
  // lancée. Le module reste `OK` et porte son message.
  const problems = inspectDescriptor(descriptor, {
    exists: (relativePath) => {
      try {
        return statSync(containedPath(moduleDir, relativePath)).isFile();
      } catch {
        return false;
      }
    },
  });

  return {
    ...base,
    status: "OK",
    statusMessage: problems.length > 0 ? problems.join(" ; ") : null,
    descriptor,
  };
}

/**
 * Résout `entry` dans le dossier du module et refuse d'en sortir.
 *
 * À dire franchement : ce n'est pas une barrière de sécurité. Le module s'exécute ensuite avec les
 * droits du processus et peut lire ce qu'il veut — le modèle de confiance, c'est l'installation
 * par dépôt de fichiers. Ce contrôle attrape un `entry` mal écrit, pas un auteur hostile.
 */
function containedPath(moduleDir: string, entry: string): string {
  const root = resolve(moduleDir);
  const target = resolve(root, entry);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`"entry" pointe hors du dossier du module : ${entry}`);
  }
  return target;
}

/**
 * Vérifie que ce que le fichier exporte est bien le module que le manifeste annonçait.
 *
 * L'identifiant et le genre sont comparés, pas seulement lus. Un descripteur qui rendrait un autre
 * identifiant que son manifeste ferait lire à ce module la configuration — et les secrets — d'un
 * autre : la clé de rattachement en base vient du manifeste, le code viendrait d'ailleurs.
 */
function asDescriptor(loaded: unknown, manifest: ExtensionManifest): ExtensionDescriptor<unknown> {
  const exported =
    loaded && typeof loaded === "object" && "default" in loaded
      ? (loaded as { default: unknown }).default
      : loaded;

  if (!exported || typeof exported !== "object") {
    throw new Error("le point d'entrée n'exporte pas de descripteur");
  }
  const candidate = exported as Partial<ExtensionDescriptor<unknown>>;

  if (typeof candidate.parseConfig !== "function") {
    throw new Error("le descripteur exporté n'a pas de `parseConfig`");
  }
  if (candidate.id !== manifest.id) {
    throw new Error(
      `le descripteur s'identifie "${String(candidate.id)}" alors que le manifeste annonce "${manifest.id}"`,
    );
  }
  if (candidate.kind !== manifest.kind) {
    throw new Error(
      `le descripteur est de genre "${String(candidate.kind)}" alors que le manifeste annonce "${manifest.kind}"`,
    );
  }

  // Les genres qui raisonnent par capacités doivent en déclarer, même toutes à `false`. Sans ce
  // contrôle l'oubli échouait quand même — mais sur un « Cannot read properties of undefined »
  // affiché tel quel dans le panel, qui ne dit à l'hébergeur ni ce qui manque ni chez qui. Le
  // noyau lit d'ailleurs `capabilities` sans précaution ailleurs (pour n'afficher que les boutons
  // qui marchent) : un descripteur sans cet objet ne peut de toute façon pas fonctionner.
  if (
    (candidate.kind === "provisioning" ||
      candidate.kind === "payment" ||
      candidate.kind === "registrar" ||
      candidate.kind === "dns") &&
    (typeof (candidate as { capabilities?: unknown }).capabilities !== "object" ||
      (candidate as { capabilities?: unknown }).capabilities === null)
  ) {
    throw new Error(
      `le descripteur de genre "${candidate.kind}" doit déclarer un objet \`capabilities\``,
    );
  }

  // Un module de provisioning qui annonce une capacité sans l'implémenter est refusé ici plutôt
  // qu'à l'appel. L'interface se fie aux `capabilities` pour afficher ses boutons : découvrir le
  // mensonge au moment où un client clique, c'est le découvrir après la commande.
  if (candidate.kind === "provisioning") {
    const missing = missingProvisioningOperations(
      candidate as unknown as Parameters<typeof missingProvisioningOperations>[0],
    );
    if (missing.length > 0) {
      throw new Error(
        `le descripteur annonce ${missing.length > 1 ? "les capacités" : "la capacité"} ${missing
          .map((name) => `\`${name}\``)
          .join(", ")} sans ${missing.length > 1 ? "les" : "l'"}implémenter`,
      );
    }
    if (
      missingNodeCapacityReporting(
        candidate as unknown as Parameters<typeof missingNodeCapacityReporting>[0],
      )
    ) {
      throw new Error(
        "le descripteur annonce `reportsNodeCapacity: true` sans implémenter `listNodeCapacity`",
      );
    }
    if (missingUsageReporting(candidate as unknown as Parameters<typeof missingUsageReporting>[0])) {
      throw new Error("le descripteur annonce `reportsUsage: true` sans implémenter `reportUsage`");
    }
    if (
      missingStorageUsageReporting(
        candidate as unknown as Parameters<typeof missingStorageUsageReporting>[0],
      )
    ) {
      throw new Error(
        "le descripteur annonce `reportsStorageUsage: true` sans implémenter `reportStorageUsage`",
      );
    }
  }

  // Même principe pour une passerelle — et c'est le genre où l'écart coûtait le plus cher. Ce
  // contrôle n'a longtemps existé que dans `pnpm check-extension`, c'est-à-dire seulement si
  // l'auteur pensait à le lancer : un module qui annonçait `refund` ou `offSession` sans les
  // écrire se chargeait sans un mot, et le mensonge se découvrait au prélèvement d'un
  // renouvellement. Les trois autres genres étaient déjà protégés ici ; le seul qui manipule de
  // l'argent ne l'était pas.
  if (candidate.kind === "payment") {
    const missing = missingPaymentOperations(
      candidate as unknown as Parameters<typeof missingPaymentOperations>[0],
    );
    if (missing.length > 0) {
      throw new Error(
        `le descripteur annonce ${missing.length > 1 ? "des capacités" : "une capacité"} sans ${
          missing.length > 1 ? "les" : "l'"
        }implémenter : ${missing.map((name) => `\`${name}\``).join(", ")}`,
      );
    }
  }

  // Un module `addon` sans les trois méthodes n'a rien à faire ici : contrairement aux autres
  // genres, il n'y a pas de `capabilities` à cocher, les trois sont toujours requises.
  if (candidate.kind === "addon") {
    const missing = missingAddonOperations(
      candidate as unknown as Parameters<typeof missingAddonOperations>[0],
    );
    if (missing.length > 0) {
      throw new Error(
        `le descripteur n'implémente pas ${missing.length > 1 ? "les méthodes" : "la méthode"} ${missing
          .map((name) => `\`${name}\``)
          .join(", ")}`,
      );
    }
  }

  // Même principe que `provisioning` : une capacité annoncée sans méthode est refusée au
  // chargement plutôt qu'au clic.
  if (candidate.kind === "registrar") {
    const missing = missingRegistrarOperations(
      candidate as unknown as Parameters<typeof missingRegistrarOperations>[0],
    );
    if (missing.length > 0) {
      throw new Error(
        `le descripteur annonce ${missing.length > 1 ? "les capacités" : "la capacité"} ${missing
          .map((name) => `\`${name}\``)
          .join(", ")} sans ${missing.length > 1 ? "les" : "l'"}implémenter`,
      );
    }
  }

  // Même principe que `registrar` : les trois capacités portent ici exactement le nom de leur
  // méthode, pas de cas particulier comme `whoisPrivacy`.
  if (candidate.kind === "dns") {
    const missing = missingDnsOperations(
      candidate as unknown as Parameters<typeof missingDnsOperations>[0],
    );
    if (missing.length > 0) {
      throw new Error(
        `le descripteur annonce ${missing.length > 1 ? "les capacités" : "la capacité"} ${missing
          .map((name) => `\`${name}\``)
          .join(", ")} sans ${missing.length > 1 ? "les" : "l'"}implémenter`,
      );
    }
  }

  return candidate as ExtensionDescriptor<unknown>;
}

/**
 * Chargement réel.
 *
 * `require` et non `import()` : le noyau est compilé en CommonJS, et un `import()` dynamique y est
 * de toute façon retranscrit en `require`. L'annoncer ici évite qu'un auteur publie un module en
 * ESM pur et cherche pourquoi il ne se charge pas.
 */
function requireEntry(entryPath: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(entryPath);
}
