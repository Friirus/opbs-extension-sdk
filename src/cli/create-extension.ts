/**
 * `create <provisioning|payment|notification|theme|addon|registrar|dns> <identifiant> [--dir <dossier>]`
 *
 * Écrit un squelette minimal, structurellement valide, sans logique inventée à effacer : les
 * capacités sont toutes à `false`, les méthodes non déclarées portent un TODO plutôt qu'un
 * comportement imaginé. `check` sur ce squelette rend toujours `0` — c'est le test que ce
 * générateur et le chargeur réel restent d'accord (voir `create-then-check.spec.ts`).
 *
 * `// @ts-check` en tête de chaque fichier généré, avec un `@type` qui annonce le contrat visé :
 * un auteur qui installe `@opbs/extension-sdk` en `devDependency` a son éditeur qui souligne un
 * champ manquant ou mal nommé avant même de lancer `check`.
 *
 * Imports relatifs plutôt que `@opbs/extension-sdk` : ce fichier fait partie du paquet, qui ne
 * peut pas s'importer lui-même par son propre nom avant d'être installé.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXTENSION_KINDS, type ExtensionKind } from "../manifest";
import { HOST_CONTRACT_VERSION } from "../version";

/** Abstraction d'E/S : la CLI (console) et les tests (capture) partagent la même logique. */
export interface CliIo {
  log(message: string): void;
  error(message: string): void;
}

const consoleIo: CliIo = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

const USAGE =
  "Usage : create <provisioning|payment|notification|theme|addon|registrar|dns> <identifiant> [--dir <dossier>]";

/** Même motif que `../loader/manifest.ts` : cet identifiant devient une clé en base, un segment
 *  d'URL et un nom de dossier une fois le module chargé pour de vrai. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,49}$/;

function titleCase(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function manifestFor(kind: ExtensionKind, id: string): Record<string, unknown> {
  const base = {
    id,
    kind,
    name: titleCase(id),
    description: "TODO : une ligne décrivant ce que ce module fait.",
    version: "0.1.0",
    author: "TODO",
    // `^` — voir COMPATIBILITY.md et version.ts : la version courante avance à chaque évolution du
    // contrat, mais seul le franchissement du plancher (HOST_CONTRACT_COMPATIBLE_SINCE) éteindra ce
    // module généré aujourd'hui.
    engines: { host: `^${HOST_CONTRACT_VERSION}` },
  };

  if (kind === "theme") {
    return {
      ...base,
      theme: {
        tokens: { colorScheme: "light" },
        stylesheet: "assets/style.css",
        assets: "assets",
      },
    };
  }
  return { ...base, entry: "index.js" };
}

const PROVISIONING_STUB = (id: string) => `// @ts-check
/**
 * ${titleCase(id)} — module de provisioning.
 *
 * Contrat : \`ProvisioningDescriptor\` — types livrés avec @opbs/extension-sdk
 *   (\`npm i -D @opbs/extension-sdk\` pour que l'éditeur résolve ce fichier via \`// @ts-check\`).
 * Guide : EXTENSIONS.md, livré dans le paquet. Exemple commenté : module \`static-pool\`.
 *
 * Les capacités ci-dessous sont toutes à \`false\` : aucune méthode de cycle de vie n'est requise
 * tant que vous n'en passez pas une à \`true\`. \`check\` refuse une capacité annoncée sans méthode —
 * pas l'inverse : une méthode fournie au-delà de ce qui est annoncé ne gêne jamais.
 *
 * Vérifiez-le : \`npx @opbs/extension-sdk check <dossier>\` (dans ce dépôt : \`pnpm check-extension\`).
 */
