import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ts from "typescript";
import { EXTENSION_KINDS } from "../manifest";
import { HOST_CONTRACT_VERSION } from "../version";
import { main as checkMain, type CliIo } from "./check-extension";
import { main as createMain } from "./create-extension";

const SDK_ROOT = join(__dirname, "..", "..");

/** Capture au lieu d'écrire sur la console — mêmes fonctions `main`, sans bruit dans les tests. */
function capture(): { io: CliIo; lines: string[] } {
  const lines: string[] = [];
  return { io: { log: (m) => lines.push(m), error: (m) => lines.push(m) }, lines };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "opbs-extension-cli-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("create puis check", () => {
  it.each(EXTENSION_KINDS)("%s : le squelette généré passe le contrôle sans erreur", (kind) => {
    const created = capture();
    expect(createMain([kind, `demo-${kind}`, "--dir", root], created.io)).toBe(0);

    const checked = capture();
    expect(checkMain([join(root, `demo-${kind}`)], checked.io)).toBe(0);
    expect(checked.lines.some((line) => line.includes("erreur "))).toBe(false);
  });

  /**
   * Dès qu'un thème fournit un pied, le portail peut retirer le sien, et avec lui les liens légaux
   * et le bouton des préférences de cookies. Le pied généré ne portait que la raison sociale : tout
   * thème tiré du générateur rendait ces documents introuvables.
   */
  it("theme : le pied généré boucle les liens légaux et pose les préférences de cookies", () => {
    expect(createMain(["theme", "demo-pied", "--dir", root], capture().io)).toBe(0);

    const footer = readFileSync(
      join(root, "demo-pied", "templates", "partials", "footer.liquid"),
      "utf8",
    ).replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "");
    expect(footer).toMatch(
      /\{%\s*for (\w+) in legalLinks\s*%\}[\s\S]*href="\{\{\s*\1\.href\s*\}\}"[\s\S]*\{%\s*endfor\s*%\}/,
    );
    expect(footer).toContain('data-island="cookie-preferences"');
  });
});

describe("create : refus", () => {
  it("refuse d'écraser un dossier existant", () => {
    createMain(["dns", "demo", "--dir", root], capture().io);

    const second = capture();
    expect(createMain(["dns", "demo", "--dir", root], second.io)).toBe(1);
  });

  it("refuse un identifiant invalide", () => {
    expect(createMain(["dns", "Pas Valide !", "--dir", root], capture().io)).toBe(1);
  });

  it("refuse un genre inconnu", () => {
    expect(createMain(["hyperviseur", "demo", "--dir", root], capture().io)).toBe(1);
  });

  it("refuse un appel sans argument", () => {
    expect(createMain([], capture().io)).toBe(1);
  });
});

describe("check : refus", () => {
  it("refuse un appel sans argument", () => {
    expect(checkMain([], capture().io)).toBe(1);
  });

  it("refuse un dossier sans module", () => {
    expect(checkMain([root], capture().io)).toBe(1);
  });
});

/**
 * Générateur et contrat d'accord au niveau des types, pas seulement au niveau du chargeur : les
 * six squelettes non-thème sont typés avec `@ts-check` + un `@type` qui nomme leur descripteur —
 * si le générateur oublie une propriété requise (ou que le contrat en ajoute une), `checkJs` le
 * signale ici, avant qu'un auteur tiers ne le découvre dans son éditeur.
 */
