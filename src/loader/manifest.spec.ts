import { invalidThemeSettings } from "../kinds/theme";
import { parseManifest } from "./manifest";

function themeManifest(theme: unknown) {
  return {
    id: "mon-theme",
    kind: "theme",
    name: "Mon thème",
    description: "",
    version: "1.0.0",
    engines: { host: "^0.1.0" },
    theme,
  };
}

describe("parseManifest — section theme", () => {
  it("lit tokens, polices et chemins", () => {
    const manifest = parseManifest(
      themeManifest({
        tokens: {
          colorScheme: "light",
          density: "compact",
          colors: { primary: "#a8531e" },
          radii: { sm: "2px" },
        },
        fonts: [{ family: "Kiosque", src: "kiosque.woff2", weight: "400" }],
        stylesheet: "assets/kiosque.css",
        assets: "assets",
      }),
      "extension.json",
    );

    expect(manifest.theme?.tokens?.colorScheme).toBe("light");
    expect(manifest.theme?.tokens?.density).toBe("compact");
    expect(manifest.theme?.tokens?.colors).toEqual({ primary: "#a8531e" });
    expect(manifest.theme?.fonts).toEqual([
      { family: "Kiosque", src: "kiosque.woff2", weight: "400" },
    ]);
    expect(manifest.theme?.stylesheet).toBe("assets/kiosque.css");
  });

  /**
   * `templates` figurait au contrat depuis le début sans être lu ici : un thème qui rangeait ses
   * gabarits ailleurs voyait sa déclaration ignorée en silence, et le noyau chercher dans
   * `templates/`. `script` naît avec le même traitement, et avec le même contrôle de confinement.
   */
  it("lit le dossier de gabarits et le script", () => {
    const manifest = parseManifest(
      themeManifest({ templates: "vues", script: "assets/kiosque.js" }),
      "extension.json",
    );

    expect(manifest.theme?.templates).toBe("vues");
    expect(manifest.theme?.script).toBe("assets/kiosque.js");
  });

  it("refuse un script qui sort du dossier du thème", () => {
    // Un script est la seule ressource d'un thème que le navigateur exécutera : le confinement
    // vaut au moins autant ici que pour une feuille de style.
    for (const bad of ["../../../etc/cron.d/x", "/tmp/payload.js", "https://ailleurs/x.js"]) {
      expect(() => parseManifest(themeManifest({ script: bad }), "extension.json")).toThrow(
        /chemin relatif/,
      );
    }
  });

  it("refuse une valeur de token qui sortirait de la balise <style>", () => {
    // Refusé **au chargement**, avec le nom du champ fautif : l'auteur l'apprend en déposant son
    // thème, et non en constatant que sa page se comporte étrangement en production.
    expect(() =>
      parseManifest(
        themeManifest({ tokens: { colors: { primary: "red</style><script>x</script>" } } }),
        "extension.json",
      ),
    ).toThrow(/theme\.tokens\.colors\.primary.*caractère interdit/s);
  });

  it("refuse un chemin qui sort du dossier du thème", () => {
    // Ce chemin serait relu à chaque requête par le noyau lui-même : ce n'est plus le thème qui
    // lit le fichier, c'est nous.
    for (const bad of ["../../.env", "/etc/passwd", "file:///etc/passwd"]) {
      expect(() => parseManifest(themeManifest({ stylesheet: bad }), "extension.json")).toThrow(
        /chemin relatif/,
      );
    }
  });

  it("refuse une police qu'aucun fichier ni aucune feuille ne charge", () => {
    // Sans src ni href, rien n'est émis : le thème paraîtrait « presque appliqué », les couleurs
    // changées et la typographie non — le plus long des défauts à diagnostiquer.
    expect(() =>
      parseManifest(themeManifest({ fonts: [{ family: "Fantôme" }] }), "extension.json"),
    ).toThrow(/"src".*ou "href"/);
  });

  it("refuse une section theme portée par un module à code", () => {
    // Son auteur croit que ses couleurs seront appliquées. Les ignorer en silence le laisserait
    // chercher longtemps du mauvais côté.
    expect(() =>
      parseManifest(
        {
          id: "acme-pay",
          kind: "payment",
          name: "Acme",
          version: "1.0.0",
          engines: { host: "^0.1.0" },
          entry: "index.js",
          theme: { tokens: { colors: { primary: "#fff" } } },
        },
        "extension.json",
      ),
    ).toThrow(/genre "payment" ne peut pas déclarer/);
  });

  it("conserve un token inconnu au lieu de refuser le thème", () => {
    // Refuser un token que cette version ne connaît pas empêcherait un thème d'être compatible
    // avec deux versions du noyau à la fois.
    const manifest = parseManifest(
      themeManifest({ tokens: { colors: { primary: "#fff", tertiaire: "#000" } } }),
      "extension.json",
    );

    expect(manifest.theme?.tokens?.colors).toEqual({ primary: "#fff", tertiaire: "#000" });
  });

  /**
   * Le groupe `layout` et le niveau `elevation` (tranche D) : un groupe absent de `TOKEN_GROUPS`
   * était ignoré à la lecture, et le thème qui le déclare n'en voyait aucun effet. Les listes
   * fermées viennent d'`ENUM_TOKENS`, pas d'une copie locale.
   */
  it("lit le groupe layout et le relief, et contrôle leurs listes fermées", () => {
    const manifest = parseManifest(
      themeManifest({
        tokens: {
          elevation: "raised",
          layout: { containerMax: "80rem", accountNav: "top" },
          typography: { lineHeight: "1.6", headingScale: "1.333" },
          colors: { link: "#0055aa" },
          radii: { button: "999px" },
        },
      }),
      "extension.json",
    );

    expect(manifest.theme?.tokens?.elevation).toBe("raised");
    expect(manifest.theme?.tokens?.layout).toEqual({ containerMax: "80rem", accountNav: "top" });
    expect(manifest.theme?.tokens?.typography).toEqual({ lineHeight: "1.6", headingScale: "1.333" });
    expect(() =>
      parseManifest(themeManifest({ tokens: { elevation: "relief" } }), "extension.json"),
    ).toThrow(/theme\.tokens\.elevation/);
    expect(() =>
      parseManifest(themeManifest({ tokens: { layout: { accountNav: "left" } } }), "extension.json"),
    ).toThrow(/theme\.tokens\.layout\.accountNav.*"sidebar" ou "top"/s);
    expect(() =>
      parseManifest(themeManifest({ tokensDark: { density: "dense" } }), "extension.json"),
    ).toThrow(/theme\.tokensDark\.density/);
  });

  /**
   * `theme.pages` a failli naître muet, comme `templates` avant lui : cette fonction ne recopie que
   * les champs qu'elle nomme, donc un champ ajouté au contrat et oublié ici disparaît sans un mot —
   * le manifeste est accepté, le thème se charge, et sa page n'existe simplement pas. Ces tests
   * sont là pour que le prochain champ ne repasse pas par là.
   */
  describe("pages déclarées par le thème", () => {
    it("conserve les pages et normalise leur slug", () => {
      const manifest = parseManifest(
        themeManifest({
          pages: [
            {
              slug: "  Nos-Garanties  ",
              title: "  Nos garanties  ",
              showInNav: true,
              navLabel: "Garanties",
              navOrder: 2,
              metaDescription: "Ce sur quoi nous nous engageons.",
              noindex: true,
            },
          ],
        }),
        "extension.json",
      );

      expect(manifest.theme?.pages).toEqual([
        {
          slug: "nos-garanties",
          title: "Nos garanties",
          showInNav: true,
          navLabel: "Garanties",
          navOrder: 2,
          metaDescription: "Ce sur quoi nous nous engageons.",
          noindex: true,
        },
      ]);
    });

    it("omet les champs facultatifs absents plutôt que de les mettre à false", () => {
      const manifest = parseManifest(
        themeManifest({ pages: [{ slug: "a-propos", title: "À propos" }] }),
        "extension.json",
      );

      expect(manifest.theme?.pages).toEqual([{ slug: "a-propos", title: "À propos" }]);
    });

    it("refuse une page sans slug ni titre", () => {
      expect(() =>
        parseManifest(themeManifest({ pages: [{ title: "Sans slug" }] }), "extension.json"),
      ).toThrow(/pages\[0\]\.slug/);
      expect(() =>
        parseManifest(themeManifest({ pages: [{ slug: "a-propos" }] }), "extension.json"),
      ).toThrow(/pages\[0\]\.title/);
    });

    /**
     * Un slug réservé ou en double n'est pas une erreur de manifeste : le thème se charge, ces
     * pages-là ne sont simplement pas servies. Éteindre un thème entier pour une page de trop
     * coûterait à l'hébergeur bien plus que ce que ça lui épargne — c'est `check-extension` qui
     * le dit à l'auteur, en clair et avant le dépôt.
     */
    it("accepte un slug réservé, que le service filtrera", () => {
      const manifest = parseManifest(
        themeManifest({ pages: [{ slug: "catalog", title: "Catalogue" }] }),
        "extension.json",
      );

      expect(manifest.theme?.pages).toEqual([{ slug: "catalog", title: "Catalogue" }]);
    });
  });

  it("lit la capture d'écran et refuse qu'elle sorte du dossier du thème", () => {
    const manifest = parseManifest(themeManifest({ screenshot: "screenshot.png" }), "extension.json");
    expect(manifest.theme?.screenshot).toBe("screenshot.png");

    expect(() =>
      parseManifest(themeManifest({ screenshot: "../../secret.png" }), "extension.json"),
    ).toThrow(/theme\.screenshot/);
  });

  /**
   * `parseSettings` recopie clé par clé : une clé oubliée ne lève rien, le réglage perd seulement
   * sa liaison et le thème « ne réagit pas ». D'où un test qui nomme chacune des clés de 0.29.0.
   */
  it("lit les clés de 0.29.0 sans en perdre une", () => {
    const manifest = parseManifest(
      themeManifest({
        settings: [
          { name: "primaire", label: "Couleur", type: "color", token: "colors.primary" },
          { name: "teinte", label: "Teinte", type: "color", cssVar: "--tt-tint" },
          { name: "primaireNuit", label: "Couleur (nuit)", type: "color", token: "colors.primary", scheme: "dark" },
          { name: "rayon", label: "Rayon", type: "number", min: 0, max: 32, step: 2, unit: "px" },
          {
            name: "blocs",
            label: "Ordre",
            type: "order",
            options: [
              { value: "a", label: "A", visibleWhen: { field: "rayon", equals: "8" } },
              { value: "b", label: "B" },
            ],
          },
          {
            name: "avis",
            label: "Avis",
            type: "list",
            maxItems: 6,
            fields: [{ name: "texte", label: "Texte", type: "textarea", localized: true }],
          },
          {
            name: "palette",
            label: "Palette",
            type: "select",
            visibleWhen: { field: "rayon", equals: "8" },
            options: [{ value: "nuit", label: "Nuit", sets: { primaire: "#111111" } }],
          },
        ],
      }),
      "extension.json",
    );

    const [primaire, teinte, primaireNuit, rayon, blocs, avis, palette] = manifest.theme?.settings ?? [];
    // Une clé oubliée ici ne lève rien : le réglage perd sa palette et repeint la mauvaise.
    expect(primaireNuit?.scheme).toBe("dark");
    expect(avis).toMatchObject({ type: "list", maxItems: 6 });
    expect(avis?.fields?.[0]).toMatchObject({ name: "texte", type: "textarea", localized: true });
    expect(primaire).toMatchObject({ type: "color", token: "colors.primary" });
    expect(teinte?.cssVar).toBe("--tt-tint");
    expect(rayon).toMatchObject({ min: 0, max: 32, step: 2, unit: "px" });
    expect(blocs?.type).toBe("order");
    expect(blocs?.options?.[0]?.visibleWhen).toEqual({ field: "rayon", equals: "8" });
    expect(palette?.visibleWhen).toEqual({ field: "rayon", equals: "8" });
    expect(palette?.options?.[0]?.sets).toEqual({ primaire: "#111111" });
  });

  it("lit un réglage image et sa longueur maximale", () => {
    const manifest = parseManifest(
      themeManifest({
        settings: [
          { name: "visuel", label: "Visuel", type: "image" },
          { name: "titre", label: "Titre", type: "text", maxLength: 80 },
        ],
      }),
      "extension.json",
    );

    expect(manifest.theme?.settings?.[0]?.type).toBe("image");
    expect(manifest.theme?.settings?.[1]?.maxLength).toBe(80);
  });

  it("laisse passer un manifeste de thème sans section theme", () => {
    const manifest = parseManifest(
      {
        id: "vide",
        kind: "theme",
        name: "Vide",
        version: "1.0.0",
        engines: { host: "^0.1.0" },
      },
      "extension.json",
    );

    expect(manifest.theme).toBeUndefined();
  });
});

