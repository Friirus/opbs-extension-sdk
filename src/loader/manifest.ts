import { valid } from "semver";
import { isSafeTokenValue } from "../kinds/theme";
import type {
  PartialThemeTokens,
  ThemeDefinition,
  ThemeFont,
  ThemePageDeclaration,
} from "../kinds/theme";
import { EXTENSION_KINDS } from "../manifest";
import type { ExtensionKind, ExtensionManifest } from "../manifest";

/** Nom du fichier qu'un module dépose à la racine de son dossier. */
export const MANIFEST_FILENAME = "extension.json";

/**
 * Manifeste refusé. Distinguée d'une erreur quelconque parce qu'elle est *attendue* : elle remonte
 * dans le panel comme l'état d'un module, pas comme un incident du noyau.
 */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

/**
 * Identifiants recevables.
 *
 * Cet identifiant devient une clé en base, un segment d'URL de webhook et un nom de dossier. Le
 * restreindre ici évite qu'un module nommé `../../etc` ou `Stripe ` (avec une espace finale)
 * traverse tout le système avant d'échouer quelque part d'illisible.
 */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,49}$/;

/**
 * Valide un manifeste **déjà lu**, sans toucher au disque.
 *
 * Séparé de la lecture pour que la validation soit testable sur des objets, et surtout pour que la
 * frontière soit nette : à ce stade, aucune ligne du module n'a été exécutée et aucune ne le sera
 * si ce qui suit refuse. C'est tout l'intérêt d'un manifeste séparé du code.
 */
export function parseManifest(raw: unknown, source: string): ExtensionManifest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ManifestError(`${source} : le manifeste doit être un objet JSON`);
  }
  const data = raw as Record<string, unknown>;

  const id = requireText(data, "id", source);
  if (!ID_PATTERN.test(id)) {
    throw new ManifestError(
      `${source} : identifiant "${id}" invalide (minuscules, chiffres et tirets, 2 à 50 caractères)`,
    );
  }

  const kind = requireText(data, "kind", source);
  if (!(EXTENSION_KINDS as readonly string[]).includes(kind)) {
    throw new ManifestError(
      `${source} : genre "${kind}" inconnu (attendu ${EXTENSION_KINDS.join(", ")})`,
    );
  }

  const engines = data.engines;
  if (typeof engines !== "object" || engines === null) {
    throw new ManifestError(`${source} : "engines.host" manquant`);
  }
  const host = (engines as Record<string, unknown>).host;
  if (typeof host !== "string" || host.trim() === "") {
    throw new ManifestError(
      `${source} : "engines.host" manquant — un module doit déclarer les versions du contrat qu'il vise`,
    );
  }

  // La version d'un module n'était vérifiée que comme « texte non vide » : `"dernière"` passait,
  // s'inscrivait en base et s'affichait telle quelle dans le panel. Or c'est ce que l'hébergeur
  // compare pour savoir s'il a bien déployé la mise à jour qu'il vient de télécharger, et ce sur
  // quoi tout mécanisme de mise à jour ultérieur devra s'appuyer — une chaîne libre ne se compare
  // pas. Le contrat exige déjà du semver dans `engines.host` ; l'exiger ici aussi n'ajoute pas de
  // contrainte, cela cesse d'en dispenser.
  const version = requireText(data, "version", source);
  if (!valid(version)) {
    throw new ManifestError(
      `${source} : version "${version}" invalide (semver attendu, ex. "1.2.0")`,
    );
  }

  return {
    id,
    kind: kind as ExtensionKind,
    name: requireText(data, "name", source),
    description: typeof data.description === "string" ? data.description : "",
    version,
    ...(typeof data.author === "string" ? { author: data.author } : {}),
    ...(typeof data.homepage === "string" ? { homepage: data.homepage } : {}),
    engines: { host: host.trim() },
    ...(Array.isArray(data.scopes) ? { scopes: data.scopes.filter(isText) } : {}),
    ...(typeof data.entry === "string" ? { entry: data.entry } : {}),
    ...themeSection(data, kind as ExtensionKind, source),
  };
}

/**
 * Lit la déclaration de thème, et refuse qu'un autre genre en porte une.
 *
 * Le refus n'est pas du zèle : une passerelle de paiement qui déclare des couleurs a été écrite par
 * quelqu'un qui croit qu'elles seront appliquées. Les ignorer en silence le laisserait chercher
 * longtemps pourquoi son thème ne prend pas — alors que le vrai problème est qu'il a écrit un
 * thème dans un module de paiement.
 */
