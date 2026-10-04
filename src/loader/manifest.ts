import { valid } from "semver";
import { ENUM_TOKENS, isSafeTokenValue } from "../kinds/theme";
import type {
  PartialThemeTokens,
  ThemeDefinition,
  ThemeFont,
  ThemePageDeclaration,
  ThemeSettingGroup,
} from "../kinds/theme";
import { EXTENSION_KINDS } from "../manifest";
import type { ExtensionKind, ExtensionManifest } from "../manifest";
import type { ConfigField, ConfigFieldCondition } from "../config-fields";
import { conditionShapeProblem, noteDiscardedConditions } from "../config-conditions";
import type { SupportedLocale } from "../locale";

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
      ...(theme.tokensDark !== undefined
        ? { tokensDark: parseTokens(theme.tokensDark, source, "theme.tokensDark") }
        : {}),
      ...(theme.fonts !== undefined ? { fonts: parseFonts(theme.fonts, source) } : {}),
      ...relativePath(theme, "assets", source),
      ...relativePath(theme, "stylesheet", source),
      ...relativePath(theme, "logo", source),
      ...relativePath(theme, "favicon", source),
      // `templates` était déclaré au contrat sans jamais être lu ici : un thème qui rangeait ses
      // gabarits ailleurs que dans `templates/` voyait sa déclaration ignorée en silence, et le
      // noyau chercher au mauvais endroit. `script` naît avec le même traitement.
      ...relativePath(theme, "templates", source),
      ...relativePath(theme, "locales", source),
      ...relativePath(theme, "script", source),
      ...relativePath(theme, "screenshot", source),
      ...(theme.pages !== undefined ? { pages: parsePages(theme.pages, source) } : {}),
      ...(theme.settings !== undefined
        ? { settings: parseSettings(theme.settings, source) }
        : {}),
      ...(theme.settingGroups !== undefined
        ? { settingGroups: parseSettingGroups(theme.settingGroups, source) }
        : {}),
      // Lu tel quel s'il est textuel : une langue hors de `SUPPORTED_LOCALES` est signalée par
      // `invalidThemeSettings`, et ne justifie pas d'éteindre le thème — le panel retombe alors sur
      // les libellés du manifeste, sans traduction.
      ...(typeof theme.settingsLocale === "string" && theme.settingsLocale.trim() !== ""
        ? { settingsLocale: theme.settingsLocale.trim() as SupportedLocale }
        : {}),
    },
  };
}

/**
 * Lit `theme.settingGroups` : les sections du panel que le thème déclare, dans leur ordre.
 *
 * Même partage que `parseSettings` — la forme ici (un tableau d'objets nommés), le jugement dans
 * `invalidThemeSettings` (nom en double, `previewPath` hors des pages que l'aperçu sait ouvrir,
 * `category` inconnue). `category` est donc gardée même inconnue, pour que l'auteur l'apprenne ;
 * le panel la lit comme `content`.
 */
function parseSettingGroups(value: unknown, source: string): ThemeSettingGroup[] {
  if (!Array.isArray(value)) {
    throw new ManifestError(`${source} : "theme.settingGroups" doit être un tableau`);
  }
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ManifestError(`${source} : "theme.settingGroups[${index}]" doit être un objet`);
    }
    const group = raw as Record<string, unknown>;
    const name = typeof group.name === "string" ? group.name.trim() : "";
    if (name === "") {
      throw new ManifestError(`${source} : "theme.settingGroups[${index}].name" est obligatoire`);
    }
    return {
      name,
      ...(typeof group.description === "string" && group.description.trim() !== ""
        ? { description: group.description.trim() }
        : {}),
      ...(typeof group.category === "string"
        ? { category: group.category as ThemeSettingGroup["category"] }
        : {}),
      ...(typeof group.previewPath === "string" ? { previewPath: group.previewPath } : {}),
      // Les seules chaînes, recopiées telles quelles : une clé mal formée ou rangée deux fois est
      // signalée par `invalidThemeSettings`, une clé absente des traductions par check-extension.
      ...(Array.isArray(group.texts)
        ? { texts: group.texts.filter((key): key is string => typeof key === "string") }
        : {}),
    };
  });
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
 * Lit `theme.settings` : les réglages que l'hébergeur pourra modifier au panel.
 *
 * Ne juge que la **forme** — un tableau d'objets, un nom, un libellé, un type connu. La validité
 * de la déclaration (noms en doublon, `select` sans option, type interdit à un thème) est l'affaire
 * de `invalidThemeSettings` côté SDK, qui produit un message lisible pour l'auteur là où une
 * exception de manifeste éteindrait le thème entier pour un réglage de trop. Même partage que
 * `theme.pages`, et pour la même raison : un thème doit rester affichable quand il se trompe sur
 * un détail.
 */
