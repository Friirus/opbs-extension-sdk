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
import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { invalidThemePages, type ConfigField, type ContributedScreen, type ExtensionDescriptor } from "../index";
import {
  discoverExtensions,
  inspectDescriptor,
  inspectThemeTemplates,
  type DiscoveredExtension,
} from "../loader/index";

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

  for (const [index, font] of (theme.fonts ?? []).entries()) {
    // `href` désigne une feuille externe qu'on ne peut pas vérifier d'ici ; `src` est un fichier
    // que le thème est censé livrer, servi comme les autres ressources.
    if (font.src) {
      mustExist(font.src, `theme.fonts[${index}].src`, "assets");
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
    ...checkThemeTemplates(entry),
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
