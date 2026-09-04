import type { ConfigField } from "../config-fields";

/**
 * Ce qu'un module ajoute à l'interface : un **écran** dans le panel d'administration, une **page**
 * dans le portail client. Deux contrats distincts, un format de sections commun.
 *
 * Ils partagent `ScreenSection` parce que le besoin est le même — décrire un tableau, un
 * formulaire, des boutons — et rien d'autre : la zone, la portée des données et le chemin d'URL
 * n'ont pas d'équivalent d'un côté à l'autre. Voir la note de `ContributedPage` sur la raison de ne
 * pas avoir simplement ajouté un champ `area` à `ContributedScreen`.
 *
 * Le rendu est déclaratif par défaut : le module décrit, le noyau rend. Ce qui vaut pour les deux
 * surfaces, et sans exception pour une page de portail — celle-ci est publique, servie à des
 * visiteurs anonymes, et n'exécutera jamais de code d'interface tiers.
 *
 * Un **écran de panel** peut en plus livrer son propre rendu (`ScreenBundle`), parce que la
 * contrainte qui fondait l'interdit n'était pas la bonne : ce qu'on refuse, c'est de reconstruire
 * l'image à l'installation d'un module, pas d'exécuter du code que son auteur a déjà construit.
 * Un fichier ESM importé à l'exécution ne demande aucune compilation chez l'hébergeur, donc
 * l'installation reste un dépôt de fichiers.
 *
 * Porté par le socle `ExtensionDescriptor` plutôt que réservé à un genre : un module de
 * provisioning peut tout autant vouloir afficher un tableau de bord qu'un canal de notification.
 */
export interface ScreenTableSection {
  type: "table";
  title: string;
  /**
   * Où lire les lignes, et le sens dépend de la surface — c'est la seule divergence entre les deux.
   *
   * Écran de panel : point d'entrée appelé sans argument, un aller-retour par tableau.
   * Page de portail : **clé du contexte** rendu par `runPageData`, où le module a déjà rangé ses
   * lignes. Une page publique appelle du code tiers sur son chemin de rendu ; lui faire faire un
   * appel par tableau multiplierait ce coût par le nombre de sections, pour des données que le
   * module a de toute façon sous la main au même moment.
   */
  entryPoint: string;
  columns: { key: string; label: string }[];
}

export interface ScreenFormSection {
  type: "form";
  title: string;
  fields: ConfigField[];
  /** Point d'entrée appelé avec les valeurs soumises. */
  entryPoint: string;
  submitLabel: string;
}

export interface ScreenActionSection {
  type: "actions";
  title: string;
  actions: { id: string; label: string; confirm?: string }[];
}

export type ScreenSection = ScreenTableSection | ScreenFormSection | ScreenActionSection;

export interface ContributedScreen {
  /** Unique parmi les écrans de ce module. Sert de segment d'URL. */
  id: string;
  label: string;
  /**
   * Rendu déclaratif, par le moteur du panel. Absent seulement si `bundle` prend le relais.
   *
   * Reste utile même avec un `bundle` : c'est le **repli** servi quand le fichier manque ou que sa
   * plage de contrat ne couvre plus celle du panel. Un écran qui n'a que son bundle disparaît le
   * jour d'une montée de version ; le même écran avec trois sections continue de rendre le service
   * essentiel en attendant que son auteur republie.
   */
  sections?: ScreenSection[];
  /** Rendu par le code du module lui-même. Voir `ScreenBundle`. */
  bundle?: ScreenBundle;
}

