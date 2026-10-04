/**
 * `check <chemin-vers-le-dossier-du-module>`
 *
 * Réutilise le chargeur réel (`discoverExtensions`, `../loader/discover.ts`) plutôt que d'inventer
 * une seconde vérification : le rapport qu'affiche cet outil est exactement ce que verrait
 * Paramètres › Extensions sur la même instance.
 *
 * Les capacités annoncées sans méthode sont désormais refusées par le chargeur lui-même, pour les
 * cinq genres qui en déclarent — cet outil n'a donc plus à les revérifier, il les lit dans le
 * statut. Ce qu'il ajoute est ce que le chargeur ne peut pas se permettre de refuser : des défauts
 * qui ne justifient pas d'éteindre un module en production, mais qu'un auteur a tout intérêt à
 * corriger avant de déposer. Un thème dont la police pointe vers un fichier absent s'affiche — mal,
 * et sans que rien ne le dise.
 *
 * Contrôle structurel, pas comportemental : ce script dit qu'un module a la bonne forme, pas qu'il
 * fonctionne contre un vrai prestataire — cette dernière responsabilité reste à son auteur (voir
 * la « soupape » dans COMPATIBILITY.md).
 *
 * Imports relatifs plutôt que `@opbs/extension-sdk` : ce fichier fait partie du paquet, qui ne
 * peut pas s'importer lui-même par son propre nom avant d'être installé.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  invalidThemePages,
  invalidThemeSettings,
  isSafeThemeFont,
  SUPPORTED_LOCALES,
  themePanelStrings,
  themeSettingWarnings,
  themeTranslationReads,
  type ConfigField,
  type ContributedScreen,
  type ExtensionDescriptor,
} from "../index";
import {
  discoverExtensions,
  inspectDescriptor,
  inspectThemeTemplates,
  type DiscoveredExtension,
} from "../loader/index";
// Hors de l'index, comme `ENUM_TOKENS` : un outil du paquet, pas une surface promise aux modules.
import { unknownThemeTokenPaths } from "../kinds/theme";

/** Un défaut relevé. `error` fait sortir en échec, `warn` informe sans bloquer. */
interface Finding {
  level: "error" | "warn";
  message: string;
}

/** Abstraction d'E/S : la CLI (console) et les tests (capture) partagent la même logique. */
export interface CliIo {
  log(message: string): void;
  error(message: string): void;
}

const consoleIo: CliIo = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

const USAGE = "Usage : check <chemin-vers-le-dossier-du-module>";

/**
 * Champs de configuration mal formés.
 *
 * L'essentiel est délégué au chargeur (`inspectDescriptor`), qui applique désormais les mêmes
 * contrôles au dépôt d'un module — la CLI dit donc exactement ce que le panel dira, ce qui n'était
 * plus vrai depuis que les deux listes avaient commencé à diverger. Ne reste ici que l'avis que le
 * chargeur ne porte pas : des `options` sur un type qui les ignore ne casse rien, ça se corrige
 * avant publication.
 */
function checkConfigFields(fields: ConfigField[] | undefined, where: string): Finding[] {
  const findings: Finding[] = [];

  for (const field of fields ?? []) {
    // Rendus par la seule page de réglages d'un thème : ailleurs ils sont ignorés en silence, ce
    // qui se corrige avant publication plutôt que de bloquer.
    if (
      field.min !== undefined ||
      field.max !== undefined ||
      field.step !== undefined ||
      field.unit !== undefined ||
      field.visibleWhen !== undefined ||
      field.localized !== undefined ||
      field.previewPath !== undefined ||
      field.subgroup !== undefined ||
      field.block !== undefined ||
      (field.options ?? []).some((option) => option.sets !== undefined)
    ) {
      findings.push({
        level: "warn",
        message: `${where} : champ "${field.name}" — bornes, unité, "visibleWhen", "localized", "previewPath", "subgroup", "block" et "sets" ne sont rendus que par la page de réglages d'un thème`,
      });
    }
    if (field.type !== "select" && (field.options ?? []).length > 0) {
      findings.push({
        level: "warn",
        message: `${where} : champ "${field.name}" porte des "options" que son type "${field.type}" ignore`,
      });
    }
  }
  return findings;
}

/**
 * Écrans contribués qui ne mèneront nulle part.
 *
 * Un écran déclaré est rendu par le panel quoi qu'il arrive ; c'est au moment où l'hébergeur
 * presse le bouton que l'absence de `runScreenEntryPoint` se découvre. Même signature pour un
 * bundle : le fichier absent ne se voit qu'à l'import, dans le navigateur d'un administrateur.
 */
