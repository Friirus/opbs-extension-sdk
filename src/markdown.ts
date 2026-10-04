import { isSafeLinkValue } from "./links";

/**
 * Texte riche des réglages de thème (`ConfigField.format: "markdown"`) : le **seul** analyseur, pur
 * et sans dépendance, que le moteur de rendu sérialise en HTML et que le panel rend en éléments
 * React pour son aperçu. Deux analyseurs finiraient par ne pas voir le même texte : l'aperçu
 * montrerait un lien que la vitrine n'affiche pas, ou l'inverse.
 *
 * Sous-ensemble **fermé**, et c'est tout l'intérêt : paragraphes (séparés par une ligne vide), saut
 * de ligne simple, `**gras**`, `*italique*` / `_italique_`, `[texte](lien)`, listes `- ` / `* ` et
 * `1. `. Ni titre, ni image, ni HTML : un titre casserait la hiérarchie que le gabarit a posée, une
 * image échapperait à la médiathèque du thème, et du HTML rouvrirait tout ce que l'échappement
 * ferme. Un caractère qui n'ouvre rien de ce qui précède reste du texte.
 *
 * Analyse **linéaire**. Le texte d'un gabarit peut venir d'un client (le corps d'un ticket, si un
 * thème y applique le filtre) : une expression régulière à retour arrière s'y ferait bloquer le fil
 * de l'API par une entrée de quelques kilo-octets. Ici, chaque délimiteur trouve son partenaire par
 * une table « prochaine occurrence » calculée en un passage, chaque caractère est lu au plus une
 * fois par niveau d'imbrication, et l'imbrication est bornée (un gras ne contient pas de gras, un
 * lien pas de lien). L'entrée elle-même est bornée à `THEME_MARKDOWN_MAX_LENGTH`.
 */

/** Longueur analysée au plus ; le reste est ignoré. */
export const THEME_MARKDOWN_MAX_LENGTH = 20_000;

/** Un morceau de texte à l'intérieur d'un paragraphe ou d'un élément de liste. */
export type ThemeMarkdownInline =
  | { type: "text"; text: string }
  /** Saut de ligne simple à l'intérieur d'un paragraphe. */
  | { type: "break" }
  | { type: "strong"; children: ThemeMarkdownInline[] }
  | { type: "em"; children: ThemeMarkdownInline[] }
  /** `href` déjà passé par `isSafeLinkValue` : un lien refusé ne devient jamais ce nœud. */
  | { type: "link"; href: string; children: ThemeMarkdownInline[] };

export type ThemeMarkdownBlock =
  | { type: "paragraph"; children: ThemeMarkdownInline[] }
  | { type: "list"; ordered: boolean; items: ThemeMarkdownInline[][] };

/**
 * Analyse un texte markdown restreint (voir l'en-tête du fichier). Ne lève jamais : une valeur qui
 * n'est pas une chaîne donne une liste vide, une syntaxe incomplète reste du texte.
 */
export function parseThemeMarkdown(text: string): ThemeMarkdownBlock[] {
  const source = (typeof text === "string" ? text : "")
    .slice(0, THEME_MARKDOWN_MAX_LENGTH)
    .replace(/\r\n?/g, "\n");
  const blocks: ThemeMarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const close = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
      paragraph = [];
    }
    if (list) {
      blocks.push({ type: "list", ordered: list.ordered, items: list.items.map(parseInline) });
      list = null;
    }
  };

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      close();
      continue;
    }
    const item = listItem(line);
    if (item) {
      if (!list || list.ordered !== item.ordered) {
        close();
        list = { ordered: item.ordered, items: [] };
      }
      list.items.push(item.content);
      continue;
    }
    // Une ligne ordinaire après une liste la termine : pas de continuation paresseuse, qui ferait
    // dépendre le sens d'une ligne de l'indentation de la précédente.
    if (list) {
      close();
    }
    paragraph.push(line);
  }
  close();
  return blocks;
}

/** `- texte`, `* texte` ou `12. texte` : la marque, un espace, puis un contenu non vide. */
function listItem(line: string): { ordered: boolean; content: string } | null {
  if ((line[0] === "-" || line[0] === "*") && line[1] === " ") {
    const content = line.slice(2).trim();
    return content === "" ? null : { ordered: false, content };
  }
  let digits = 0;
  while (digits < 10 && isDigit(line[digits])) {
    digits += 1;
  }
  if (digits > 0 && digits < 10 && line[digits] === "." && line[digits + 1] === " ") {
    const content = line.slice(digits + 2).trim();
    return content === "" ? null : { ordered: true, content };
  }
  return null;
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

function isBlank(char: string | undefined): boolean {
  return char === undefined || char === " " || char === "\t" || char === "\n";
}

/** Lettre, chiffre ou `_` : un `_` collé à un mot (`nom_de_variable`) n'ouvre ni ne ferme rien. */
function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}_]/u.test(char);
}