describe("rapport d'API du générateur", () => {
  it("les 6 squelettes non-thème typent sans diagnostic contre le contrat réel", () => {
    const kinds = EXTENSION_KINDS.filter((kind) => kind !== "theme");
    for (const kind of kinds) {
      expect(createMain([kind, `typecheck-${kind}`, "--dir", root], capture().io)).toBe(0);
    }

    const configFile = ts.readConfigFile(join(SDK_ROOT, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, SDK_ROOT);

    const options: ts.CompilerOptions = {
      ...parsed.options,
      allowJs: true,
      checkJs: true,
      noEmit: true,
      declaration: false,
      declarationMap: false,
      strict: true,
      paths: { "@opbs/extension-sdk": [join(SDK_ROOT, "src", "index.ts")] },
    };
    delete options.rootDir;
    delete options.outDir;

    const files = kinds.map((kind) => join(root, `typecheck-${kind}`, "index.js"));
    const program = ts.createProgram(files, options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const formatted = diagnostics
      .map((d) => {
        const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
        if (d.file && d.start !== undefined) {
          const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
          return `${d.file.fileName}:${line + 1}:${character + 1} - ${message}`;
        }
        return message;
      })
      .join("\n");

    expect(formatted).toBe("");
  });
});

describe("check : traductions indexées par variable", () => {
  /**
   * Un gabarit qui traduit un code venu du noyau compose sa clé (`"status" | append: …`) et indexe
   * `t`. Les clés correspondantes ne s'écrivent nulle part en toutes lettres : sans ce cas, le
   * contrôle les déclarait mortes et le thème sortait du contrôle avec un avis faux à chaque
   * passage — la meilleure façon d'apprendre à ne plus lire les avis.
   */
  function theme(templates: Record<string, string>, locale: Record<string, string>): string {
    const dir = join(root, "theme-locales");
    mkdirSync(join(dir, "templates", "pages"), { recursive: true });
    mkdirSync(join(dir, "locales"), { recursive: true });
    writeFileSync(
      join(dir, "extension.json"),
      JSON.stringify({
        id: "theme-locales",
        kind: "theme",
        name: "Locales",
        version: "1.0.0",
        engines: { host: `^${HOST_CONTRACT_VERSION}` },
        theme: { tokens: {}, locales: "locales" },
      }),
    );
    for (const [name, body] of Object.entries(templates)) {
      writeFileSync(join(dir, "templates", "pages", name), body);
    }
    writeFileSync(join(dir, "locales", "fr.json"), JSON.stringify(locale));
    return dir;
  }

  it("ne signale pas comme morte une clé qu'un gabarit lit par variable", () => {
    const dir = theme(
      { "home.liquid": '{% assign k = "status" | append: s %}<p>{{ t[k] }}{{ t.hello }}</p>' },
      { hello: "Bonjour", statusACTIVE: "Actif" },
    );

    const run = capture();
    expect(checkMain([dir], run.io)).toBe(0);
    expect(run.lines.join("\n")).not.toContain("qu'aucun gabarit ne lit");
  });

  it("signale encore une clé morte quand aucun gabarit n'indexe « t »", () => {
    const dir = theme({ "home.liquid": "<p>{{ t.hello }}</p>" }, { hello: "Bonjour", orphan: "Orpheline" });

    const run = capture();
    expect(checkMain([dir], run.io)).toBe(0);
    expect(run.lines.join("\n")).toContain("qu'aucun gabarit ne lit");
  });
});

/**
 * Le noyau omet sans bruit le `@font-face` d'une police hors de sa liste blanche : le texte
 * retombait sur la police système en production alors que ce contrôle rendait OK.
 */
describe("check : polices écartées du @font-face", () => {
  it("avertit de chaque police livrée que le noyau n'émettra pas, et d'elles seules", () => {
    const dir = join(root, "theme-polices");
    mkdirSync(join(dir, "assets"), { recursive: true });
    for (const file of ["a.woff2", "b.woff2", "c.woff2"]) {
      writeFileSync(join(dir, "assets", file), "");
    }
    writeFileSync(
      join(dir, "extension.json"),
      JSON.stringify({
        id: "theme-polices",
        kind: "theme",
        name: "Polices",
        version: "1.0.0",
        engines: { host: `^${HOST_CONTRACT_VERSION}` },
        theme: {
          tokens: {},
          fonts: [
            { family: "Libre Franklin 2.0", src: "a.woff2" },
            { family: "Crimson Text", src: "b.woff2", weight: "semibold" },
            { family: "Figtree", src: "c.woff2", weight: "300 900" },
            // Feuille externe : le noyau n'en émet aucun @font-face, rien à signaler.
            { family: "Nom libre 2.0", href: "https://fonts.example/x.css" },
          ],
        },
      }),
    );

    const run = capture();
    expect(checkMain([dir], run.io)).toBe(0);
    const report = run.lines.join("\n");
    expect(report).toContain("theme.fonts[0] (« Libre Franklin 2.0 ») : police écartée du @font-face");
    expect(report).toContain("theme.fonts[1] (« Crimson Text ») : police écartée du @font-face");
    expect(report).not.toContain("theme.fonts[2]");
    expect(report).not.toContain("theme.fonts[3]");
  });
});

/**
 * Le chargeur garde une clé de token inconnue (compatibilité avec un noyau plus récent), et le
 * rendu l'ignore : `typography.lineheight` ne faisait ni erreur ni effet. L'avis est le seul endroit
 * où la faute de frappe peut encore se voir.
 */
describe("check : tokens inconnus", () => {
  it("avertit d'une clé de theme.tokens ou theme.tokensDark inconnue, sans bloquer", () => {
    const dir = join(root, "theme-tokens");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "extension.json"),
      JSON.stringify({
        id: "theme-tokens",
        kind: "theme",
        name: "Tokens",
        version: "1.0.0",
        engines: { host: `^${HOST_CONTRACT_VERSION}` },
        theme: {
          tokens: {
            elevation: "raised",
            layout: { containerMax: "64rem", accountNav: "top" },
            typography: { lineheight: "1.5", headingScale: "1.2" },
            ombres: "fortes",
          },
          tokensDark: { colors: { bg: "#000", primaire: "#fff" } },
        },
      }),
    );

    const run = capture();
    expect(checkMain([dir], run.io)).toBe(0);
    const report = run.lines.join("\n");
    expect(report).toContain("theme.tokens.typography.lineheight : token inconnu");
    expect(report).toContain("theme.tokens.ombres : token inconnu");
    expect(report).toContain("theme.tokensDark.colors.primaire : token inconnu");
    expect(report).not.toContain("headingScale : token inconnu");
    expect(report).not.toContain("layout.containerMax : token inconnu");
  });
});