/** @type {import("@opbs/extension-sdk").ProvisioningDescriptor} */
module.exports = {
  id: "${id}",
  kind: "provisioning",
  label: "TODO",
  description: "TODO",

  capabilities: {
    create: false,
    suspend: false,
    resume: false,
    delete: false,
    resize: false,
    reboot: false,
    console: false,
    backup: false,
    reinstall: false,
  },

  // Réglages du module lui-même, saisis une fois dans Paramètres › Extensions.
  configFields: [],
  parseConfig(raw) {
    return {};
  },

  // Réglages d'une instance de fournisseur (cluster, vCenter, serveur…). Liste vide : ce module
  // n'a pas de fournisseur, le panel cesse alors d'en réclamer un.
  providerConfigFields: [],

  // Réglages saisis par offre du catalogue (ex. quel gabarit cloner).
  productConfigFields: [],
  parseProductConfig(raw) {
    return {};
  },

  // Fournisseur ciblé par cette offre, ou \`null\` si ce module n'en utilise pas.
  providerIdOf(config) {
    return null;
  },
  // Résumé affiché dans le catalogue produit.
  summarize(config) {
    return "${id}";
  },

  // TODO : n'implémentez que ce qu'une capacité ci-dessus autorise.
  // async create(ctx, target) { ... },
  // async suspend(ctx, target) { ... },
  // async resume(ctx, target) { ... },
  // async delete(ctx, target) { ... },
};
`;

const PAYMENT_STUB = (id: string) => `// @ts-check
/**
 * ${titleCase(id)} — passerelle de paiement.
 *
 * Contrat : \`PaymentGatewayDescriptor\` — types livrés avec @opbs/extension-sdk
 *   (\`npm i -D @opbs/extension-sdk\` pour que l'éditeur résolve ce fichier via \`// @ts-check\`).
 * Guide : EXTENSIONS.md, livré dans le paquet. Exemple commenté : module \`purchase-order\`.
 *
 * Vérifiez-le : \`npx @opbs/extension-sdk check <dossier>\` (dans ce dépôt : \`pnpm check-extension\`).
 */
/** @type {import("@opbs/extension-sdk").PaymentGatewayDescriptor} */
module.exports = {
  id: "${id}",
  kind: "payment",
  label: "TODO",
  description: "TODO",
  checkoutLabel: "TODO",

  capabilities: {
    offSession: false,
    refund: false,
    webhook: false,
    storedMethods: false,
    methodSetup: false,
  },

  configFields: [],
  parseConfig(raw) {
    return {};
  },

  // Seule méthode requise d'emblée : le client doit toujours pouvoir régler.
  async createCheckout(ctx, request) {
    throw new Error("TODO : implémentez createCheckout");
  },

  // TODO : n'implémentez que ce qu'une capacité ci-dessus autorise.
  // async chargeOffSession(ctx, request) { ... }, // exige capabilities.offSession
  // async verifyWebhook(ctx, request) { ... },    // exige capabilities.webhook
  // async refund(ctx, request) { ... },           // exige capabilities.refund
};
`;

const NOTIFICATION_STUB = (id: string) => `// @ts-check
/**
 * ${titleCase(id)} — canal de notification.
 *
 * Contrat : \`NotificationChannelDescriptor\` — types livrés avec @opbs/extension-sdk
 *   (\`npm i -D @opbs/extension-sdk\` pour que l'éditeur résolve ce fichier via \`// @ts-check\`).
 * Guide : EXTENSIONS.md, livré dans le paquet. Exemple commenté : module \`slack-status\`.
 *
 * Un module \`notification\` sans effet réel sous \`send\` charge normalement (c'est le cas de
 * \`smtp\`, livré avec le noyau) : il n'est simplement pas piloté par le bus d'événements. Le
 * squelette ci-dessous fournit un \`send\` qui décline tout, à remplacer par un envoi réel — ou à
 * retirer si ce canal ne doit jamais être appelé par le bus.
 *
 * Vérifiez-le : \`npx @opbs/extension-sdk check <dossier>\` (dans ce dépôt : \`pnpm check-extension\`).
 */