function themeSection(
  data: Record<string, unknown>,
  kind: ExtensionKind,
  source: string,
): { theme?: ThemeDefinition } {
  if (data.theme === undefined) {
    return {};
  }
  if (kind !== "theme") {
    throw new ManifestError(
      `${source} : un module de genre "${kind}" ne peut pas déclarer de section "theme"`,
    );
  }
  if (typeof data.theme !== "object" || data.theme === null || Array.isArray(data.theme)) {
    throw new ManifestError(`${source} : "theme" doit être un objet`);
  }
  const theme = data.theme as Record<string, unknown>;

  return {
    theme: {
      ...(theme.tokens !== undefined ? { tokens: parseTokens(theme.tokens, source) } : {}),
      ...(theme.fonts !== undefined ? { fonts: parseFonts(theme.fonts, source) } : {}),
      ...relativePath(theme, "assets", source),
      ...relativePath(theme, "stylesheet", source),
      ...relativePath(theme, "logo", source),
      ...relativePath(theme, "favicon", source),
      // `templates` était déclaré au contrat sans jamais être lu ici : un thème qui rangeait ses
      // gabarits ailleurs que dans `templates/` voyait sa déclaration ignorée en silence, et le
      // noyau chercher au mauvais endroit. `script` naît avec le même traitement.
      ...relativePath(theme, "templates", source),
      ...relativePath(theme, "script", source),
      ...(theme.pages !== undefined ? { pages: parsePages(theme.pages, source) } : {}),
    },
  };
}

/**
 * Les pages que le thème apporte, telles qu'il les déclare.
 *
 * Le slug est normalisé ici et nulle part ailleurs : c'est lui qui deviendra une URL, et le laisser
 * arriver tantôt en `Nos-Garanties` tantôt en `nos-garanties` obligerait chaque lecteur à s'en
 * souvenir. Sa **validité**, en revanche, n'est pas jugée ici — un slug réservé ou en double est
 * signalé par `invalidThemePages` (SDK), qui produit un message lisible pour l'auteur du thème,
 * là où une exception de manifeste éteindrait le thème entier pour une page de trop.
 */
function parsePages(value: unknown, source: string): ThemePageDeclaration[] {
  if (!Array.isArray(value)) {
    throw new ManifestError(`${source} : "theme.pages" doit être un tableau`);
  }
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ManifestError(`${source} : "theme.pages[${index}]" doit être un objet`);
    }
    const page = raw as Record<string, unknown>;
    const slug = typeof page.slug === "string" ? page.slug.trim().toLowerCase() : "";
    if (slug === "") {
      throw new ManifestError(`${source} : "theme.pages[${index}].slug" est obligatoire`);
    }
    if (typeof page.title !== "string" || page.title.trim() === "") {
      throw new ManifestError(`${source} : "theme.pages[${index}].title" est obligatoire`);
    }
    return {
      slug,
      title: page.title.trim(),
      ...(page.showInNav === true ? { showInNav: true } : {}),
      ...(typeof page.navLabel === "string" && page.navLabel.trim() !== ""
        ? { navLabel: page.navLabel.trim() }
        : {}),
      ...(typeof page.navOrder === "number" && Number.isFinite(page.navOrder)
        ? { navOrder: page.navOrder }
        : {}),
      ...(typeof page.metaDescription === "string" && page.metaDescription.trim() !== ""
        ? { metaDescription: page.metaDescription.trim() }
        : {}),
      ...(page.noindex === true ? { noindex: true } : {}),
    };
  });
}

/**
 * Lit un chemin déclaré par le thème, et refuse tout ce qui ne reste pas chez lui.
 *
 * Ces valeurs deviennent des chemins de fichiers servis publiquement. Un `../../.env` accepté ici
 * serait relu à chaque requête par le noyau lui-même — ce n'est plus le thème qui lit le fichier,
 * c'est nous. Le contrôle appartient donc à la lecture du manifeste, avant que le chemin n'existe
 * quelque part sous forme de variable.
 */
function relativePath(
  theme: Record<string, unknown>,
  key: "assets" | "stylesheet" | "logo" | "favicon" | "templates" | "script",
  source: string,
): Record<string, string> {
  const value = theme[key];
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new ManifestError(`${source} : "theme.${key}" doit être un chemin non vide`);
  }
  const path = value.trim();
  if (path.startsWith("/") || path.includes("..") || /^[a-z]+:/i.test(path)) {
    throw new ManifestError(
      `${source} : "theme.${key}" doit être un chemin relatif au dossier du thème (reçu "${path}")`,
    );
  }
  return { [key]: path };
}