/**
 * Version du **contrat de panel** : ce que le noyau promet à un écran monté par le code d'un
 * module. Distincte de `HOST_CONTRACT_VERSION`, et c'est tout l'intérêt.
 *
 * Les deux ne bougent pas pour les mêmes raisons ni au même rythme. Le contrat d'hôte gagne un
 * genre ou une capacité toutes les semaines — quinze itérations en un mois — et chacune invalide
 * les manifestes. Le contrat de panel, lui, ne parle que de `mount` et de `PanelScreenHost` : le
 * lier au premier ferait recompiler un bundle parfaitement valide à chaque ajout de capacité DNS,
 * c'est-à-dire exactement le découragement qu'on cherche à éviter chez un auteur tiers.
 *
 * Contrairement au contrat d'hôte, celui-ci démarre en 1.0.0. Il le peut parce qu'il ne promet
 * presque rien, et il le doit pour la même raison : une plage `^1.0.0` doit pouvoir couvrir les
 * ajouts à venir, sinon on retrouve la rupture à chaque virgule.
 */
export const PANEL_CONTRACT_VERSION = "1.0.0";

/**
 * Un écran rendu par le code du module, et non par le moteur déclaratif.
 *
 * Ce que le contrat exige tient en une ligne : un fichier **ESM déjà construit**, qui exporte par
 * défaut une fonction `mount`. Rien d'autre. Le noyau ne compile rien, n'installe aucune
 * dépendance et ne reconstruit aucune image — l'installation reste un dépôt de fichiers.
 *
 * **Le contrat ne nomme aucune bibliothèque d'interface, et ce n'est pas un oubli.** Le module
 * monte dans un conteneur qui lui appartient : il y crée sa propre racine React, ou du DOM brut,
 * ou du Preact, sans que le panel ait à le savoir. Deux instances de React sur la même page ne se
 * gênent que si l'une rend des composants dans l'arbre de l'autre, ce qui n'arrive jamais ici. Le
 * prix est la taille du bundle ; le gain est qu'une montée de React côté panel ne casse pas d'un
 * coup tous les modules installés — et qu'un auteur construit son écran avec l'outillage de son
 * choix, sans configuration d'externals à réussir.
 */
export interface ScreenBundle {
  /**
   * Chemin du fichier ESM, relatif au dossier du module (ex. `dist/orders.js`).
   *
   * Le module doit avoir un dossier sur l'instance, donc être déposé par l'hébergeur : un module
   * livré avec l'application est compilé dans l'image et n'a rien d'où servir un fichier.
   */
  entry: string;
  /**
   * Plage semver du contrat de panel contre lequel le bundle est écrit (ex. `"^1.0.0"`).
   *
   * Hors plage, l'écran retombe sur ses `sections` avec un bandeau qui nomme la raison — il
   * n'éteint pas le module. Un module de provisionnement dont l'écran de supervision a pris du
   * retard doit continuer à livrer des machines.
   */
  panel: string;
}

/**
 * Ce que le noyau remet à un écran monté.
 *
 * Aussi pauvre que `HostContext`, et pour la même raison : ce qui n'est pas donné n'a pas à être
 * défendu. Pas de client HTTP (le module passe par ses propres points d'entrée, côté serveur, où
 * vivent ses secrets), pas de jeton de session, pas d'accès au reste du panel.
 */
