import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { lte, valid } from "semver";
import { HOST_CONTRACT_COMPATIBLE_SINCE, HOST_CONTRACT_VERSION } from "./version";

/**
 * La surface est lue dans le **source**, pas dans le module compilé.
 *
 * La moitié de ce contrat est faite de types, qui n'existent plus après compilation : un
 * `Object.keys` sur le paquet ne verrait ni `HostContext`, ni `ProvisioningDescriptor`, ni aucune
 * des interfaces qu'un auteur tiers implémente réellement — c'est-à-dire précisément ce qui casse
 * quand on y touche.
 */
const SRC = __dirname;

/** Tout ce qu'un barrel réexporte, valeurs et types confondus, trié. */
function exportedNames(file = "index.ts"): string[] {
  const source = readFileSync(join(SRC, file), "utf8");
  const names = new Set<string>();
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const raw of (match[1] ?? "").split(",")) {
      const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (name) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

/**
 * Membres d'une interface, tels qu'un auteur tiers les voit.
 *
 * Limité aux noms à dessein : suivre les signatures complètes rendrait l'instantané illisible et
 * le ferait échouer sur un renommage de paramètre, qui ne casse personne.
 */
function interfaceMembers(file: string, name: string): string[] {
  const source = readFileSync(join(SRC, file), "utf8");
  const start = source.search(new RegExp(`export interface ${name}\\b`));
  if (start === -1) {
    return [];
  }
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const members = new Set<string>();
  for (const line of source.slice(open + 1, end).split("\n")) {
    // Membres de premier niveau seulement : deux espaces d'indentation, hors commentaires.
    const match = /^ {2}(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*[(:<]/.exec(line);
    if (match?.[1]) {
      members.add(match[1]);
    }
  }
  return [...members].sort();
}

function listedStrings(file: string, constant: string): string[] {
  const source = readFileSync(join(SRC, file), "utf8");
  const block = new RegExp(`export const ${constant} = \\[([^\\]]*)\\]`).exec(source)?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1] as string);
}

const extensionKinds = () => listedStrings("manifest.ts", "EXTENSION_KINDS");
const coreEvents = () => listedStrings("events.ts", "CORE_EVENTS");

/** Fichiers de genre présents, pour qu'un genre ajouté sans instantané se remarque. */
function kindFiles(): string[] {
  return readdirSync(join(SRC, "kinds"))
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".spec.ts"))
    .sort();
}

/**
 * Verrou sur la surface du contrat d'extension.
 *
 * `version.ts` énonce depuis toujours qu'en 0.x la moindre modification du contrat est une rupture,
 * et que `HOST_CONTRACT_VERSION` doit donc bouger. La règle est restée lettre morte quinze jours :
 * la constante n'a pas quitté `0.1.0` pendant que le contrat gagnait deux genres entiers
 * (`addon`, `registrar`), un champ sur `HostContext` (`locale`) et une demi-douzaine de capacités.
 * Le mécanisme de refus fonctionnait très bien — il n'était alimenté par rien.
 *
 * Ce test ne juge pas si un changement *devrait* avoir lieu : il exige seulement qu'il soit
 * délibéré. Toucher à la surface fait échouer la suite tant que la version et `CHANGELOG.md`
 * n'ont pas suivi dans le même mouvement.
 *
 * Miroir de `apps/api/src/common/public-surface.spec.ts`, qui rend le même service aux routes
 * publiques décrites par `COMPATIBILITY.md`.
 */

const RAPPEL =
  "Surface du contrat modifiée. Incrémentez HOST_CONTRACT_VERSION (mineure, en 0.x) dans " +
  "version.ts et package.json, ajoutez une entrée dans packages/extension-sdk/CHANGELOG.md, et si " +
  "le changement n'est pas additif relevez aussi HOST_CONTRACT_COMPATIBLE_SINCE — puis cet " +
  "instantané.";

const KINDS = ["provisioning", "payment", "notification", "theme", "addon", "registrar", "dns"];

const KIND_FILES = [
  "addon.ts",
  "dns.ts",
  "notification.ts",
  "payment.ts",
  "provisioning.ts",
  "registrar.ts",
  "theme.ts",
  "ui.ts",
];

const CORE_EVENTS = [
  "order.created",
  "invoice.paid",
  "invoice.disputed",
  "service.provisioned",
  "subscription.cancelled",
  "ticket.created",
  "node.capacity.warning",
  "login.suspicious",
  "billing.oss_threshold.warning",
  "domain.registered",
  "domain.renewal.failed",
  "domain.expiring",
  "domain.transfer.completed",
  "service.monitor.down",
  "service.monitor.up",
  "dns.zone.created",
  "dns.zone.deleted",
  "dns.zone.error",
  "customer.registered",
  "referral.commission.earned",
  "invoice.refunded",
  "provisioning.approval.requested",
];

