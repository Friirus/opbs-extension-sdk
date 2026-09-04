/**
 * Copie volontaire de `SUPPORTED_LOCALES`/`SupportedLocale`/`DEFAULT_LOCALE`
 * (`packages/shared-types/src/index.ts`), et non un import de ce paquet.
 *
 * Le SDK n'a besoin que de ces trois identifiants sur toute la surface de `@opbs/shared-types`
 * — publier ce paquet en plus (capacity-tone, ssh-public-key, domain-name...) pour eux seuls serait
 * disproportionné. `pnpm check-mirrors` compare les deux listes à chaque CI : une langue ajoutée
 * d'un côté sans l'autre s'y voit.
 */
export const SUPPORTED_LOCALES = ["fr", "en", "de"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "fr";
