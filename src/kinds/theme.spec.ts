import {
  DEFAULT_THEME_TOKENS,
  invalidThemePages,
  THEME_ISLANDS,
  THEME_VIEWS,
  THEME_VIEW_NAMES,
  isSafeTokenValue,
  mergeThemeTokens,
  missingRequiredIslands,
  themeIslandSpec,
  unknownIslands,
  type PartialThemeTokens,
} from "./theme";

describe("isSafeTokenValue", () => {
  it("accepte ce dont une vraie déclaration a besoin", () => {
    // Une pile de polices porte guillemets, virgules et espaces. Les refuser rendrait le contrat
    // inutilisable pour le seul token que tout thème redéfinit.
    expect(isSafeTokenValue('"Space Grotesk", system-ui, sans-serif')).toBe(true);
    expect(isSafeTokenValue("#6d28d9")).toBe(true);
    expect(isSafeTokenValue("color-mix(in srgb, #fff 20%, transparent)")).toBe(true);
    expect(isSafeTokenValue("0.625rem")).toBe(true);
  });

  it("refuse ce qui sortirait de la balise <style>", () => {
    // Le cas qui compte : ces valeurs sont interpolées côté serveur dans un <style>. La seconde
    // source de ces valeurs est le formulaire de marque du panel — donc un membre du staff, qui
    // n'a pas à pouvoir injecter du script dans l'espace client.
    expect(isSafeTokenValue("red</style><script>alert(1)</script>")).toBe(false);
    expect(isSafeTokenValue("red; position: fixed")).toBe(false);
    expect(isSafeTokenValue("red } body { display: none")).toBe(false);
    expect(isSafeTokenValue("red\n}")).toBe(false);
  });
});

describe("mergeThemeTokens", () => {
  it("ne perd pas les couleurs qu'un thème ne redéfinit pas", () => {
    // Une fusion superficielle effacerait les neuf autres couleurs sur une déclaration
    // parfaitement légitime, et l'interface deviendrait illisible.
    const merged = mergeThemeTokens(DEFAULT_THEME_TOKENS, { colors: { primary: "#ff0000" } });

    expect(merged.colors.primary).toBe("#ff0000");
    expect(merged.colors.text).toBe(DEFAULT_THEME_TOKENS.colors.text);
    expect(merged.colors.danger).toBe(DEFAULT_THEME_TOKENS.colors.danger);
    expect(merged.radii).toEqual(DEFAULT_THEME_TOKENS.radii);
  });

  it("ignore une valeur vide au lieu d'en faire un `undefined` en CSS", () => {
    // Le cas survient dès qu'une couche vient d'un JSON où le champ existe mais n'a pas été rempli.
    const merged = mergeThemeTokens(DEFAULT_THEME_TOKENS, {
      colors: { primary: "", accent: undefined },
    } as PartialThemeTokens);

    expect(merged.colors.primary).toBe(DEFAULT_THEME_TOKENS.colors.primary);
    expect(merged.colors.accent).toBe(DEFAULT_THEME_TOKENS.colors.accent);
  });

  it("empile les couches dans l'ordre, la dernière l'emportant", () => {
    // C'est l'ordre réel : défauts du noyau, puis thème choisi, puis réglages de marque saisis.
    const theme = mergeThemeTokens(DEFAULT_THEME_TOKENS, {
      colorScheme: "light",
      colors: { primary: "#111111", bg: "#ffffff" },
    });
    const withBranding = mergeThemeTokens(theme, { colors: { primary: "#222222" } });

    expect(withBranding.colors.primary).toBe("#222222");
    expect(withBranding.colors.bg).toBe("#ffffff");
    expect(withBranding.colorScheme).toBe("light");
  });

  it("rend la base inchangée quand rien ne la surcharge", () => {
    expect(mergeThemeTokens(DEFAULT_THEME_TOKENS, undefined)).toEqual(DEFAULT_THEME_TOKENS);
  });
});

/**
 * Les îlots sont la moitié du système de thèmes qui rend l'autre possible : un gabarit place, le
 * noyau monte. Ce qui suit vérifie le contrôle qu'un auteur de thème verra dans
 * `pnpm check-extension`, pas le montage lui-même (qui vit dans le portail).
 */
describe("registre des vues", () => {
  it("ne nomme que des îlots qui existent", () => {
    for (const view of THEME_VIEWS) {
      for (const island of view.requiredIslands) {
        expect(themeIslandSpec(island)).toBeDefined();
      }
    }
  });

  it("ne déclare pas deux fois le même nom", () => {
    expect(new Set(THEME_VIEW_NAMES).size).toBe(THEME_VIEW_NAMES.length);
    const islands = THEME_ISLANDS.map((island) => island.name);
    expect(new Set(islands).size).toBe(islands.length);
  });

  it("ignore une vue inconnue plutôt que de prétendre qu'il lui manque quelque chose", () => {
    expect(missingRequiredIslands("<div></div>", "vue-inventee")).toEqual([]);
  });
});