const HOST_CONTEXT = ["config", "emit", "http", "locale", "logger", "storage"];

const MANIFEST = [
  "author",
  "description",
  "engines",
  "entry",
  "homepage",
  "id",
  "kind",
  "name",
  "scopes",
  "theme",
  "version",
];

const DESCRIPTOR = [
  "configFields",
  "contributesPages",
  "contributesScreens",
  "description",
  "id",
  "kind",
  "label",
  "parseConfig",
  "runPageAction",
  "runPageData",
  "runScreenEntryPoint",
];

const PROVISIONING_CAPABILITIES = [
  "backup",
  "console",
  "create",
  "delete",
  "reboot",
  "reinstall",
  "resize",
  "restore",
  "resume",
  "snapshot",
  "suspend",
];

const PAYMENT_CAPABILITIES = ["methodSetup", "offSession", "refund", "storedMethods", "webhook"];

const REGISTRAR_CAPABILITIES = [
  "checkAvailability",
  "register",
  "renew",
  "setTransferLock",
  "transfer",
  "updateContact",
  "updateNameservers",
  "whoisPrivacy",
];

const DNS_CAPABILITIES = ["createZone", "deleteZone", "ptr", "syncZone"];

const EXPORTS = [
  "AddonDescriptor",
  "AddonOffering",
  "AddonOutcome",
  "AddonSubscriptionContext",
  "AvailabilityResult",
  "BackupOutcome",
  "CORE_EVENTS",
  "CapturedEvent",
  "CapturedLogEntry",
  "ChargeOutcome",
  "ChargeRequest",
  "CheckoutOutcome",
  "CheckoutRequest",
  "ConfigField",
  "ConfigFieldOption",
  "ConfigFieldType",
  "ConsoleSession",
  "ContributedLabel",
  "ContributedPage",
  "ContributedScreen",
  "CoreEvent",
  "CoreEventPayloads",
  "DEFAULT_LOCALE",
  "DEFAULT_THEME_TOKENS",
  "DNS_RECORD_TYPES",
  "DnsCapabilities",
  "DnsDescriptor",
  "DnsOperation",
  "DnsOutcome",
  "DnsRecordInput",
  "DnsRecordType",
  "DnsZoneTarget",
  "DomainContact",
  "EXTENSION_KINDS",
  "ExtensionConfigError",
  "ExtensionDescriptor",
  "ExtensionKind",
  "ExtensionLogger",
  "ExtensionManifest",
  "ExtensionStorage",
  "GatewayEvent",
  "HOST_CONTRACT_COMPATIBLE_SINCE",
  "HOST_CONTRACT_VERSION",
  "HostContext",
  "MethodSetupOutcome",
  "MethodSetupRequest",
  "ModulePageActionRequest",
  "ModulePageActionResult",
  "ModulePageCustomer",
  "ModulePageRequest",
  "ModulePageResult",
  "ModulePageService",
  "NO_CAPABILITIES",
  "NO_DNS_CAPABILITIES",
  "NO_PAYMENT_CAPABILITIES",
  "NO_PROVISIONING_CAPABILITIES",
  "NO_REGISTRAR_CAPABILITIES",
  "NodeCapacitySnapshot",
  "NotificationChannelDescriptor",
  "NotificationEvent",
  "NotificationOutcome",
  "PANEL_CONTRACT_VERSION",
  "PanelScreenHost",
  "PanelScreenModule",
  "PanelScreenMount",
  "PanelScreenUnmount",
  "PartialThemeTokens",
  "PaymentCapabilities",
  "PaymentGatewayDescriptor",
  "PaymentPurpose",
  "ProvisioningCapabilities",
  "ProvisioningDescriptor",
  "ProvisioningNetwork",
  "ProvisioningNetworkAddress",
  "ProvisioningOperation",
  "ProvisioningOutcome",
  "ProvisioningTarget",
  "PtrTarget",
  "RESERVED_PAGE_SLUGS",
  "RefundRequest",
  "RegistrarCapabilities",
  "RegistrarDescriptor",
  "RegistrarOperation",
  "RegistrarOutcome",
  "RegistrarTarget",
  "ResolvedTheme",
  "ResourceSpec",
  "SUPPORTED_LOCALES",
  "ScreenActionSection",
  "ScreenBundle",
  "ScreenFormSection",
  "ScreenSection",
  "ScreenTableSection",
  "ServiceUsageSnapshot",
  "SnapshotInfo",
  "StorageUsageSnapshot",
  "StoredMethodDetails",
  "SupportedLocale",
  "THEME_ISLANDS",
  "THEME_VIEWS",
  "THEME_VIEW_NAMES",
  "TestHostContext",
  "TestHostOptions",
  "ThemeAcceptInviteView",
  "ThemeAccountBillingView",
  "ThemeAccountPaymentMethodsView",
  "ThemeAccountPrivacyView",
  "ThemeAccountProfileView",
  "ThemeAccountReferralView",
  "ThemeAccountSecurityView",
  "ThemeAccountTeamView",
  "ThemeAccountView",
  "ThemeBundleView",
  "ThemeCartView",
  "ThemeCatalogView",
  "ThemeCategorySection",
  "ThemeColorScheme",
  "ThemeColors",
  "ThemeContentPageView",
  "ThemeCustomPageView",
  "ThemeDashboardView",
  "ThemeDefinition",
  "ThemeDensity",
  "ThemeDnsZoneView",
  "ThemeDnsZonesView",
  "ThemeDomainView",
  "ThemeDomainsMineView",
  "ThemeDomainsView",
  "ThemeEmailContext",
  "ThemeFont",
  "ThemeForgotPasswordView",
  "ThemeHistoryView",
  "ThemeHomeView",
  "ThemeInvoiceSummary",
  "ThemeInvoiceView",
  "ThemeInvoicesView",
  "ThemeIslandSpec",
  "ThemeKbArticle",
  "ThemeKbArticleSummary",
  "ThemeKbArticleView",
  "ThemeKbView",
  "ThemeLegalPrivacyView",
  "ThemeLegalTermsView",
  "ThemeLoginView",
  "ThemeNavLink",
  "ThemePageBlock",
  "ThemePageDeclaration",
  "ThemePagination",
  "ThemePasswordPolicy",
  "ThemeProductView",
  "ThemeRadii",
  "ThemeRegisterView",
  "ThemeResellerBrandingView",
  "ThemeResellerClientNewView",
  "ThemeResellerClientView",
  "ThemeResellerClientsView",
  "ThemeResetPasswordView",
  "ThemeServiceConsoleView",
  "ThemeServiceSummary",
  "ThemeServiceView",
  "ThemeServicesView",
  "ThemeShellContext",
  "ThemeSsoCallbackView",
  "ThemeSsoLinkView",
  "ThemeTicketNewView",
  "ThemeTicketView",
  "ThemeTicketsView",
  "ThemeTokens",
  "ThemeTypography",
  "ThemeVerifyEmailView",
  "ThemeViewContext",
  "ThemeViewSpec",
  "UnknownExtensionError",
  "WebhookRequest",
  "createTestHost",
  "declaredIslands",
  "invalidContributedPages",
  "invalidContributedScreens",
  "invalidThemePages",
  "isEventDrivenChannel",
  "isProvidedContextView",
  "isReservedPageSlug",
  "isSafeTokenValue",
  "isSecretField",
  "mergeDriverConfig",
  "mergeResourceSpec",
  "mergeThemeTokens",
  "missingAddonOperations",
  "missingDnsOperations",
  "missingNodeCapacityReporting",
  "missingPaymentOperations",
  "missingProvisioningOperations",
  "missingRegistrarOperations",
  "missingRequiredIslands",
  "missingStorageUsageReporting",
  "missingUsageReporting",
  "modulePageHref",
  "modulePageThemeTemplatePath",
  "readBoolean",
  "readNumber",
  "readString",
  "requireNumber",
  "requireOneOf",
  "requireString",
  "resolveContributedLabel",
  "secretFieldNames",
  "themeIslandSpec",
  "themePageTemplatePath",
  "themeViewSpec",
  "unknownIslands",
];