function checkScreens(descriptor: ExtensionDescriptor): Finding[] {
  const screens = (descriptor.contributesScreens ?? []) as ContributedScreen[];
  if (screens.length === 0) {
    return [];
  }

  // Les défauts structurels (bundle absent, section inconnue…) sont rapportés par le chargeur,
  // qui les applique aussi au dépôt : voir `entry.statusMessage` plus bas. Ici, ce qui relève du
  // jugement d'auteur et n'a pas sa place dans un message de panel.
  const findings: Finding[] = [];

  // Un écran entièrement rendu par son bundle n'appelle pas forcément de point d'entrée : c'est le
  // seul cas où l'absence de `runScreenEntryPoint` est légitime.
  const needsEntryPoint = screens.some((screen) => (screen.sections ?? []).length > 0);
  if (needsEntryPoint && typeof descriptor.runScreenEntryPoint !== "function") {
    findings.push({
      level: "error",
      message: `écran(s) avec des sections mais pas de \`runScreenEntryPoint\` pour les servir`,
    });
  }

  for (const screen of screens) {
    // `label` et non `title` : c'est le nom de l'écran dans la navigation du panel. Les *sections*
    // d'un écran portent un `title`, ce qui prête à confusion à la lecture du contrat.
    if (!screen.label?.trim()) {
      findings.push({
        level: "warn",
        message: `écran "${screen.id}" sans libellé — sa page apparaîtra sans nom dans le panel`,
      });
    }
    // Un écran qui n'a que son bundle disparaît le jour d'une montée du contrat de panel : rien
    // ne le remplace, et l'hébergeur perd un écran sans savoir qu'il en avait un.
    if (screen.bundle && (screen.sections ?? []).length === 0) {
      findings.push({
        level: "warn",
        message: `écran "${screen.id}" : bundle sans sections de repli — l'écran disparaîtra si sa plage de panel cesse d'être couverte`,
      });
    }
  }
  return findings;
}

/**
 * Pages contribuées au portail dont rien ne servira le contenu.
 *
 * Ces défauts ont tous la même signature, la pire : le module se charge, la page répond, et il ne
 * se passe rien. Une page sans gabarit ni sections s'affiche vide, un identifiant malformé donne
 * une URL qui ne répond pas, un `cacheSeconds` en zone client n'est jamais honoré. Le noyau écarte
 * ce qui l'empêche de fonctionner, mais silencieusement — c'est ici que l'auteur l'apprend.
 */
function checkPages(descriptor: ExtensionDescriptor): Finding[] {
  const pages = descriptor.contributesPages ?? [];
  if (pages.length === 0) {
    return [];
  }

  const findings: Finding[] = [];

  // Une page qui ne déclare que des sections statiques est légitime : c'est le contexte qui est
  // vide, pas la page. Un tableau, en revanche, n'affichera jamais rien sans producteur.
  const needsData = pages.some((page) =>
    (page.sections ?? []).some((section) => section.type === "table"),
  );
  if (needsData && typeof descriptor.runPageData !== "function") {
    findings.push({
      level: "error",
      message: `page(s) avec un tableau mais pas de \`runPageData\` pour en produire les lignes`,
    });
  }

  const needsAction = pages.some((page) =>
    (page.sections ?? []).some((section) => section.type !== "table"),
  );
  if (needsAction && typeof descriptor.runPageAction !== "function") {
    findings.push({
      level: "error",
      message: `page(s) avec un formulaire ou un bouton mais pas de \`runPageAction\` pour le traiter`,
    });
  }

  // `runPageAction` écrite alors qu'aucune page ne déclare d'action : le noyau n'accepte que ce
  // qui figure dans `sections`, donc cette méthode ne sera jamais appelée. Avertissement à
  // l'échelle du module et non de la page — un module dont *une* page porte un bouton l'utilise,
  // même si ses autres pages sont de simples gabarits.
  if (!needsAction && typeof descriptor.runPageAction === "function") {
    findings.push({
      level: "warn",
      message: `\`runPageAction\` ne sera jamais appelée — seules les actions déclarées dans "sections" sont acceptées`,
    });
  }

  return findings;
}

/**
 * Fichiers qu'un thème déclare mais n'a pas déposés.
 *
 * Le chargeur vérifie que ces chemins restent dans le dossier du module — c'est une question de
 * sécurité, et il refuse ce qui en sort. Il ne vérifie pas qu'ils *existent* : un thème dont la
 * feuille de style manque se charge, s'applique, et rend une page à moitié peinte. La leçon a déjà
 * été apprise sur une police déclarée mais jamais chargée.
 */
/**
 * Clés de `theme.tokens` et `theme.tokensDark` que ce noyau ne connaît pas.
 *
 * Avis et non erreur : le chargeur les garde pour qu'un thème reste compatible avec deux versions
 * du noyau (un token ajouté plus tard). Mais `typography.lineheight` n'a aucun effet et ne produit
 * aucune erreur, et c'est ici seulement qu'une faute de frappe peut encore se voir. Lu dans le
 * fichier brut : le manifeste analysé a déjà écarté les clés de premier niveau qu'il ne connaît pas.
 */
function checkThemeTokenKeys(entry: DiscoveredExtension): Finding[] {
  if (!entry.manifest?.theme) {
    return [];
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(entry.path, "extension.json"), "utf8"));
  } catch {
    // Illisible : le chargeur l'a déjà dit, et bien plus précisément.
    return [];
  }
  const theme = (raw as { theme?: Record<string, unknown> } | null)?.theme;
  const findings: Finding[] = [];
  for (const key of ["tokens", "tokensDark"] as const) {
    for (const path of unknownThemeTokenPaths(theme?.[key])) {
      findings.push({
        level: "warn",
        message: `theme.${key}.${path} : token inconnu de ce noyau (faute de frappe ?) — il restera sans effet`,
      });
    }
  }
  return findings;
}