describe("parseManifest — contrat 0.34.0 des réglages", () => {
  it("lit les trois opérateurs de condition et les tableaux, sur un champ comme sur une option", () => {
    const manifest = parseManifest(
      themeManifest({
        settings: [
          { name: "mode", label: "Mode", type: "select", options: [{ value: "a", label: "A" }] },
          { name: "egal", label: "Égal", type: "text", visibleWhen: { field: "mode", equals: true } },
          { name: "diff", label: "Différent", type: "text", visibleWhen: { field: "mode", notEquals: "a" } },
          { name: "parmi", label: "Parmi", type: "text", visibleWhen: { field: "mode", in: ["a", "b"] } },
          {
            name: "tous",
            label: "Tous",
            type: "text",
            visibleWhen: [{ field: "mode", equals: "a" }, { field: "diff", notEquals: "" }],
          },
          {
            name: "blocs",
            label: "Blocs",
            type: "order",
            options: [
              { value: "x", label: "X", visibleWhen: [{ field: "mode", in: ["a"] }] },
              { value: "y", label: "Y" },
            ],
          },
        ],
      }),
      "extension.json",
    );

    const [, egal, diff, parmi, tous, blocs] = manifest.theme?.settings ?? [];
    // Un booléen du JSON devient sa forme texte : le panel compare des chaînes.
    expect(egal?.visibleWhen).toEqual({ field: "mode", equals: "true" });
    expect(diff?.visibleWhen).toEqual({ field: "mode", notEquals: "a" });
    expect(parmi?.visibleWhen).toEqual({ field: "mode", in: ["a", "b"] });
    expect(tous?.visibleWhen).toEqual([
      { field: "mode", equals: "a" },
      { field: "diff", notEquals: "" },
    ]);
    expect(blocs?.options?.[0]?.visibleWhen).toEqual([{ field: "mode", in: ["a"] }]);
  });

  /**
   * Avant 0.34.0, une forme inconnue disparaissait sans un mot et le champ restait toujours
   * visible. Elle est toujours écartée — le thème se charge —, mais `invalidThemeSettings` la
   * restitue : c'est ce que lit `check-extension`.
   */
  it("écarte une condition mal formée sans refuser le thème, et la fait signaler", () => {
    const manifest = parseManifest(
      themeManifest({
        settings: [
          { name: "mode", label: "Mode", type: "text" },
          { name: "typo", label: "Typo", type: "text", visibleWhen: { field: "mode", notEqual: "a" } },
          { name: "deux", label: "Deux", type: "text", visibleWhen: { field: "mode", equals: "a", in: ["b"] } },
          {
            name: "mixte",
            label: "Mixte",
            type: "text",
            visibleWhen: [{ field: "mode", equals: "a" }, { field: "mode", in: "a" }],
          },
          {
            name: "blocs",
            label: "Blocs",
            type: "order",
            options: [
              { value: "x", label: "X", visibleWhen: { equals: "a" } },
              { value: "y", label: "Y" },
            ],
          },
        ],
      }),
      "extension.json",
    );

    const [, typo, deux, mixte, blocs] = manifest.theme?.settings ?? [];
    expect(typo?.visibleWhen).toBeUndefined();
    expect(deux?.visibleWhen).toBeUndefined();
    // Le reste d'un tableau survit : seule la condition fautive est écartée.
    expect(mixte?.visibleWhen).toEqual([{ field: "mode", equals: "a" }]);
    expect(blocs?.options?.[0]?.visibleWhen).toBeUndefined();

    const problems = invalidThemeSettings(manifest.theme?.settings).join("\n");
    expect(problems).toContain("réglage « typo » : condition « visibleWhen » ignorée — aucun opérateur");
    expect(problems).toContain("réglage « deux » : condition « visibleWhen » ignorée — un seul opérateur");
    expect(problems).toContain("réglage « mixte » : condition « visibleWhen » ignorée — « in » attend un tableau");
    expect(problems).toContain(
      "réglage « blocs », option « x » : condition « visibleWhen » ignorée — « field » manquant",
    );
  });

  it("lit subgroup, block, settingGroups et settingsLocale", () => {
    const manifest = parseManifest(
      themeManifest({
        settingsLocale: "fr",
        settingGroups: [
          { name: "Accueil", description: " Le haut de la page. ", category: "content", previewPath: "/" },
          { name: "Couleurs", category: "appearance" },
        ],
        settings: [
          { name: "nuit", label: "Nuit", type: "color", group: "Couleurs", subgroup: " Mode sombre " },
          {
            name: "ordre",
            label: "Ordre",
            type: "order",
            group: "Accueil",
            options: [
              { value: "hero", label: "Hero" },
              { value: "steps", label: "Étapes" },
            ],
          },
          { name: "titreEtapes", label: "Titre", type: "text", group: "Accueil", block: "steps" },
        ],
      }),
      "extension.json",
    );

    const theme = manifest.theme;
    expect(theme?.settingsLocale).toBe("fr");
    expect(theme?.settingGroups).toEqual([
      { name: "Accueil", description: "Le haut de la page.", category: "content", previewPath: "/" },
      { name: "Couleurs", category: "appearance" },
    ]);
    expect(theme?.settings?.[0]?.subgroup).toBe("Mode sombre");
    expect(theme?.settings?.[2]?.block).toBe("steps");
    expect(invalidThemeSettings(theme?.settings, theme)).toEqual([]);
  });

  it("lit le type link, format et les textes d'une section", () => {
    const manifest = parseManifest(
      themeManifest({
        settingGroups: [{ name: "Accueil", texts: ["heroTitle", 3, "heroLead"] }],
        settings: [
          { name: "cta", label: "Bouton", type: "link", group: "Accueil", defaultValue: "/catalog" },
          { name: "corps", label: "Corps", type: "textarea", group: "Accueil", format: "markdown" },
          {
            name: "liens",
            label: "Liens",
            type: "list",
            group: "Accueil",
            fields: [{ name: "href", label: "Lien", type: "link" }],
          },
        ],
      }),
      "extension.json",
    );
    const theme = manifest.theme;
    expect(theme?.settingGroups).toEqual([{ name: "Accueil", texts: ["heroTitle", "heroLead"] }]);
    expect(theme?.settings?.[0]?.type).toBe("link");
    expect(theme?.settings?.[1]?.format).toBe("markdown");
    expect(theme?.settings?.[2]?.fields?.[0]?.type).toBe("link");
    expect(invalidThemeSettings(theme?.settings, theme)).toEqual([]);
  });

  it("refuse une section sans nom, ou une liste de sections qui n'est pas un tableau", () => {
    expect(() =>
      parseManifest(themeManifest({ settingGroups: [{ description: "x" }] }), "extension.json"),
    ).toThrow(/settingGroups\[0\]\.name/);
    expect(() =>
      parseManifest(themeManifest({ settingGroups: "Accueil" }), "extension.json"),
    ).toThrow(/settingGroups" doit être un tableau/);
  });
});