describe("surface publique du contrat d'extension", () => {
  it(`réexporte exactement ce que la version ${HOST_CONTRACT_VERSION} promet`, () => {
    expect(exportedNames()).toEqual(EXPORTS);
  });

  /**
   * Un genre ajouté est la rupture la plus coûteuse : la base de données doit le connaître
   * (une énumération PostgreSQL ne s'étend pas sans migration), le panel doit savoir l'afficher,
   * et tous les modules installés voient leur plage de compatibilité invalidée.
   */
  it("ne déclare que les genres connus", () => {
    expect(extensionKinds()).toEqual(KINDS);
  });

  it("n'a pas de fichier de genre orphelin", () => {
    // Un `kinds/*.ts` ajouté sans entrée dans EXTENSION_KINDS donnerait un contrat que rien ne
    // sait charger ; l'inverse, un genre nommé sans contrat, s'est déjà produit.
    expect(kindFiles()).toEqual(KIND_FILES);
  });

  /**
   * `CORE_EVENTS` est le vocabulaire partagé par les webhooks sortants et les canaux de
   * notification. Il a déjà existé en double, et les deux copies avaient divergé : un événement
   * réellement émis n'y figurait pas, invisible à quiconque aurait voulu s'y abonner.
   */
  it("n'émet que les événements canoniques documentés", () => {
    expect(coreEvents()).toEqual(CORE_EVENTS);
  });

  it("remet aux modules exactement les mêmes clés de contexte", () => {
    expect(interfaceMembers("host.ts", "HostContext")).toEqual(HOST_CONTEXT);
  });

  it("n'attend d'un manifeste que les champs documentés", () => {
    expect(interfaceMembers("manifest.ts", "ExtensionManifest")).toEqual(MANIFEST);
  });

  it("n'exige d'un descripteur que le socle commun documenté", () => {
    expect(interfaceMembers("manifest.ts", "ExtensionDescriptor")).toEqual(DESCRIPTOR);
  });

  /**
   * Les capacités méritent leur propre verrou : chacune commande un bouton du panel et une
   * méthode que le chargeur exigera. En ajouter une invalide silencieusement tout module qui
   * construit son objet `capabilities` en le listant exhaustivement — c'est-à-dire tous.
   */
  it("ne déclare que les capacités de provisionnement connues", () => {
    expect(interfaceMembers("kinds/provisioning.ts", "ProvisioningCapabilities")).toEqual(
      PROVISIONING_CAPABILITIES,
    );
  });

  it("ne déclare que les capacités de paiement connues", () => {
    expect(interfaceMembers("kinds/payment.ts", "PaymentCapabilities")).toEqual(
      PAYMENT_CAPABILITIES,
    );
  });

  it("ne déclare que les capacités de registrar connues", () => {
    expect(interfaceMembers("kinds/registrar.ts", "RegistrarCapabilities")).toEqual(
      REGISTRAR_CAPABILITIES,
    );
  });

  it("ne déclare que les capacités de dns connues", () => {
    expect(interfaceMembers("kinds/dns.ts", "DnsCapabilities")).toEqual(DNS_CAPABILITIES);
  });

  it("porte un rappel utilisable quand l'un des verrous ci-dessus cède", () => {
    // Le message ne sert à rien s'il n'est lu qu'ici : il est repris dans CHANGELOG.md, qui est
    // l'endroit où l'on arrive quand ce fichier échoue.
    expect(RAPPEL).toContain("HOST_CONTRACT_VERSION");
  });
});