function checkThemeAssets(entry: DiscoveredExtension): Finding[] {
  const theme = entry.manifest?.theme;
  if (!theme) {
    return [];
  }

  const findings: Finding[] = [];

  /**
   * Deux bases distinctes, et c'est le piège de cette section du manifeste.
   *
   * `assets` et `stylesheet` sont résolus depuis le dossier du module
   * (`ThemesService.stylesheet`), tandis que `logo`, `favicon` et `fonts[].src` deviennent des URL
   * sous `/assets/` et sont donc résolus **dans le dossier de ressources**
   * (`ThemesService.asset`, et `themeFontFaces` côté UI). D'où un manifeste qui paraît incohérent
   * — `"assets/kiosque.css"` à côté de `"logo.svg"` — alors qu'il est juste.
   */
  const mustExist = (
    relative: string | undefined,
    label: string,
    base: "module" | "assets",
    wantDir = false,
  ) => {
    if (!relative) {
      return;
    }
    const root = base === "assets" ? join(entry.path, theme.assets ?? "assets") : entry.path;
    const full = join(root, relative);
    if (!existsSync(full)) {
      findings.push({ level: "error", message: `${label} introuvable : "${relative}"` });
      return;
    }
    if (wantDir && !statSync(full).isDirectory()) {
      findings.push({ level: "error", message: `${label} doit être un dossier : "${relative}"` });
    }
  };

  mustExist(theme.assets, "theme.assets", "module", true);
  mustExist(theme.templates, "theme.templates", "module", true);
  mustExist(theme.script, "theme.script", "module");
  mustExist(theme.stylesheet, "theme.stylesheet", "module");
  mustExist(theme.logo, "theme.logo", "assets");
  mustExist(theme.favicon, "theme.favicon", "assets");
  mustExist(theme.screenshot, "theme.screenshot", "module");

  // La capture est servie telle quelle dans le panel : un format que le navigateur n'affiche pas
  // donne une vignette cassée, et une capture de plusieurs Mo ralentit tout le sélecteur.
  if (theme.screenshot) {
    if (!/\.(png|jpe?g|webp)$/i.test(theme.screenshot)) {
      findings.push({
        level: "error",
        message: `theme.screenshot doit être un PNG, un JPEG ou un WebP : "${theme.screenshot}"`,
      });
    }
    const full = join(entry.path, theme.screenshot);
    if (existsSync(full) && statSync(full).size > 400 * 1024) {
      findings.push({
        level: "warn",
        message: `theme.screenshot pèse ${Math.round(statSync(full).size / 1024)} Ko — 400 Ko au plus recommandés`,
      });
    }
  }

  for (const [index, font] of (theme.fonts ?? []).entries()) {
    // `href` désigne une feuille externe qu'on ne peut pas vérifier d'ici ; `src` est un fichier
    // que le thème est censé livrer, servi comme les autres ressources.
    if (font.src) {
      mustExist(font.src, `theme.fonts[${index}].src`, "assets");
      // Le noyau n'émet le `@font-face` que d'une police qui passe sa liste blanche, et omet les
      // autres sans rien dire : le texte retombait sur la police système en production, alors que
      // ce contrôle rendait OK. Un avis et non une erreur, puisque la page se rend.
      if (!isSafeThemeFont(font)) {
        findings.push({
          level: "warn",
          message:
            `theme.fonts[${index}] (« ${font.family} ») : police écartée du @font-face — famille en ` +
            `lettres ASCII, chiffres, espaces, _ ou - (64 au plus), graisse normal, bold ou 1 à 1000 ` +
            `(deux pour une police variable), style normal ou italic, display auto, block, swap, ` +
            `fallback ou optional`,
        });
      }
    }
  }
  return findings;
}

