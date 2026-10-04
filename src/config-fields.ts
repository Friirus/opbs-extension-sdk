import { ExtensionConfigError } from "./errors";

/**
 * Types de champ qu'un module peut déclarer. Le panel admin rend le formulaire à partir de cette
 * description : sans elle, chaque nouveau module imposerait son propre écran sur mesure, ce qui
 * fermerait de fait la porte aux modules tiers.
 */
export type ConfigFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  /** Saisie masquée, **chiffrée en base et jamais renvoyée en clair par l'API**. */
  | "password"
  /**
   * Adresse web : rendue en `<input type="url">`, donc validée par le navigateur avant envoi.
   *
   * Ajouté pour les réglages de thème, où la moitié des champs visuels sont des images — et une
   * image se désigne par son adresse, comme le logo de Paramètres › Identité. Utile à tout module
   * qui demande une adresse de service plutôt qu'un identifiant.
   */
  | "url"
  /**
   * Image téléversée depuis le panel, ou désignée par son adresse. **Réservé aux réglages de
   * thème** : le noyau ne stocke des fichiers que pour eux, et `pnpm check-extension` refuse ce
   * type ailleurs.
   *
   * La valeur reste une adresse — `/api/v1/theme-media/<id>.<ext>` après téléversement, ou une
   * adresse `https:` saisie à la main —, si bien qu'un gabarit l'écrit tel quel dans un `src`.
   */
  | "image"
  /**
   * Couleur, saisie au sélecteur du panel. La valeur est un hexadécimal (`#rgb` ou `#rrggbb`) et
   * rien d'autre : c'est le seul format dont le noyau sait mesurer le contraste, et le seul qu'un
   * `<input type="color">` sache relire.
   *
   * Seule, une couleur n'arrive qu'aux gabarits. Pour qu'elle atteigne la feuille de style, le
   * champ la lie à un token (`token`) ou à une variable CSS du thème (`cssVar`).
   */
  | "color"
  /**
   * Ordre d'une liste fermée — l'emplacement des blocs d'une page. `options` nomme les éléments,
   * le panel les rend déplaçables, et la valeur est la liste de leurs `value` séparés par des
   * virgules (`"families,steps,account"`), qu'un gabarit lit par `split`.
   *
   * Une chaîne et non un tableau : le type de `settings` ne change pas, donc aucun gabarit
   * existant ne casse. L'ordre ne masque rien — montrer ou cacher un bloc reste un `boolean`.
   */
  | "order"
  /**
   * Liste d'éléments, chacun composé des sous-champs de `fields` — des avis, une FAQ, des liens.
   * L'hébergeur ajoute, retire et ordonne les éléments au panel ; le gabarit reçoit un tableau
   * d'objets (`{% for review in settings.reviews %}{{ review.author }}`). **Réservé aux réglages
   * de thème.** Un sous-champ ne peut être ni `list`, ni `order`, ni `password`, ni `provider`,
   * et ne porte ni `token` ni `cssVar`.
   */
  | "list"
  /**
   * Lien : un chemin du site (`/catalog`, `/infrastructure`) ou une adresse externe (`https:`,
   * `mailto:`, `tel:`), validé par `isSafeLinkValue`. **Réservé aux réglages de thème**, admis comme
   * sous-champ de `list` (les colonnes d'un pied de page).
   *
   * Distinct de `url` parce que ce n'est pas la même chose qu'on demande à l'hébergeur : `url` est
   * une adresse de ressource (une image, un service), `link` une destination de navigation. Le
   * panel lui propose donc les pages qui existent — la vitrine, ses propres pages de contenu, celles
   * du thème — au lieu d'un champ vide où il faudrait deviner qu'on attend `/catalog`.
   */
  | "link"
  /**
   * Famille de polices. **Réservé aux réglages de thème**, et liable aux seuls tokens
   * `typography.fontFamily` et `typography.headingFamily`.
   *
   * La valeur est l'une des `options` du thème (une pile, `"Figtree", system-ui, sans-serif`), ou
   * le nom d'une police que l'hébergeur a téléversée au panel (`Ma Police`), que le noyau complète
   * d'une pile de repli en l'émettant. Distinct de `select` parce que la liste n'est pas fermée par
   * le manifeste : les polices téléversées ne sont connues qu'à l'exécution, et les validateurs du
   * SDK les reçoivent en paramètre — le SDK ne lit aucune base.
   */
  | "font"
  /**
   * Désigne une instance de fournisseur configurée pour ce module (un cluster, un vCenter, un
   * serveur). Le panel remplit lui-même la liste des choix : le module n'a pas à la connaître.
   */
  | "provider";

