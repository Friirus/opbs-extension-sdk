import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  missingRequiredIslands,
  themeViewSpec,
  unknownIslands,
  type ThemeViewSpec,
} from "../kinds/theme";

/** Ce qu'on peut reprocher à un gabarit sans l'exécuter. */
export interface ThemeTemplateFinding {
  /** Chemin du gabarit, relatif au dossier du thème. */
  templatePath: string;
  /** Vue correspondante, ou `null` si le nom du fichier n'en désigne aucune. */
  view: ThemeViewSpec | null;
  /** Îlots que la vue exige et que le gabarit ne place nulle part. */
  missingIslands: string[];
  /** `data-island` qui ne désignent aucun composant de l'hôte. */
  unknownIslands: string[];
  /**
   * Commentaires écrits en syntaxe Jinja/Twig (`{# … #}`), que Liquid ne connaît pas.
   *
   * Trouvé en production sur nos propres thèmes : Liquid ne reconnaît que `{% comment %}`, donc un
   * `{# … #}` n'est pas un commentaire mais du texte — rendu tel quel, sous les yeux du visiteur,
   * au milieu d'une page de contenu. Le réflexe vient de Jinja et de Twig, et rien dans le rendu
   * n'a l'air d'une erreur : c'est une phrase de plus, en français, dans une page qui en contient
   * déjà.
   */
  strayComments: string[];
}

/**
 * Inspecte les gabarits d'un thème déposé sur disque.
 *
 * Le pendant outillé de `missingRequiredIslands` (SDK), qui ne connaît qu'une source de gabarit :
 * ici on va la chercher, on nomme la vue depuis le nom du fichier, et on couvre aussi ce qui n'est
 * pas une vue mais peut porter des îlots : l'enveloppe (`language-switcher`) et les pages que le
 * thème apporte lui-même (`custom/`).
 *
 * Lecture seule, aucun rendu : un gabarit qui échoue à l'exécution est déjà couvert par le repli
 * du noyau, alors qu'un îlot oublié rend une page qui s'affiche parfaitement et ne fait rien.
 */
export function inspectThemeTemplates(
  themeDir: string,
  templatesDir = "templates",
): ThemeTemplateFinding[] {
  const findings: ThemeTemplateFinding[] = [];
  const root = join(themeDir, templatesDir);

  const inspect = (relativePath: string, viewName: string | null): void => {
    const full = join(themeDir, relativePath);
    if (!existsSync(full)) {
      return;
    }
    const source = readFileSync(full, "utf8");
    findings.push({
      templatePath: relativePath,
      view: viewName ? (themeViewSpec(viewName) ?? null) : null,
      missingIslands: viewName ? missingRequiredIslands(source, viewName) : [],
      unknownIslands: unknownIslands(source),
      // Non borné à la détection, tronqué seulement à l'affichage : un commentaire d'en-tête fait
      // couramment dix lignes, et une limite posée sur le motif laisserait passer précisément les
      // plus visibles.
      strayComments: [...source.matchAll(/\{#([\s\S]*?)#\}/g)].map((m) =>
        (m[1] ?? "").trim().split(/\s+/).slice(0, 6).join(" "),
      ),
    });
  };

  const pagesDir = join(root, "pages");
  if (existsSync(pagesDir)) {
    for (const file of readdirSync(pagesDir).sort()) {
      if (!file.endsWith(".liquid")) {
        continue;
      }
      inspect(`${templatesDir}/pages/${file}`, file.replace(/\.liquid$/, ""));
    }
  }

  // Les pages que le thème apporte lui-même : aucun îlot n'y est obligatoire — personne d'autre
  // que l'auteur ne sait ce que cette page raconte — mais un `data-island` mal orthographié y
  // reste un emplacement qui ne montera rien, et c'est ce qu'on cherche à dire avant le dépôt.
  const customDir = join(root, "custom");
  if (existsSync(customDir)) {
    for (const file of readdirSync(customDir).sort()) {
      if (!file.endsWith(".liquid")) {
        continue;
      }
      inspect(`${templatesDir}/custom/${file}`, null);
    }
  }

  for (const partial of ["header", "footer"]) {
    inspect(`${templatesDir}/partials/${partial}.liquid`, null);
  }

  return findings;
}
