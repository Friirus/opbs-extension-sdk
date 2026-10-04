/**
 * Évaluation des conditions d'affichage (`visibleWhen`) d'un champ de configuration.
 *
 * Fonctions pures, sans rien de Node : ce fichier est réexporté par la racine du SDK, que les
 * bundles **navigateur** des apps Next.js lisent (voir la note de `index.ts`). Le panel les
 * appelle au rendu de chaque formulaire ; les réécrire côté panel, c'était la troisième copie
 * d'une règle que le lecteur de manifeste et `check-extension` connaissent déjà.
 */
import type { ConfigField, ConfigFieldCondition } from "./config-fields";

/** Valeurs d'un formulaire, telles que le panel les tient (chaînes) ou qu'un appelant les résout. */
export type ConfigFieldValues = Readonly<Record<string, unknown>>;

/** Ce dont l'évaluation a besoin d'un champ : son nom et sa condition. Une option s'y prête aussi. */
type Conditioned = Pick<ConfigField, "name" | "visibleWhen">;

/**
 * Les conditions d'un `visibleWhen`, toujours en tableau : une condition seule et un tableau d'une
 * condition disent la même chose, et aucun appelant n'a à distinguer les deux formes.
 */
export function configFieldConditions(
  visibleWhen: ConfigFieldCondition | readonly ConfigFieldCondition[] | undefined,
): ConfigFieldCondition[] {
  if (visibleWhen === undefined) {
    return [];
  }
  return Array.isArray(visibleWhen)
    ? [...(visibleWhen as readonly ConfigFieldCondition[])]
    : [visibleWhen as ConfigFieldCondition];
}

/**
 * Ce qui cloche dans la **forme** d'une condition, ou `null` si elle est bien formée.
 *
 * Partagé par le lecteur de manifeste (qui écarte la condition) et `invalidThemeSettings` (qui la
 * signale) : une seule définition de « bien formée », sans quoi l'un laisserait passer ce que
 * l'autre refuse. Une valeur booléenne est admise — `"equals": true` s'écrit naturellement dans un
 * JSON — et comparée sous sa forme texte.
 */
export function conditionShapeProblem(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return "une condition est un objet { field, equals | notEquals | in }";
  }
  const condition = raw as Record<string, unknown>;
  if (typeof condition.field !== "string" || condition.field.trim() === "") {
    return "« field » manquant";
  }
  const operators = CONDITION_OPERATORS.filter((operator) => condition[operator] !== undefined);
  if (operators.length !== 1) {
    return operators.length === 0
      ? "aucun opérateur (equals, notEquals ou in)"
      : `un seul opérateur par condition (reçu ${operators.join(", ")})`;
  }
  const operator = operators[0]!;
  const value = condition[operator];
  if (operator === "in") {
    if (!Array.isArray(value) || value.length === 0) {
      return "« in » attend un tableau non vide de valeurs";
    }
    if (!value.every(isComparable)) {
      return "« in » n'accepte que des chaînes";
    }
    return null;
  }
  return isComparable(value) ? null : `« ${operator} » attend une chaîne`;
}

/** Opérateurs connus, dans l'ordre où le lecteur de manifeste les cherche. */
const CONDITION_OPERATORS = ["equals", "notEquals", "in"] as const;

function isComparable(value: unknown): value is string | boolean {
  return typeof value === "string" || typeof value === "boolean";
}