export interface ConfigFieldOption {
  value: string;
  label: string;
  /**
   * Valeurs que ce choix pose sur d'autres champs quand on le sélectionne — une palette qui
   * remplit six couleurs d'un coup. Clé : nom d'un champ déclaré ; valeur : ce qu'on y aurait tapé.
   *
   * Le panel applique, le noyau n'en sait rien : les champs remplis restent des champs ordinaires,
   * modifiables un à un ensuite. Réservé aux réglages de thème.
   */
  sets?: Record<string, string>;
  /**
   * Pour un champ `order` : l'élément n'apparaît sur la page que si cette condition tient
   * (`{ "field": "showSteps", "equals": "true" }`). Le panel le marque « masqué » dans la liste
   * plutôt que de le retirer — on peut placer un bloc avant de l'activer. Le noyau ne s'en sert
   * pas : c'est le gabarit qui montre ou cache.
   *
   * Un tableau de conditions veut dire « toutes », comme sur `ConfigField.visibleWhen`.
   */
  visibleWhen?: ConfigFieldCondition | ConfigFieldCondition[];
}

/**
 * Condition d'affichage d'un champ : il n'apparaît que si un autre champ a telle valeur, n'a pas
 * telle valeur, ou a l'une de plusieurs valeurs. **Exactement un opérateur** par condition.
 *
 * La valeur comparée est celle saisie dans l'autre champ, en chaîne : `"true"`/`"false"` pour un
 * `boolean`, la `value` de l'option pour un `select`. Une union et non trois clés facultatives sur
 * un même objet : `{ field, equals, in }` n'aurait aucun sens, et le type le refuse avant que le
 * lecteur de manifeste n'ait à le faire.
 *
 * Pur confort de formulaire. Le noyau ignore la condition — un champ masqué garde sa valeur et
 * le gabarit la reçoit toujours : c'est à lui de ne pas s'en servir. `conditionHolds` et
 * `isConfigFieldVisible` l'évaluent, pour que le panel et quiconque d'autre en tirent la même
 * réponse.
 */
export type ConfigFieldCondition =
  | { field: string; equals: string }
  | { field: string; notEquals: string }
  /** Tableau non vide : une liste vide ne tiendrait jamais, ce qui masquerait le champ pour toujours. */
  | { field: string; in: string[] };

/**
 * Clés que le noyau se réserve dans l'objet des réglages d'un thème (`$customCss`, `$texts` — CSS
 * additionnel et textes du thème saisis au panel). Elles vivent dans le même JSON que les valeurs
 * des réglages déclarés, d'où le `$` : la règle de nom d'un réglage (une lettre, puis lettres,
 * chiffres ou `_`, voir `invalidThemeSettings`) ne peut pas en produire, si bien qu'aucun thème ne
 * peut déclarer un réglage qui les écraserait. **Toute clé commençant par `$` appartient au
 * noyau** ; celles-ci sont les seules utilisées aujourd'hui.
 */
export const THEME_RESERVED_SETTING_KEYS = ["$customCss", "$texts"] as const;

/** Unités qu'un champ `number` peut porter jusqu'à la feuille de style. */
export const CONFIG_FIELD_UNITS = ["px", "rem", "em", "%", "vw", "vh", "ch"] as const;
export type ConfigFieldUnit = (typeof CONFIG_FIELD_UNITS)[number];