function parseSettings(value: unknown, source: string, at = "theme.settings"): ConfigField[] {
  if (!Array.isArray(value)) {
    throw new ManifestError(`${source} : "${at}" doit être un tableau`);
  }
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ManifestError(`${source} : "${at}[${index}]" doit être un objet`);
    }
    const field = raw as Record<string, unknown>;
    const name = typeof field.name === "string" ? field.name.trim() : "";
    if (name === "") {
      throw new ManifestError(`${source} : "${at}[${index}].name" est obligatoire`);
    }
    if (typeof field.label !== "string" || field.label.trim() === "") {
      throw new ManifestError(`${source} : "${at}[${index}].label" est obligatoire`);
    }
    if (typeof field.type !== "string" || !CONFIG_FIELD_TYPES.has(field.type)) {
      throw new ManifestError(
        `${source} : "${at}[${index}].type" doit être l'un de ${[...CONFIG_FIELD_TYPES].join(", ")}`,
      );
    }
    const visibility = parseVisibleWhen(field.visibleWhen);
    const parsed: ConfigField = {
      name,
      label: field.label.trim(),
      type: field.type as ConfigField["type"],
      required: field.required === true,
      ...(typeof field.defaultValue === "string" ? { defaultValue: field.defaultValue } : {}),
      ...(typeof field.placeholder === "string" ? { placeholder: field.placeholder } : {}),
      ...(typeof field.help === "string" ? { help: field.help } : {}),
      // Lu tel quel, même invalide : `invalidThemeSettings` le signale à l'auteur, et un
      // `maxLength` faux ne justifie pas d'éteindre le thème entier.
      ...(typeof field.maxLength === "number" ? { maxLength: field.maxLength } : {}),
      ...(typeof field.group === "string" && field.group.trim() !== ""
        ? { group: field.group.trim() }
        : {}),
      // Ajouts de 0.34.0. Lus sans jugement : un `block` qui ne désigne aucun élément d'`order`, un
      // `subgroup` sans `group`, sont signalés par `invalidThemeSettings`.
      ...(typeof field.subgroup === "string" && field.subgroup.trim() !== ""
        ? { subgroup: field.subgroup.trim() }
        : {}),
      ...(typeof field.block === "string" && field.block.trim() !== ""
        ? { block: field.block.trim() }
        : {}),
      // Même règle pour les ajouts de 0.29.0 : la forme ici, le jugement dans le SDK. Une clé
      // oubliée dans cette liste ne lèverait rien — le réglage perdrait sa liaison en silence.
      ...(typeof field.min === "number" ? { min: field.min } : {}),
      ...(typeof field.max === "number" ? { max: field.max } : {}),
      ...(typeof field.step === "number" ? { step: field.step } : {}),
      ...(typeof field.unit === "string" ? { unit: field.unit as ConfigField["unit"] } : {}),
      ...(typeof field.token === "string" ? { token: field.token } : {}),
      ...(typeof field.cssVar === "string" ? { cssVar: field.cssVar } : {}),
      ...(typeof field.previewPath === "string" ? { previewPath: field.previewPath } : {}),
      ...(field.scheme === "light" || field.scheme === "dark" ? { scheme: field.scheme } : {}),
      ...visibility.value,
      ...(field.localized === true ? { localized: true } : {}),
      // Lu tel quel s'il est textuel : une valeur inconnue ou un `format` hors d'un `textarea` sont
      // signalés par `invalidThemeSettings`, sans éteindre le thème.
      ...(typeof field.format === "string" ? { format: field.format as ConfigField["format"] } : {}),
      ...(typeof field.maxItems === "number" ? { maxItems: field.maxItems } : {}),
      // Récursif : les sous-champs d'un `list` ont la même forme. Une profondeur de plus est
      // refusée par le SDK, pas ici — la lecture ne juge que la forme.
      ...(Array.isArray(field.fields)
        ? { fields: parseSettings(field.fields, source, `${at}[${index}].fields`) }
        : {}),
      ...(Array.isArray(field.options)
        ? {
            options: field.options.flatMap((option) => {
              if (typeof option !== "object" || option === null) {
                return [];
              }
              const entry = option as Record<string, unknown>;
              if (typeof entry.value !== "string" || typeof entry.label !== "string") {
                return [];
              }
              const optionVisibility = parseVisibleWhen(entry.visibleWhen);
              const parsedOption = {
                value: entry.value,
                label: entry.label,
                ...parseOptionSets(entry.sets),
                ...optionVisibility.value,
              };
              noteDiscardedConditions(parsedOption, optionVisibility.discarded);
              return [parsedOption];
            }),
          }
        : {}),
    };
    noteDiscardedConditions(parsed, visibility.discarded);
    return parsed;
  });
}

function parseOptionSets(value: unknown): { sets?: Record<string, string> } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const sets = Object.fromEntries(
    Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === "string"),
  );
  return Object.keys(sets).length > 0 ? { sets } : {};
}