/** Chaque gabarit `.liquid` du thème, sous-dossiers compris, avec son chemin relatif au thème. */
function themeTemplateSources(
  themeDir: string,
  templatesDir: string,
): Array<{ path: string; source: string }> {
  const found: Array<{ path: string; source: string }> = [];
  const walk = (relativeDir: string): void => {
    const full = join(themeDir, relativeDir);
    const items = existsSync(full) ? readdirSync(full, { withFileTypes: true }) : [];
    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${relativeDir}/${item.name}`;
      if (item.isDirectory()) {
        walk(path);
      } else if (item.name.endsWith(".liquid")) {
        found.push({ path, source: readFileSync(join(themeDir, path), "utf8") });
      }
    }
  };
  walk(templatesDir);
  return found;
}

/**
 * Lignes d'un gabarit où une expression applique le filtre `raw`.
 *
 * Seul le balisage évalué compte (`{{ … }}`, `{% … %}`) : le contenu d'un bloc `{% raw %}` ou
 * `{% comment %}`, et un commentaire en ligne `{% # … %}`, ne sont que du texte, et les signaler
 * serait un avis qu'on sait faux. Les blocs écartés sont remplacés par des blancs de même
 * longueur, pour que les numéros de ligne restent ceux du fichier.
 */
function rawFilterLines(source: string): number[] {
  const evaluated = source.replace(
    /\{%-?\s*(raw|comment)\s*-?%\}[\s\S]*?\{%-?\s*end\1\s*-?%\}/g,
    (block) => block.replace(/[^\n]/g, " "),
  );
  const lines = new Set<number>();
  for (const markup of evaluated.matchAll(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g)) {
    if (/^\{%-?\s*#/.test(markup[0])) {
      continue;
    }
    for (const filter of markup[0].matchAll(/\|\s*raw\b/g)) {
      const offset = (markup.index ?? 0) + (filter.index ?? 0);
      lines.add(evaluated.slice(0, offset).split("\n").length);
    }
  }
  return [...lines];
}

/**
 * `| raw` dans un gabarit de thème : sans effet, le noyau échappe toute sortie.
 *
 * Le moteur du noyau réenregistre `raw` sans son drapeau, précisément pour qu'aucun gabarit ne
 * puisse faire sortir une valeur du contexte en HTML brut. Un auteur qui l'écrit attend pourtant ce
 * HTML brut, et découvrira ses balises affichées en texte à l'écran : l'avis le lui dit avant. Un
 * avis et non une erreur, puisque la page se rend et ne met rien en danger. Le seul HTML qui sort
 * tel quel est celui que le noyau construit lui-même (`ThemeEmailContext.bodyHtml`), et il n'a pas
 * besoin du filtre pour ça.
 */
function checkThemeRawFilters(entry: DiscoveredExtension): Finding[] {
  const theme = entry.manifest?.theme;
  if (!theme) {
    return [];
  }
  const findings: Finding[] = [];
  for (const { path, source } of themeTemplateSources(entry.path, theme.templates ?? "templates")) {
    const lines = rawFilterLines(source);
    if (lines.length > 0) {
      findings.push({
        level: "warn",
        message:
          `${path} (ligne${lines.length > 1 ? "s" : ""} ${lines.join(", ")}) : « | raw » sans effet, ` +
          `le noyau échappe toute sortie — un HTML attendu brut s'affichera en texte (seul ` +
          `\`bodyHtml\` d'un e-mail sort en HTML, et sans ce filtre)`,
      });
    }
  }
  return findings;
}

/**
 * Le balisage qu'un gabarit émet réellement : le contenu des blocs `{% comment %}` et `{% raw %}`,
 * et des commentaires HTML, remplacé par des blancs de même longueur — les numéros de ligne
 * restent ceux du fichier.
 */
function emittedMarkup(source: string): string {
  return source.replace(
    /\{%-?\s*(raw|comment)\s*-?%\}[\s\S]*?\{%-?\s*end\1\s*-?%\}|<!--[\s\S]*?-->/g,
    (block) => block.replace(/[^\n]/g, " "),
  );
}

/**
 * Clés nommées par `data-theme-text="clé"` dans un gabarit, avec leur ligne. Une valeur calculée
 * (`{{ … }}`) ne se juge pas sans rendu, elle est laissée de côté.
 */
function annotatedTextKeys(source: string): Array<{ line: number; key: string }> {
  const emitted = emittedMarkup(source);
  const found: Array<{ line: number; key: string }> = [];
  for (const match of emitted.matchAll(/data-theme-text\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const value = match[1] ?? match[2] ?? "";
    if (value.includes("{{") || value.includes("{%")) {
      continue;
    }
    const line = emitted.slice(0, match.index ?? 0).split("\n").length;
    for (const key of value.split(/\s+/).filter((part) => part !== "")) {
      found.push({ line, key });
    }
  }
  return found;
}

/**
 * Lignes d'un gabarit où `| markdown` est appliqué **à l'intérieur d'une balise ouverte** — dans un
 * attribut (`title="{{ x | markdown }}"`) ou à sa place.
 *
 * Le filtre produit du HTML (`<p>`, `<a href="…">`), marqué sûr pour sortir tel quel entre deux
 * balises. Dans un attribut, ce HTML n'a plus de sens : le noyau encode ses propres attributs pour
 * qu'il reste inerte, mais la page affiche alors du balisage en guise d'infobulle. Un avis et non
 * une erreur, puisque rien ne s'exécute.
 *
 * La position se juge sur le balisage émis, les expressions Liquid effacées : un `>` dans
 * `{% if a > b %}` ne ferme aucune balise.
 */
function markdownInTagLines(source: string): number[] {
  const emitted = emittedMarkup(source);
  const html = emitted.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, (markup) =>
    markup.replace(/[^\n]/g, " "),
  );
  const lines = new Set<number>();
  for (const markup of emitted.matchAll(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g)) {
    if (!/\|\s*markdown\b/.test(markup[0])) {
      continue;
    }
    const offset = markup.index ?? 0;
    const lastOpen = html.lastIndexOf("<", offset);
    const lastClose = html.lastIndexOf(">", offset);
    // Une balise ouverte : un `<` suivi d'un nom de balise, sans `>` depuis.
    if (lastOpen > lastClose && /[a-zA-Z]/.test(html[lastOpen + 1] ?? "")) {
      lines.add(emitted.slice(0, offset).split("\n").length);
    }
  }
  return [...lines];
}

/** `| markdown` placé dans une balise ouverte : voir `markdownInTagLines`. */
function checkThemeMarkdownPlacement(entry: DiscoveredExtension): Finding[] {
  const theme = entry.manifest?.theme;
  if (!theme) {
    return [];
  }
  const findings: Finding[] = [];
  for (const { path, source } of themeTemplateSources(entry.path, theme.templates ?? "templates")) {
    const lines = markdownInTagLines(source);
    if (lines.length > 0) {
      findings.push({
        level: "warn",
        message:
          `${path} (ligne${lines.length > 1 ? "s" : ""} ${lines.join(", ")}) : « | markdown » dans ` +
          `une balise ouverte (attribut) — le filtre produit des paragraphes et des liens, qui ` +
          `n'ont leur place qu'entre deux balises ; l'attribut afficherait du balisage`,
      });
    }
  }
  return findings;
}

/**
 * `data-theme-setting` qui nomme un réglage que le thème ne déclare pas.
 *
 * L'attribut relie une région d'un gabarit aux réglages qui la façonnent : l'aperçu du panel y pose
 * un bouton « Modifier » qui ouvre ces champs, et l'entrée dans une section y fait défiler la page.
 * Un nom inconnu ne casse rien — la zone reste simplement muette au clic —, c'est pourquoi c'est un
 * avis : une faute de frappe, ou un réglage renommé sans reprendre ses annotations.
 *
 * Seul le balisage réellement émis compte : le contenu d'un bloc `{% comment %}` ou `{% raw %}` et
 * d'un commentaire HTML n'atteint jamais le DOM. Une valeur calculée (`{{ … }}`) ne se juge pas
 * sans rendu, elle est laissée de côté.
 */
function checkThemeSettingAnnotations(entry: DiscoveredExtension): Finding[] {
  const theme = entry.manifest?.theme;
  if (!theme) {
    return [];
  }
  const declared = new Set((theme.settings ?? []).map((field) => field.name));
  const findings: Finding[] = [];
  for (const { path, source } of themeTemplateSources(entry.path, theme.templates ?? "templates")) {
    const emitted = emittedMarkup(source);
    for (const match of emitted.matchAll(/data-theme-setting\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const value = match[1] ?? match[2] ?? "";
      if (value.includes("{{") || value.includes("{%")) {
        continue;
      }
      const line = emitted.slice(0, match.index ?? 0).split("\n").length;
      for (const name of value.split(/\s+/).filter((part) => part !== "")) {
        if (!declared.has(name)) {
          findings.push({
            level: "warn",
            message:
              `${path} (ligne ${line}) : data-theme-setting nomme « ${name} », qui n'est pas un ` +
              `réglage déclaré — le bouton « Modifier » de l'aperçu n'ouvrira aucun champ pour lui`,
          });
        }
      }
    }
  }
  return findings;
}

/**
 * Traductions du thème : les clés qu'un gabarit lit sous `t` doivent exister.
 *
 * Une clé absente ne casse rien — le gabarit rend du vide — et c'est précisément le problème :
 * un bouton sans libellé se remarque à l'usage, pas à la relecture. Le contrôle porte aussi sur
 * l'écart entre langues, parce qu'une traduction oubliée retombe silencieusement sur celle de
 * l'instance : la page reste lisible, mais panachée.
 *
 * L'avis inverse — une clé que plus personne ne lit — est rendu muet dès qu'un gabarit indexe `t`
 * par variable : voir `indexed` ci-dessous.
 */
function checkThemeTranslations(entry: DiscoveredExtension): Finding[] {
  const theme = entry.manifest?.theme;
  if (!theme || !entry.path) {
    return [];
  }
  const findings: Finding[] = [];
  const dir = join(entry.path, theme.locales ?? "locales");

  const used = new Set<string>();
  /**
   * Un gabarit lit-il `t` par variable (`t[key]`) plutôt que par nom ?
   *
   * C'est le motif qui traduit un code venu du noyau — `status` d'un service, `kind` d'une demande
   * de droits : le gabarit compose la clé (`"status" | append: service.status`) et l'indexe. Les
   * clés correspondantes sont bien lues, mais aucune ne s'écrit `t.quelqueChose`, si bien que la
   * lecture statique ci-dessus les croit mortes. Dès qu'un seul gabarit indexe `t`, on ne peut
   * plus prouver qu'une clé ne sert pas — et un avis qu'on sait faux apprend à ignorer les avis.
   */
  let indexed = false;
  const templates = themeTemplateSources(entry.path, theme.templates ?? "templates");
  for (const { source } of templates) {
    // Même lecture que le panel, qui range chaque texte du thème sous les gabarits qui le lisent.
    const reads = themeTranslationReads(source);
    for (const key of reads.keys) {
      used.add(key);
    }
    indexed ||= reads.indexed;
  }

  if (!existsSync(dir)) {
    if (used.size > 0) {
      findings.push({
        level: "error",
        message: `gabarits : ${used.size} libellé(s) lus sous "t" mais aucun dossier de traductions (${theme.locales ?? "locales"}/)`,
      });
    }
    return findings;
  }

  const tables = new Map<string, Record<string, string>>();
  // Les seuls `*.json` du dossier lui-même : le sous-dossier `panel/` (traductions des réglages,
  // voir `checkThemePanelTranslations`) n'est pas une langue des gabarits, et le moteur de rendu ne
  // le lit pas non plus — il n'ouvre que `<locales>/<langue>.json`.
  for (const file of readdirSync(dir, { withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith(".json"))
    .map((item) => item.name)) {
    const locale = file.replace(/\.json$/, "");
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        findings.push({ level: "error", message: `${file} : un objet de clés est attendu` });
        continue;
      }
      const entries = Object.entries(parsed as Record<string, unknown>);
      const wrong = entries.filter(([, value]) => typeof value !== "string").map(([key]) => key);
      if (wrong.length > 0) {
        findings.push({
          level: "error",
          message: `${file} : valeur non textuelle pour ${wrong.join(", ")} — le noyau les ignore`,
        });
      }
      tables.set(locale, Object.fromEntries(entries.filter((e): e is [string, string] => typeof e[1] === "string")));
    } catch (error) {
      findings.push({
        level: "error",
        message: `${file} : JSON illisible (${error instanceof Error ? error.message : String(error)})`,
      });
    }
  }

  const known = new Set([...tables.values()].flatMap((table) => Object.keys(table)));
  const missing = [...used].filter((key) => !known.has(key)).sort();
  if (missing.length > 0) {
    findings.push({
      level: "error",
      message: `gabarits : libellé(s) lus sous "t" mais absents de toutes les traductions — ${missing.join(", ")}`,
    });
  }
  // Les textes nommés hors d'une lecture `t.<clé>` — une zone `data-theme-text`, une section qui
  // les range (`settingGroups[].texts`) — doivent exister aussi : sinon l'aperçu du panel mène à
  // une entrée qui n'existe pas, ou la section annonce un texte qu'on ne peut pas modifier.
  const textAnnotations = templates.flatMap(({ path, source }) =>
    annotatedTextKeys(source).map((annotation) => ({ path, ...annotation })),
  );
  for (const { path, line, key } of textAnnotations) {
    if (!known.has(key)) {
      findings.push({
        level: "warn",
        message:
          `${path} (ligne ${line}) : data-theme-text nomme « ${key} », absente des traductions — ` +
          `l'aperçu du panel ne mènera à aucun texte pour cette zone`,
      });
    }
  }
  for (const group of theme.settingGroups ?? []) {
    const unknown = (group.texts ?? []).filter((key) => !known.has(key));
    if (unknown.length > 0) {
      findings.push({
        level: "warn",
        message:
          `section « ${group.name} » : « texts » cite ${unknown.join(", ")}, absente(s) des ` +
          `traductions — le panel n'aurait aucun texte à y montrer`,
      });
    }
  }
  const unused = indexed ? [] : [...known].filter((key) => !used.has(key)).sort();
  if (unused.length > 0) {
    findings.push({
      level: "warn",
      message: `traductions : clé(s) qu'aucun gabarit ne lit — ${unused.slice(0, 10).join(", ")}${unused.length > 10 ? "…" : ""}`,
    });
  }
  for (const [locale, table] of tables) {
    const gaps = [...known].filter((key) => !(key in table)).sort();
    if (gaps.length > 0) {
      findings.push({
        level: "warn",
        message: `${locale}.json : ${gaps.length} clé(s) non traduite(s) — la langue de l'instance s'affichera à la place (${gaps.slice(0, 6).join(", ")}${gaps.length > 6 ? "…" : ""})`,
      });
    }
  }
  return findings;
}

/**
 * Gabarits de vue dont il manque un îlot.
 *
 * Le défaut le plus coûteux du système de thèmes, et le seul qui ne se voie pas : un gabarit de
 * catalogue qui oublie `data-island="order-button"` s'affiche parfaitement, se relit sans rien
 * remarquer, et ne vend rien. Personne ne le découvre avant le premier client qui renonce.
 *
 * Trois niveaux de gravité, dans l'ordre de ce qu'ils coûtent :
 * - îlot obligatoire absent → **erreur**, la vue perd une action que rien d'autre ne rend ;
 * - `data-island` inconnu → **erreur** aussi, mais pour une autre raison : c'est presque toujours
 *   une faute de frappe sur un nom d'îlot voulu, donc le même défaut déguisé ;
 * - gabarit qui ne correspond à aucune vue → **avis** : le fichier ne sera jamais rendu, mais il
 *   ne casse rien et peut être un reste d'une version antérieure du thème.
 */
function checkThemeTemplates(entry: DiscoveredExtension): Finding[] {
  const theme = entry.manifest?.theme;
  if (!theme) {
    return [];
  }

  const findings: Finding[] = [];
  for (const found of inspectThemeTemplates(entry.path, theme.templates ?? "templates")) {
    if (found.missingIslands.length > 0) {
      findings.push({
        level: "error",
        message:
          `${found.templatePath} : îlot(s) obligatoire(s) absent(s) — ${found.missingIslands.join(", ")}. ` +
          `La page s'affichera sans que rien ne le signale, et l'action correspondante sera perdue`,
      });
    }
    for (const unknown of found.unknownIslands) {
      findings.push({
        level: "error",
        message: `${found.templatePath} : data-island="${unknown}" ne désigne aucun composant de l'hôte (faute de frappe ?)`,
      });
    }
    for (const stray of found.strayComments) {
      findings.push({
        level: "error",
        message:
          `${found.templatePath} : « {# ${stray}… #} » — Liquid ne connaît pas cette syntaxe de ` +
          `commentaire (c'est celle de Jinja/Twig) et rendra ce texte tel quel au visiteur. ` +
          `Utiliser {% comment %}…{% endcomment %}`,
      });
    }
    for (const target of found.missingPartials) {
      findings.push({
        level: "error",
        message:
          `${found.templatePath} : {% render "${target}" %} ne désigne aucun fichier du thème — ` +
          `le chemin part de la racine du thème, pas du gabarit (« templates/partials/x », pas ` +
          `« partials/x »). Le gabarit entier échouera au rendu et la page retombera en silence ` +
          `sur l'écran d'origine du portail`,
      });
    }
    if (!found.view && found.templatePath.includes("/pages/")) {
      findings.push({
        level: "warn",
        message: `${found.templatePath} : aucune vue de ce nom — ce gabarit ne sera jamais rendu`,
      });
    }
  }

  // Les pages que le thème apporte lui-même. Aucun de ces défauts ne se voit au rendu, et chacun
  // produit un thème qui paraît complet : un slug réservé donne une page que la route du noyau
  // masque en permanence, un doublon en fait disparaître une, un gabarit manquant donne un 404 sur
  // un lien que le thème a lui-même mis en navigation.
  const templatesDir = theme.templates ?? "templates";
  for (const problem of invalidThemePages(
    theme.pages,
    (relativePath) => existsSync(join(entry.path, relativePath)),
    templatesDir,
  )) {
    findings.push({ level: "error", message: problem });
  }

  // Les réglages sont ce que l'hébergeur verra dans la page de configuration du thème : un nom
  // invalide donne un champ qu'aucun gabarit ne peut lire, un doublon une valeur perdue en
  // silence, un `select` sans option une liste vide. Trois défauts qui ne se voient qu'en ouvrant
  // cette page, c'est-à-dire trop tard.
  for (const problem of invalidThemeSettings(theme.settings, theme)) {
    findings.push({ level: "error", message: problem });
  }
  for (const advice of themeSettingWarnings(theme)) {
    findings.push({ level: "warn", message: advice });
  }

  return findings;
}

/** Nombre de chaînes citées par un avis avant « … » : le détail complet encombrerait la console. */
const PANEL_SAMPLE = 6;

/**
 * Traductions des textes du manifeste pour le panel : `<locales>/panel/<langue>.json`.
 *
 * Une par langue de `SUPPORTED_LOCALES` autre que celle du manifeste (`settingsLocale`, défaut
 * `en`). Tout est avis et rien n'est erreur : une traduction absente retombe sur la chaîne source,
 * le panel reste utilisable — dans une autre langue que celle du staff. Seul un fichier illisible
 * est une erreur, parce qu'il annule en silence toutes les traductions qu'il contient.
 *
 * La clé est la chaîne source exacte (façon gettext) : un libellé retouché dans le manifeste rend
 * sa traduction orpheline, d'où l'avis sur les clés que plus aucune chaîne ne porte.
 */
function checkThemePanelTranslations(entry: DiscoveredExtension): Finding[] {
  const theme = entry.manifest?.theme;
  if (!theme || !entry.path) {
    return [];
  }
  const sources = themePanelStrings(theme);
  if (sources.length === 0) {
    return [];
  }
  const settingsLocale = theme.settingsLocale ?? "en";
  const panelDir = `${theme.locales ?? "locales"}/panel`;
  const findings: Finding[] = [];
  const sample = (items: string[]) =>
    `${items
      .slice(0, PANEL_SAMPLE)
      .map((item) => `« ${item} »`)
      .join(", ")}${items.length > PANEL_SAMPLE ? "…" : ""}`;

  for (const locale of SUPPORTED_LOCALES) {
    if (locale === settingsLocale) {
      continue;
    }
    const file = `${panelDir}/${locale}.json`;
    const full = join(entry.path, file);
    if (!existsSync(full)) {
      findings.push({
        level: "warn",
        message: `${file} absent — le panel affichera les ${sources.length} textes des réglages en « ${settingsLocale} » à un membre du staff en « ${locale} »`,
      });
      continue;
    }
    let table: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(readFileSync(full, "utf8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        findings.push({ level: "error", message: `${file} : un objet { "chaîne source": "traduction" } est attendu` });
        continue;
      }
      table = parsed as Record<string, unknown>;
    } catch (error) {
      findings.push({
        level: "error",
        message: `${file} : JSON illisible (${error instanceof Error ? error.message : String(error)})`,
      });
      continue;
    }
    const untranslated = sources.filter((source) => {
      const value = table[source];
      return typeof value !== "string" || value.trim() === "";
    });
    if (untranslated.length > 0) {
      findings.push({
        level: "warn",
        message: `${file} : ${untranslated.length} texte(s) sans traduction, affiché(s) tel(s) quel(s) — ${sample(untranslated)}`,
      });
    }
    const known = new Set(sources);
    const orphans = Object.keys(table).filter((key) => !known.has(key));
    if (orphans.length > 0) {
      findings.push({
        level: "warn",
        message: `${file} : ${orphans.length} clé(s) qui ne correspondent à aucun texte du manifeste (libellé retouché ?) — ${sample(orphans)}`,
      });
    }
  }
  return findings;
}

/** Renseignements que le panel affiche et dont l'absence se voit tout de suite. */
function checkIdentity(entry: DiscoveredExtension): Finding[] {
  const findings: Finding[] = [];
  if (!entry.manifest?.author?.trim()) {
    findings.push({
      level: "warn",
      message: `pas d'"author" — l'hébergeur d'un module en panne ne saura pas à qui écrire`,
    });
  }
  if (!entry.manifest?.description?.trim()) {
    findings.push({ level: "warn", message: `pas de "description" — la carte du panel restera nue` });
  }
  return findings;
}

function inspect(entry: DiscoveredExtension): Finding[] {
  const findings: Finding[] = [
    ...checkIdentity(entry),
    ...checkThemeAssets(entry),
    ...checkThemeTokenKeys(entry),
    ...checkThemeTemplates(entry),
    ...checkThemeRawFilters(entry),
    ...checkThemeMarkdownPlacement(entry),
    ...checkThemeSettingAnnotations(entry),
    ...checkThemeTranslations(entry),
    ...checkThemePanelTranslations(entry),
  ];

  const descriptor = entry.descriptor as (ExtensionDescriptor & Record<string, unknown>) | undefined;
  if (!descriptor) {
    // Cas normal d'un thème : tout ce qu'il apporte tient dans son manifeste.
    return findings;
  }

  // Ce que le chargeur a lui-même relevé au chargement : même code, même formulation que ce que
  // l'hébergeur lira dans le panel s'il dépose le module en l'état.
  findings.push(
    ...inspectDescriptor(descriptor, {
      exists: (relativePath) => existsSync(join(entry.path, relativePath)),
    }).map((message) => ({ level: "error" as const, message })),
  );
  findings.push(...checkConfigFields(descriptor.configFields, "configFields"));
  findings.push(...checkScreens(descriptor));
  findings.push(...checkPages(descriptor));

  // Les deux listes propres aux genres qui distinguent réglages du module et réglages par produit
  // ou par fournisseur. Nommées ici plutôt que devinées : un module `payment` n'en a aucune.
  for (const key of ["productConfigFields", "providerConfigFields"] as const) {
    if (Array.isArray(descriptor[key])) {
      findings.push(...checkConfigFields(descriptor[key] as ConfigField[], key));
    }
  }

  return findings;
}

/** Synchrone, ne quitte jamais le processus : c'est `bin/opbs-extension.ts` qui décide de ça. */
export function main(argv: string[], io: CliIo = consoleIo): number {
  const [target] = argv;
  if (!target) {
    io.error(USAGE);
    return 1;
  }

  const moduleDir = resolve(target);
  const parent = dirname(moduleDir);
  const name = basename(moduleDir);

  const discovered = discoverExtensions({ dir: parent });
  const entry = discovered.find((candidate) => resolve(candidate.path) === moduleDir);

  if (!entry) {
    io.error(`Aucun module trouvé dans ${moduleDir} (pas d'"extension.json" ?)`);
    return 1;
  }

  io.log(`${entry.moduleId} (dossier "${name}")`);
  io.log(`  genre  : ${entry.manifest?.kind ?? "inconnu"}`);
  io.log(`  statut : ${entry.status}`);
  if (entry.statusMessage) {
    io.log(`  motif  : ${entry.statusMessage}`);
  }

  // Un module que le chargeur refuse ne sera pas inspecté plus avant : son descripteur n'a pas
  // été exécuté, il n'y a rien à examiner. Le statut dit déjà tout.
  if (entry.status !== "OK") {
    return 1;
  }

  const findings = inspect(entry);
  for (const finding of findings) {
    // `error` et `warn` visaient tous deux stderr côté console d'origine — seule la structure du
    // rapport (id, genre, statut, résumé final) va sur stdout.
    io.error(`  ${finding.level === "error" ? "erreur " : "avis   "}: ${finding.message}`);
  }

  const errors = findings.filter((finding) => finding.level === "error").length;
  if (errors === 0) {
    io.log(
      findings.length === 0
        ? "  OK — aucune anomalie structurelle."
        : "  OK — aucune erreur bloquante, voir les avis ci-dessus.",
    );
  }
  return errors === 0 ? 0 : 1;
}