export interface ConfigField {
  name: string;
  label: string;
  type: ConfigFieldType;
  required: boolean;
  /** Valeur pré-remplie à l'ouverture du formulaire. */
  defaultValue?: string;
  placeholder?: string;
  /** Texte d'aide affiché sous le champ. */
  help?: string;
  /** Pour les types `select`, `order` et `font`. */
  options?: ConfigFieldOption[];
  /**
   * Section sous laquelle le panel range ce champ : à la fois son titre et son **identifiant**.
   *
   * Sans lui, tous les champs se suivent dans l'ordre de déclaration — acceptable pour les trois
   * réglages d'un module d'encaissement, illisible pour les vingt-cinq d'un thème. Pour un thème,
   * la chaîne est celle du manifeste, jamais traduite : c'est elle que nomment
   * `ThemeDefinition.settingGroups[].name` et la règle de `block` (même section), et une traduction
   * incohérente couperait sinon une section en deux. Le panel affiche à côté un libellé traduit.
   * Ordre des sections : celui de `settingGroups`, puis les groupes non déclarés dans l'ordre de
   * leur première apparition.
   */
  group?: string;
  /**
   * **Thèmes seulement.** Intertitre repliable à l'intérieur de la section (`group`) — « Mode
   * sombre » dans « Couleurs ». Chaîne source du manifeste, traduisible au panel comme `group`.
   *
   * Exige `group`, et exclut `block` : un réglage rattaché à un bloc s'affiche dans ce bloc.
   */
  subgroup?: string;
  /**
   * **Thèmes seulement.** Rattache ce réglage à un élément d'un champ `order` de la **même
   * section** : la `value` d'une de ses options (`"steps"`). Le panel rend alors l'`order` en blocs
   * dépliables, chacun portant ses propres réglages — le titre des étapes sous le bloc « Étapes »,
   * plutôt qu'à trente lignes de là.
   *
   * Un champ `order` ne porte ni `block` ni `subgroup`.
   */
  block?: string;
  /**
   * **Thèmes seulement**, sur `textarea` (y compris sous-champ de `list`) : la valeur est un texte
   * riche, écrit dans le sous-ensemble markdown de `parseThemeMarkdown` (paragraphes, gras,
   * italique, liens, listes). Le panel ajoute une barre de mise en forme et un aperçu ; le gabarit
   * reçoit toujours le texte brut, et le met en forme par `{{ settings.x | markdown }}` — jamais
   * dans un attribut, où `pnpm check-extension` le signale.
   *
   * Une clé et non un type : la valeur reste un texte, localisable et borné comme les autres, et un
   * thème qui ne l'applique pas au rendu montre simplement les astérisques.
   */
  format?: "markdown";
  /**
   * Longueur maximale d'une valeur texte (`text`, `textarea`, `url`, `link`), en caractères.
   *
   * Le panel affiche un compteur quand elle est déclarée, et le noyau refuse une valeur plus
   * longue. Sans elle, pas de compteur : un compteur sans limite n'apprend rien à personne. Utile
   * surtout aux thèmes, dont la mise en page casse sur un titre trois fois trop long.
   */
  maxLength?: number;
  /**
   * Bornes et pas d'un champ `number`. Avec `min` **et** `max`, le panel rend un curseur ; le
   * noyau refuse une valeur hors bornes dans tous les cas.
   */
  min?: number;
  max?: number;
  step?: number;
  /**
   * Unité d'un champ `number` : affichée à côté de la valeur, et accolée à elle quand le champ
   * est lié à un token ou à une variable CSS (`18` + `px`). Le gabarit, lui, reçoit le nombre nu.
   *
   * Obligatoire pour un nombre lié à un token, sauf les tokens **sans unité** —
   * `typography.lineHeight`, `headingLineHeight` et `headingScale` —, où elle est au contraire
   * refusée : `1.5px` n'est pas la hauteur de ligne `1.5`, et `1.25rem` ne multiplie rien.
   */
  unit?: ConfigFieldUnit;
  /**
   * Le champ n'apparaît au panel que si cette condition est remplie — ou, pour un tableau, si
   * toutes le sont. **Transitif** : un champ dont la condition renvoie à un champ lui-même masqué
   * est masqué aussi (voir `isConfigFieldVisible`), sans quoi « Points de la conclusion » restait
   * affiché sous une conclusion désactivée. Une boucle de conditions masque tous ses membres ;
   * `pnpm check-extension` la refuse.
   */
  visibleWhen?: ConfigFieldCondition | ConfigFieldCondition[];
  /**
   * **Thèmes seulement.** Token que ce réglage remplace : `"colors.primary"`, `"radii.md"`,
   * `"typography.headingFamily"`, `"density"`… Le noyau pose la valeur par-dessus les tokens du
   * thème ; seule la marque d'un revendeur passe encore devant, sur ses domaines et pour ses
   * clients.
   *
   * Passer par un token plutôt que par une variable libre, c'est hériter de tout ce que le noyau
   * en dérive : la couleur lisible sur un aplat, l'échelle d'espacement d'une densité, la taille
   * des titres d'une échelle, les ombres d'un relief (`elevation`).
   */
  token?: string;
  /**
   * **Thèmes seulement.** Variable CSS du thème qui reçoit la valeur (`"--ag-hero-tint"`), émise
   * dans le même bloc `:root` que les tokens. Pour ce qu'aucun token ne décrit.
   *
   * Les préfixes du noyau (`--brand-`, `--radius-`, `--space-`, `--font-size-`) sont refusés : un
   * réglage qui les écraserait contournerait les valeurs dérivées. Types admis : `color`,
   * `number`, `select`.
   */
  cssVar?: string;
  /**
   * **Thèmes seulement**, sur `text` et `textarea` : une valeur par langue de l'instance. Le panel
   * montre un onglet par langue ; le gabarit reçoit la valeur de la langue de la page, sinon celle
   * de la langue par défaut de l'instance, sinon la première renseignée, sinon `defaultValue`.
   */
  localized?: boolean;
  /**
   * **Thèmes seulement**, avec `token` ou `cssVar` : la palette que ce réglage alimente. `"dark"`
   * vise le mode sombre (`ThemeDefinition.tokensDark`), `"light"` — le défaut — l'apparence
   * ordinaire. Sans mode sombre déclaré par le thème, un réglage `"dark"` n'a aucun effet.
   */
  scheme?: "light" | "dark";
  /**
   * **Thèmes seulement. Déprécié** au profit de `ThemeDefinition.settingGroups[].previewPath` : la
   * page d'aperçu est une propriété de la section, pas d'un réglage. Reste lu comme **repli** —
   * quand la section ne déclare pas la sienne, le premier réglage de la section qui en porte une
   * décide pour toute la section.
   *
   * Un chemin que `isThemePreviewPath` accepte : une page de `THEME_PREVIEW_PATHS` ou de
   * `THEME_ACCOUNT_PREVIEW_PATHS`, ou `/<slug>` d'une page déclarée par le thème.
   */
  previewPath?: string;
  /** Sous-champs d'un `list`. */
  fields?: ConfigField[];
  /** Nombre maximal d'éléments d'un `list`. Le noyau refuse au-delà. */
  maxItems?: number;
}