/** @type {import("@opbs/extension-sdk").NotificationChannelDescriptor} */
module.exports = {
  id: "${id}",
  kind: "notification",
  label: "TODO",
  description: "TODO",

  configFields: [],
  parseConfig(raw) {
    return {};
  },

  // TODO : décommentez pour ne réagir qu'à une sélection d'événements (voir CORE_EVENTS dans
  // EXTENSIONS.md). Absent : ce canal reçoit tous les événements canoniques.
  // supportedEvents: ["invoice.paid", "ticket.created"],

  async send(ctx, event) {
    return { delivered: false, error: "TODO" };
  },
};
`;

const ADDON_STUB = (id: string) => `// @ts-check
/**
 * ${titleCase(id)} — option d'abonnement.
 *
 * Contrat : \`AddonDescriptor\` — types livrés avec @opbs/extension-sdk
 *   (\`npm i -D @opbs/extension-sdk\` pour que l'éditeur résolve ce fichier via \`// @ts-check\`).
 * Guide : EXTENSIONS.md, livré dans le paquet. Exemple commenté : module \`pterodactyl-ports\`.
 *
 * Contrairement aux autres genres, les trois méthodes ci-dessous sont toutes requises d'emblée :
 * il n'y a pas de \`capabilities\` à cocher. Un module qui n'a rien à *faire* à l'ajout d'une
 * option n'a pas sa place ici — le catalogue interne (Facturation › Options dans le panel) couvre
 * déjà les options purement tarifaires, sans écrire de module.
 *
 * Vérifiez-le : \`npx @opbs/extension-sdk check <dossier>\` (dans ce dépôt : \`pnpm check-extension\`).
 */
/** @type {import("@opbs/extension-sdk").AddonDescriptor} */
module.exports = {
  id: "${id}",
  kind: "addon",
  label: "TODO",
  description: "TODO",

  configFields: [],
  parseConfig(raw) {
    return {};
  },

  // Options proposées pour cet abonnement précis — filtrez selon \`subscription.driverId\` si
  // votre option n'a de sens que pour certains pilotes de provisioning (voir l'exemple).
  async offeringsFor(ctx, subscription) {
    return [];
    // return [{ id: "TODO", name: "TODO", priceCents: 0, currency: "EUR" }];
  },

  // Effet réel de l'ajout — appelé après que la facturation ait abouti. Idempotent : peut être
  // rejoué sur la même offre sans dupliquer son effet.
  async onAttach(ctx, offeringId, subscription) {
    throw new Error("TODO : implémentez onAttach");
  },

  // Symétrique. Un abonnement déjà sans l'option est un succès, pas une erreur (rejeu après retrait).
  async onDetach(ctx, offeringId, subscription) {
    throw new Error("TODO : implémentez onDetach");
  },
};
`;

const REGISTRAR_STUB = (id: string) => `// @ts-check
/**
 * ${titleCase(id)} — module registrar (noms de domaine).
 *
 * Contrat : \`RegistrarDescriptor\` — types livrés avec @opbs/extension-sdk
 *   (\`npm i -D @opbs/extension-sdk\` pour que l'éditeur résolve ce fichier via \`// @ts-check\`).
 * Guide : EXTENSIONS.md, livré dans le paquet. Exemple commenté : module \`reference-registrar\`.
 * Module manuel livré avec le noyau (aucune automatisation) : \`manual-registrar\`.
 *
 * Les capacités ci-dessous sont toutes à \`false\` : aucune méthode d'exécution n'est requise tant
 * que vous n'en passez pas une à \`true\`. \`check\` refuse une capacité annoncée sans méthode — pas
 * l'inverse : une méthode fournie au-delà de ce qui est annoncé ne gêne jamais.
 *
 * Vérifiez-le : \`npx @opbs/extension-sdk check <dossier>\` (dans ce dépôt : \`pnpm check-extension\`).
 */
