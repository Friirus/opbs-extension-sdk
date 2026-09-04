/**
 * Le chargeur réel du contrat d'extension : ce qui permet à un auteur tiers de valider son module
 * sans le monorepo (`@opbs/extensions` dépend de `@opbs/database`, non publiable — voir
 * ROADMAP.md, entrée P1).
 *
 * Entrée séparée du reste du SDK (`@opbs/extension-sdk/loader`, pas
 * `@opbs/extension-sdk`) : ce module lit le système de fichiers (`node:fs`) et charge du code
 * avec un `require()` dynamique, deux choses qu'un bundle **navigateur** ne peut pas résoudre.
 * `@opbs/ui` importe le SDK principal pour les jetons de thème et alimente ainsi les bundles
 * client des trois apps Next.js — y laisser ce fichier faisait échouer leur build.
 *
 * Même discipline de version que le reste du contrat : `HOST_CONTRACT_VERSION`,
 * `public-surface.spec.ts` (section « chargeur »), `CHANGELOG.md`.
 */
export { discoverExtensions } from "./discover";
export type { DiscoveredExtension, DiscoveredStatus, DiscoverOptions } from "./discover";
export { incompatibilityReason } from "./compatibility";
export { MANIFEST_FILENAME, ManifestError, parseManifest } from "./manifest";
export { inspectDescriptor } from "./inspect";
export type { InspectDescriptorOptions } from "./inspect";
export { inspectThemeTemplates } from "./islands";
export type { ThemeTemplateFinding } from "./islands";
