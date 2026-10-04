import type { ConfigField } from "../config-fields";
import type { ExtensionDescriptor } from "../manifest";
import { invalidContributedPages, invalidContributedScreens } from "../kinds/ui";

/**
 * Défauts structurels d'un module **chargé**, énoncés à l'hébergeur plutôt qu'à personne.
 *
 * Ces contrôles n'existaient que dans `pnpm check-extension`, c'est-à-dire seulement si l'auteur
 * du module pensait à le lancer. Or le modèle d'installation de ce projet est le dépôt de fichiers
 * sur le serveur : rien ne garantit qu'un module tiers ait jamais vu la CLI, et c'est précisément
 * le module non relu qui pose problème. Les défauts couverts ici ont tous la même signature, la
 * pire — le module se charge, l'écran répond, et il ne se passe rien : un `select` sans options
 * donne une liste vide qu'aucune erreur n'accompagne, un gabarit de page manquant retombe en
 * silence sur les sections.
 *
 * **Ce sont des avertissements, jamais un refus de chargement.** Une passerelle qui encaisse
 * parfaitement ne doit pas être écartée parce qu'un écran secondaire déclare un bundle absent : le
 * noyau sait déjà se rabattre proprement sur les sections. Le module reste `OK` et porte son
 * message, que le panel affiche à côté de lui.
 *
 * Vit dans le chargeur du SDK pour que la CLI et le noyau disent la même chose. La duplication
 * précédente était déjà en train de dériver : la CLI vérifiait des champs de configuration que le
 * chargeur acceptait sans un mot.
 */
export interface InspectDescriptorOptions {
  /** Un chemin relatif au dossier du module désigne-t-il un fichier existant ? */
  exists: (relativePath: string) => boolean;
}

export function inspectDescriptor(
  descriptor: ExtensionDescriptor<unknown>,
  options: InspectDescriptorOptions,
): string[] {
  return [
    ...configFieldProblems(descriptor.configFields, "configFields"),
    ...invalidContributedScreens(descriptor.contributesScreens ?? [], options.exists),
    ...invalidContributedPages(descriptor.contributesPages ?? [], options.exists),
  ];
}

/**
 * Champs de configuration que le panel ne saurait pas rendre.
 *
 * Le formulaire de l'écran Extensions est construit à partir de cette seule description. Un champ
 * sans libellé y devient une case anonyme, un `select` sans options une liste vide : dans les deux
 * cas l'hébergeur voit un champ qu'il ne peut pas remplir, donc un module qu'il ne peut pas
 * activer — `parseConfig` refusera la valeur manquante.
 */
function configFieldProblems(fields: ConfigField[] | undefined, where: string): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const field of fields ?? []) {
    if (seen.has(field.name)) {
      problems.push(`${where} : champ "${field.name}" déclaré deux fois — le second écrase le premier`);
    }
    seen.add(field.name);

    if (field.type === "select" && (field.options ?? []).length === 0) {
      problems.push(
        `${where} : champ "${field.name}" de type "select" sans "options" — liste déroulante vide`,
      );
    }
    if (!field.label?.trim()) {
      problems.push(`${where} : champ "${field.name}" sans libellé — le formulaire afficherait une case anonyme`);
    }
    // Types et attributs que seule la page de réglages d'un thème sait rendre. Ailleurs, le champ
    // s'affiche sans ce qui le rend utilisable — un `image` sans bouton de téléversement, un
    // `color` sans sélecteur — ou ne mène nulle part : un `token` n'a de feuille de style à
    // alimenter que pour un thème.
    if (
      field.type === "image" ||
      field.type === "color" ||
      field.type === "order" ||
      field.type === "list" ||
      field.type === "link" ||
      field.type === "font"
    ) {
      problems.push(
        `${where} : champ "${field.name}" de type "${field.type}", réservé aux réglages de thème`,
      );
    }
    if (field.token !== undefined || field.cssVar !== undefined || field.scheme !== undefined) {
      problems.push(
        `${where} : champ "${field.name}" — "token", "cssVar" et "scheme" n'ont de sens que dans les réglages d'un thème`,
      );
    }
    // Le texte riche n'est mis en forme que par le filtre `markdown` d'un gabarit : ailleurs, la
    // barre de mise en forme du panel produirait des astérisques que rien ne rend.
    if (field.format !== undefined) {
      problems.push(
        `${where} : champ "${field.name}" — "format" n'a de sens que dans les réglages d'un thème`,
      );
    }
    if (field.maxLength !== undefined && (!Number.isInteger(field.maxLength) || field.maxLength <= 0)) {
      problems.push(
        `${where} : champ "${field.name}" — "maxLength" doit être un entier strictement positif`,
      );
    }
  }
  return problems;
}