describe("check : filtre raw", () => {
  /**
   * Le moteur du noyau échappe toute sortie, `| raw` compris. Un auteur qui l'écrit attend du HTML
   * brut et verra ses balises affichées en texte : l'avis le prévient, sans bloquer, puisque la
   * page se rend et ne met rien en danger.
   */
  function theme(templates: Record<string, string>): string {
    const dir = join(root, "theme-raw");
    for (const [path, body] of Object.entries(templates)) {
      mkdirSync(join(dir, "templates", path, ".."), { recursive: true });
      writeFileSync(join(dir, "templates", path), body);
    }
    writeFileSync(
      join(dir, "extension.json"),
      JSON.stringify({
        id: "theme-raw",
        kind: "theme",
        name: "Raw",
        version: "1.0.0",
        engines: { host: `^${HOST_CONTRACT_VERSION}` },
        theme: { tokens: {} },
      }),
    );
    return dir;
  }

  it("signale « | raw » avec sa ligne, jusque dans un fragment hors des vues", () => {
    const dir = theme({
      "pages/home.liquid": "<h1>Accueil</h1>\n<p>{{ intro | raw }}</p>",
      // Un fragment n'est pas une vue : le contrôle des îlots ne le lit pas, celui-ci si.
      "partials/card/title.liquid": '{% liquid\n  assign t = "x"\n  echo t | upcase | raw\n%}',
    });

    const run = capture();
    expect(checkMain([dir], run.io)).toBe(0);
    const report = run.lines.join("\n");
    expect(report).toMatch(
      /avis {3}: templates\/pages\/home\.liquid \(ligne 2\) : « \| raw » sans effet/,
    );
    expect(report).toContain("templates/partials/card/title.liquid (ligne 3)");
  });

  it("ne signale pas un « raw » qui n'est pas un filtre évalué", () => {
    const dir = theme({
      "pages/home.liquid": [
        "<p>{{ intro | raw_html }}</p>",
        "{% comment %}{{ ancien | raw }}{% endcomment %}",
        "{% raw %}{{ exemple | raw }}{% endraw %}",
        "{% # {{ note | raw }} %}",
        "<p>Texte | raw hors balisage</p>",
      ].join("\n"),
    });

    const run = capture();
    expect(checkMain([dir], run.io)).toBe(0);
    expect(run.lines.join("\n")).not.toContain("« | raw »");
  });
});