/** Les trois groupes de tokens qui sont des dictionnaires de chaînes, traités à l'identique. */
const TOKEN_GROUPS = ["colors", "radii", "typography"] as const;

const COLOR_SCHEMES = ["light", "dark"];
const DENSITIES = ["compact", "comfortable", "spacious"];

function parseTokens(raw: unknown, source: string): PartialThemeTokens {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ManifestError(`${source} : "theme.tokens" doit être un objet`);
  }
  const data = raw as Record<string, unknown>;
  const tokens: PartialThemeTokens = {};

  if (data.colorScheme !== undefined) {
    tokens.colorScheme = requireOneOfText(
      data.colorScheme,
      COLOR_SCHEMES,
      "theme.tokens.colorScheme",
      source,
    ) as PartialThemeTokens["colorScheme"];
  }
  if (data.density !== undefined) {
    tokens.density = requireOneOfText(
      data.density,
      DENSITIES,
      "theme.tokens.density",
      source,
    ) as PartialThemeTokens["density"];
  }

  for (const group of TOKEN_GROUPS) {
    const value = data[group];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ManifestError(`${source} : "theme.tokens.${group}" doit être un objet`);
    }
    const entries: Record<string, string> = {};
    for (const [name, candidate] of Object.entries(value as Record<string, unknown>)) {
      if (typeof candidate !== "string") {
        throw new ManifestError(`${source} : "theme.tokens.${group}.${name}" doit être une chaîne`);
      }
      // Ces valeurs seront interpolées dans une balise <style> rendue en SSR. Le contrôle vit ici
      // plutôt qu'au rendu pour que l'auteur du thème l'apprenne au chargement, avec le nom du
      // champ fautif, plutôt que de voir sa page se comporter étrangement en production.
      if (!isSafeTokenValue(candidate)) {
        throw new ManifestError(
          `${source} : "theme.tokens.${group}.${name}" contient un caractère interdit dans une valeur CSS`,
        );
      }
      entries[name] = candidate;
    }
    // Les clés inconnues d'un groupe sont conservées et simplement ignorées au rendu : refuser un
    // token que cette version ne connaît pas empêcherait un thème d'être compatible avec deux
    // versions du noyau à la fois.
    Object.assign(tokens, { [group]: entries });
  }

  return tokens;
}

function parseFonts(raw: unknown, source: string): ThemeFont[] {
  if (!Array.isArray(raw)) {
    throw new ManifestError(`${source} : "theme.fonts" doit être une liste`);
  }
  return raw.map((entry, index) => {
    const at = `theme.fonts[${index}]`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ManifestError(`${source} : "${at}" doit être un objet`);
    }
    const data = entry as Record<string, unknown>;
    const family = data.family;
    if (typeof family !== "string" || family.trim() === "") {
      throw new ManifestError(`${source} : "${at}.family" manquant`);
    }
    // Une police déclarée sans fichier ni feuille externe ne serait jamais chargée : le thème
    // paraîtrait « presque appliqué », ce qui est précisément le défaut que `fonts` corrige.
    if (typeof data.src !== "string" && typeof data.href !== "string") {
      throw new ManifestError(
        `${source} : "${at}" doit porter "src" (fichier livré) ou "href" (feuille externe)`,
      );
    }
    return {
      family: family.trim(),
      ...(typeof data.src === "string" ? { src: data.src } : {}),
      ...(typeof data.href === "string" ? { href: data.href } : {}),
      ...(typeof data.weight === "string" ? { weight: data.weight } : {}),
      ...(data.style === "italic" || data.style === "normal" ? { style: data.style } : {}),
      ...(typeof data.display === "string"
        ? { display: data.display as ThemeFont["display"] }
        : {}),
    };
  });
}

function requireOneOfText(
  value: unknown,
  allowed: string[],
  field: string,
  source: string,
): string {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ManifestError(
      `${source} : "${field}" doit valoir ${allowed.map((one) => `"${one}"`).join(" ou ")}`,
    );
  }
  return value;
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function requireText(data: Record<string, unknown>, key: string, source: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ManifestError(`${source} : champ "${key}" manquant ou vide`);
  }
  return value.trim();
}