/** @type {import("@opbs/extension-sdk").RegistrarDescriptor} */
module.exports = {
  id: "${id}",
  kind: "registrar",
  label: "TODO",
  description: "TODO",

  // Réglages du module lui-même, saisis une fois dans Paramètres › Extensions.
  configFields: [],
  parseConfig(raw) {
    return {};
  },

  capabilities: {
    checkAvailability: false,
    register: false,
    renew: false,
    transfer: false,
    updateNameservers: false,
    updateContact: false,
    setTransferLock: false,
    whoisPrivacy: false,
  },

  // Réglages d'un compte chez le registrar (clé API, identifiant revendeur…). Liste vide : ce
  // module n'a pas de fournisseur (livraison manuelle), le panel cesse alors d'en réclamer un.
  providerConfigFields: [],

  // Réglages saisis par TLD vendu (le TLD lui-même, au minimum).
  productConfigFields: [],
  parseProductConfig(raw) {
    return {};
  },

  // Compte ciblé par cette offre, ou \`null\` si ce module n'en utilise pas.
  providerIdOf(config) {
    return null;
  },
  // Résumé affiché dans la grille de tarification TLD.
  summarize(config) {
    return "${id}";
  },

  // TODO : n'implémentez que ce qu'une capacité ci-dessus autorise.
  // async checkAvailability(ctx, name, provider) { ... },   // exige capabilities.checkAvailability
  // async register(ctx, target, years) { ... },             // exige capabilities.register
  // async renew(ctx, target, years) { ... },                // exige capabilities.renew
  // async transfer(ctx, target, authCode) { ... },          // exige capabilities.transfer
  // async updateNameservers(ctx, target, nameservers) { ... }, // exige capabilities.updateNameservers
  // async updateContact(ctx, target, contact) { ... },      // exige capabilities.updateContact
  // async setTransferLock(ctx, target, locked) { ... },     // exige capabilities.setTransferLock
  // async setWhoisPrivacy(ctx, target, enabled) { ... },    // exige capabilities.whoisPrivacy
};
`;

const DNS_STUB = (id: string) => `// @ts-check
/**
 * ${titleCase(id)} — module dns (zones et enregistrements DNS).
 *
 * Contrat : \`DnsDescriptor\` — types livrés avec @opbs/extension-sdk
 *   (\`npm i -D @opbs/extension-sdk\` pour que l'éditeur résolve ce fichier via \`// @ts-check\`).
 * Guide : EXTENSIONS.md, livré dans le paquet. Exemple commenté : module \`reference-dns\`.
 * Module livré avec le noyau, intégration réelle : module \`powerdns\`.
 *
 * Les capacités ci-dessous sont toutes à \`false\` : aucune méthode d'exécution n'est requise tant
 * que vous n'en passez pas une à \`true\`. \`check\` refuse une capacité annoncée sans méthode — pas
 * l'inverse : une méthode fournie au-delà de ce qui est annoncé ne gêne jamais.
 *
 * Vérifiez-le : \`npx @opbs/extension-sdk check <dossier>\` (dans ce dépôt : \`pnpm check-extension\`).
 */
/** @type {import("@opbs/extension-sdk").DnsDescriptor} */
module.exports = {
  id: "${id}",
  kind: "dns",
  label: "TODO",
  description: "TODO",

  // Réglages du module lui-même (URL de l'API, clé, serveurs de noms annoncés…), saisis une fois
  // dans Paramètres › Extensions — un seul service DNS par installation de ce module.
  configFields: [],
  parseConfig(raw) {
    return {};
  },

  capabilities: {
    createZone: false,
    deleteZone: false,
    syncZone: false,
    ptr: false,
  },

  // Serveurs de noms publics à annoncer au client, pour qu'il les pointe chez son registrar.
  nameserversOf(config) {
    return [];
  },

  // TODO : n'implémentez que ce qu'une capacité ci-dessus autorise. Toutes doivent être
  // idempotentes — appelées depuis une file qui rejoue en cas d'échec.
  // async createZone(ctx, target) { ... },  // exige capabilities.createZone
  // async deleteZone(ctx, target) { ... },  // exige capabilities.deleteZone
  // async syncZone(ctx, target) { ... },    // exige capabilities.syncZone — reçoit l'état complet
  //                                          // voulu (target.records) et fait le diff lui-même.
  // async setPtr(ctx, target, hostname) { ... }, // exige capabilities.ptr — hostname null efface
};
`;

const THEME_HEADER = `{% comment %}
  En-tête minimal : reprend le nom de l'instance et la navigation fournie par l'hôte. Voir le type
  \`ThemeDefinition\` du SDK (\`ThemeShellContext\`) pour les variables disponibles.
{% endcomment %}
<header>
  <a href="/">{{ companyName | default: "Espace client" }}</a>
  <nav>
    {% for link in nav %}
    <a href="{{ link.href }}">{{ link.label }}</a>
    {% endfor %}
  </nav>
</header>
`;

