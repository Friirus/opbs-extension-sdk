import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectThemeTemplates } from "./islands";

/** Un thème sur disque : ces contrôles lisent des fichiers, pas une chaîne passée en argument. */
function themeWith(templates: Record<string, string>, templatesDir = "templates"): string {
  const root = mkdtempSync(join(tmpdir(), "theme-islands-"));
  for (const [relative, content] of Object.entries(templates)) {
    const full = join(root, templatesDir, relative);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe("inspectThemeTemplates", () => {
  it("ne rapporte rien pour un thème sans gabarit", () => {
    expect(inspectThemeTemplates(mkdtempSync(join(tmpdir(), "theme-vide-")))).toEqual([]);
  });

  it("relève l'îlot obligatoire absent d'un gabarit de vue", () => {
    const root = themeWith({ "pages/catalog.liquid": "<h1>Nos offres</h1>" });

    const [finding] = inspectThemeTemplates(root);

    expect(finding?.templatePath).toBe("templates/pages/catalog.liquid");
    expect(finding?.view?.name).toBe("catalog");
    expect(finding?.missingIslands).toEqual(["order-button"]);
  });

  it("ne relève rien quand le gabarit place l'îlot", () => {
    const root = themeWith({
      "pages/catalog.liquid": '<div data-island="order-button" data-product="{{ p.id }}"></div>',
    });

    expect(inspectThemeTemplates(root)[0]?.missingIslands).toEqual([]);
  });

  /**
   * L'enveloppe n'est pas une vue — elle n'a donc aucun îlot obligatoire — mais elle peut en
   * porter, et une faute de frappe y laisserait le même emplacement vide qu'ailleurs.
   */
  it("inspecte aussi l'enveloppe, sans rien lui imposer", () => {
    const root = themeWith({
      "partials/header.liquid": '<div data-island="langue-switcher"></div>',
    });

    const [finding] = inspectThemeTemplates(root);

    expect(finding?.templatePath).toBe("templates/partials/header.liquid");
    expect(finding?.view).toBeNull();
    expect(finding?.missingIslands).toEqual([]);
    expect(finding?.unknownIslands).toEqual(["langue-switcher"]);
  });

  /**
   * Le chemin d'un `{% render %}` part de la racine du thème, pas du gabarit qui l'écrit. En
   * relatif — le réflexe de qui vient de Jekyll —, LiquidJS lève un `ENOENT` : le noyau retombe
   * sur son écran React et la page reste présentable, sans qu'une seule ligne du thème ne
   * s'affiche. C'est arrivé sur un thème d'exemple de ce dépôt, et `check-extension` répondait
   * « OK » pendant que la vitrine entière était revenue au rendu d'origine.
   */
  it("relève un partial dont le chemin ne part pas de la racine du thème", () => {
    const root = themeWith({
      "pages/home.liquid": '{% render "partials/icon", name: "server" %}',
      "partials/icon.liquid": "<svg></svg>",
    });

    expect(inspectThemeTemplates(root)[0]?.missingPartials).toEqual(["partials/icon"]);
  });

  it("ne relève rien quand le chemin est correct, avec ou sans extension", () => {
    const root = themeWith({
      "pages/home.liquid":
        '{% render "templates/partials/icon" %}{% include "templates/partials/icon.liquid" %}',
      "partials/icon.liquid": "<svg></svg>",
    });

    expect(inspectThemeTemplates(root)[0]?.missingPartials).toEqual([]);
  });

  /** Une cible calculée sort d'un contrôle statique : la signaler produirait une fausse alerte. */
  it("ignore un render dont la cible est une variable", () => {
    const root = themeWith({ "pages/home.liquid": "{% render page.template %}" });

    expect(inspectThemeTemplates(root)[0]?.missingPartials).toEqual([]);
  });

  it("signale un gabarit qui ne correspond à aucune vue", () => {
    const root = themeWith({ "pages/blogue.liquid": "<h1>Actualités</h1>" });

    expect(inspectThemeTemplates(root)[0]?.view).toBeNull();
  });

  it("suit le dossier de gabarits déclaré par le thème", () => {
    const root = themeWith({ "pages/cart.liquid": "<h1>Panier</h1>" }, "vues");

    const findings = inspectThemeTemplates(root, "vues");

    expect(findings[0]?.templatePath).toBe("vues/pages/cart.liquid");
    expect(findings[0]?.missingIslands).toEqual(["cart"]);
  });
});