describe("missingRequiredIslands", () => {
  it("signale l'îlot dont l'absence rend une page muette", () => {
    // Un catalogue sans bouton de commande s'affiche parfaitement et ne vend rien : c'est le seul
    // défaut de ce système qu'une relecture visuelle ne rattrape pas.
    expect(missingRequiredIslands("<h1>Nos offres</h1>", "catalog")).toEqual(["order-button"]);
  });

  it("accepte un gabarit qui place l'îlot, où qu'il soit dans la page", () => {
    const template =
      '{% for p in section.products %}<div data-island="order-button" data-product="{{ p.id }}"></div>{% endfor %}';

    expect(missingRequiredIslands(template, "catalog")).toEqual([]);
  });

  /**
   * Contrôle sur la source, jamais sur le rendu : un `{% for %}` ne produit rien pour un catalogue
   * vide, et un contrôle au rendu serait donc faussement alarmant sur une instance neuve —
   * exactement le moment où l'auteur d'un thème le lance pour la première fois.
   */
  it("ne dépend pas de ce que les boucles produiraient", () => {
    expect(
      missingRequiredIslands('{% if false %}<div data-island="cart"></div>{% endif %}', "cart"),
    ).toEqual([]);
  });
});

describe("unknownIslands", () => {
  it("attrape la faute de frappe qui laisserait un emplacement vide", () => {
    expect(unknownIslands('<div data-island="order-buton"></div>')).toEqual(["order-buton"]);
  });

  it("ne signale rien quand tous les noms existent", () => {
    expect(
      unknownIslands('<div data-island="cart"></div><span data-island="language-switcher"></span>'),
    ).toEqual([]);
  });

  /**
   * Le gabarit générique des pages de contenu ne peut pas écrire un nom en clair : il rend des
   * blocs saisis au panel après la publication du thème. Le signaler comme inconnu apprendrait à
   * l'auteur à ignorer les erreurs de `check-extension`.
   */
  it("ignore un nom d'îlot calculé par le gabarit", () => {
    expect(unknownIslands('<div data-island="{{ block.island }}"></div>')).toEqual([]);
    expect(
      unknownIslands('<div data-island="{% if x %}cart{% endif %}"></div>'),
    ).toEqual([]);
  });

  it("attrape toujours une faute de frappe à côté d'un nom calculé", () => {
    expect(
      unknownIslands('<div data-island="{{ block.island }}"></div><i data-island="cart-panel"></i>'),
    ).toEqual(["cart-panel"]);
  });
});

describe("missingRequiredIslands face à un nom calculé", () => {
  it("n'accepte pas un nom calculé comme preuve qu'un îlot obligatoire est placé", () => {
    // Asymétrie volontaire avec `unknownIslands` : un nom qu'on ne sait pas résoudre ne peut pas
    // *démontrer* que le bouton de commande est bien là.
    expect(missingRequiredIslands('<div data-island="{{ block.island }}"></div>', "catalog")).toEqual(
      ["order-button"],
    );
  });
});

/**
 * Les trois façons de livrer un thème qui paraît complet et dont une page ne s'affichera jamais.
 * Aucune ne se voit au rendu, et c'est pour ça que ce contrôle existe.
 */
describe("invalidThemePages", () => {
  const present = () => true;

  it("ne reproche rien à une déclaration correcte", () => {
    expect(
      invalidThemePages([{ slug: "nos-garanties", title: "Nos garanties" }], present),
    ).toEqual([]);
  });

  it("refuse un slug que le portail possède déjà", () => {
    // `/catalog` est une route statique du noyau : en App Router elle gagne toujours sur
    // l'attrape-tout, donc cette page ne s'afficherait jamais — sans le moindre message.
    const problems = invalidThemePages([{ slug: "catalog", title: "Catalogue" }], present);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/appartient au portail/);
  });

  it("refuse un slug mal formé", () => {
    expect(invalidThemePages([{ slug: "Nos Garanties", title: "x" }], present)[0]).toMatch(
      /slug invalide/,
    );
    expect(invalidThemePages([{ slug: "-a-", title: "x" }], present)[0]).toMatch(/slug invalide/);
  });

  it("refuse deux fois le même slug", () => {
    const problems = invalidThemePages(
      [
        { slug: "offres", title: "Offres" },
        { slug: "offres", title: "Offres bis" },
      ],
      present,
    );

    expect(problems).toEqual([expect.stringMatching(/déclarée deux fois/)]);
  });

  it("signale un gabarit absent, au chemin exact où il est attendu", () => {
    const problems = invalidThemePages([{ slug: "offres", title: "Offres" }], () => false);

    expect(problems).toEqual([expect.stringContaining("templates/custom/offres.liquid")]);
  });

  it("suit le dossier de gabarits déclaré par le thème", () => {
    const looked: string[] = [];
    invalidThemePages(
      [{ slug: "offres", title: "Offres" }],
      (path) => {
        looked.push(path);
        return true;
      },
      "vues",
    );

    expect(looked).toEqual(["vues/custom/offres.liquid"]);
  });

  it("ne vérifie aucun gabarit quand on ne lui donne pas de quoi regarder", () => {
    // Le contrôle de forme doit rester utilisable sur le seul manifeste, sans disque.
    expect(invalidThemePages([{ slug: "offres", title: "Offres" }])).toEqual([]);
  });
});
