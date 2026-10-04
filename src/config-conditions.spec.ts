import type { ConfigField, ConfigFieldCondition } from "./config-fields";
import {
  conditionHolds,
  conditionShapeProblem,
  configFieldConditions,
  isConfigFieldVisible,
} from "./config-conditions";

function field(name: string, visibleWhen?: ConfigField["visibleWhen"]): ConfigField {
  return { name, label: name, type: "text", required: false, ...(visibleWhen ? { visibleWhen } : {}) };
}

describe("conditionHolds", () => {
  it("compare avec equals, notEquals et in, en chaîne", () => {
    const values = { scheme: "auto", count: 3, shown: true };

    expect(conditionHolds({ field: "scheme", equals: "auto" }, values)).toBe(true);
    expect(conditionHolds({ field: "scheme", equals: "dark" }, values)).toBe(false);
    expect(conditionHolds({ field: "scheme", notEquals: "light" }, values)).toBe(true);
    expect(conditionHolds({ field: "scheme", notEquals: "auto" }, values)).toBe(false);
    expect(conditionHolds({ field: "scheme", in: ["dark", "auto"] }, values)).toBe(true);
    expect(conditionHolds({ field: "scheme", in: ["dark", "light"] }, values)).toBe(false);
    // Un nombre ou un booléen résolu se compare sous sa forme texte, comme le panel le tient.
    expect(conditionHolds({ field: "count", equals: "3" }, values)).toBe(true);
    expect(conditionHolds({ field: "shown", equals: "true" }, values)).toBe(true);
  });

  it("traite une valeur absente comme une chaîne vide", () => {
    expect(conditionHolds({ field: "absent", equals: "" }, {})).toBe(true);
    expect(conditionHolds({ field: "absent", notEquals: "true" }, {})).toBe(true);
    expect(conditionHolds({ field: "absent", equals: "true" }, {})).toBe(false);
  });

  /** Écartée par le lecteur, ignorée ici : un champ affiché à tort se voit, un champ perdu non. */
  it("ignore une condition mal formée plutôt que de masquer le champ", () => {
    const twoOperators = { field: "a", equals: "x", notEquals: "y" } as unknown as ConfigFieldCondition;
    const emptyIn = { field: "a", in: [] } as ConfigFieldCondition;

    expect(conditionHolds(twoOperators, { a: "z" })).toBe(true);
    expect(conditionHolds(emptyIn, { a: "z" })).toBe(true);
  });
});

describe("conditionShapeProblem", () => {
  it.each<[string, unknown]>([
    ["pas un objet", "showSteps"],
    ["sans field", { equals: "true" }],
    ["sans opérateur", { field: "a" }],
    ["deux opérateurs", { field: "a", equals: "x", in: ["y"] }],
    ["in non tableau", { field: "a", in: "x" }],
    ["in vide", { field: "a", in: [] }],
    ["in avec un objet", { field: "a", in: [{}] }],
    ["equals numérique", { field: "a", equals: 8 }],
  ])("refuse une condition %s", (_label, raw) => {
    expect(conditionShapeProblem(raw)).not.toBeNull();
  });

  it("accepte les trois opérateurs, booléens compris", () => {
    expect(conditionShapeProblem({ field: "a", equals: true })).toBeNull();
    expect(conditionShapeProblem({ field: "a", notEquals: "x" })).toBeNull();
    expect(conditionShapeProblem({ field: "a", in: ["x", "y"] })).toBeNull();
  });
});

describe("configFieldConditions", () => {
  it("rend toujours un tableau", () => {
    const one = { field: "a", equals: "x" };
    expect(configFieldConditions(undefined)).toEqual([]);
    expect(configFieldConditions(one)).toEqual([one]);
    expect(configFieldConditions([one, one])).toEqual([one, one]);
  });
});

describe("isConfigFieldVisible", () => {
  it("affiche un champ sans condition", () => {
    const a = field("a");
    expect(isConfigFieldVisible(a, [a], {})).toBe(true);
  });

  it("exige toutes les conditions d'un tableau", () => {
    const a = field("a", [
      { field: "x", equals: "1" },
      { field: "y", in: ["2", "3"] },
    ]);

    expect(isConfigFieldVisible(a, [a], { x: "1", y: "3" })).toBe(true);
    expect(isConfigFieldVisible(a, [a], { x: "1", y: "4" })).toBe(false);
    expect(isConfigFieldVisible(a, [a], { x: "0", y: "3" })).toBe(false);
  });

  /**
   * Le cas d'Argile : « Points de la conclusion » dépend d'« Afficher la liste », qui dépend
   * d'« Afficher la conclusion ». Conclusion masquée ⇒ ses points aussi, même si la liste reste
   * cochée.
   */
  it("masque un champ dont le champ de référence est lui-même masqué", () => {
    const showClosing = field("showClosing");
    const closingShowList = field("closingShowList", { field: "showClosing", equals: "true" });
    const closingPoints = field("closingPoints", { field: "closingShowList", equals: "true" });
    const fields = [showClosing, closingShowList, closingPoints];

    expect(
      isConfigFieldVisible(closingPoints, fields, { showClosing: "true", closingShowList: "true" }),
    ).toBe(true);
    expect(
      isConfigFieldVisible(closingPoints, fields, { showClosing: "false", closingShowList: "true" }),
    ).toBe(false);
  });

  it("masque les membres d'une boucle, et ce qui en dépend, sans boucler", () => {
    const a = field("a", { field: "b", equals: "1" });
    const b = field("b", { field: "c", notEquals: "0" });
    const c = field("c", { field: "a", equals: "1" });
    const d = field("d", { field: "a", equals: "1" });
    const self = field("self", { field: "self", equals: "1" });
    const fields = [a, b, c, d, self];
    const values = { a: "1", b: "1", c: "1", self: "1" };

    for (const member of [a, b, c, d, self]) {
      expect(isConfigFieldVisible(member, fields, values)).toBe(false);
    }
  });

  it("compte un renvoi vers un champ inconnu par sa seule condition", () => {
    const a = field("a", { field: "ghost", equals: "on" });
    expect(isConfigFieldVisible(a, [a], { ghost: "on" })).toBe(true);
    expect(isConfigFieldVisible(a, [a], {})).toBe(false);
  });

  /** Une option d'`order` s'évalue comme un champ : même règle, transitive comprise. */
  it("évalue une option d'order comme un champ", () => {
    const showSteps = field("showSteps", { field: "home", equals: "full" });
    const option = { name: "order:steps", visibleWhen: { field: "showSteps", equals: "true" } };
    const fields = [field("home"), showSteps];

    expect(isConfigFieldVisible(option, fields, { home: "full", showSteps: "true" })).toBe(true);
    expect(isConfigFieldVisible(option, fields, { home: "short", showSteps: "true" })).toBe(false);
  });
});