/** La valeur d'un champ telle qu'une condition la compare : du texte, vide si rien n'est saisi. */
function comparedValue(values: ConfigFieldValues, name: string): string {
  const value = values[name];
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

/**
 * La condition tient-elle pour ces valeurs ?
 *
 * Une condition mal formée — ce que le type interdit mais qu'un JSON peut contenir — est **ignorée**
 * (elle tient) : c'est ce que fait le lecteur de manifeste, qui l'écarte, et un champ affiché à tort
 * se remarque, là où un champ masqué à jamais disparaît sans que personne ne sache qu'il existe.
 */
export function conditionHolds(
  condition: ConfigFieldCondition,
  values: ConfigFieldValues,
): boolean {
  if (conditionShapeProblem(condition) !== null) {
    return true;
  }
  const actual = comparedValue(values, condition.field);
  if ("in" in condition) {
    return condition.in.map(String).includes(actual);
  }
  if ("notEquals" in condition) {
    return actual !== String(condition.notEquals);
  }
  return actual === String(condition.equals);
}

/**
 * Le champ est-il affiché, compte tenu des autres champs et des valeurs du moment ?
 *
 * **Transitif** : un champ est visible si toutes ses conditions tiennent *et* si chaque champ
 * qu'elles nomment est lui-même visible. Sans cela, « Points de la conclusion » (qui dépend de
 * « Afficher la liste », qui dépend de « Afficher la conclusion ») restait affiché quand la
 * conclusion entière était masquée — un réglage sans effet, offert à l'édition.
 *
 * **Une boucle masque ses membres**, et tout ce qui en dépend : `A` visible si `B` l'est, `B` si
 * `A` l'est, rien ne permet de trancher. `invalidThemeSettings` refuse la boucle, mais un thème
 * déposé sans passer par `check-extension` ne doit pas pour autant faire tourner le panel à
 * l'infini. Un renvoi vers un champ inconnu ne compte que par sa condition (valeur absente = `""`).
 *
 * `field` peut être une option d'un `order` (`{ name, visibleWhen }`) : même règle.
 */
export function isConfigFieldVisible(
  field: Conditioned,
  fields: readonly Conditioned[],
  values: ConfigFieldValues,
): boolean {
  const byName = new Map(fields.map((candidate) => [candidate.name, candidate]));
  const memo = new Map<string, boolean>();
  const visiting = new Set<Conditioned>();

  const visible = (current: Conditioned): boolean => {
    const conditions = configFieldConditions(current.visibleWhen);
    if (conditions.length === 0) {
      return true;
    }
    const known = byName.get(current.name) === current ? memo.get(current.name) : undefined;
    if (known !== undefined) {
      return known;
    }
    // Déjà sur le chemin en cours : c'est une boucle. Le résultat ne dépend pas du point d'entrée
    // — tout membre d'une boucle est masqué —, ce qui rend la mémorisation ci-dessous sûre.
    if (visiting.has(current)) {
      return false;
    }
    visiting.add(current);
    let result = true;
    for (const condition of conditions) {
      if (!conditionHolds(condition, values)) {
        result = false;
        break;
      }
      const target = byName.get(condition.field);
      if (target && !visible(target)) {
        result = false;
        break;
      }
    }
    visiting.delete(current);
    if (byName.get(current.name) === current) {
      memo.set(current.name, result);
    }
    return result;
  };

  return visible(field);
}

/**
 * Conditions qu'un lecteur a écartées d'un champ ou d'une option parce qu'elles étaient mal
 * formées, avec la raison.
 *
 * Le lecteur de manifeste ne refuse pas un thème pour une condition mal écrite (le thème doit
 * rester affichable), mais il ne doit pas non plus la perdre en silence : la note est gardée ici,
 * attachée à l'objet qu'il a produit, et `invalidThemeSettings` la restitue en erreur — donc
 * `check-extension`. Une table faible plutôt qu'une clé de plus sur `ConfigField` : la note n'a
 * rien à faire dans le contrat, ni dans ce que l'API renvoie au panel. Revers assumé : une copie de
 * l'objet la perd, et seul le résultat direct du lecteur la porte — c'est lui que lit
 * `check-extension`.
 */
const discardedConditions = new WeakMap<object, string[]>();

/** Réservé au lecteur de manifeste. */
export function noteDiscardedConditions(owner: object, problems: readonly string[]): void {
  if (problems.length > 0) {
    discardedConditions.set(owner, [...problems]);
  }
}

/** Réservé à `invalidThemeSettings`. */
export function discardedConditionsOf(owner: object): readonly string[] {
  return discardedConditions.get(owner) ?? [];
}
