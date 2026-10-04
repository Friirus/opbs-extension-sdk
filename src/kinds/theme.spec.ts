import {
  DEFAULT_THEME_TOKENS,
  invalidThemePages,
  invalidThemeSettings,
  themeSettingStyle,
  themeSettingEditable,
  themeSettingValues,
  isHexColor,
  THEME_ISLANDS,
  THEME_VIEWS,
  THEME_VIEW_NAMES,
  isSafeSettingUrl,
  isSafeThemeFont,
  isSafeUploadedFontFamily,
  isAllowedFontValue,
  uploadedFontFaces,
  isSafeTokenValue,
  mergeThemeTokens,
  missingRequiredIslands,
  themeIslandSpec,
  unknownIslands,
  isThemePreviewPath,
  themePanelStrings,
  themeSettingWarnings,
  themeTranslationReads,
  THEME_ACCOUNT_PREVIEW_PATHS,
  THEME_PREVIEW_PATHS,
  unknownThemeTokenPaths,
  type PartialThemeTokens,
} from "./theme";
import {
  THEME_RESERVED_SETTING_KEYS,
  type ConfigField,
  type ConfigFieldCondition,
} from "../config-fields";
import type { SupportedLocale } from "../locale";

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
    // Le cas qui compte : ces valeurs sont interpolées côté serveur dans un <style>. Hors du thème
    // lui-même, elles viennent des réglages du thème saisis au panel et de la marque d'un
    // revendeur — donc d'un membre du staff ou d'un revendeur, qui n'ont pas à pouvoir injecter du
    // script dans l'espace client.
    expect(isSafeTokenValue("red</style><script>alert(1)</script>")).toBe(false);
    expect(isSafeTokenValue("red; position: fixed")).toBe(false);
    expect(isSafeTokenValue("red } body { display: none")).toBe(false);
    expect(isSafeTokenValue("red\n}")).toBe(false);
  });

  it("accepte les valeurs des thèmes livrés, de leurs réglages et de la marque d'un revendeur", () => {
    // Ce que les thèmes existants, leurs réglages et le formulaire de marque d'un revendeur
    // écrivent vraiment : le contrôle ne doit rien leur retirer en se durcissant.
    for (const value of [
      '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
      "'Fraunces', Georgia, serif",
      "Inter, system-ui, sans-serif",
      "#0b0b10",
      "#fff",
      "rgb(15 23 42 / 0.6)",
      "hsl(262 83% 58%)",
      "color-mix(in oklab, var(--brand-color-primary) 12%, transparent)",
      "calc(var(--radius-md) * 2)",
      "clamp(1rem, 0.9rem + 0.5vw, 1.25rem)",
      "var(--brand-color-surface, #16161d)",
      "999px",
      "light dark",
      // Un nom qui contient « src » ou « image » sans être la fonction.
      '"Source Serif 4", serif',
      '"Imagery Sans", sans-serif',
    ]) {
      expect(isSafeTokenValue(value)).toBe(true);
    }
  });

  it.each([
    ["url(https://tiers.test/pixel.png)"],
    ["URL(https://tiers.test/pixel.png)"],
    ["Url(//tiers.test/x)"],
    ["#fff url(https://tiers.test/x) no-repeat"],
    ["var(--x, url(https://tiers.test/x))"],
    ['image("https://tiers.test/x.png")'],
    ['image-set("https://tiers.test/x.png" 1x)'],
    ['-webkit-image-set("https://tiers.test/x.png" 1x)'],
    ['IMAGE-SET("https://tiers.test/x.png" 1x)'],
    ["cross-fade(url(a.png), url(b.png), 50%)"],
    ['-webkit-cross-fade("a.png", "b.png", 50%)'],
    ["element(#cible)"],
    ["-moz-element(#cible)"],
    ['src("https://tiers.test/x.png")'],
    ["expression(alert(1))"],
    ["EXPRESSION(alert(1))"],
    ["@import"],
    ['red @import "https://tiers.test/x.css"'],
    ["u\\72l(https://tiers.test/x)"],
  ])("refuse %s, qui ferait charger une ressource ou sortirait de la valeur", (value) => {
    // Une couleur saisie par un revendeur ou un membre du staff finit en fond sur toutes les
    // pages : une adresse qu'elle contient serait chargée par chaque visiteur, sans consentement.
    expect(isSafeTokenValue(value)).toBe(false);
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
    // C'est l'ordre réel : défauts du noyau, puis thème choisi (ses tokens, puis ses réglages
    // publiés), puis la marque d'un revendeur.
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

  /**
   * `headingFamily` a un défaut littéral (Inter) alors que le contrat le dit dérivé de
   * `fontFamily`. Sans la dérivation, un thème qui ne déclare que sa police du texte garde des
   * titres en Inter — le thème paraît « presque appliqué », sur les titres seulement.
   */
  describe("police des titres", () => {
    const grotesk = '"Space Grotesk", system-ui, sans-serif';
    const serif = '"IBM Plex Serif", Georgia, serif';

    it("suit la police du texte quand le thème ne distingue pas ses titres", () => {
      const merged = mergeThemeTokens(DEFAULT_THEME_TOKENS, { typography: { fontFamily: grotesk } });

      expect(merged.typography.headingFamily).toBe(grotesk);
    });

    it("garde la police de titres qu'un thème déclare", () => {
      const merged = mergeThemeTokens(DEFAULT_THEME_TOKENS, {
        typography: { fontFamily: grotesk, headingFamily: serif },
      });

      expect(merged.typography.headingFamily).toBe(serif);
    });

    it("ne laisse pas une marque posée par-dessus écraser des titres distincts", () => {
      // Le cas d'Encre : titres en Plex Serif, texte en Plex Sans. Une police du texte saisie par
      // l'hébergeur ou un revendeur change le texte, pas le choix de titre du thème.
      const theme = mergeThemeTokens(DEFAULT_THEME_TOKENS, {
        typography: { fontFamily: grotesk, headingFamily: serif },
      });
      const branded = mergeThemeTokens(theme, { typography: { fontFamily: "Roboto" } });

      expect(branded.typography.fontFamily).toBe("Roboto");
      expect(branded.typography.headingFamily).toBe(serif);
    });

    it("entraîne les titres avec la police de marque quand le thème ne les distingue pas", () => {
      // Le cas du thème Classique, qui recopie les défauts : texte et titres sur la même police.
      const theme = mergeThemeTokens(DEFAULT_THEME_TOKENS, { typography: DEFAULT_THEME_TOKENS.typography });
      const branded = mergeThemeTokens(theme, { typography: { fontFamily: "Roboto" } });

      expect(branded.typography.headingFamily).toBe("Roboto");
    });

    it("traite une police de titres vide comme absente", () => {
      const merged = mergeThemeTokens(DEFAULT_THEME_TOKENS, {
        typography: { fontFamily: grotesk, headingFamily: "" },
      });

      expect(merged.typography.headingFamily).toBe(grotesk);
    });
  });

  it("donne aux titres la graisse que le navigateur leur donnait déjà", () => {
    // `--brand-weight-heading` n'était lue nulle part : les titres s'affichaient en `bold` (700).
    // La brancher avec un défaut à 600 aurait allégé les titres de toutes les instances.
    expect(DEFAULT_THEME_TOKENS.typography.headingWeight).toBe("700");
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

/**
 * Un îlot qui est le seul chemin vers une fonction se place, il ne se retire pas. Le portail ne
 * rend plus l'écran React dès qu'un gabarit existe : un îlot oublié fait disparaître la fonction
 * pour tous les clients de l'instance. C'est ce qui est arrivé sous Argile, qui ne posait que
 * l'îlot exigé sur ces quatre vues (ni double authentification, ni résiliation, ni changement
 * d'offre) et passait pourtant `check-extension`.
 */
describe("îlots qui sont le seul chemin vers une fonction", () => {
  const required = (name: string) =>
    THEME_VIEWS.find((view) => view.name === name)?.requiredIslands;

  it("exige toutes les actions d'un service, résiliation et changement d'offre compris", () => {
    expect(required("service")).toEqual([
      "service-actions",
      "service-credentials",
      "service-reinstall",
      "service-snapshots",
      "service-backups",
      "service-reverse-dns",
      "service-plan-change",
      "service-addons",
      "service-monitoring",
      "service-early-renewal",
      "service-cancellation",
    ]);
  });

  it("exige toute la sécurité du compte, pas seulement le mot de passe", () => {
    expect(required("account-security")).toEqual([
      "account-change-password",
      "account-two-factor",
      "account-passkeys",
      "account-sso",
      "account-anti-phishing",
    ]);
  });

  it("exige la satisfaction d'un ticket et toute la gestion d'une zone", () => {
    expect(required("ticket")).toEqual(["ticket-reply", "ticket-satisfaction"]);
    expect(required("dns-zone")).toEqual([
      "dns-records-editor",
      "dns-use-host-ns",
      "dns-delete-zone",
    ]);
  });

  /**
   * L'invariant plutôt que la liste : un îlot ajouté plus tard à l'espace client doit être exigé
   * par une vue, ou ce test échoue. `logout` est la seule exception, et elle n'en est pas une :
   * il vit dans l'enveloppe, où le noyau pose son propre bouton quand le thème ne le place pas.
   */
  it("n'a aucun îlot de l'espace client qu'une vue puisse perdre, hors déconnexion", () => {
    const requiredSomewhere = new Set(THEME_VIEWS.flatMap((view) => view.requiredIslands));
    const orphans = THEME_ISLANDS.filter(
      (island) => island.area === "account" && !requiredSomewhere.has(island.name),
    ).map((island) => island.name);

    expect(orphans).toEqual(["logout"]);
  });

  it("refuse le gabarit d'un thème qui ne posait que l'ancien îlot obligatoire", () => {
    const passwordOnly = '<div data-island="account-change-password"></div>';

    expect(missingRequiredIslands(passwordOnly, "account-security")).toEqual([
      "account-two-factor",
      "account-passkeys",
      "account-sso",
      "account-anti-phishing",
    ]);
    expect(
      missingRequiredIslands('<div data-island="service-actions"></div>', "service"),
    ).toContain("service-cancellation");
  });

  /**
   * Un nom qui n'apparaît qu'en texte ne monte rien au portail : le citer dans un commentaire HTML
   * ou le fabriquer par le gabarit ne doit pas suffire à passer le contrôle.
   */
  it("ne se laisse pas satisfaire par un nom cité en texte ou calculé", () => {
    const template =
      '<div data-island="ticket-reply"></div>' +
      "<!-- ticket-satisfaction -->" +
      "<div data-island=\"{{ 'ticket-satisfaction' }}\"></div>";

    expect(missingRequiredIslands(template, "ticket")).toEqual(["ticket-satisfaction"]);
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

/**
 * Les réglages sont ce qui rend un thème modifiable sans SSH. Trois des règles ci-dessous
 * corrigent un piège précis, et chacune casse une page si elle est oubliée.
 */
describe("themeSettingValues", () => {
  const fields = [
    { name: "titre", label: "Titre", type: "text" as const, required: false, defaultValue: "Par défaut" },
    { name: "actif", label: "Actif", type: "boolean" as const, required: false, defaultValue: "true" },
    { name: "eteint", label: "Éteint", type: "boolean" as const, required: false, defaultValue: "false" },
    { name: "taille", label: "Taille", type: "number" as const, required: false, defaultValue: "3" },
  ];

  it("applique le défaut déclaré quand rien n'est saisi", () => {
    expect(themeSettingValues(fields, null)).toEqual({
      titre: "Par défaut",
      actif: true,
      eteint: false,
      taille: 3,
    });
  });

  /**
   * Un formulaire HTML envoie la chaîne « false », qui est **vraie** en Liquid comme en
   * JavaScript : sans cette conversion, décocher une case allumerait la section.
   */
  it("convertit les booléens envoyés en chaîne par un formulaire", () => {
    const values = themeSettingValues(fields, { actif: "false", eteint: "true" });

    expect(values.actif).toBe(false);
    expect(values.eteint).toBe(true);
  });

  /** Un champ vidé revient au texte d'origine du thème, il ne laisse pas un trou dans la page. */
  it("retombe sur le défaut quand la valeur saisie est vide", () => {
    expect(themeSettingValues(fields, { titre: "   " }).titre).toBe("Par défaut");
  });

  /** Une valeur orpheline après mise à jour du thème ne doit pas ressortir dans un gabarit. */
  it("ignore une valeur stockée que le thème ne déclare plus", () => {
    expect(themeSettingValues(fields, { retire: "valeur" })).not.toHaveProperty("retire");
  });

  /**
   * Liquid échappe le HTML, pas le protocole : une adresse `javascript:` enregistrée avant que la
   * règle existe ne doit pas atteindre un `href`.
   */
  it("écarte une adresse dangereuse déjà stockée, et retombe sur le défaut", () => {
    const urls = [
      { name: "lien", label: "Lien", type: "url" as const, required: false, defaultValue: "/catalog" },
      { name: "visuel", label: "Visuel", type: "image" as const, required: false },
    ];

    const values = themeSettingValues(urls, {
      lien: "javascript:alert(1)",
      visuel: "data:image/svg+xml,<svg onload=alert(1)>",
    });

    expect(values).not.toHaveProperty("lien");
    expect(values).not.toHaveProperty("visuel");
    expect(themeSettingValues(urls, { visuel: "/api/v1/theme-media/x.png" }).visuel).toBe(
      "/api/v1/theme-media/x.png",
    );
  });

  it("rend un objet vide pour un thème sans réglage", () => {
    expect(themeSettingValues(undefined, { titre: "x" })).toEqual({});
  });
});

describe("invalidThemeSettings", () => {
  it("accepte une déclaration correcte", () => {
    expect(
      invalidThemeSettings([
        { name: "titre", label: "Titre", type: "text", required: false },
        { name: "cible", label: "Cible", type: "select", required: false, options: [{ value: "/a", label: "A" }] },
      ]),
    ).toEqual([]);
  });

  /** Un thème n'exécute aucun code : un secret y serait saisi pour rien, et lu par des gabarits. */
  it("refuse un champ de type password ou provider", () => {
    const problems = invalidThemeSettings([
      { name: "cle", label: "Clé", type: "password", required: false },
      { name: "cluster", label: "Cluster", type: "provider", required: false },
    ]);

    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("password");
    expect(problems[1]).toContain("provider");
  });

  it("refuse un nom illisible par un gabarit, un doublon, et un select sans option", () => {
    const problems = invalidThemeSettings([
      { name: "1er", label: "X", type: "text", required: false },
      { name: "dup", label: "A", type: "text", required: false },
      { name: "dup", label: "B", type: "text", required: false },
      { name: "vide", label: "C", type: "select", required: false },
    ]);

    expect(problems.join(" | ")).toMatch(/1er/);
    expect(problems.join(" | ")).toMatch(/deux fois/);
    expect(problems.join(" | ")).toMatch(/sans option/);
  });

  it("refuse un maxLength qui n'est pas un entier positif", () => {
    const problems = invalidThemeSettings([
      { name: "a", label: "A", type: "text", required: false, maxLength: 0 },
      { name: "b", label: "B", type: "text", required: false, maxLength: 2.5 },
      { name: "c", label: "C", type: "text", required: false, maxLength: 40 },
    ]);

    expect(problems).toHaveLength(2);
  });

  it("refuse une adresse par défaut qu'un gabarit ne pourrait pas écrire sans risque", () => {
    const problems = invalidThemeSettings([
      { name: "img", label: "Image", type: "image", required: false, defaultValue: "javascript:x" },
      { name: "lien", label: "Lien", type: "url", required: false, defaultValue: "https://exemple.fr" },
    ]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("img");
  });

  it("ne reproche rien à un thème qui n'en déclare aucun", () => {
    expect(invalidThemeSettings(undefined)).toEqual([]);
  });
});

describe("isSafeSettingUrl", () => {
  it.each(["https://exemple.fr/a.png", "http://exemple.fr", "/catalog", "/api/v1/theme-media/x.webp"])(
    "accepte %s",
    (url) => {
      expect(isSafeSettingUrl(url)).toBe(true);
    },
  );

  // `//hote` et `/\hote` sortent du site sous l'apparence d'un chemin.
  it.each(["javascript:alert(1)", "JAVASCRIPT:x", "data:text/html,x", "//ailleurs.fr", "/\\ailleurs.fr", "catalog", "https://a b"])(
    "refuse %s",
    (url) => {
      expect(isSafeSettingUrl(url)).toBe(false);
    },
  );

  /**
   * Le navigateur retire tabulations et sauts de ligne avant d'analyser une adresse, et lit `\`
   * comme `/` : chacun de ces chemins devenait `//evil.example`, une adresse hors du site.
   */
  it.each([
    ["/\t/evil.example/logo.png", "tabulation"],
    ["/\n/evil.example/logo.png", "saut de ligne"],
    ["/\r\n/evil.example", "retour chariot"],
    ["/\t\\evil.example", "tabulation puis barre oblique inverse"],
    ["/assets\\..\\x.png", "barre oblique inverse plus loin"],
    ["/mes documents/logo.png", "blanc dans le chemin"],
    ["/logo\u0000.png", "caractère nul"],
    ["/logo\u007f.png", "DEL"],
    ["https://exemple.fr/\tx", "tabulation dans une adresse absolue"],
    ["https://exemple.fr/\u0001", "caractère de contrôle dans une adresse absolue"],
  ])("refuse %j (%s)", (url) => {
    expect(isSafeSettingUrl(url)).toBe(false);
  });

  it("refuse précisément les chemins que l'analyseur d'URL fait sortir du site", () => {
    for (const url of ["/\t/evil.example/logo.png", "/\n/evil.example/logo.png", "/\t\\evil.example"]) {
      // La démonstration du contournement : ce que l'ancien contrôle laissait passer sort du site.
      expect(new URL(url, "https://opbs.test/").host).toBe("evil.example");
      expect(isSafeSettingUrl(url)).toBe(false);
    }
  });
});

/**
 * La liste blanche des polices vit ici pour deux lecteurs : `themeFontFaces` (`@opbs/ui`), qui
 * omet une police refusée, et `check-extension`, qui en avertit l'auteur.
 */
describe("isSafeThemeFont", () => {
  it.each([
    [{ family: "Figtree" }],
    [{ family: "IBM Plex Sans", weight: "400", style: "italic" as const }],
    [{ family: "'Fraunces'", weight: "100 900", display: "optional" as const }],
    [{ family: "Space_Grotesk-2", weight: "bold" }],
  ])("accepte %j", (font) => {
    expect(isSafeThemeFont(font)).toBe(true);
  });

  it.each([
    [{ family: "Libre Franklin 2.0" }, "un point dans la famille"],
    [{ family: "Crimson Text", weight: "semibold" }, "une graisse nommée hors CSS"],
    [{ family: "Figtree", weight: "300 600 900" }, "trois graisses"],
    [{ family: "Figtree", weight: "0" }, "une graisse nulle"],
    [{ family: "Figtree", weight: "1001" }, "une graisse au-delà de 1000"],
    [{ family: "x</style><script>alert(1)</script>" }, "une famille qui fermerait le <style>"],
    [{ family: "Éditoriale" }, "une lettre accentuée"],
    [{ family: "A".repeat(65) }, "une famille de 65 caractères"],
    [{ family: "Figtree", style: "oblique" as never }, "un style hors normal/italic"],
    [{ family: "Figtree", display: "instant" as never }, "un display inconnu"],
  ])("refuse %j (%s)", (font) => {
    expect(isSafeThemeFont(font)).toBe(false);
  });
});

describe("réglages liés à la feuille de style (0.29.0)", () => {
  const color = (extra: object = {}) => ({
    name: "colorPrimary",
    label: "Couleur principale",
    type: "color" as const,
    required: false,
    defaultValue: "#3f6350",
    token: "colors.primary",
    ...extra,
  });

  it("reconnaît un hexadécimal, et rien d'autre", () => {
    expect(isHexColor("#3f6350")).toBe(true);
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#3f635080")).toBe(false);
    expect(isHexColor("#fff;} body{display:none")).toBe(false);
  });

  it("remplace un token par la valeur du réglage, et laisse les autres tranquilles", () => {
    const fields = [color()];
    const style = themeSettingStyle(fields, themeSettingValues(fields, { colorPrimary: "#112233" }));
    expect(style.tokens).toEqual({ colors: { primary: "#112233" } });
    expect(style.cssVars).toEqual({});
  });

  it("écarte une couleur stockée qui n'en est pas une, au profit du défaut", () => {
    const fields = [color()];
    // `themeSettingValues` ne rend pas la valeur douteuse : la clé est absente, le token intact.
    const values = themeSettingValues(fields, { colorPrimary: "url(javascript:1)" });
    expect(values.colorPrimary).toBeUndefined();
    expect(themeSettingStyle(fields, values).tokens).toEqual({});
  });

  it("accole l'unité d'un nombre, et borne la valeur", () => {
    const fields = [
      {
        name: "radius",
        label: "Arrondi",
        type: "number" as const,
        required: false,
        defaultValue: "20",
        min: 0,
        max: 32,
        unit: "px" as const,
        token: "radii.md",
      },
    ];
    expect(themeSettingStyle(fields, themeSettingValues(fields, null)).tokens).toEqual({
      radii: { md: "20px" },
    });
    expect(themeSettingValues(fields, { radius: "400" }).radius).toBe(32);
  });

  it("pose une variable propre au thème, jamais une variable du noyau", () => {
    const fields = [
      color({ name: "tint", token: undefined, cssVar: "--ag-hero-tint" }),
      color({ name: "hijack", token: undefined, cssVar: "--brand-color-on-primary" }),
    ];
    const style = themeSettingStyle(fields, themeSettingValues(fields, null));
    expect(style.cssVars).toEqual({ "--ag-hero-tint": "#3f6350" });
    expect(invalidThemeSettings(fields).join("\n")).toContain("appartient au noyau");
  });

  it("rend un ordre toujours complet, sans doublon ni inconnu", () => {
    const fields = [
      {
        name: "blocks",
        label: "Ordre des blocs",
        type: "order" as const,
        required: false,
        defaultValue: "facts,families,steps",
        options: [
          { value: "facts", label: "Chiffres" },
          { value: "families", label: "Familles" },
          { value: "steps", label: "Déroulé" },
          { value: "closing", label: "Bandeau de fin" },
        ],
      },
    ];
    expect(themeSettingValues(fields, null).blocks).toBe("facts,families,steps,closing");
    expect(themeSettingValues(fields, { blocks: "steps,steps,inconnu,facts" }).blocks).toBe(
      "steps,facts,families,closing",
    );
    expect(invalidThemeSettings(fields)).toEqual([]);
  });

  it("revient au défaut quand l'option choisie n'existe plus", () => {
    const fields = [
      {
        name: "navStyle",
        label: "Barre",
        type: "select" as const,
        required: false,
        defaultValue: "pill",
        options: [
          { value: "pill", label: "Pilule" },
          { value: "bar", label: "Barre" },
        ],
      },
    ];
    expect(themeSettingValues(fields, { navStyle: "retirée" }).navStyle).toBe("pill");
  });

  it("dit en clair ce qui cloche dans une déclaration", () => {
    const problems = invalidThemeSettings([
      color({ name: "a", token: "colors.primaire" }),
      color({ name: "b", type: "text" }),
      color({ name: "c", defaultValue: "vert" }),
      { name: "d", label: "D", type: "number", required: false, token: "radii.md" },
      { name: "e", label: "E", type: "text", required: false, min: 2 },
      { name: "f", label: "F", type: "text", required: false, visibleWhen: { field: "absent", equals: "x" } },
      {
        name: "g",
        label: "G",
        type: "select",
        required: false,
        options: [{ value: "x", label: "X", sets: { absent: "1", c: "pas-une-couleur" } }],
      },
    ]).join("\n");
    expect(problems).toContain("token « colors.primaire » inconnu");
    expect(problems).toContain("attend un champ de type color");
    expect(problems).toContain("doit être un hexadécimal");
    expect(problems).toContain("doit déclarer son unité");
    expect(problems).toContain("réservé au type « number »");
    expect(problems).toContain("« visibleWhen » renvoie à « absent »");
    expect(problems).toContain("« sets » remplit « absent »");
    expect(problems).toContain("n'est pas une couleur hexadécimale");
  });
});

describe("listes et textes localisés (0.29.0)", () => {
  const reviews = {
    name: "reviews",
    label: "Avis",
    type: "list" as const,
    required: false,
    maxItems: 2,
    fields: [
      { name: "author", label: "Auteur", type: "text" as const, required: false },
      { name: "quote", label: "Citation", type: "textarea" as const, required: false, localized: true },
      { name: "avatar", label: "Photo", type: "image" as const, required: false },
      { name: "stars", label: "Étoiles", type: "number" as const, required: false, min: 1, max: 5 },
    ],
  };
  const title = {
    name: "title",
    label: "Titre",
    type: "text" as const,
    required: false,
    localized: true,
    defaultValue: "Défaut",
  };

  it("rend une liste d'objets résolus comme des champs, bornée à maxItems", () => {
    const stored = {
      reviews: JSON.stringify([
        { author: " Ana ", quote: { fr: "Très bien", en: "Great" }, avatar: "javascript:1", stars: "9" },
        { author: "Bo", quote: "Chaîne nue", stars: "3" },
        { author: "Trop", quote: "" },
      ]),
    };
    expect(themeSettingValues([reviews], stored, { locale: "en" }).reviews).toEqual([
      { author: "Ana", quote: "Great", stars: 5 },
      { author: "Bo", quote: "Chaîne nue", stars: 3 },
    ]);
    expect(themeSettingValues([reviews], { reviews: "pas du json" }).reviews).toEqual([]);
  });

  it("choisit la langue de la page, puis celle de l'instance, puis la première renseignée", () => {
    const stored = { title: JSON.stringify({ fr: "Bonjour", de: "Hallo" }) };
    expect(themeSettingValues([title], stored, { locale: "fr" }).title).toBe("Bonjour");
    expect(themeSettingValues([title], stored, { locale: "en", fallbackLocale: "fr" }).title).toBe("Bonjour");
    expect(themeSettingValues([title], stored, { locale: "en", fallbackLocale: "en" }).title).toBe("Bonjour");
    expect(themeSettingValues([title], { title: JSON.stringify({ fr: "  " }) }, { locale: "fr" }).title).toBe("Défaut");
    // Une chaîne nue, stockée avant la localisation, vaut pour toutes les langues.
    expect(themeSettingValues([title], { title: "Ancien" }, { locale: "de" }).title).toBe("Ancien");
  });

  it("rend au panel toutes les langues et tous les éléments, en chaînes", () => {
    const editable = themeSettingEditable([reviews, title], {
      reviews: JSON.stringify([{ author: "Ana", quote: { fr: "Bien" }, stars: 4 }]),
      title: "Ancien",
    });
    expect(JSON.parse(editable.reviews as string)).toEqual([
      { author: "Ana", quote: JSON.stringify({ fr: "Bien" }), avatar: "", stars: "4" },
    ]);
    expect(JSON.parse(editable.title as string)).toEqual({ "*": "Ancien" });
    expect(themeSettingEditable([reviews, title], null)).toEqual({ reviews: "[]", title: "" });
  });

  it("livre le contenu d'origine du thème, et respecte une liste vidée", () => {
    const steps = {
      name: "steps",
      label: "Étapes",
      type: "list" as const,
      required: false,
      defaultValue: JSON.stringify([{ title: "Vous choisissez" }, { title: "Vous réglez" }]),
      fields: [{ name: "title", label: "Titre", type: "text" as const, required: false }],
    };

    // Rien en base : le thème livre ses étapes.
    expect(themeSettingValues([steps], null).steps).toEqual([
      { title: "Vous choisissez" },
      { title: "Vous réglez" },
    ]);
    // Vidée par l'hébergeur : elle reste vide, sinon la section retirée reparaîtrait.
    expect(themeSettingValues([steps], { steps: "[]" }).steps).toEqual([]);
    expect(themeSettingValues([steps], { steps: '[{"title":"À moi"}]' }).steps).toEqual([
      { title: "À moi" },
    ]);
    // Le panel ouvre sur le contenu d'origine, modifiable.
    expect(JSON.parse(themeSettingEditable([steps], null).steps as string)).toEqual([
      { title: "Vous choisissez" },
      { title: "Vous réglez" },
    ]);
    expect(invalidThemeSettings([steps])).toEqual([]);
    expect(
      invalidThemeSettings([{ ...steps, defaultValue: '[{"inconnu":"x"}]' }]).join("\n"),
    ).toContain("n'est pas un sous-champ déclaré");
    expect(invalidThemeSettings([{ ...steps, defaultValue: "pas du json" }]).join("\n")).toContain(
      "tableau JSON d'éléments",
    );
  });

  it("dit ce qui cloche dans une liste", () => {
    const problems = invalidThemeSettings([
      { ...reviews, token: "colors.primary", fields: [
        { name: "inner", label: "I", type: "list", required: false },
        { name: "inner", label: "I2", type: "text", required: false, cssVar: "--x" },
        { name: "c", label: "C", type: "color", required: false, localized: true },
      ] },
      { name: "t", label: "T", type: "text", required: false, fields: [] },
      { name: "b", label: "B", type: "boolean", required: false, localized: true },
    ]).join("\n");
    expect(problems).toContain("ne se lie ni à un token");
    expect(problems).toContain("type « list » impossible dans un élément");
    expect(problems).toContain("déclaré deux fois");
    expect(problems).toContain("ni « token » ni « cssVar » dans un élément");
    expect(problems).toContain("« localized » n'a de sens que sur text ou textarea");
    expect(problems).toContain("réservés au type « list »");
  });
});

describe("conditions, sections, sous-groupes et blocs (0.34.0)", () => {
  const text = (name: string, extra: Partial<ConfigField> = {}): ConfigField => ({
    name,
    label: name,
    type: "text",
    required: false,
    ...extra,
  });
  const order = (name: string, group: string, values: string[]): ConfigField => ({
    name,
    label: name,
    type: "order",
    required: false,
    group,
    options: values.map((value) => ({ value, label: value })),
  });

  it("refuse les renvois inconnus et les auto-références, dans chaque branche d'un tableau", () => {
    const problems = invalidThemeSettings([
      text("mode"),
      text("a", { visibleWhen: [{ field: "mode", equals: "x" }, { field: "absent", in: ["y"] }] }),
      text("b", { visibleWhen: { field: "b", notEquals: "" } }),
      {
        ...order("blocs", "Accueil", ["x", "y"]),
        options: [
          { value: "x", label: "X", visibleWhen: { field: "blocs", equals: "x" } },
          { value: "y", label: "Y" },
        ],
      },
    ]).join("\n");

    expect(problems).toContain("réglage « a » : « visibleWhen » renvoie à « absent », qui n'est pas un autre réglage déclaré");
    expect(problems).toContain("réglage « b » : « visibleWhen » renvoie à « b » lui-même");
    expect(problems).toContain("réglage « blocs », option « x » : « visibleWhen » renvoie à « blocs » lui-même");
    expect(problems).not.toContain("« mode », qui n'est pas");
  });

  /** À toute profondeur, et une seule fois par boucle quel que soit le point d'entrée. */
  it("refuse une boucle de conditions, une fois", () => {
    const problems = invalidThemeSettings([
      text("a", { visibleWhen: { field: "b", equals: "1" } }),
      text("b", { visibleWhen: [{ field: "x", equals: "1" }, { field: "c", equals: "1" }] }),
      text("c", { visibleWhen: { field: "a", in: ["1"] } }),
      text("x"),
      text("chaine", { visibleWhen: { field: "a", equals: "1" } }),
    ]);

    const cycles = problems.filter((problem) => problem.includes("en boucle"));
    expect(cycles).toEqual([
      "réglages « a » → « b » → « c » → « a » : conditions « visibleWhen » en boucle — aucun ne s'afficherait",
    ]);
  });

  it("accepte une chaîne de conditions sans boucle", () => {
    expect(
      invalidThemeSettings([
        text("showClosing"),
        text("closingShowList", { visibleWhen: { field: "showClosing", equals: "true" } }),
        text("closingPoints", { visibleWhen: { field: "closingShowList", equals: "true" } }),
      ]),
    ).toEqual([]);
  });

  /** Un thème écrit en TypeScript peut forcer le type : la forme est rejugée à la validation. */
  it("signale une condition mal formée forcée au-delà du type", () => {
    const forced = { field: "mode", equals: "x", notEquals: "y" } as unknown as ConfigFieldCondition;
    const problems = invalidThemeSettings([text("mode"), text("a", { visibleWhen: forced })]);

    expect(problems.join("\n")).toContain("réglage « a » : condition « visibleWhen » ignorée — un seul opérateur");
  });

  it("juge subgroup et block", () => {
    const problems = invalidThemeSettings([
      order("ordre", "Accueil", ["hero", "steps"]),
      text("titre", { group: "Accueil", block: "steps" }),
      text("ailleurs", { group: "Pied", block: "steps" }),
      text("inconnu", { group: "Accueil", block: "faq" }),
      text("orphelin", { subgroup: "Mode sombre" }),
      text("lesDeux", { group: "Accueil", subgroup: "X", block: "hero" }),
      { ...order("ordre2", "Accueil", ["a", "b"]), subgroup: "Y" },
      {
        name: "avis",
        label: "Avis",
        type: "list",
        required: false,
        fields: [text("auteur", { subgroup: "Z" })],
      },
    ]).join("\n");

    expect(problems).not.toContain("réglage « titre »");
    expect(problems).toContain("réglage « ailleurs » : « block » vaut « steps », qui n'est l'option d'aucun champ « order » de la même section");
    expect(problems).toContain("réglage « inconnu » : « block » vaut « faq »");
    expect(problems).toContain("réglage « orphelin » : « subgroup » sans « group »");
    expect(problems).toContain("réglage « lesDeux » : « subgroup » ou « block », pas les deux");
    expect(problems).toContain("réglage « ordre2 » de type « order » : ni « subgroup » ni « block »");
    expect(problems).toContain("sous-champ « auteur » : ni « subgroup » ni « block » dans un élément de liste");
  });

  it("juge les sections déclarées et la langue du manifeste", () => {
    const problems = invalidThemeSettings([text("a", { group: "Accueil" })], {
      settingsLocale: "es" as SupportedLocale,
      pages: [{ slug: "infrastructure", title: "Infra" }],
      settingGroups: [
        { name: "Accueil", previewPath: "/" },
        { name: "Accueil" },
        { name: "Infra", previewPath: "/infrastructure" },
        { name: "Compte", previewPath: "/dashboard", category: "appearance" },
        { name: "Ailleurs", previewPath: "/nulle-part" },
        { name: "Genre", category: "misc" as "content" },
      ],
    }).join("\n");

    expect(problems).toContain("section « Accueil » déclarée deux fois");
    expect(problems).toContain("section « Ailleurs » : « previewPath » « /nulle-part » n'est pas une page");
    expect(problems).toContain("section « Genre » : « category » vaut « appearance » ou « content »");
    expect(problems).toContain("« settingsLocale » vaut « es » : langue inconnue");
    expect(problems).not.toContain("« Infra »");
    expect(problems).not.toContain("« Compte »");
  });

  it("accepte en previewPath de réglage une page de compte ou une page du thème", () => {
    const fields = [
      text("a", { previewPath: "/account/billing" }),
      text("b", { previewPath: "/legal/cookies" }),
      text("c", { previewPath: "/infrastructure" }),
    ];

    expect(invalidThemeSettings(fields, { pages: [{ slug: "infrastructure", title: "Infra" }] })).toEqual([]);
    // Sans la page déclarée, `/infrastructure` n'est plus une destination connue.
    expect(invalidThemeSettings(fields).join("\n")).toContain("réglage « c » : « previewPath »");
  });

  /** L'API range `$customCss` et `$texts` dans le même JSON que les réglages : aucun thème ne doit pouvoir les déclarer. */
  it("refuse comme nom de réglage chaque clé réservée au noyau", () => {
    for (const key of THEME_RESERVED_SETTING_KEYS) {
      expect(key.startsWith("$")).toBe(true);
      expect(invalidThemeSettings([text(key)]).join("\n")).toContain("le nom doit être alphanumérique");
    }
  });

  it("avertit d'une section déclarée qu'aucun réglage ne nomme", () => {
    expect(
      themeSettingWarnings({
        settings: [text("a", { group: "Accueil" })],
        settingGroups: [{ name: "Accueil" }, { name: "Pied de page" }],
      }),
    ).toEqual([
      "section « Pied de page » déclarée dans « settingGroups » mais qu'aucun réglage ne nomme dans son « group » et qui ne range aucun texte (« texts ») — elle restera vide au panel",
    ]);
    // Une section qui ne range que des textes du thème n'est pas vide.
    expect(
      themeSettingWarnings({
        settings: [text("a", { group: "Accueil" })],
        settingGroups: [{ name: "Accueil" }, { name: "Pied de page", texts: ["footerNote"] }],
      }),
    ).toEqual([]);
  });
});

describe("liens, texte riche et textes du thème (0.34.0)", () => {
  const field = (extra: Partial<ConfigField> & Pick<ConfigField, "name" | "type">): ConfigField => ({
    label: extra.name,
    required: false,
    ...extra,
  });

  it("valide le lien par défaut d'un `link`, en premier niveau comme en sous-champ", () => {
    expect(
      invalidThemeSettings([
        field({ name: "cta", type: "link", defaultValue: "/catalog" }),
        field({ name: "mail", type: "link", defaultValue: "mailto:a@b.tld" }),
      ]),
    ).toEqual([]);
    const problems = invalidThemeSettings([
      field({ name: "cta", type: "link", defaultValue: "javascript:alert(1)" }),
      field({
        name: "cols",
        type: "list",
        fields: [field({ name: "href", type: "link", defaultValue: "//evil.test" })],
      }),
    ]).join("\n");
    expect(problems).toContain("réglage « cta » : le lien par défaut doit être un chemin du site");
    expect(problems).toContain("réglage « cols », sous-champ « href » : lien par défaut invalide");
  });

  it("n'admet `format: markdown` que sur un textarea, sous-champ compris", () => {
    expect(
      invalidThemeSettings([
        field({ name: "corps", type: "textarea", format: "markdown" }),
        field({ name: "faq", type: "list", fields: [field({ name: "r", type: "textarea", format: "markdown" })] }),
      ]),
    ).toEqual([]);
    const problems = invalidThemeSettings([
      field({ name: "titre", type: "text", format: "markdown" }),
      field({ name: "corps", type: "textarea", format: "html" as "markdown" }),
      field({ name: "faq", type: "list", fields: [field({ name: "q", type: "text", format: "markdown" })] }),
    ]).join("\n");
    expect(problems).toContain("réglage « titre » : « format » est réservé au type « textarea »");
    expect(problems).toContain("réglage « corps » : « format » vaut « markdown »");
    expect(problems).toContain("réglage « faq », sous-champ « q » : « format » est réservé au type « textarea »");
  });

  it("rend un lien sûr tel quel, et le lien du thème à la place d'un lien refusé", () => {
    const fields = [
      field({ name: "cta", type: "link", defaultValue: "/catalog" }),
      field({ name: "nu", type: "link" }),
      field({ name: "cols", type: "list", fields: [field({ name: "href", type: "link", defaultValue: "/kb" })] }),
    ];
    expect(themeSettingValues(fields, { cta: "tel:+33100000000", nu: "/x" })).toMatchObject({
      cta: "tel:+33100000000",
      nu: "/x",
    });
    const values = themeSettingValues(fields, {
      cta: "javascript:alert(1)",
      nu: "/\t/evil.test",
      cols: [{ href: "data:text/html,x" }, { href: "/ok" }],
    });
    expect(values.cta).toBe("/catalog");
    expect(values.nu).toBeUndefined();
    expect(values.cols).toEqual([{ href: "/kb" }, { href: "/ok" }]);
  });

  it("refuse une clé de texte mal formée ou rangée dans deux sections", () => {
    expect(
      invalidThemeSettings([], {
        settingGroups: [
          { name: "Accueil", texts: ["heroTitle", "heroLead"] },
          { name: "Pied", texts: ["footerNote"] },
        ],
      }),
    ).toEqual([]);
    const problems = invalidThemeSettings([], {
      settingGroups: [
        { name: "Accueil", texts: ["heroTitle", "hero-lead", "heroTitle"] },
        { name: "Pied", texts: ["heroTitle"] },
      ],
    }).join("\n");
    expect(problems).toContain("section « Accueil » : « texts » cite « hero-lead », qui n'est pas une clé de texte");
    expect(problems).toContain("section « Accueil » : « texts » cite « heroTitle » deux fois");
    expect(problems).toContain(
      "section « Pied » : « texts » cite « heroTitle », déjà rangée dans la section « Accueil »",
    );
  });

  it("lit statiquement les clés `t.<clé>` d'un gabarit, et signale une lecture indexée", () => {
    expect(themeTranslationReads("{{ t.heroTitle }} {% if t.cta_label %}{{ t.cta_label }}{% endif %}")).toEqual({
      keys: ["heroTitle", "cta_label"],
      indexed: false,
    });
    expect(themeTranslationReads("{{ t[key] }} {{ settings.t.x }}").indexed).toBe(true);
  });
});

describe("chemins d'aperçu", () => {
  it("ouvre les trois documents légaux qui manquaient au sélecteur", () => {
    expect(THEME_PREVIEW_PATHS).toEqual(
      expect.arrayContaining(["/legal/notice", "/legal/refund", "/legal/cookies"]),
    );
  });

  /** Deux listes aux usages distincts : l'une s'ouvre sans session, l'autre non. */
  it("ne mélange pas vitrine et espace client", () => {
    const shared = THEME_ACCOUNT_PREVIEW_PATHS.filter((path) =>
      (THEME_PREVIEW_PATHS as readonly string[]).includes(path),
    );
    expect(shared).toEqual([]);
  });

  it("isThemePreviewPath : les deux listes et les pages du thème, rien d'autre", () => {
    expect(isThemePreviewPath("/")).toBe(true);
    expect(isThemePreviewPath("/account/team")).toBe(true);
    expect(isThemePreviewPath("/garanties", ["garanties"])).toBe(true);
    expect(isThemePreviewPath("/garanties")).toBe(false);
    expect(isThemePreviewPath("/services/12")).toBe(false);
    expect(isThemePreviewPath("/reseller/clients")).toBe(false);
    expect(isThemePreviewPath("//ailleurs.fr", ["/ailleurs.fr"])).toBe(false);
    expect(isThemePreviewPath("/catalog/")).toBe(false);
  });
});

describe("themePanelStrings", () => {
  it("collecte chaque texte traduisible une fois, sous-champs et sections compris", () => {
    const strings = themePanelStrings({
      settingGroups: [{ name: "Accueil", description: "Le haut de la page." }, { name: "Vide" }],
      settings: [
        {
          name: "mode",
          label: "Mode",
          type: "select",
          required: false,
          group: "Accueil",
          subgroup: "Hero",
          help: "Aide",
          placeholder: "Choisir",
          options: [{ value: "a", label: "Clair" }],
        },
        {
          name: "avis",
          label: "Avis",
          type: "list",
          required: false,
          group: "Accueil",
          fields: [
            { name: "note", label: "Note", type: "select", required: false, help: "Sur 5", options: [{ value: "5", label: "Cinq" }] },
          ],
        },
      ],
    });

    expect(strings.sort()).toEqual(
      ["Accueil", "Aide", "Avis", "Choisir", "Cinq", "Clair", "Hero", "Le haut de la page.", "Mode", "Note", "Sur 5", "Vide"].sort(),
    );
  });
});

/**
 * Tokens de la tranche D : typographie fine, lien, focus, rayon des boutons, mise en page, relief.
 * Trois pièges tenus ici — un groupe oublié par la fusion, un token « sans unité » que le contrôle
 * des nombres liés refusait, et un défaut littéral là où la valeur doit suivre une autre.
 */
describe("tokens de mise en page, de relief et de typographie fine", () => {
  const bound = (token: string, extra: Partial<ConfigField> = {}): ConfigField => ({
    name: "reglage",
    label: "Réglage",
    type: "number",
    required: false,
    token,
    ...extra,
  });

  it("déclare les défauts qui reproduisent le rendu d'avant, et rien pour ce qui se dérive", () => {
    expect(DEFAULT_THEME_TOKENS.layout).toEqual({ containerMax: "72rem", accountNav: "sidebar" });
    expect(DEFAULT_THEME_TOKENS.elevation).toBe("soft");
    // Absents : ils suivent l'accent et le rayon moyen **résolus** (voir `themeToCss`).
    expect(DEFAULT_THEME_TOKENS.colors.link).toBeUndefined();
    expect(DEFAULT_THEME_TOKENS.colors.focus).toBeUndefined();
    expect(DEFAULT_THEME_TOKENS.radii.button).toBeUndefined();
  });

  it("fusionne le groupe layout et le relief, couche par couche", () => {
    const merged = mergeThemeTokens(
      mergeThemeTokens(DEFAULT_THEME_TOKENS, { layout: { accountNav: "top" }, elevation: "flat" }),
      { layout: { containerMax: "64rem" } },
    );

    expect(merged.layout).toEqual({ containerMax: "64rem", accountNav: "top" });
    expect(merged.elevation).toBe("flat");
    expect(mergeThemeTokens(DEFAULT_THEME_TOKENS, { layout: { containerMax: "" } }).layout.containerMax).toBe(
      "72rem",
    );
  });

  it("admet un nombre sans unité sur un token sans unité, et le refuse partout ailleurs", () => {
    for (const token of ["typography.lineHeight", "typography.headingLineHeight", "typography.headingScale"]) {
      expect(invalidThemeSettings([bound(token, { min: 1, max: 2, step: 0.05 })])).toEqual([]);
      expect(invalidThemeSettings([bound(token, { unit: "px" })])).toEqual([
        `réglage « reglage » : « ${token} » est sans unité — retirez « unit »`,
      ]);
    }
    expect(invalidThemeSettings([bound("typography.letterSpacing")])[0]).toMatch(/doit déclarer son unité/);
    expect(invalidThemeSettings([bound("layout.containerMax", { unit: "rem" })])).toEqual([]);
    expect(invalidThemeSettings([bound("radii.button", { unit: "px" })])).toEqual([]);
  });

  it("n'accepte que les valeurs prévues pour la navigation du compte et le relief", () => {
    const select = (token: string, values: string[]): ConfigField => ({
      name: "choix",
      label: "Choix",
      type: "select",
      required: false,
      token,
      options: values.map((value) => ({ value, label: value })),
    });

    expect(invalidThemeSettings([select("layout.accountNav", ["sidebar", "top"])])).toEqual([]);
    expect(invalidThemeSettings([select("elevation", ["flat", "soft", "raised"])])).toEqual([]);
    expect(invalidThemeSettings([select("layout.accountNav", ["left"])])[0]).toMatch(/n'accepte que sidebar, top/);
    expect(invalidThemeSettings([select("elevation", ["deep"])])[0]).toMatch(/n'accepte que flat, soft, raised/);

    const fields = [select("layout.accountNav", ["sidebar", "top"]), { ...select("elevation", ["flat", "raised"]), name: "relief" }];
    expect(themeSettingStyle(fields, { choix: "top", relief: "flat" }).tokens).toEqual({
      layout: { accountNav: "top" },
      elevation: "flat",
    });
  });

  it("lie un nombre sans unité tel quel, sans suffixe", () => {
    const fields = [bound("typography.lineHeight", { name: "interligne", min: 1, max: 2, step: 0.05 })];
    expect(themeSettingStyle(fields, { interligne: 1.6 }).tokens).toEqual({ typography: { lineHeight: "1.6" } });
  });

  it("lie les couleurs de lien et de focus comme les autres couleurs", () => {
    const fields: ConfigField[] = ["link", "focus"].map((name) => ({
      name,
      label: name,
      type: "color",
      required: false,
      token: `colors.${name}`,
    }));
    expect(invalidThemeSettings(fields)).toEqual([]);
    expect(themeSettingStyle(fields, { link: "#0055aa", focus: "#aa5500" }).tokens).toEqual({
      colors: { link: "#0055aa", focus: "#aa5500" },
    });
  });

  it("réserve --shadow- et --layout- au noyau", () => {
    for (const cssVar of ["--shadow-md", "--layout-container-max"]) {
      const field: ConfigField = { name: "libre", label: "Libre", type: "number", required: false, unit: "px", cssVar };
      expect(invalidThemeSettings([field])[0]).toMatch(/appartient au noyau/);
      expect(themeSettingStyle([field], { libre: 4 }).cssVars).toEqual({});
    }
  });

  it("nomme les clés de tokens que ce noyau ne connaît pas", () => {
    expect(
      unknownThemeTokenPaths({
        colorScheme: "light",
        elevation: "soft",
        colors: { primary: "#fff", primaire: "#000", link: "#00f" },
        typography: { lineheight: "1.5", headingScale: "1.2" },
        layout: { containerMax: "70rem" },
        shadows: { md: "none" },
        densite: "compact",
      }),
    ).toEqual(["colors.primaire", "typography.lineheight", "shadows", "densite"]);
    expect(unknownThemeTokenPaths(undefined)).toEqual([]);
  });
});

describe("type font et polices téléversées", () => {
  const stack = '"Figtree", system-ui, sans-serif';
  const font = (extra: Partial<ConfigField> = {}): ConfigField => ({
    name: "fontBody",
    label: "Police du texte",
    type: "font",
    required: false,
    defaultValue: stack,
    options: [
      { value: stack, label: "Figtree" },
      { value: "system-ui, sans-serif", label: "Police du système" },
    ],
    token: "typography.fontFamily",
    ...extra,
  });

  it("se lie à fontFamily et headingFamily, pas à la chasse fixe", () => {
    expect(invalidThemeSettings([font()])).toEqual([]);
    expect(invalidThemeSettings([font({ token: "typography.headingFamily" })])).toEqual([]);
    expect(invalidThemeSettings([font({ token: "typography.monoFamily" })]).join(" ")).toMatch(
      /attend un champ de type select/,
    );
  });

  it("refuse un défaut hors options et une option qui sortirait de la feuille", () => {
    expect(invalidThemeSettings([font({ defaultValue: "Comic Sans" })]).join(" ")).toMatch(
      /pas l'une des options/,
    );
    const hostile = font({
      token: undefined,
      defaultValue: undefined,
      options: [{ value: "x;} body{color:red", label: "x" }],
    });
    expect(invalidThemeSettings([hostile]).join(" ")).toMatch(/caractère interdit/);
  });

  it("admet une police téléversée seulement si l'appelant la connaît", () => {
    const fields = [font()];
    expect(themeSettingValues(fields, { fontBody: "Ma Police" })).toEqual({ fontBody: stack });
    expect(
      themeSettingValues(fields, { fontBody: "Ma Police" }, { uploadedFontFamilies: ["Ma Police"] }),
    ).toEqual({ fontBody: "Ma Police" });
  });

  it("émet la police téléversée en pile avec repli, et ignore un nom inconnu", () => {
    const fields = [font()];
    const values = { fontBody: "Ma Police" };
    expect(themeSettingStyle(fields, values, "light", ["Ma Police"]).tokens).toEqual({
      typography: { fontFamily: '"Ma Police", system-ui, sans-serif' },
    });
    expect(themeSettingStyle(fields, values, "light", []).tokens).toEqual({});
    expect(themeSettingStyle(fields, { fontBody: stack }).tokens).toEqual({
      typography: { fontFamily: stack },
    });
  });

  it("n'accepte jamais une famille hostile, même déclarée téléversée", () => {
    const hostile = "x</style><script>alert(1)</script>";
    expect(isAllowedFontValue(font(), hostile, [hostile])).toBe(false);
    expect(themeSettingStyle([font()], { fontBody: hostile }, "light", [hostile]).tokens).toEqual({});
    expect(isSafeUploadedFontFamily(" Ma Police")).toBe(false);
    expect(isSafeUploadedFontFamily('"Ma Police"')).toBe(false);
    expect(isSafeUploadedFontFamily("Ma Police")).toBe(true);
  });

  it("garde à l'édition la police téléversée enregistrée", () => {
    expect(themeSettingEditable([font()], { fontBody: "Ma Police" })).toEqual({
      fontBody: "Ma Police",
    });
  });

  it("uploadedFontFaces refiltre famille et adresse au point d'émission", () => {
    const id = "0b8f6f1e-8a51-4d8a-9d8e-2f1a5c3b7e90";
    const css = uploadedFontFaces([
      { family: "Ma Police", url: `/api/v1/theme-media/${id}.woff2` },
      { family: 'x"; } </style><script>', url: `/api/v1/theme-media/${id}.woff2` },
      { family: "Autre", url: "https://evil.example/f.woff2" },
      { family: "Image", url: `/api/v1/theme-media/${id}.png` },
    ]);
    expect(css).toBe(
      `@font-face { font-family: "Ma Police"; src: url("/api/v1/theme-media/${id}.woff2") format("woff2"); font-display: swap; }`,
    );
    expect(uploadedFontFaces(undefined)).toBe("");
  });
});