/**
 * Pour chaque position `i`, la première position `j ≥ i` qui satisfait `matches` (`s.length` si
 * aucune). Un seul passage de droite à gauche : c'est ce qui rend chaque recherche de délimiteur
 * fermant constante, au lieu d'un balayage par tentative — celui qui rendait quadratique une ligne
 * de `*` jamais refermés.
 */
function nextTable(s: string, matches: (j: number) => boolean): Int32Array {
  const table = new Int32Array(s.length + 2).fill(s.length);
  for (let j = s.length - 1; j >= 0; j -= 1) {
    table[j] = matches(j) ? j : table[j + 1]!;
  }
  return table;
}

interface Inside {
  strong: boolean;
  em: boolean;
  link: boolean;
}

function parseInline(s: string): ThemeMarkdownInline[] {
  // Un fermant n'est jamais précédé d'un blanc, un ouvrant jamais suivi d'un blanc : `2 * 3 * 4`
  // reste une multiplication. Dans une suite `***`, le gras se ferme sur les deux derniers `*` et
  // l'italique sur le premier (`***les deux***`) ; ailleurs, l'italique ne se ferme que sur un `*`
  // isolé, pour que `*a **b** c*` garde son gras à l'intérieur.
  const nextDouble = nextTable(
    s,
    (j) => s[j] === "*" && s[j + 1] === "*" && s[j + 2] !== "*" && !isBlank(s[j - 1]),
  );
  const nextStar = nextTable(
    s,
    (j) =>
      s[j] === "*" &&
      s[j - 1] !== "*" &&
      !isBlank(s[j - 1]) &&
      (s[j + 1] !== "*" || (s[j + 2] === "*" && s[j + 3] !== "*")),
  );
  const nextUnderscore = nextTable(
    s,
    (j) => s[j] === "_" && !isBlank(s[j - 1]) && !isWordChar(s[j + 1]),
  );
  const nextBracket = nextTable(s, (j) => s[j] === "]");
  const nextParen = nextTable(s, (j) => s[j] === ")");

  const parse = (start: number, end: number, inside: Inside): ThemeMarkdownInline[] => {
    const out: ThemeMarkdownInline[] = [];
    let textStart = start;
    const flush = (upTo: number): void => {
      if (upTo > textStart) {
        out.push({ type: "text", text: s.slice(textStart, upTo) });
      }
    };
    // Un délimiteur qui n'ouvre rien n'interrompt pas le texte : on avance d'un caractère sans
    // vider le tampon, et il sortira avec ses voisins.
    const open = (at: number, node: ThemeMarkdownInline | ThemeMarkdownInline[], next: number) => {
      flush(at);
      if (Array.isArray(node)) {
        out.push(...node);
      } else {
        out.push(node);
      }
      textStart = next;
      return next;
    };
    let i = start;
    while (i < end) {
      const char = s[i];
      if (char === "\n") {
        i = open(i, { type: "break" }, i + 1);
        continue;
      }
      if (char === "*" && s[i + 1] === "*" && !inside.strong && !isBlank(s[i + 2])) {
        const closing = nextDouble[i + 2]!;
        if (closing > i + 2 && closing + 1 < end) {
          const children = parse(i + 2, closing, { ...inside, strong: true });
          i = open(i, { type: "strong", children }, closing + 2);
          continue;
        }
      }
      if (char === "*" && s[i + 1] !== "*" && !inside.em && !isBlank(s[i + 1])) {
        const closing = nextStar[i + 1]!;
        if (closing > i + 1 && closing < end) {
          const children = parse(i + 1, closing, { ...inside, em: true });
          i = open(i, { type: "em", children }, closing + 1);
          continue;
        }
      }
      if (char === "_" && !inside.em && !isWordChar(s[i - 1]) && !isBlank(s[i + 1])) {
        const closing = nextUnderscore[i + 1]!;
        if (closing > i + 1 && closing < end) {
          const children = parse(i + 1, closing, { ...inside, em: true });
          i = open(i, { type: "em", children }, closing + 1);
          continue;
        }
      }
      if (char === "[" && !inside.link) {
        const bracket = nextBracket[i + 1]!;
        const paren = bracket + 1 < end && s[bracket + 1] === "(" ? nextParen[bracket + 2]! : end;
        if (bracket > i + 1 && paren < end) {
          const children = parse(i + 1, bracket, { ...inside, link: true });
          const href = s.slice(bracket + 2, paren);
          // Lien refusé (`javascript:`, adresse avec un blanc…) : le texte reste, le lien part.
          const node = isSafeLinkValue(href) ? { type: "link" as const, href, children } : children;
          i = open(i, node, paren + 1);
          continue;
        }
      }
      i += 1;
    }
    flush(end);
    return out;
  };

  return parse(0, s.length, { strong: false, em: false, link: false });
}