/** Une valeur de réglage telle qu'un gabarit la reçoit. */
export type ThemeSettingScalar = string | number | boolean;
export type ThemeSettingItem = Record<string, ThemeSettingScalar>;
export type ThemeSettingValue = ThemeSettingScalar | ThemeSettingItem[];

/**
 * Un champ dont la valeur ne doit jamais ressortir de la base.
 *
 * Fonction plutôt que test direct sur `type === "password"` disséminé dans le code : le jour où un
 * second type sensible apparaît, il y a un seul endroit à corriger — et surtout, un seul endroit à
 * relire pour vérifier qu'aucun secret ne fuit.
 */
export function isSecretField(field: ConfigField): boolean {
  return field.type === "password";
}

/** Noms des champs sensibles d'un module, pour expurger une configuration avant de la renvoyer. */
export function secretFieldNames(fields: readonly ConfigField[]): string[] {
  return fields.filter(isSecretField).map((field) => field.name);
}

/** Accès typé à un champ d'un objet de configuration brut (issu de JSON ou d'un formulaire). */
export function readString(raw: unknown, key: string): string | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const value = (raw as Record<string, unknown>)[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function requireString(raw: unknown, key: string, label: string): string {
  const value = readString(raw, key);
  if (value === undefined) {
    throw new ExtensionConfigError(`Champ requis manquant ou vide : ${label}`);
  }
  return value;
}

/**
 * Lit un nombre, qu'il arrive en nombre ou en chaîne — un formulaire HTML envoie toujours du
 * texte, et un JSON stocké renvoie un nombre. Les deux doivent donner le même résultat.
 */
export function readNumber(raw: unknown, key: string): number | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const value = (raw as Record<string, unknown>)[key];
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const text = readString(raw, key);
  if (text === undefined) {
    return undefined;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function requireNumber(raw: unknown, key: string, label: string): number {
  const value = readNumber(raw, key);
  if (value === undefined) {
    throw new ExtensionConfigError(`Champ requis manquant ou non numérique : ${label}`);
  }
  return value;
}

/**
 * Lit un booléen tolérant aux formes que prend une case à cocher selon le chemin emprunté :
 * `true`, `"true"`, `"on"` depuis un formulaire, `"1"` depuis une variable d'environnement.
 */
export function readBoolean(raw: unknown, key: string): boolean | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const value = (raw as Record<string, unknown>)[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["true", "on", "1", "yes", "oui"].includes(normalized)) {
    return true;
  }
  if (["false", "off", "0", "no", "non"].includes(normalized)) {
    return false;
  }
  return undefined;
}

/** Valide qu'une valeur fait partie d'un ensemble fermé, en repliant sur un défaut si elle manque. */
export function requireOneOf<T extends string>(
  raw: unknown,
  key: string,
  label: string,
  allowed: readonly T[],
  fallback?: T,
): T {
  const value = readString(raw, key) ?? fallback;
  if (value === undefined) {
    throw new ExtensionConfigError(`Champ requis manquant ou vide : ${label}`);
  }
  if (!allowed.includes(value as T)) {
    throw new ExtensionConfigError(
      `${label} invalide : "${value}" (attendu ${allowed.join(" ou ")})`,
    );
  }
  return value as T;
}