export interface PanelScreenHost {
  moduleId: string;
  screenId: string;
  /** Langue du membre du staff qui regarde, pas celle de l'instance. */
  locale: string;
  /**
   * Appelle un point d'entrée du module, exactement celui qu'une section déclarative appellerait.
   *
   * Résout avec ce que `runScreenEntryPoint` a rendu, rejette avec le message que le module a levé
   * — c'est ce message que l'écran doit afficher, pas « une erreur est survenue ».
   */
  callEntryPoint(entryPoint: string, input?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Ce que le module rend à `mount` pour être démonté proprement : arrêt d'un intervalle, retrait
 * d'un écouteur, `root.unmount()`. Le panel l'appelle en quittant l'écran.
 *
 * Rien rendre est légitime — un écran qui n'a rien à défaire n'a pas à écrire une fonction vide.
 */
export type PanelScreenUnmount = () => void;

/**
 * Point d'entrée d'un bundle d'écran : l'export **par défaut** du fichier.
 *
 * Le conteneur est vide, attaché au document, et déjà dans la coquille du panel — les variables
 * CSS du thème y sont donc héritées, ce qui permet à un écran tiers de ne pas détonner sans qu'on
 * ait à lui livrer un système de composants.
 */
export type PanelScreenMount = (
  container: HTMLElement,
  host: PanelScreenHost,
) => PanelScreenUnmount | void | Promise<PanelScreenUnmount | void>;

/** Forme attendue du fichier ESM, telle que le panel l'importe. */
export interface PanelScreenModule {
  default: PanelScreenMount;
}

/**
 * Libellé affiché, en une langue ou plusieurs.
 *
 * Un `Record` libre plutôt que le `LocalizedText` du noyau, qui exige la clé `fr` : un module
 * anglophone n'a pas à écrire du français pour être installable, et le SDK n'a pas à propager le
 * verrou de locales consigné dans `ROADMAP.md`. Le repli est la locale demandée, puis la première
 * valeur déclarée — jamais une chaîne vide, qui donnerait un lien de navigation invisible.
 */
export type ContributedLabel = string | Record<string, string>;

/**
 * Page ajoutée au **portail client** par un module.
 *
 * Contrat distinct de `ContributedScreen` plutôt qu'un champ `area` de plus sur lui, et la raison
 * vaut d'être écrite : un écran de panel voit tout et n'a besoin que d'un identifiant, une page de
 * portail a une zone, une portée de données bornée au client connecté, un gabarit possible et un
 * chemin public. Ajouter `area` aurait rendu chaque écran déjà écrit à moitié valide côté
 * portail — sans zone déclarée, sans savoir ce qu'il a le droit de lire — et c'est exactement le
 * genre de demi-validité qui se découvre en production.
 *
 * **Autonome par construction.** Une page contribuée ne s'injecte nulle part : elle a son URL, et
 * le noyau ne l'appelle jamais au milieu d'un de ses propres écrans. C'est ce qui évite de
 * transformer chaque page du produit en surface de contrat.
 *
 * **L'URL est préfixée, et le préfixe n'est pas une commodité** : `/m/<moduleId>/<id>` en zone
 * client, `/x/<moduleId>/<id>` en zone publique. Sans lui, un module prendrait `/factures` et le
 * noyau ne pourrait plus jamais créer cette route — un squat d'espace de noms est irréversible dès
 * qu'il existe des modules dans la nature. Second effet, aussi important : les deux préfixes étant
 * statiques, le middleware du portail n'a rien à savoir des modules installés.
 */
export interface ContributedPage {
  /**
   * Unique parmi les pages de ce module. Sert de dernier segment d'URL, donc même forme qu'un
   * slug : minuscules, chiffres et tirets.
   */
  id: string;
  label: ContributedLabel;
  /**
   * `"customer"` ⇒ `/m/<moduleId>/<id>`, réservée aux clients connectés et servie avec l'identité
   * du visiteur. `"public"` ⇒ `/x/<moduleId>/<id>`, servie à quiconque, sans identité.
   *
   * Ce champ décide de ce que le module reçoit, pas seulement de l'endroit où la page vit :
   * `ModulePageRequest.customer` n'est renseigné que pour une page `"customer"`.
   */
  area: "customer" | "public";
  /** Ajouter un lien dans la navigation de la zone correspondante. Sans ça, la page existe sans que rien n'y mène. */
  showInNav?: boolean;
  /** Ordre relatif entre les pages contribuées. Les liens du noyau passent avant, toujours. */
  navOrder?: number;
  /**
   * Gabarit Liquid du module, chemin relatif à son dossier (ex. `templates/unlock.liquid`).
   *
   * Chemin explicite plutôt qu'une convention implicite : un module n'a pas la structure de
   * dossiers imposée d'un thème, et deviner `templates/pages/<id>.liquid` chez lui produirait un
   * gabarit introuvable sans message. Absent ⇒ la page est rendue par ses `sections`.
   */
  template?: string;
  /**
   * Rendu de repli, avec les composants du portail. Utilisé quand ni le thème ni le module ne
   * fournissent de gabarit — ce qui est le cas le plus fréquent, un auteur de module n'écrivant pas
   * forcément du Liquid.
   */
  sections?: ScreenSection[];
  /**
   * Zone client : refuser la page à un sous-utilisateur (`CustomerContact`), qui n'a que cinq
   * permissions fixes dont aucune ne parle des modules.
   *
   * Le seul cran de contrôle qui ait un sens ici : inventer une permission par module supposerait
   * une migration SQL à chaque installation. Un module qui veut affiner lit `customer.isContact` et
   * décide lui-même — c'est lui qui sait si sa page est dangereuse.
   */
  ownerOnly?: boolean;
  /**
   * Zone publique : durée de mise en cache du contexte, en secondes. `0` ou absent ⇒ aucun cache.
   *
   * Une page publique appelle du code tiers sur son chemin de rendu, donc à chaque visiteur et à
   * chaque passage de robot. Refusé en zone client, et pas par prudence : le contexte y dépend du
   * visiteur, un cache partagé y servirait les données d'un client à un autre.
   */
  cacheSeconds?: number;
}

/** Un service du client, tel qu'un module le reçoit sur une page de portail. */
export interface ModulePageService {
  id: string;
  /** Nom du produit tel qu'il est vendu, pas l'identifiant interne. */
  productName: string;
  /** Identifiant chez le fournisseur qui l'héberge (VMID Proxmox, compte cPanel…), s'il en a un. */
  remoteId: string | null;
}

/**
 * Le client connecté, tel qu'un module le reçoit.
 *
 * **L'identité vient du jeton vérifié par le noyau, jamais de l'URL.** Le noyau écrase
 * systématiquement tout ce qui arriverait par les paramètres de requête : sans cette règle, un
 * module de déblocage d'IP lit le service du voisin en changeant un chiffre.
 *
 * Ce que le module obtient est arbitré, et volontairement pauvre : un identifiant et la liste
 * réduite des services. Pas de nom, pas d'adresse, pas de solde — cela couvre les usages réels
 * (agir sur un service qu'on possède) sans livrer l'identité de facturation à un tiers.
 */
export interface ModulePageCustomer {
  id: string;
  /** Sous-utilisateur plutôt que titulaire du compte. Voir `ContributedPage.ownerOnly`. */
  isContact: boolean;
  services: ModulePageService[];
}

/**
 * Ce que le noyau remet au module pour rendre une page.
 *
 * `customerId` n'est **pas** dans `HostContext` et n'y sera pas : ce contexte vit pour la durée du
 * processus, pas de la requête. Y ranger un état de requête est le piège classique, et sur une page
 * client c'est une fuite d'un client vers un autre.
 */
export interface ModulePageRequest {
  pageId: string;
  /** Langue du visiteur en zone client, de l'instance en zone publique. */
  locale: string;
  /** Renseigné pour une page `area: "customer"` uniquement. */
  customer?: ModulePageCustomer;
  /**
   * Paramètres de requête de l'URL (`?site=42`).
   *
   * Une page contribuée n'a pas de sous-chemins : son URL s'arrête à `<id>`. Un module qui a besoin
   * d'un état le met ici plutôt que dans un segment, ce qui évite d'inventer un routage que le
   * noyau devrait ensuite comprendre pour le rendre thémable.
   */
  query: Record<string, string>;
}

/** Une action déclenchée depuis une page : bouton d'une section `actions`, ou formulaire soumis. */
export interface ModulePageActionRequest extends ModulePageRequest {
  /** `id` d'une action, ou `entryPoint` d'un formulaire. */
  action: string;
  input: Record<string, unknown>;
}

/** Ce qu'un module rend pour une page. */
export interface ModulePageResult {
  /** Titre affiché, s'il diffère du libellé déclaré — un compteur, un nom de service. */
  title?: string;
  /**
   * Ce que reçoivent le gabarit et les sections. Une section `table` y lit ses lignes sous la clé
   * de son `entryPoint`.
   */
  context: Record<string, unknown>;
  /**
   * Sections à rendre, en remplacement de celles déclarées.
   *
   * Existe parce que la déclaration est écrite avant de savoir qui regarde : les choix d'un `select`
   * « quel service ? » dépendent du client connecté, et une liste vide dans `ContributedPage` ne
   * pourrait que mentir. Le premier module écrit contre ce contrat a buté dessus tout de suite.
   *
   * **Précise, n'ouvre pas.** Le noyau n'accepte une action que si la *déclaration* la porte
   * (`sections` de `ContributedPage`) : un `entryPoint` apparu ici au moment du rendu ne serait pas
   * exécuté. Sans cette règle, la liste des actions autorisées deviendrait quelque chose que le
   * module décide requête par requête, donc quelque chose que `check-extension` ne peut plus lire.
   */
  sections?: ScreenSection[];
}

/** Ce qu'un module rend après une action. */
export interface ModulePageActionResult {
  /** Message de succès affiché au visiteur. Un échec se signale en levant, pas en le rédigeant ici. */
  message?: string;
  /** Recharger la page pour montrer l'effet de l'action. */
  reload?: boolean;
}

/** Forme d'un identifiant de page : minuscules, chiffres et tirets, sans tiret aux extrémités. */
const PAGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Ce qui empêche les écrans déclarés par un module de fonctionner, en clair.
 *
 * Même service que `invalidContributedPages`, et même signature volontairement : les deux
 * surfaces échouent de la même façon — l'écran s'affiche, et il est vide. Un écran sans sections
 * ni bundle n'affiche rien, un bundle dont le fichier manque retombe sur un repli qui n'existe
 * pas, et un identifiant en double donne une URL qui désigne deux choses.
 *
 * La plage `bundle.panel` n'est vérifiée que dans sa **forme** ici : la confronter à
 * `PANEL_CONTRACT_VERSION` demande semver, que le contrat n'embarque pas. C'est le chargeur qui
 * tranche la compatibilité, et lui seul — voir `resolveScreenBundle`.
 */
export function invalidContributedScreens(
  screens: ContributedScreen[] | undefined,
  fileExists?: (relativePath: string) => boolean,
): string[] {
  if (!screens || screens.length === 0) {
    return [];
  }
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const screen of screens) {
    const id = typeof screen?.id === "string" ? screen.id.trim() : "";
    if (id === "") {
      problems.push("écran sans identifiant — il n'aurait pas d'URL");
      continue;
    }
    if (seen.has(id)) {
      problems.push(`écran « ${id} » : déclaré deux fois — son URL désignerait deux choses`);
      continue;
    }
    seen.add(id);

    const sections = screen.sections ?? [];
    if (!screen.bundle && sections.length === 0) {
      problems.push(
        `écran « ${id} » : ni sections ni bundle — il s'afficherait vide, ce qu'aucun rendu ne signale`,
      );
    }

    if (!screen.bundle) {
      continue;
    }
    const entry = typeof screen.bundle.entry === "string" ? screen.bundle.entry.trim() : "";
    if (entry === "") {
      problems.push(`écran « ${id} » : bundle sans "entry" — aucun fichier à importer`);
    } else if (fileExists && !fileExists(entry)) {
      problems.push(`écran « ${id} » : bundle ${entry} absent`);
    }
    if (typeof screen.bundle.panel !== "string" || screen.bundle.panel.trim() === "") {
      // Refusé plutôt que traité comme « toutes versions » : une plage absente laisserait charger
      // du code sur la foi d'une compatibilité que personne n'a déclarée.
      problems.push(
        `écran « ${id} » : bundle sans "panel" — déclarez la plage du contrat de panel visée (ex. "^${PANEL_CONTRACT_VERSION}")`,
      );
    }
  }

  return problems;
}

/**
 * Le libellé d'une page dans une langue donnée.
 *
 * Ne rend jamais de chaîne vide : un lien de navigation sans texte est un lien qu'on ne peut pas
 * cliquer, et le module ne saurait pas d'où vient le trou.
 */
export function resolveContributedLabel(label: ContributedLabel, locale: string): string {
  if (typeof label === "string") {
    return label;
  }
  const exact = label[locale];
  if (typeof exact === "string" && exact.trim() !== "") {
    return exact;
  }
  for (const value of Object.values(label)) {
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return "";
}

/** Adresse d'une page contribuée. Le préfixe découle de la zone, jamais du module. */
export function modulePageHref(moduleId: string, page: ContributedPage): string {
  return `/${page.area === "public" ? "x" : "m"}/${moduleId}/${page.id}`;
}

/**
 * Gabarit par lequel un **thème** rhabille la page d'un module.
 *
 * Premier maillon de la cascade — gabarit du thème, gabarit du module, sections — et le seul que
 * l'auteur du module ne connaît pas. Un thème peut donc reprendre la page d'une extension sans que
 * son auteur ait rien prévu.
 */
export function modulePageThemeTemplatePath(
  moduleId: string,
  pageId: string,
  templatesDir = "templates",
): string {
  return `${templatesDir}/modules/${moduleId}/${pageId}.liquid`;
}

/**
 * Ce qui empêche les pages déclarées par un module de fonctionner, en clair.
 *
 * Rendu par `pnpm check-extension` avant qu'un hébergeur n'installe le module, parce qu'aucun de
 * ces défauts ne se voit au chargement : une page sans gabarit ni sections s'affiche vide, un
 * `cacheSeconds` sur une page client serait un cache partagé entre visiteurs, et un identifiant
 * malformé donne une URL qui ne répond pas.
 *
 * Le gabarit n'est vérifié que si `fileExists` est fourni — le contrôle de forme, lui, ne demande
 * que la déclaration.
 */
export function invalidContributedPages(
  pages: ContributedPage[] | undefined,
  fileExists?: (relativePath: string) => boolean,
): string[] {
  if (!pages || pages.length === 0) {
    return [];
  }
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    const id = typeof page?.id === "string" ? page.id.trim().toLowerCase() : "";
    if (!PAGE_ID_PATTERN.test(id)) {
      problems.push(
        `page « ${page?.id ?? ""} » : identifiant invalide — minuscules, chiffres et tirets uniquement`,
      );
      continue;
    }
    if (seen.has(id)) {
      problems.push(`page « ${id} » : déclarée deux fois`);
      continue;
    }
    seen.add(id);

    if (page.area !== "customer" && page.area !== "public") {
      problems.push(`page « ${id} » : zone inconnue « ${String(page.area)} » — "customer" ou "public"`);
    }
    if (resolveContributedLabel(page.label, "fr") === "") {
      problems.push(`page « ${id} » : libellé manquant`);
    }
    if (!page.template && (!page.sections || page.sections.length === 0)) {
      problems.push(
        `page « ${id} » : ni gabarit ni sections — elle s'afficherait vide, ce qu'aucun rendu ne signale`,
      );
    }
    if (page.template && fileExists && !fileExists(page.template)) {
      problems.push(`page « ${id} » : gabarit ${page.template} absent`);
    }
    // Refusé plutôt qu'ignoré : un auteur qui l'écrit croit sa page mise en cache, et le silence
    // le laisserait dimensionner son module pour un cache qui n'existe pas.
    if (page.area === "customer" && (page.cacheSeconds ?? 0) > 0) {
      problems.push(
        `page « ${id} » : cacheSeconds est refusé en zone client — le contexte y dépend du visiteur`,
      );
    }
  }

  return problems;
}