describe("check : réglages et traductions du panel (0.34.0)", () => {
  /** Un thème minimal dont on choisit les réglages et les fichiers de `locales/`. */
  function theme(declaration: Record<string, unknown>, files: Record<string, unknown> = {}): string {
    const dir = join(root, "theme-panel");
    mkdirSync(join(dir, "locales", "panel"), { recursive: true });
    writeFileSync(
      join(dir, "extension.json"),
      JSON.stringify({
        id: "theme-panel",
        kind: "theme",
        name: "Panel",
        version: "1.0.0",
        author: "Test",
        description: "Test",
        engines: { host: `^${HOST_CONTRACT_VERSION}` },
        theme: { tokens: {}, ...declaration },
      }),
    );
    for (const [path, content] of Object.entries(files)) {
      writeFileSync(join(dir, "locales", path), typeof content === "string" ? content : JSON.stringify(content));
    }
    return dir;
  }

  const settings = [
    { name: "titre", label: "Titre", type: "text", group: "Accueil", help: "Affiché en haut" },
    { name: "mode", label: "Mode", type: "select", group: "Accueil", options: [{ value: "a", label: "Clair" }] },
  ];

  it("avertit d'un fichier absent, d'une chaîne non traduite et d'une clé orpheline", () => {
    const dir = theme(
      { settingsLocale: "fr", settings },
      {
        "fr.json": { hello: "Bonjour" },
        "panel/en.json": { Titre: "Title", Accueil: "Home", Mode: "Mode", Clair: "", "Ancien libellé": "Old" },
      },
    );

    const run = capture();
    expect(checkMain([dir], run.io)).toBe(0);
    const report = run.lines.join("\n");
    expect(report).toContain("locales/panel/de.json absent");
    expect(report).toContain("locales/panel/en.json : 2 texte(s) sans traduction, affiché(s) tel(s) quel(s) — « Affiché en haut », « Clair »");
    expect(report).toContain("locales/panel/en.json : 1 clé(s) qui ne correspondent à aucun texte du manifeste (libellé retouché ?) — « Ancien libellé »");
    // Langue du manifeste : rien à traduire, rien à réclamer.
    expect(report).not.toContain("panel/fr.json");
    // `panel/` n'est pas une langue des gabarits.
    expect(report).not.toContain("panel.json");
  });

  it("prend l'anglais pour langue du manifeste quand settingsLocale manque", () => {
    const run = capture();
    expect(checkMain([theme({ settings })], run.io)).toBe(0);
    const report = run.lines.join("\n");
    expect(report).toContain("locales/panel/fr.json absent");
    expect(report).toContain("locales/panel/de.json absent");
    expect(report).not.toContain("panel/en.json");
  });

  it("refuse un fichier de traductions du panel illisible", () => {
    const run = capture();
    expect(checkMain([theme({ settingsLocale: "fr", settings }, { "panel/en.json": "{ pas du json" })], run.io)).toBe(1);
    expect(run.lines.join("\n")).toContain("locales/panel/en.json : JSON illisible");
  });

  it("refuse une boucle de conditions et une condition mal formée, avertit d'une section vide", () => {
    const run = capture();
    const dir = theme({
      settingsLocale: "fr",
      settingGroups: [{ name: "Accueil" }, { name: "Pied de page" }],
      settings: [
        { name: "a", label: "A", type: "text", group: "Accueil", visibleWhen: { field: "b", equals: "1" } },
        { name: "b", label: "B", type: "text", group: "Accueil", visibleWhen: { field: "a", equals: "1" } },
        { name: "c", label: "C", type: "text", group: "Accueil", visibleWhen: { field: "a", notEqual: "1" } },
      ],
    });

    expect(checkMain([dir], run.io)).toBe(1);
    const report = run.lines.join("\n");
    expect(report).toMatch(/erreur : réglages « a » → « b » → « a » : conditions « visibleWhen » en boucle/);
    expect(report).toMatch(/erreur : réglage « c » : condition « visibleWhen » ignorée — aucun opérateur/);
    expect(report).toMatch(/avis {3}: section « Pied de page » déclarée dans « settingGroups »/);
  });
});