const THEME_FOOTER = `<footer>
  <p>{{ companyName | default: "Espace client" }}</p>
</footer>
`;

const THEME_STYLE = `/* TODO : feuille de style libre du thème, servie depuis "theme.stylesheet". */
`;

/** Synchrone, ne quitte jamais le processus : c'est `bin/opbs-extension.ts` qui décide de ça. */
export function main(argv: string[], io: CliIo = consoleIo): number {
  const [kindArg, idArg, ...rest] = argv;
  if (!kindArg || !idArg) {
    io.error(USAGE);
    return 1;
  }
  if (!(EXTENSION_KINDS as readonly string[]).includes(kindArg)) {
    io.error(`Genre inconnu : "${kindArg}" (attendu ${EXTENSION_KINDS.join(", ")}).`);
    return 1;
  }
  if (!ID_PATTERN.test(idArg)) {
    io.error(`Identifiant "${idArg}" invalide : minuscules, chiffres et tirets, 2 à 50 caractères.`);
    return 1;
  }

  let dir = ".";
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--dir") {
      const value = rest[i + 1];
      if (!value) {
        io.error(USAGE);
        return 1;
      }
      dir = value;
      i += 1;
    }
  }

  const kind = kindArg as ExtensionKind;
  const id = idArg;
  const moduleDir = join(dir, id);

  if (existsSync(moduleDir)) {
    io.error(`Refus d'écraser un dossier existant : ${moduleDir}`);
    return 1;
  }

  mkdirSync(moduleDir, { recursive: true });
  writeFileSync(
    join(moduleDir, "extension.json"),
    `${JSON.stringify(manifestFor(kind, id), null, 2)}\n`,
  );

  if (kind === "provisioning") {
    writeFileSync(join(moduleDir, "index.js"), PROVISIONING_STUB(id));
  } else if (kind === "payment") {
    writeFileSync(join(moduleDir, "index.js"), PAYMENT_STUB(id));
  } else if (kind === "notification") {
    writeFileSync(join(moduleDir, "index.js"), NOTIFICATION_STUB(id));
  } else if (kind === "addon") {
    writeFileSync(join(moduleDir, "index.js"), ADDON_STUB(id));
  } else if (kind === "registrar") {
    writeFileSync(join(moduleDir, "index.js"), REGISTRAR_STUB(id));
  } else if (kind === "dns") {
    writeFileSync(join(moduleDir, "index.js"), DNS_STUB(id));
  } else {
    mkdirSync(join(moduleDir, "templates", "partials"), { recursive: true });
    mkdirSync(join(moduleDir, "assets"), { recursive: true });
    writeFileSync(join(moduleDir, "templates", "partials", "header.liquid"), THEME_HEADER);
    writeFileSync(join(moduleDir, "templates", "partials", "footer.liquid"), THEME_FOOTER);
    writeFileSync(join(moduleDir, "assets", "style.css"), THEME_STYLE);
  }

  io.log(`Module "${id}" (${kind}) créé dans ${moduleDir}/`);
  io.log(`Vérifiez-le : npx @opbs/extension-sdk check ${moduleDir}`);
  return 0;
}
