import { isSafeLinkValue } from "./links";
import { THEME_MARKDOWN_MAX_LENGTH, parseThemeMarkdown, type ThemeMarkdownInline } from "./markdown";

describe("isSafeLinkValue", () => {
  it("accepte un chemin du site et les quatre schémas admis, sans égard à la casse", () => {
    for (const value of [
      "/",
      "/catalog",
      "/kb/article?q=x#ancre",
      "https://exemple.tld/offre",
      "HTTP://exemple.tld",
      "mailto:contact@exemple.tld",
      "MailTo:contact@exemple.tld",
      "tel:+33123456789",
    ]) {
      expect(isSafeLinkValue(value)).toBe(true);
    }
  });

  it("refuse ce qui sort du site sous l'apparence d'un chemin", () => {
    expect(isSafeLinkValue("//evil.test")).toBe(false);
    expect(isSafeLinkValue("/\\evil.test")).toBe(false);
    expect(isSafeLinkValue("/a\\b")).toBe(false);
    // Le navigateur retire tabulations et sauts de ligne : `/<tab>/hote` se lirait `//hote`.
    expect(isSafeLinkValue("/\t/evil.test")).toBe(false);
    expect(isSafeLinkValue("/\n/evil.test")).toBe(false);
    expect(isSafeLinkValue(`/${String.fromCharCode(0)}x`)).toBe(false);
  });

  it("refuse tout autre schéma, un blanc n'importe où et un schéma sans suite", () => {
    for (const value of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      " /catalog",
      "/catalog ",
      "https://exemple.tld/a b",
      `https://exemple.tld/${String.fromCharCode(0x7f)}`,
      "mailto:",
      "tel:",
      "https://",
      "catalog",
      "",
      "#ancre",
    ]) {
      expect(isSafeLinkValue(value)).toBe(false);
    }
  });
});

/** Le texte d'une suite de morceaux, pour comparer sans reproduire tout l'arbre. */
function plain(nodes: ThemeMarkdownInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "break":
          return "\n";
        case "strong":
          return `<b>${plain(node.children)}</b>`;
        case "em":
          return `<i>${plain(node.children)}</i>`;
        case "link":
          return `<a ${node.href}>${plain(node.children)}</a>`;
      }
    })
    .join("");
}

describe("parseThemeMarkdown", () => {
  it("sépare les paragraphes par une ligne vide, garde le saut de ligne simple", () => {
    const blocks = parseThemeMarkdown("Un\ndeux\n\n\r\nTrois");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", text: "Un" }, { type: "break" }, { type: "text", text: "deux" }],
      },
      { type: "paragraph", children: [{ type: "text", text: "Trois" }] },
    ]);
  });

  it("lit gras, italique (deux écritures) et leur imbrication", () => {
    const [block] = parseThemeMarkdown("**Gras *et italique*** puis _souligné_ et *italique*");
    expect(block?.type).toBe("paragraph");
    expect(plain(block?.type === "paragraph" ? block.children : [])).toBe(
      "<b>Gras <i>et italique</i></b> puis <i>souligné</i> et <i>italique</i>",
    );
    const text = (source: string) => {
      const [only] = parseThemeMarkdown(source);
      return plain(only?.type === "paragraph" ? only.children : []);
    };
    expect(text("*a **b** c*")).toBe("<i>a <b>b</b> c</i>");
    expect(text("***les deux***")).toBe("<b><i>les deux</i></b>");
  });

  it("laisse en texte ce qui n'ouvre rien", () => {
    const text = (source: string) => {
      const [block] = parseThemeMarkdown(source);
      return plain(block?.type === "paragraph" ? block.children : []);
    };
    expect(text("2 * 3 * 4")).toBe("2 * 3 * 4");
    expect(text("nom_de_variable")).toBe("nom_de_variable");
    expect(text("**jamais fermé")).toBe("**jamais fermé");
    expect(text("[pas un lien] (x)")).toBe("[pas un lien] (x)");
    expect(text("# Pas un titre")).toBe("# Pas un titre");
    expect(text("<b>pas du HTML</b>")).toBe("<b>pas du HTML</b>");
    expect(text("![image](/a.png)")).toBe("!<a /a.png>image</a>");
  });

  it("garde un lien sûr et ne rend que le texte d'un lien refusé", () => {
    const [block] = parseThemeMarkdown(
      "[Catalogue](/catalog), [**écrire**](mailto:a@b.tld), [piège](javascript:alert(1)) et [x](//evil.test)",
    );
    expect(plain(block?.type === "paragraph" ? block.children : [])).toBe(
      "<a /catalog>Catalogue</a>, <a mailto:a@b.tld><b>écrire</b></a>, piège) et x",
    );
  });

  it("lit les listes à puces et numérotées, et termine une liste sur une ligne ordinaire", () => {
    const blocks = parseThemeMarkdown("- un\n* **deux**\n1. premier\n12. second\nfin");
    expect(blocks.map((block) => block.type)).toEqual(["list", "list", "paragraph"]);
    const [bullets, numbers] = blocks;
    expect(bullets).toMatchObject({ type: "list", ordered: false });
    expect(bullets?.type === "list" ? bullets.items.map(plain) : []).toEqual(["un", "<b>deux</b>"]);
    expect(numbers?.type === "list" ? numbers.items.map(plain) : []).toEqual(["premier", "second"]);
    expect(numbers).toMatchObject({ ordered: true });
  });

  it("ne lève jamais, et borne l'entrée", () => {
    expect(parseThemeMarkdown(undefined as unknown as string)).toEqual([]);
    expect(parseThemeMarkdown("")).toEqual([]);
    const [block] = parseThemeMarkdown("a".repeat(THEME_MARKDOWN_MAX_LENGTH + 500));
    expect(plain(block?.type === "paragraph" ? block.children : [])).toHaveLength(
      THEME_MARKDOWN_MAX_LENGTH,
    );
  });

  it("traite une entrée pathologique en temps linéaire", () => {
    // Chaque motif piège un analyseur qui cherche son fermant par balayage : une ligne de `*`,
    // des crochets jamais refermés, des `_` collés, des liens sans parenthèse fermante.
    const inputs = [
      "*".repeat(100_000),
      "[".repeat(100_000),
      "_a".repeat(50_000),
      "[a](".repeat(25_000),
      "**a *b _c ".repeat(10_000),
    ];
    for (const input of inputs) {
      const started = performance.now();
      parseThemeMarkdown(input);
      expect(performance.now() - started).toBeLessThan(500);
    }
  });
});