describe("check : annotations data-theme-setting", () => {
  /**
   * L'attribut relie une région aux réglages qui la façonnent, pour le bouton « Modifier » de
   * l'aperçu. Un nom inconnu laisse la zone muette : un avis, jamais une erreur.
   */
  function theme(templates: Record<string, string>): string {
    const dir = join(root, "theme-annot");
    for (const [path, body] of Object.entries(templates)) {
      mkdirSync(join(dir, "templates", path, ".."), { recursive: true });
      writeFileSync(join(dir, "templates", path), body);
    }
    writeFileSync(
      join(dir, "extension.json"),
      JSON.stringify({
        id: "theme-annot",
        kind: "theme",
        name: "Annot",
        version: "1.0.0",
        engines: { host: `^${HOST_CONTRACT_VERSION}` },
        theme: {
          tokens: {},
          settingsLocale: "fr",
          settings: [
            { name: "heroTitle", label: "Titre", type: "text" },
            { name: "heroLead", label: "Chapeau", type: "text" },
          ],
        },
      }),
    );
    return dir;
  }

  it("avertit d'un nom non déclaré, avec sa ligne, et de lui seul", () => {
    const dir = theme({
      "pages/home.liquid": [
        '<section data-theme-setting="heroTitle heroLead">',
        "<h1>{{ settings.heroTitle }}</h1>",
        "</section>",
        "<footer data-theme-setting='heroTitle heroTitel'></footer>",
      ].join("\n"),
    });

    const run = capture();
    expect(checkMain([dir], run.io)).toBe(0);
    const report = run.lines.join("\n");
    expect(report).toMatch(
      /avis {3}: templates\/pages\/home\.liquid \(ligne 4\) : data-theme-setting nomme « heroTitel »/,
    );
    expect(report).not.toContain("nomme « heroLead »");
    expect(report).not.toContain("nomme « heroTitle »");
  });

  it("ignore les commentaires et les valeurs calculées", () => {
    const dir = theme({
      "partials/header.liquid": [
        '{% comment %}<div data-theme-setting="ancien"></div>{% endcomment %}',
        '<!-- <div data-theme-setting="ancien2"></div> -->',
        '<div data-theme-setting="{{ zone }}"></div>',
      ].join("\n"),
    });

    const run = capture();
    expect(checkMain([dir], run.io)).toBe(0);
    expect(run.lines.join("\n")).not.toContain("data-theme-setting nomme");
  });
});

describe("check : texte riche et textes du thème", () => {
  function theme(templates: Record<string, string>, extra: Record<string, unknown> = {}): string {
    const dir = join(root, "theme-texts");
    rmSync(dir, { recursive: true, force: true });
    for (const [path, body] of Object.entries(templates)) {
      mkdirSync(join(dir, "templates", path, ".."), { recursive: true });
      writeFileSync(join(dir, "templates", path), body);
    }
    mkdirSync(join(dir, "locales"), { recursive: true });
    for (const locale of ["fr", "en", "de"]) {
      writeFileSync(
        join(dir, "locales", `${locale}.json`),
        JSON.stringify({ heroTitle: "Titre", footerNote: "Note" }),
      );
    }
    writeFileSync(
      join(dir, "extension.json"),
      JSON.stringify({
        id: "theme-texts",
        kind: "theme",
        name: "Textes",
        version: "1.0.0",
        engines: { host: `^${HOST_CONTRACT_VERSION}` },
        theme: {
          tokens: {},
          settingsLocale: "fr",
          settings: [{ name: "corps", label: "Corps", type: "textarea", format: "markdown" }],
          ...extra,
        },
      }),
    );
    return dir;
  }

  it("avertit d'un `| markdown` dans une balise ouverte, pas entre deux balises", () => {
    const dir = theme({
      "pages/home.liquid": [
        "<h1>{{ t.heroTitle }}</h1><p>{{ t.footerNote }}</p>",
        "<div>{{ settings.corps | markdown }}</div>",
        '<div title="{{ settings.corps | markdown }}"',
        '  data-x="{% if a > b %}y{% endif %}{{ settings.corps | markdown }}"></div>',
      ].join("\n"),
    });

    const run = capture();
    expect(checkMain([dir], run.io)).toBe(0);
    expect(run.lines.join("\n")).toMatch(
      /avis {3}: templates\/pages\/home\.liquid \(lignes 3, 4\) : « \| markdown » dans une balise ouverte/,
    );
  });

  it("avertit d'une zone data-theme-text ou d'une section qui nomme un texte inconnu", () => {
    const dir = theme(
      {
        "pages/home.liquid": [
          '<h1 data-theme-text="heroTitle">{{ t.heroTitle }}</h1>',
          "<p data-theme-text='footerNote heroTitel'>{{ t.footerNote }}</p>",
          '<!-- <p data-theme-text="ancien"></p> -->',
        ].join("\n"),
      },
      { settingGroups: [{ name: "Accueil", texts: ["heroTitle", "inconnu"] }] },
    );

    const run = capture();
    expect(checkMain([dir], run.io)).toBe(0);
    const report = run.lines.join("\n");
    expect(report).toMatch(
      /avis {3}: templates\/pages\/home\.liquid \(ligne 2\) : data-theme-text nomme « heroTitel »/,
    );
    expect(report).toMatch(/avis {3}: section « Accueil » : « texts » cite inconnu, absente\(s\)/);
    expect(report).not.toContain("« ancien »");
    expect(report).not.toContain("nomme « heroTitle »");
  });
});
