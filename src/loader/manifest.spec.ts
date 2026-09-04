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
