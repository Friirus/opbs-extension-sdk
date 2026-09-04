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
   * Désigne une instance de fournisseur configurée pour ce module (un cluster, un vCenter, un
   * serveur). Le panel remplit lui-même la liste des choix : le module n'a pas à la connaître.
   */
  | "provider";

export interface ConfigFieldOption {
  value: string;
  label: string;
}

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
  /** Uniquement pour type "select". */
  options?: ConfigFieldOption[];
}

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
