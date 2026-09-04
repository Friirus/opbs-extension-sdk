import {
  invalidContributedPages,
  modulePageHref,
  modulePageThemeTemplatePath,
  resolveContributedLabel,
  type ContributedPage,
} from "./ui";

function page(overrides: Partial<ContributedPage> = {}): ContributedPage {
  return {
    id: "unlock",
    label: "Déblocage",
    area: "customer",
    sections: [{ type: "actions", title: "Actions", actions: [{ id: "run", label: "Débloquer" }] }],
    ...overrides,
  };
}

describe("resolveContributedLabel", () => {
  it("rend la chaîne telle quelle quand le module n'a qu'une langue", () => {
    expect(resolveContributedLabel("Déblocage", "en")).toBe("Déblocage");
  });

  it("choisit la langue demandée", () => {
    expect(resolveContributedLabel({ fr: "Déblocage", en: "Unlock" }, "en")).toBe("Unlock");
  });

  /**
   * Le repli est le point : un module anglophone n'a pas à écrire du français pour être
   * installable. Rendre une chaîne vide donnerait un lien de nav invisible, sans que rien ne dise
   * d'où vient le trou.
   */
  it("retombe sur la première langue déclarée plutôt que sur du vide", () => {
    expect(resolveContributedLabel({ en: "Unlock" }, "fr")).toBe("Unlock");
    expect(resolveContributedLabel({ fr: "   ", en: "Unlock" }, "fr")).toBe("Unlock");
  });
});

describe("modulePageHref", () => {
  it("préfixe par la zone, jamais par le module", () => {
    expect(modulePageHref("ip-unlock", page())).toBe("/m/ip-unlock/unlock");
    expect(modulePageHref("ip-unlock", page({ area: "public" }))).toBe("/x/ip-unlock/unlock");
  });
});

describe("modulePageThemeTemplatePath", () => {
  it("range le gabarit de surcharge sous le module", () => {
    expect(modulePageThemeTemplatePath("ip-unlock", "unlock")).toBe(
      "templates/modules/ip-unlock/unlock.liquid",
    );
    expect(modulePageThemeTemplatePath("ip-unlock", "unlock", "views")).toBe(
      "views/modules/ip-unlock/unlock.liquid",
    );
  });
});

describe("invalidContributedPages", () => {
  it("accepte une page bien formée", () => {
    expect(invalidContributedPages([page()])).toEqual([]);
  });

  it("accepte l'absence de pages", () => {
    expect(invalidContributedPages(undefined)).toEqual([]);
    expect(invalidContributedPages([])).toEqual([]);
  });

  it("refuse un identifiant qui ne tiendrait pas dans une URL", () => {
    expect(invalidContributedPages([page({ id: "Mon Écran" })])[0]).toContain("identifiant invalide");
  });

  it("refuse deux pages de même identifiant", () => {
    expect(invalidContributedPages([page(), page()])[0]).toContain("déclarée deux fois");
  });

  it("refuse une zone inconnue", () => {
    expect(
      invalidContributedPages([page({ area: "admin" as ContributedPage["area"] })])[0],
    ).toContain("zone inconnue");
  });

  it("refuse un libellé vide, qui donnerait un lien qu'on ne peut pas cliquer", () => {
    expect(invalidContributedPages([page({ label: { fr: "  " } })])[0]).toContain(
      "libellé manquant",
    );
  });

  /**
   * Le défaut que rien ne signale : la page se charge, répond 200, et n'affiche rien. Sans ce
   * contrôle, l'auteur cherche du côté du thème.
   */
  it("refuse une page qui n'a ni gabarit ni sections", () => {
    expect(invalidContributedPages([page({ sections: [] })])[0]).toContain("ni gabarit ni sections");
    expect(invalidContributedPages([page({ sections: undefined })])[0]).toContain(
      "ni gabarit ni sections",
    );
  });

  it("signale un gabarit déclaré mais absent du dossier", () => {
    const problems = invalidContributedPages(
      [page({ template: "templates/unlock.liquid", sections: undefined })],
      () => false,
    );
    expect(problems[0]).toContain("templates/unlock.liquid absent");
  });

  it("accepte un gabarit présent, sans exiger de sections", () => {
    expect(
      invalidContributedPages(
        [page({ template: "templates/unlock.liquid", sections: undefined })],
        (path) => path === "templates/unlock.liquid",
      ),
    ).toEqual([]);
  });

  /**
   * Refusé et non ignoré : un auteur qui écrit `cacheSeconds` croit sa page mise en cache. Le
   * silence le laisserait dimensionner son module pour un cache qui n'existe pas — et si le noyau
   * l'honorait, ce serait les données d'un client servies à un autre.
   */
  it("refuse un cache sur une page dont le contenu dépend du visiteur", () => {
    expect(invalidContributedPages([page({ cacheSeconds: 60 })])[0]).toContain(
      "cacheSeconds est refusé en zone client",
    );
    expect(invalidContributedPages([page({ area: "public", cacheSeconds: 60 })])).toEqual([]);
  });
});
