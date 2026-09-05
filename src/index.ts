/**
 * Contrat public des extensions opbs.
 *
 * **Cette surface n'est pas encore figée.** Elle a été éprouvée sur trois passerelles de paiement
 * réelles, mais sur un seul hyperviseur : le second, qui devait la confronter à autre chose que
 * Proxmox, a été reporté faute de simulateur vSphere REST utilisable. Elle peut donc encore
 * changer — voir `COMPATIBILITY.md` à la racine du dépôt.
 *
 * Principe de rédaction suivi ici : **un contrat s'écrit avec sa première implémentation, jamais
 * avant.** Les sept genres ont désormais tous la leur ; `notification` et `theme`, longtemps nommés
 * dans `EXTENSION_KINDS` sans interface — la base de données devait les connaître avant que le
 * contrat n'existe —, ont rejoint les autres.
 *
 * Toute modification de ce qui suit est une rupture au sens de `HOST_CONTRACT_VERSION` : voir
 * `version.ts`, `CHANGELOG.md`, et le verrou `public-surface.spec.ts` qui échoue si l'un des trois
 * est oublié.
 */

export { ExtensionConfigError, UnknownExtensionError } from "./errors";
export { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./locale";
export type { SupportedLocale } from "./locale";

export {
  isSecretField,
  readBoolean,
  readNumber,
  readString,
  requireNumber,
  requireOneOf,
  requireString,
  secretFieldNames,
} from "./config-fields";
export type { ConfigField, ConfigFieldOption, ConfigFieldType } from "./config-fields";

export { HOST_CONTRACT_COMPATIBLE_SINCE, HOST_CONTRACT_VERSION } from "./version";

export { mergeDriverConfig, mergeResourceSpec } from "./merge";

export { EXTENSION_KINDS } from "./manifest";
export type { ExtensionDescriptor, ExtensionKind, ExtensionManifest } from "./manifest";

export type { ExtensionLogger, ExtensionStorage, HostContext } from "./host";

export { createTestHost } from "./testing";
export type { CapturedEvent, CapturedLogEntry, TestHostContext, TestHostOptions } from "./testing";

// Le chargeur réel (discoverExtensions, parseManifest, inspectThemeTemplates...) n'est **pas**
// réexporté ici : il dépend de `node:fs`/`node:path`, et ce fichier est aussi ce que
// `@opbs/ui` importe pour les jetons de thème (`isSafeTokenValue`, `ResolvedTheme`), donc lu
// par les bundles **navigateur** des trois apps Next.js. Un `require()` dynamique dans ce graphe
// fait échouer leur build (Turbopack refuse de le résoudre, même mort côté client) — voir
// `./loader/index.ts`, importé séparément via `@opbs/extension-sdk/loader`.

export { CORE_EVENTS } from "./events";
export type { CoreEvent, CoreEventPayloads } from "./events";

export { isEventDrivenChannel } from "./kinds/notification";
export type {
  NotificationChannelDescriptor,
  NotificationEvent,
  NotificationOutcome,
} from "./kinds/notification";

export {
  invalidContributedPages,
  invalidContributedScreens,
  modulePageHref,
  modulePageThemeTemplatePath,
  PANEL_CONTRACT_VERSION,
  resolveContributedLabel,
} from "./kinds/ui";
export type {
  ContributedLabel,
  ContributedPage,
  ContributedScreen,
  ModulePageActionRequest,
  ModulePageActionResult,
  ModulePageCustomer,
  ModulePageRequest,
  ModulePageResult,
  ModulePageService,
  PanelScreenHost,
  PanelScreenModule,
  PanelScreenMount,
  PanelScreenUnmount,
  ScreenActionSection,
  ScreenBundle,
  ScreenFormSection,
  ScreenSection,
  ScreenTableSection,
} from "./kinds/ui";

export {
  missingNodeCapacityReporting,
  missingProvisioningOperations,
  missingStorageUsageReporting,
  missingUsageReporting,
  NO_CAPABILITIES,
  NO_PROVISIONING_CAPABILITIES,
} from "./kinds/provisioning";
export type {
  BackupOutcome,
  ConsoleSession,
  NodeCapacitySnapshot,
  ProvisioningCapabilities,
  ProvisioningDescriptor,
  ProvisioningNetwork,
  ProvisioningNetworkAddress,
  ProvisioningOperation,
  ProvisioningOutcome,
  ProvisioningTarget,
  ResourceSpec,
  ServiceUsageSnapshot,
  StorageUsageSnapshot,
  SnapshotInfo,
} from "./kinds/provisioning";

export {
  DEFAULT_THEME_TOKENS,
  THEME_ISLANDS,
  THEME_VIEWS,
  THEME_VIEW_NAMES,
  declaredIslands,
  invalidThemePages,
  isProvidedContextView,
  isSafeTokenValue,
  mergeThemeTokens,
  missingRequiredIslands,
  themeIslandSpec,
  themePageTemplatePath,
  themeViewSpec,
  unknownIslands,
} from "./kinds/theme";
export type {
  PartialThemeTokens,
  ResolvedTheme,
  ThemeAcceptInviteView,
  ThemeAccountBillingView,
  ThemeAccountPaymentMethodsView,
  ThemeAccountPrivacyView,
  ThemeAccountProfileView,
  ThemeAccountReferralView,
  ThemeAccountSecurityView,
  ThemeAccountTeamView,
  ThemeAccountView,
  ThemeBundleView,
  ThemeCartView,
  ThemeCatalogView,
  ThemeCategorySection,
  ThemeColors,
  ThemeColorScheme,
  ThemeContentPageView,
  ThemeCustomPageView,
  ThemeDashboardView,
  ThemeDefinition,
  ThemeDensity,
  ThemeDnsZonesView,
  ThemeDnsZoneView,
  ThemeDomainsMineView,
  ThemeDomainsView,
  ThemeDomainView,
  ThemeEmailContext,
  ThemeFont,
  ThemeForgotPasswordView,
  ThemeHistoryView,
  ThemeHomeView,
  ThemeInvoiceSummary,
  ThemeInvoicesView,
  ThemeInvoiceView,
  ThemeIslandSpec,
  ThemeKbArticle,
  ThemeKbArticleSummary,
  ThemeKbArticleView,
  ThemeKbView,
  ThemeLegalPrivacyView,
  ThemeLegalTermsView,
  ThemeLoginView,
  ThemeNavLink,
  ThemePageBlock,
  ThemePageDeclaration,
  ThemePagination,
  ThemePasswordPolicy,
  ThemeProductView,
  ThemeRadii,
  ThemeRegisterView,
  ThemeResellerClientNewView,
  ThemeResellerBrandingView,
  ThemeResellerClientsView,
  ThemeResellerClientView,
  ThemeResetPasswordView,
  ThemeServiceConsoleView,
  ThemeServicesView,
  ThemeServiceSummary,
  ThemeServiceView,
  ThemeShellContext,
  ThemeSsoCallbackView,
  ThemeSsoLinkView,
  ThemeTicketNewView,
  ThemeTicketsView,
  ThemeTicketView,
  ThemeTokens,
  ThemeTypography,
  ThemeVerifyEmailView,
  ThemeViewContext,
  ThemeViewSpec,
} from "./kinds/theme";

export { isReservedPageSlug, RESERVED_PAGE_SLUGS } from "./reserved-slugs";

export { missingAddonOperations } from "./kinds/addon";
export type {
  AddonDescriptor,
  AddonOffering,
  AddonOutcome,
  AddonSubscriptionContext,
} from "./kinds/addon";

export { missingRegistrarOperations, NO_REGISTRAR_CAPABILITIES } from "./kinds/registrar";
export type {
  AvailabilityResult,
  DomainContact,
  RegistrarCapabilities,
  RegistrarDescriptor,
  RegistrarOperation,
  RegistrarOutcome,
  RegistrarTarget,
} from "./kinds/registrar";

export { DNS_RECORD_TYPES, missingDnsOperations, NO_DNS_CAPABILITIES } from "./kinds/dns";
export type {
  DnsCapabilities,
  DnsDescriptor,
  DnsOperation,
  DnsOutcome,
  DnsRecordInput,
  DnsRecordType,
  DnsZoneTarget,
  PtrTarget,
} from "./kinds/dns";

export { missingPaymentOperations, NO_PAYMENT_CAPABILITIES } from "./kinds/payment";
export type {
  ChargeOutcome,
  ChargeRequest,
  CheckoutOutcome,
  CheckoutRequest,
  GatewayEvent,
  MethodSetupOutcome,
  MethodSetupRequest,
  PaymentCapabilities,
  PaymentGatewayDescriptor,
  PaymentPurpose,
  RefundRequest,
  StoredMethodDetails,
  WebhookRequest,
} from "./kinds/payment";