describe("version du contrat", () => {
  const changelog = () => readFileSync(join(SRC, "..", "CHANGELOG.md"), "utf8");

  it("CHANGELOG.md documente HOST_CONTRACT_VERSION avec une date", () => {
    // Un titre sans date se serait glissé pour "0.29.0 — 2026-09-05" : le format complet, pas
    // seulement la présence du numéro, sinon une entrée bâclée passerait ce verrou.
    expect(changelog()).toMatch(
      new RegExp(`^## ${HOST_CONTRACT_VERSION.replace(/\./g, "\\.")} — \\d{4}-\\d{2}-\\d{2}$`, "m"),
    );
  });

  it("package.json suit HOST_CONTRACT_VERSION", () => {
    const pkg = JSON.parse(readFileSync(join(SRC, "..", "package.json"), "utf8")) as {
      version: string;
    };
    expect(pkg.version).toBe(HOST_CONTRACT_VERSION);
  });

  it("le plancher de compatibilité est une version valide, jamais postérieure au contrat, et documentée", () => {
    expect(valid(HOST_CONTRACT_COMPATIBLE_SINCE)).not.toBeNull();
    expect(lte(HOST_CONTRACT_COMPATIBLE_SINCE, HOST_CONTRACT_VERSION)).toBe(true);
    expect(changelog()).toContain(`## ${HOST_CONTRACT_COMPATIBLE_SINCE}`);
  });
});

/**
 * Le chargeur (`discoverExtensions`, `parseManifest`...) est sur une entrée séparée
 * (`@opbs/extension-sdk/loader`, `src/loader/index.ts`) plutôt que la racine : il lit
 * `node:fs` et charge du code avec un `require()` dynamique, ce que les bundles navigateur des apps
 * Next.js (qui importent le SDK via `@opbs/ui` pour les jetons de thème) ne peuvent pas
 * résoudre. Même discipline de version que la surface principale, verrou séparé pour la même
 * raison que les deux fichiers sont séparés.
 */
const LOADER_EXPORTS = [
  "DiscoverOptions",
  "DiscoveredExtension",
  "DiscoveredStatus",
  "InspectDescriptorOptions",
  "MANIFEST_FILENAME",
  "ManifestError",
  "ThemeTemplateFinding",
  "discoverExtensions",
  "incompatibilityReason",
  "inspectDescriptor",
  "inspectThemeTemplates",
  "parseManifest",
];

describe("surface du chargeur (@opbs/extension-sdk/loader)", () => {
  it(`réexporte exactement ce que la version ${HOST_CONTRACT_VERSION} promet`, () => {
    expect(exportedNames("loader/index.ts")).toEqual(LOADER_EXPORTS);
  });
});