/**
 * Lit une condition d'affichage — un objet, ou un tableau d'objets qui doivent tous tenir.
 *
 * Une condition mal formée (aucun ou plusieurs opérateurs, `in` qui n'est pas un tableau non vide,
 * `field` absent) est **écartée**, jamais devinée — mais plus perdue en silence comme avant 0.34.0,
 * où un `notEqual` mal orthographié laissait le champ toujours visible sans un mot : la raison est
 * rendue dans `discarded`, que `parseSettings` attache au champ pour `invalidThemeSettings`. Le
 * thème se charge quand même : un champ affiché à tort ne justifie pas d'éteindre la vitrine.
 */
function parseVisibleWhen(value: unknown): {
  value: Pick<ConfigField, "visibleWhen">;
  discarded: string[];
} {
  // `null` vaut absence : c'est ainsi qu'un outil qui génère le manifeste écrit « pas de condition ».
  if (value === undefined || value === null) {
    return { value: {}, discarded: [] };
  }
  const candidates: unknown[] = Array.isArray(value) ? value : [value];
  const kept: ConfigFieldCondition[] = [];
  const discarded: string[] = [];
  for (const candidate of candidates) {
    const problem = conditionShapeProblem(candidate);
    if (problem !== null) {
      discarded.push(problem);
      continue;
    }
    // Forme vérifiée ci-dessus : un seul opérateur, des valeurs textuelles ou booléennes, mises en
    // texte ici pour que tout lecteur en aval compare des chaînes.
    const { field, equals, notEquals, in: among } = candidate as Record<string, unknown>;
    const name = (field as string).trim();
    if (among !== undefined) {
      kept.push({ field: name, in: (among as unknown[]).map(String) });
    } else if (notEquals !== undefined) {
      kept.push({ field: name, notEquals: String(notEquals) });
    } else {
      kept.push({ field: name, equals: String(equals) });
    }
  }
  if (kept.length === 0) {
    return { value: {}, discarded };
  }
  // Un tableau reste un tableau, même réduit à une condition : c'est la forme qu'a écrite l'auteur,
  // et le panel qui l'affiche (« Visible quand … et … ») n'a pas à en inventer une autre.
  return { value: { visibleWhen: Array.isArray(value) ? kept : kept[0]! }, discarded };
}

/** Types de champ que le contrat connaît, pour refuser une faute de frappe dès la lecture. */
const CONFIG_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "number",
  "boolean",
  "select",
  "password",
  "url",
  "image",
  "color",
  "order",
  "list",
  "link",
  "font",
  "provider",
]);

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
  key: "assets" | "stylesheet" | "logo" | "favicon" | "templates" | "script" | "screenshot" | "locales",
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

/**
 * Les groupes de tokens qui sont des dictionnaires de chaînes, traités à l'identique. Un groupe
 * absent d'ici est ignoré à la lecture : le thème qui le déclare n'en verrait aucun effet.
 */
const TOKEN_GROUPS = ["colors", "radii", "typography", "layout"] as const;

/** Tokens de premier niveau à liste fermée. Les valeurs viennent d'`ENUM_TOKENS`, jamais recopiées. */
const TOP_LEVEL_ENUMS = ["colorScheme", "density", "elevation"] as const;

function parseTokens(raw: unknown, source: string, at = "theme.tokens"): PartialThemeTokens {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ManifestError(`${source} : "${at}" doit être un objet`);
  }
  const data = raw as Record<string, unknown>;
  const tokens: PartialThemeTokens = {};

  for (const key of TOP_LEVEL_ENUMS) {
    if (data[key] !== undefined) {
      Object.assign(tokens, {
        [key]: requireOneOfText(data[key], [...(ENUM_TOKENS[key] ?? [])], `${at}.${key}`, source),
      });
    }
  }

  for (const group of TOKEN_GROUPS) {
    const value = data[group];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ManifestError(`${source} : "${at}.${group}" doit être un objet`);
    }
    const entries: Record<string, string> = {};
    for (const [name, candidate] of Object.entries(value as Record<string, unknown>)) {
      if (typeof candidate !== "string") {
        throw new ManifestError(`${source} : "${at}.${group}.${name}" doit être une chaîne`);
      }
      // Ces valeurs seront interpolées dans une balise <style> rendue en SSR. Le contrôle vit ici
      // plutôt qu'au rendu pour que l'auteur du thème l'apprenne au chargement, avec le nom du
      // champ fautif, plutôt que de voir sa page se comporter étrangement en production.
      if (!isSafeTokenValue(candidate)) {
        throw new ManifestError(
          `${source} : "${at}.${group}.${name}" contient un caractère interdit dans une valeur CSS`,
        );
      }
      // Un token à liste fermée dans un groupe (`layout.accountNav`) : même contrôle qu'au premier
      // niveau, sans quoi une faute de frappe y passerait pour une valeur, et le portail la lirait.
      const closed = ENUM_TOKENS[`${group}.${name}`];
      if (closed !== undefined) {
        requireOneOfText(candidate, [...closed], `${at}.${group}.${name}`, source);
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
