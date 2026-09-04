/**
 * Contrat d'un thème.
 *
 * Un thème est le seul genre de module qui **n'apporte aucun code**. Ce n'est pas une économie,
 * c'est la contrainte de la plateforme : les deux frontends sont des applications Next.js App
 * Router, dont les composants React sont résolus au build. Un composant déposé par FTP ne serait
 * jamais rendu sans reconstruire l'image. Un thème livre donc de la **donnée** — des tokens, des
 * polices, des ressources, du CSS — que le noyau applique à des écrans qu'il a compilés lui-même.
 *
 * Conséquence directe : tout se déclare dans `extension.json`, et il n'y a pas de descripteur.
 * Pour les genres à code, le descripteur fait foi et le manifeste ne redéclare rien (voir la note
 * de `manifest.ts`). Pour un thème il n'existe pas de second endroit où mentir : le manifeste est
 * la seule source, et elle est inerte — le panel peut décrire un thème sans rien exécuter.
 */

import { isReservedPageSlug } from "../reserved-slugs";

/**
 * Palette complète.
 *
 * Les cinq premières couleurs sont celles que l'application connaissait déjà ; les cinq suivantes
 * existent parce qu'elles étaient jusqu'ici **codées en dur** dans les composants. Tant que
 * `Alert` écrit sa propre nuance de rouge, un thème peut repeindre toute l'interface sauf les
 * messages d'erreur — et c'est précisément là que le dépaysement s'arrête.
 */
export interface ThemeColors {
  primary: string;
  accent: string;
  /** Fond de page. */
  bg: string;
  /** Fond des cartes et panneaux posés sur `bg`. */
  surface: string;
  text: string;
  /** Texte secondaire. Déclaré plutôt que dérivé par opacité : sur fond sombre, un texte à 70 %
   *  d'opacité tombe sous le seuil de contraste, et l'opacité s'applique aussi aux enfants. */
  muted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
}

/** Rayons de bordure. Un thème anguleux met tout à `0`, et c'est un changement très visible. */
export interface ThemeRadii {
  sm: string;
  md: string;
  lg: string;
}

export interface ThemeTypography {
  /** Police du texte courant. */
  fontFamily: string;
  /** Police des titres. Vaut `fontFamily` si le thème n'en distingue pas. */
  headingFamily: string;
  /** Police à chasse fixe : identifiants de machines, empreintes, références de facture. */
  monoFamily: string;
  /** Taille de base, à laquelle toute l'échelle typographique est relative. */
  baseSize: string;
  bodyWeight: string;
  headingWeight: string;
}

/**
 * Densité : multiplie l'échelle d'espacement d'un bloc.
 *
 * C'est le levier qui distingue un panneau d'administration dense d'une vitrine aérée, sans
 * toucher à une seule marge dans le code. Un thème qui ne s'en préoccupe pas garde `comfortable`.
 */
export type ThemeDensity = "compact" | "comfortable" | "spacious";

/**
 * Indique au navigateur si les couleurs sont claires ou sombres.
 *
 * Sert à `color-scheme`, qui décide de l'apparence de ce que le thème ne peut pas peindre :
 * ascenseurs, sélecteurs de date, champs remplis automatiquement. Sans lui, un thème clair reçoit
 * des contrôles natifs sombres, et l'illusion tombe sur le premier champ de formulaire.
 */
export type ThemeColorScheme = "light" | "dark";

/**
 * Tout ce qu'un thème peut redéfinir sans écrire une ligne de CSS.
 *
 * Chaque valeur est facultative jusqu'au dernier niveau : un thème qui ne veut changer que la
 * couleur primaire ne doit pas avoir à recopier trente valeurs qu'il ne comprend pas — recopier,
 * c'est figer, et ce thème-là ne profiterait plus jamais d'un défaut corrigé par l'hôte.
 */
export interface ThemeTokens {
  colorScheme: ThemeColorScheme;
  colors: ThemeColors;
  radii: ThemeRadii;
  typography: ThemeTypography;
  density: ThemeDensity;
}

/** Tokens tels qu'un thème les déclare : partiels à tous les niveaux. */
export interface PartialThemeTokens {
  colorScheme?: ThemeColorScheme;
  colors?: Partial<ThemeColors>;
  radii?: Partial<ThemeRadii>;
  typography?: Partial<ThemeTypography>;
  density?: ThemeDensity;
}

/**
 * Une police que le thème veut voir chargée.
 *
 * Existe parce que déclarer `fontFamily: "Space Grotesk"` ne suffit pas : si personne n'émet la
 * règle `@font-face` ou le lien correspondant, le navigateur retombe silencieusement sur une
 * police de substitution. Le thème paraît alors « presque appliqué », ce qui est le plus long à
 * diagnostiquer — on relit les tokens, qui sont justes.
 */
export interface ThemeFont {
  /** Nom de famille, tel qu'il apparaît dans `typography`. */
  family: string;
  /**
   * Fichier de police, relatif au dossier du thème. Le noyau le sert et en fabrique le
   * `@font-face`. Absent, `href` doit être renseigné.
   */
  src?: string;
  /** Feuille de style externe qui déclare la police (Google Fonts, Bunny, fonderie). */
  href?: string;
  weight?: string;
  style?: "normal" | "italic";
  /** Défaut `swap` : afficher le texte tout de suite dans une police de repli vaut mieux que du
   *  vide, et c'est ce que veut une page de commande. */
  display?: "auto" | "block" | "swap" | "fallback" | "optional";
}

/**
 * Ce qu'un thème déclare dans son `extension.json`, sous la clé `theme`.
 *
 * Volontairement réduit à ce que le noyau sait aujourd'hui appliquer. Les gabarits d'enveloppe, les
 * gabarits de page et les blocs de l'espace client viennent avec leur implémentation : déclarer
 * maintenant des clés que rien ne lit produirait des thèmes qui se croient appliqués et ne le sont
 * pas — exactement le défaut que `fonts` corrige plus haut.
 */
export interface ThemeDefinition {
  tokens?: PartialThemeTokens;
  fonts?: ThemeFont[];
  /**
   * Dossier des ressources livrées par le thème, relatif à son dossier. Défaut `assets`.
   *
   * Le noyau le sert en lecture seule sous une URL publique. C'est ce qui permet à un thème
   * d'embarquer ses polices, son logo et ses images sans dépendre d'un hébergement extérieur — et
   * donc de rester appliqué sur une instance sans accès sortant.
   */
  assets?: string;
  /**
   * Feuille de style libre, relative au dossier du thème.
   *
   * Chargée **en dernier**, après les tokens et après les styles de l'application : elle peut donc
   * tout redéfinir. C'est l'échappatoire assumée du système — ce qu'aucun token ne prévoit se
   * rattrape ici, sans quoi tout thème un peu ambitieux se heurterait au premier détail non
   * paramétré et le mécanisme entier paraîtrait inutile.
   */
  stylesheet?: string;
  /** Logo du thème, relatif au dossier du thème. Le logo saisi dans le panel reste prioritaire. */
  logo?: string;
  favicon?: string;
  /**
   * Dossier des gabarits Liquid du thème, relatif à son dossier. Défaut `templates`.
   *
   * Absent, un thème n'a pas de structure à proposer : le noyau retombe sur ses écrans React pour
   * l'enveloppe (en-tête, pied) comme pour les pages de la vitrine — c'est le mécanisme de repli
   * du niveau 3/4, qui garantit qu'un thème incomplet ne rend jamais l'instance inutilisable.
   */
  templates?: string;
  /**
   * Pages que le thème apporte lui-même, à des URL que le noyau ne connaît pas.
   *
   * La différence avec tout le reste de ce contrat tient en une phrase : ailleurs, un thème
   * rhabille une page qui existe ; ici il en ajoute une. « Notre infrastructure », « Pourquoi
   * nous », une page de garantie — le genre de contenu qui fait partie du thème et n'a pas à être
   * ressaisi au panel par chaque hébergeur qui l'installe.
   *
   * Un gabarit libre, donc, sans îlot obligatoire ni contexte imposé : `templates/custom/<slug>.liquid`,
   * qui reçoit `companyName`, `locale` et sa propre déclaration. Les îlots restent disponibles —
   * une page de thème peut porter un vrai bouton de commande — mais aucun n'est exigé, personne
   * d'autre que l'auteur ne sachant ce que cette page raconte.
   *
   * **Une page d'hébergeur au même slug l'emporte**, et ce n'est pas négociable : même règle que
   * les réglages de marque face aux tokens du thème (voir `resolveActiveTheme`). Ignorer ce qu'un
   * administrateur vient de saisir est le pire des deux mondes — il le ressaisirait en boucle sans
   * jamais comprendre.
   */
  pages?: ThemePageDeclaration[];
  /**
   * Script du thème, relatif à son dossier. Chargé en `defer` sur toutes les pages du portail.
   *
   * Servi par une route distincte des ressources (`/api/v1/themes/:id/script.js`), avec sa propre
   * politique : la route des ressources applique `sandbox` et `default-src 'none'` — juste pour un
   * SVG, qui est un document exécutable ouvert directement, mais qui ne convient pas à ce qu'on
   * veut justement voir s'exécuter.
   *
   * **Ne peut venir que d'un thème déposé sur le serveur, jamais d'un réglage saisi dans le
   * panel.** Même distinction que pour les valeurs de tokens (voir `isSafeTokenValue` plus bas) :
   * déposer un fichier suppose un accès SSH/FTP, cocher une case dans le panel non. Un membre du
   * staff autorisé à changer une couleur n'est pas autorisé à exécuter du script dans l'espace
   * client de tous les clients.
   */
  script?: string;
}

/**
 * Une page apportée par le thème, déclarée dans son manifeste.
 *
 * Tout y est écrit dans une seule langue, celle de l'auteur du thème, et c'est une limite assumée :
 * le corps de la page vit dans un gabarit, qui reçoit `locale` et peut donc être bilingue
 * (`{% if locale == "en" %}`), mais le titre et le libellé de nav sortent du manifeste tels quels.
 * Un hébergeur qui a besoin des deux langues jusque dans sa navigation crée la page depuis son
 * back-office, où `LocalizedText` s'applique — et elle l'emportera sur celle du thème.
 */
export interface ThemePageDeclaration {
  /**
   * Premier segment de l'URL, à la racine du site : `infrastructure` ⇒ `/infrastructure`.
   *
   * Refusé s'il figure dans `RESERVED_PAGE_SLUGS`, et `pnpm check-extension` le dit avant qu'un
   * hébergeur ne l'installe. Sans ce refus, un thème prendrait `/catalog` et découvrirait sur une
   * instance que sa page ne s'affiche jamais — en App Router, une route statique gagne toujours
   * sur l'attrape-tout.
   */
  slug: string;
  /** Titre de la page, utilisé pour `<title>` et, à défaut de `navLabel`, pour le lien de nav. */
  title: string;
  /** Le lien apparaît-il dans la navigation de la vitrine ? Défaut : non. */
  showInNav?: boolean;
  navLabel?: string;
  /** Ordre entre les liens du thème. Les pages d'hébergeur passent avant, dans tous les cas. */
  navOrder?: number;
  metaDescription?: string;
  /** Publiée mais non indexée — une page de campagne, typiquement. */
  noindex?: boolean;
}

/**
 * Ce que reçoit `templates/custom/<slug>.liquid`.
 *
 * Volontairement pauvre : cette page n'a pas de données du noyau à recevoir, elle est le contenu
 * qu'un auteur de thème a écrit. `page` lui rend sa propre déclaration, ce qui permet d'écrire le
 * titre une seule fois — dans le manifeste, d'où il sert aussi au `<title>` et à la nav.
 */
export interface ThemeCustomPageView extends ThemeViewContext {
  view: "theme-page";
  page: { slug: string; title: string };
}

/** Un lien de navigation, tel qu'un gabarit d'enveloppe le reçoit. */
export interface ThemeNavLink {
  href: string;
  label: string;
}

/**
 * Ce que reçoivent `templates/partials/header.liquid` et `templates/partials/footer.liquid`.
 *
 * Contrat public, comme `ThemeViewContext` et `ThemeEmailContext` plus bas : un thème qui lit
 * `nav` ou `companyName` doit pouvoir compter sur leur présence d'une version à l'autre, sous
 * peine de rendre un thème publié un jour et cassé le suivant sans qu'aucune ligne de son code
 * n'ait changé.
 */
export interface ThemeShellContext {
  companyName: string;
  logoUrl?: string;
  /** Liens à afficher, dans l'ordre. Diffère entre la vitrine publique et l'espace client. */
  nav: ThemeNavLink[];
  /** Vitrine publique ou espace client authentifié : un thème peut vouloir deux structures. */
  area: "marketing" | "account";
  authenticated: boolean;
}

/** Une offre du catalogue, telle qu'un gabarit de page la reçoit. */
export interface ThemeProductView {
  id: string;
  name: string;
  /** Déjà mis en forme (devise, TTC) : un gabarit Liquid n'a pas accès à `Intl`. */
  priceFormatted: string;
  /** `"mois"` ou `"an"`, déjà traduit. */
  recurringLabel: string;
  resourceSpec?: { cpu: number; ramMb: number; diskGb: number };
}

/** Section du catalogue : une catégorie et les offres qu'elle contient. */
export interface ThemeCategorySection {
  id: string | null;
  name: string;
  description?: string;
  /** Profondeur dans l'arbre des catégories, pour un gabarit qui voudrait indenter. */
  depth: number;
  products: ThemeProductView[];
}

/** Une offre groupée du catalogue, telle qu'un gabarit la reçoit. */
export interface ThemeBundleView {
  id: string;
  name: string;
  /** Déjà mis en forme, comme `ThemeProductView.priceFormatted`. */
  priceFormatted: string;
  /** Composition, déjà rédigée (« VPS Start ×1, Sauvegarde ×2 »). */
  contentsLabel: string;
}

/** Un article de la base de connaissances, en résumé de liste. */
export interface ThemeKbArticleSummary {
  slug: string;
  title: string;
  excerpt: string;
  /** Date de mise à jour, déjà mise en forme dans la locale de l'instance. */
  updatedAtFormatted: string;
}

/**
 * Un article complet.
 *
 * Ne dérive pas du résumé : un article ouvert n'a pas d'extrait, il a son corps. `body` est du
 * texte brut saisi au panel, jamais du HTML — Liquid l'échappe, et un gabarit ne peut pas
 * contourner cet échappement.
 */
export interface ThemeKbArticle {
  slug: string;
  title: string;
  body: string;
  tags: string[];
  updatedAtFormatted: string;
}

/** Pagination d'une liste, telle qu'un gabarit peut la rendre en liens. */
export interface ThemePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** `null` aux extrémités : un gabarit n'a pas à calculer les bornes. */
  previousHref: string | null;
  nextHref: string | null;
}

/**
 * Ce que reçoit un gabarit de vue (`GET /themes/render/view/:name`).
 *
 * **Ouvert, et c'est le point de ce contrat.** Il a d'abord été une union fermée de trois types —
 * accueil, catalogue, confidentialité — ce qui rendait le SDK obligatoire de passage pour rendre
 * une quatrième page thémable : 3 pages sur 42 en ont vécu, les 39 autres ont attendu. Le nom de
 * la vue et ce qu'elle contient sont désormais décidés par le noyau qui la sérialise, et déclarés
 * dans `THEME_VIEWS` ci-dessous ; ce type ne fixe plus que ce qui est vrai de toutes.
 *
 * Le prix, assumé : un gabarit qui lit `{{ sectons }}` ne provoque plus d'erreur de type, il rend
 * du vide. C'est déjà le comportement de Liquid pour toute clé absente, et le contrôle qui reste
 * porte sur ce qui casse réellement une page — les îlots obligatoires, vérifiés par
 * `pnpm check-extension` (voir `missingRequiredIslands`).
 */
export interface ThemeViewContext {
  /** Nom de la vue, tel qu'il figure dans `THEME_VIEWS`. */
  view: string;
  companyName: string;
  /**
   * Langue dans laquelle rendre le gabarit.
   *
   * Un gabarit écrit ses propres libellés — le noyau ne les lui fournit pas, pas plus que WHMCS ou
   * Paymenter ne le font pour les leurs — et c'est cette clé qui lui permet d'en avoir plusieurs :
   * `{% if locale == "en" %}Invoices{% else %}Factures{% endif %}`. Les valeurs *dérivées* des
   * données (dates, montants, statuts) arrivent en revanche déjà mises en forme dans cette langue :
   * elles dépendent de règles qu'un gabarit ne peut pas appliquer.
   *
   * Vitrine : la locale de l'instance, faute de visiteur identifié. Espace client : celle du
   * visiteur.
   */
  locale: string;
  [key: string]: unknown;
}

/**
 * Contextes des vues livrées, à titre documentaire.
 *
 * Ce sont des aides à l'écriture, pas des barrières : le noyau ne les impose nulle part, et une
 * vue ajoutée demain n'aura pas à en déclarer un. Ils disent à l'auteur d'un thème ce qu'il peut
 * lire dans chaque gabarit, ce que la lecture de `THEME_VIEWS` seule ne donnerait pas.
 */
export interface ThemeHomeView extends ThemeViewContext {
  view: "home";
}

export interface ThemeCatalogView extends ThemeViewContext {
  view: "catalog";
  sections: ThemeCategorySection[];
  bundles: ThemeBundleView[];
}

export interface ThemeCartView extends ThemeViewContext {
  view: "cart";
}

export interface ThemeDomainsView extends ThemeViewContext {
  view: "domains";
}

export interface ThemeKbView extends ThemeViewContext {
  view: "kb";
  articles: ThemeKbArticleSummary[];
  /** Tous les mots-clés existants, pour proposer un filtre. */
  tags: string[];
  /** Recherche et filtre en cours, pour que le gabarit puisse les réafficher. */
  query: string;
  activeTag: string | null;
  pagination: ThemePagination;
}

export interface ThemeKbArticleView extends ThemeViewContext {
  view: "kb-article";
  article: ThemeKbArticle;
}

export interface ThemeLegalPrivacyView extends ThemeViewContext {
  view: "legal-privacy";
  privacyPolicy: string | null;
  /** Adresse du responsable de traitement, déjà réduite aux lignes non vides. */
  address: string[];
  contactEmail?: string;
}

export interface ThemeLegalTermsView extends ThemeViewContext {
  view: "legal-terms";
  termsBody: string | null;
  /** CGV hébergées ailleurs : le gabarit y renvoie au lieu de rendre un corps. */
  termsUrl: string | null;
}

/**
 * Un bloc d'une page créée par l'hébergeur depuis le back-office, **déjà résolu dans une langue**.
 *
 * Forme de sortie de `PageBlock` (`@opbs/shared-types`), qui est la forme stockée : là-bas
 * chaque texte est un `LocalizedText`, ici c'est une chaîne. La résolution est faite une fois par
 * l'API, pour les deux consommateurs à la fois — le gabarit du thème et le rendu React de repli.
 * Un gabarit Liquid n'a de toute façon pas de quoi choisir une langue.
 *
 * Champs unis en un seul type plutôt qu'en union discriminée : Liquid ne sait pas rétrécir un
 * type, il lit `block.type` puis les clés qui l'intéressent. Les clés absentes valent vide, ce qui
 * est déjà le comportement de Liquid partout ailleurs.
 */
export interface ThemePageBlock {
  /** `heading`, `text`, `image`, `button` ou `island`. */
  type: string;
  /** `heading` et `text`. */
  text?: string;
  /** `heading` : 2 ou 3. Jamais 1 — le titre de la page occupe déjà ce niveau. */
  level?: number;
  /** `image`. */
  src?: string;
  alt?: string;
  /** `button`. */
  label?: string;
  href?: string;
  /**
   * `island` : nom d'un îlot de `THEME_ISLANDS`, et ses paramètres.
   *
   * Le gabarit reste libre de la balise et de ce qui l'entoure, mais c'est bien lui qui doit
   * écrire le marqueur — `<div data-island="{{ block.island }}" data-product="{{ block.params.product }}">`.
   * Le noyau ne pré-rend rien : c'est la même règle que partout, le thème place, le noyau fait.
   */
  island?: string;
  params?: Record<string, string>;
}

/**
 * Une page créée depuis le back-office, telle qu'un gabarit la reçoit.
 *
 * Le seul contexte de vue dont le contenu n'est pas décidé par le noyau mais saisi par
 * l'hébergeur. Le gabarit est donc générique : il rend une suite de blocs, sans savoir de quelle
 * page il s'agit. Un thème qui fournit `templates/pages/content-page.liquid` rhabille d'un coup
 * toutes les pages créées au panel, présentes et futures.
 */
export interface ThemeContentPageView extends ThemeViewContext {
  view: "content-page";
  page: {
    slug: string;
    title: string;
    blocks: ThemePageBlock[];
  };
}

/* -------------------------------------------------------------------------------------------
 * Contextes des vues de l'espace client.
 *
 * Même statut que ceux de la vitrine : documentaires, jamais imposés. Deux règles les
 * gouvernent, et les connaître évite de chercher une clé qui n'existera jamais.
 *
 * 1. **Ce qui est dérivé arrive déjà mis en forme.** Un montant est une chaîne (`totalFormatted`),
 *    pas des centimes ; une date est une chaîne (`dueDateFormatted`) ; un décompte de SLA est une
 *    chaîne. Ces valeurs dépendent de la devise, de la locale du visiteur et de l'instant du
 *    rendu — un gabarit Liquid n'a pas de quoi les produire, et le noyau les calcule déjà pour son
 *    propre écran.
 * 2. **Ce qui est secret n'y est pas.** Le contexte est destiné à l'affichage : jeton de session,
 *    phrase anti-hameçonnage, secret 2FA n'y figurent pas. Ce qu'un formulaire a besoin de
 *    connaître va à son îlot, jamais au gabarit.
 *
 * Le statut brut (`status`) accompagne systématiquement son libellé (`statusLabel`) : le premier
 * pour styler (`{% if domain.status == "EXPIRED" %}`), le second pour afficher.
 * ------------------------------------------------------------------------------------------- */

/** Un service, tel qu'il apparaît dans une liste. */
export interface ThemeServiceSummary {
  id: string;
  href: string;
  name: string;
  categoryName: string;
  /** Absent pour un produit sans machine derrière (hébergement mutualisé, licence). */
  resourceSpec?: { cpu: number; ramMb: number; diskGb: number };
  /** Renseigné quand le service a été acheté dans une offre groupée. */
  bundleName?: string;
  status: string;
}

export interface ThemeInvoiceSummary {
  id: string;
  href: string;
  totalFormatted: string;
  dueDateFormatted: string;
  status: string;
  /** Facture reprise d'un ancien outil à la migration : jamais émise par cette instance. */
  imported: boolean;
  /** Le gabarit peut poser `invoice-pay` ; ce drapeau lui dit sur quelles lignes. */
  payable: boolean;
}

export interface ThemeDashboardView extends ThemeViewContext {
  view: "dashboard";
  counters: { services: number; unpaidInvoices: number };
  recentServices: { id: string; href: string; name: string; status: string }[];
  recentInvoices: { id: string; href: string; totalFormatted: string; status: string }[];
}

export interface ThemeServicesView extends ThemeViewContext {
  view: "services";
  services: ThemeServiceSummary[];
  pagination: ThemePagination;
}

export interface ThemeServiceView extends ThemeViewContext {
  view: "service";
  service: {
    id: string;
    name: string;
    categoryName: string;
    status: string;
    resourceSpec?: { cpu: number; ramMb: number; diskGb: number };
    /** Référence chez le fournisseur (VMID, identifiant de compte). Volontairement neutre. */
    reference?: string;
    ipAddress?: string;
    consoleHref: string;
  };
  /**
   * Ce que ce service permet réellement, driver et état compris.
   *
   * À lire avant de poser un îlot : le noyau ne monte que ce qu'il peut alimenter, mais un cadre
   * « Instantanés » vide sur un produit qui n'en a pas est un défaut que seul le gabarit peut
   * éviter.
   */
  capabilities: {
    active: boolean;
    startStop: boolean;
    reboot: boolean;
    console: boolean;
    credentials: boolean;
    reinstall: boolean;
    snapshots: boolean;
    /** Le fournisseur n'a pas répondu : distinct d'une liste vide, et à dire au client. */
    snapshotsUnavailable: boolean;
    backups: boolean;
    reverseDns: boolean;
    earlyRenewal: boolean;
    /** Faux quand aucune formule de remplacement n'est proposée : l'îlot ne rendrait rien. */
    planChange: boolean;
    /** Faux quand le service n'a ni option attachée ni option disponible. */
    addons: boolean;
  };
}

export interface ThemeServiceConsoleView extends ThemeViewContext {
  view: "service-console";
  service: { id: string; backHref: string };
}

export interface ThemeInvoicesView extends ThemeViewContext {
  view: "invoices";
  invoices: ThemeInvoiceSummary[];
  /** Vide dans le cas courant : un solde n'existe qu'après un avoir ou un trop-perçu. */
  creditBalances: { formatted: string }[];
  pagination: ThemePagination;
}

export interface ThemeInvoiceView extends ThemeViewContext {
  view: "invoice";
  invoice: {
    id: string;
    /** Numéro de facture, ou référence provisoire d'un brouillon. */
    label: string;
    status: string;
    imported: boolean;
    payable: boolean;
    dueDateFormatted: string;
    totalFormatted: string;
    pdfHref: string;
    items: { description: string; quantity: number; amountFormatted: string }[];
  };
}

export interface ThemeTicketsView extends ThemeViewContext {
  view: "tickets";
  tickets: { id: string; href: string; subject: string; status: string }[];
  newTicketHref: string;
  pagination: ThemePagination;
}

export interface ThemeTicketView extends ThemeViewContext {
  view: "ticket";
  ticket: {
    id: string;
    subject: string;
    status: string;
    closed: boolean;
    departmentName: string | null;
    slaBreached: boolean;
    /** Temps restant avant l'échéance de réponse, déjà rédigé. `null` sur un ticket clos. */
    slaCountdown: string | null;
    messages: {
      id: string;
      /** Texte brut : Liquid l'échappe, un client ne publie pas de HTML dans un ticket. */
      body: string;
      fromCustomer: boolean;
      createdAtFormatted: string;
      attachments: { filename: string; sizeFormatted: string; href: string }[];
    }[];
    /** Renseigné seulement si le client a déjà noté le ticket. */
    satisfaction: { rating: number; stars: string; comment: string | null } | null;
  };
}

export interface ThemeTicketNewView extends ThemeViewContext {
  view: "ticket-new";
  departments: { id: string; name: string }[];
  ticketsHref: string;
}

export interface ThemeDomainsMineView extends ThemeViewContext {
  view: "domains-mine";
  domains: {
    id: string;
    href: string;
    name: string;
    status: string;
    statusLabel: string;
    expiryFormatted: string | null;
  }[];
  pagination: ThemePagination;
}

export interface ThemeDomainView extends ThemeViewContext {
  view: "domain";
  domain: {
    id: string;
    name: string;
    status: string;
    statusLabel: string;
    expiryFormatted: string | null;
    nameservers: string[];
    transferLockEnabled: boolean;
    autoRenew: boolean;
  };
}

export interface ThemeDnsZonesView extends ThemeViewContext {
  view: "dns-zones";
  zones: { id: string; href: string; name: string; status: string; statusLabel: string }[];
  pagination: ThemePagination;
}

export interface ThemeDnsZoneView extends ThemeViewContext {
  view: "dns-zone";
  zone: {
    id: string;
    name: string;
    status: string;
    statusLabel: string;
    /** Message d'erreur de la dernière synchronisation, à montrer tel quel au client. */
    errorLog: string | null;
    announcedNameservers: string[];
    /** Faux quand la zone n'est rattachée à aucun domaine géré ici : rien à basculer. */
    canUseHostNs: boolean;
    records: {
      id: string;
      type: string;
      name: string;
      content: string;
      ttl: number;
      priority: number | null;
    }[];
  };
}

export interface ThemeHistoryView extends ThemeViewContext {
  view: "history";
  entries: { id: string; action: string; createdAtFormatted: string }[];
  pagination: ThemePagination;
}

export interface ThemeAccountView extends ThemeViewContext {
  view: "account";
  /** Déjà filtrées par les permissions du visiteur : un sous-utilisateur en voit moins. */
  sections: { key: string; href: string; title: string; description: string }[];
}

export interface ThemeAccountProfileView extends ThemeViewContext {
  view: "account-profile";
  email: string;
}

/**
 * Sécurité du compte. Aucun secret ici : ni la phrase anti-hameçonnage, ni le secret 2FA, ni le
 * moindre identifiant de clé d'accès — seulement de quoi titrer et compter.
 */
export interface ThemeAccountSecurityView extends ThemeViewContext {
  view: "account-security";
  /** Faux pour un sous-utilisateur : 2FA, clés d'accès et SSO sont réservés au titulaire. */
  isOwner: boolean;
  twoFactorEnabled: boolean;
  passkeyCount: number;
  linkedSsoCount: number;
  availableSsoProviders: string[];
}

export interface ThemeAccountBillingView extends ThemeViewContext {
  view: "account-billing";
  billing: {
    companyName: string | null;
    country: string | null;
    vatNumber: string | null;
    currency: string | null;
  };
  baseCurrency: string;
  currencies: { code: string; label: string }[];
}

export interface ThemeAccountPaymentMethodsView extends ThemeViewContext {
  view: "account-payment-methods";
  methods: {
    id: string;
    type: string;
    brand: string | null;
    last4: string | null;
    isDefault: boolean;
  }[];
  gateways: { moduleId: string; label: string }[];
  canManage: boolean;
  /** Retour de la passerelle après un enregistrement de carte : de quoi confirmer au client. */
  justAdded: boolean;
}

export interface ThemeAccountPrivacyView extends ThemeViewContext {
  view: "account-privacy";
  pendingErasure: boolean;
  requests: { kind: string; status: string }[];
}

export interface ThemeAccountReferralView extends ThemeViewContext {
  view: "account-referral";
  referralCode: string;
  earned: { currency: string; formatted: string }[];
  referrals: { email: string; joinedAtFormatted: string }[];
}

export interface ThemeAccountTeamView extends ThemeViewContext {
  view: "account-team";
  contacts: { id: string; email: string; permissions: string[] }[];
  grantablePermissions: { key: string; description: string }[];
}

export interface ThemeResellerBrandingView extends ThemeViewContext {
  view: "reseller-branding";
  /** Faux pour un compte ordinaire qui atteint l'URL : état vide, jamais une erreur. */
  isReseller: boolean;
  /**
   * Le gabarit n'a pas à rendre les champs — l'îlot `reseller-branding` porte tout le formulaire,
   * comme pour les autres écrans à effet. Ce qui suit ne sert qu'à écrire un texte autour :
   * l'état du domaine, dont dépend le seul message vraiment utile de cette page.
   */
  domain: {
    hostname: string;
    verified: boolean;
    /** Ce que le revendeur doit publier dans sa zone DNS, déjà composé. */
    recordName: string;
    recordValue: string;
  } | null;
}

export interface ThemeResellerClientsView extends ThemeViewContext {
  view: "reseller-clients";
  /** Faux pour un compte ordinaire qui atteint l'URL : le gabarit rend un état vide, pas une erreur. */
  isReseller: boolean;
  createHref: string;
  clients: {
    id: string;
    href: string;
    email: string;
    companyName: string | null;
    sinceFormatted: string;
  }[];
  pagination?: ThemePagination;
}

export interface ThemeResellerClientView extends ThemeViewContext {
  view: "reseller-client";
  client: { id: string; email: string; companyName: string | null; sinceFormatted: string };
}

export interface ThemeResellerClientNewView extends ThemeViewContext {
  view: "reseller-client-new";
  clientsHref: string;
}

/**
 * Politique de mot de passe en vigueur, telle qu'un gabarit d'inscription peut l'annoncer.
 *
 * Le gabarit l'affiche, il ne l'applique pas : la validation reste côté serveur, et l'îlot du
 * formulaire signale déjà chaque règle non satisfaite pendant la saisie. Ce que cette clé ajoute
 * est la possibilité d'écrire les règles *avant* le formulaire, dans la langue et le ton du thème.
 */
export interface ThemePasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
}

/**
 * Contextes des huit vues d'authentification.
 *
 * Ce qui n'y figure pas est le point important : **aucun jeton, aucun ticket, aucun code**. Un lien
 * de réinitialisation porte un secret à usage unique ; le gabarit n'a pas à le lire, seul l'îlot en
 * a besoin, et la page le lui passe directement (`islandProps`) sans jamais le faire transiter par
 * le contexte. Le gabarit reçoit à la place le booléen dont il a réellement l'usage — « ce lien
 * porte-t-il un jeton ? » — de quoi choisir entre le formulaire et un message d'erreur.
 */
export interface ThemeLoginView extends ThemeViewContext {
  view: "login";
  /** L'inscription publique est-elle ouverte ? Faux ⇒ pas de lien « Créer un compte » à écrire. */
  publicSignupEnabled: boolean;
  /**
   * Au moins un fournisseur SSO actif. Booléen et non la liste : les boutons sont rendus par
   * l'îlot, qui seul sait démarrer un échange OIDC. Le gabarit n'en a besoin que pour décider s'il
   * écrit un séparateur « ou ».
   */
  ssoEnabled: boolean;
}

export interface ThemeRegisterView extends ThemeViewContext {
  view: "register";
  passwordPolicy: ThemePasswordPolicy;
}

export interface ThemeForgotPasswordView extends ThemeViewContext {
  view: "forgot-password";
}

export interface ThemeResetPasswordView extends ThemeViewContext {
  view: "reset-password";
  passwordPolicy: ThemePasswordPolicy;
  /** Faux quand l'URL n'en porte aucun : lien tronqué par un client mail, ou visite directe. */
  hasToken: boolean;
}

export interface ThemeVerifyEmailView extends ThemeViewContext {
  view: "verify-email";
  /** Résultat de la vérification, déjà faite par la page avant ce rendu. */
  verified: boolean;
}

export interface ThemeAcceptInviteView extends ThemeViewContext {
  view: "accept-invite";
  passwordPolicy: ThemePasswordPolicy;
  hasToken: boolean;
}

export interface ThemeSsoLinkView extends ThemeViewContext {
  view: "sso-link";
  /** Faux si le ticket de liaison manque ou a expiré côté URL : le gabarit renvoie vers `/login`. */
  hasTicket: boolean;
}

export interface ThemeSsoCallbackView extends ThemeViewContext {
  view: "sso-callback";
  /**
   * Le fournisseur a renvoyé une erreur au lieu d'un code. Booléen, jamais le message : il vient
   * d'un tiers, et c'est l'îlot qui en rend une version traduite par le noyau.
   */
  providerFailed: boolean;
}

/**
 * Un îlot : un emplacement qu'un gabarit marque et que le noyau remplit d'un vrai composant.
 *
 * C'est la moitié qui rend le reste possible. Un gabarit Liquid ne peut pas produire un bouton de
 * commande — derrière lui il y a le choix de la passerelle, une redirection, un panier persisté,
 * un jeton de session. **Le thème place, le noyau fait** : le gabarit écrit
 * `<div data-island="order-button" data-product="{{ product.id }}"></div>` et décide donc de la
 * position, de ce qui l'entoure et de ce qui n'y est pas ; ce qui s'y monte reste du code de
 * l'hôte, compilé dans l'application.
 *
 * Conséquence de sécurité, et elle n'est pas négociable : **aucun îlot ne fabrique un formulaire
 * d'authentification à partir de ce qu'un gabarit lui dit.** Les îlots `auth-*` sont des
 * composants entièrement câblés du noyau — leur URL de soumission, leur gestion du second facteur
 * et leur redirection sont compilées dans le portail. Un gabarit en choisit l'emplacement, rien
 * d'autre : il ne peut ni détourner la soumission, ni lire ce qui est saisi, ni recevoir le jeton
 * qui accompagne un lien de réinitialisation (voir les contextes `ThemeResetPasswordView` et
 * consorts, qui n'en portent qu'un booléen).
 *
 * Ce que cette garde ne prétend pas être, et il vaut mieux l'écrire que le laisser croire : une
 * barrière contre un thème hostile. Un gabarit Liquid produit du HTML arbitraire, donc un faux
 * formulaire de connexion y tient en six lignes — sur le bon domaine et avec le bon certificat. Ce
 * qui l'en empêche n'est pas ce mécanisme mais le chemin de dépôt : un thème arrive par SSH/FTP,
 * donc de quelqu'un qui a déjà le serveur. La garde porte sur l'autre source, celle qui n'a pas cet
 * accès — un réglage de marque saisi au panel ne peut ni fournir de gabarit, ni de script (voir
 * `ThemeDefinition.script` et `isSafeTokenValue`). Sa valeur ici est de ne fournir aucun outil qui
 * rendrait la chose banale, et de garder les secrets hors de portée du gabarit même quand il est
 * de bonne foi.
 */
export interface ThemeIslandSpec {
  /** Valeur de l'attribut `data-island`. */
  name: string;
  description: string;
  /**
   * Attributs `data-*` que le gabarit doit porter en plus de `data-island`, sans le préfixe.
   * `["product"]` se lit `data-product="…"` dans le gabarit, `dataset.product` côté navigateur.
   */
  params: string[];
  /**
   * Renseigné ⇒ îlot **refusé dans une page créée au panel** (`parsePageBlocks`), pour deux raisons
   * distinctes qu'il vaut mieux ne pas confondre.
   *
   * `"account"` : n'a de sens que pour un client connecté. Un éditeur de zone DNS sur une page
   * « À propos » ne saurait qu'échouer en 401 sous les yeux d'un visiteur.
   *
   * `"auth"` : appartient à un écran d'authentification, dont l'état vient de l'URL (jeton de
   * réinitialisation, ticket SSO) et que la page seule sait fournir. Posé dans une page de contenu,
   * un tel îlot rendrait un formulaire sans le secret qui le rend utilisable — et un formulaire de
   * connexion surgissant au milieu d'une page rédactionnelle apprend surtout aux clients à en
   * saisir un n'importe où.
   *
   * Absent : utilisable partout, y compris dans un bloc de page de contenu. Un bouton de commande
   * ou un panier ont leur place des deux côtés.
   */
  area?: "account" | "auth";
}

/**
 * Îlots que le portail sait monter, où qu'ils apparaissent — gabarit de vue comme enveloppe.
 *
 * Liste fermée, à l'inverse des vues : un nom d'îlot désigne un composant réellement compilé dans
 * le portail. Un `data-island` inconnu ne rend rien plutôt que d'échouer, mais `check-extension`
 * le signale, parce que c'est presque toujours une faute de frappe.
 */
export const THEME_ISLANDS: ThemeIslandSpec[] = [
  {
    name: "order-button",
    description:
      "Commande d'un produit : options configurables, code promo, consentement CGV, paiement.",
    params: ["product"],
  },
  {
    name: "bundle-order-button",
    description: "Commande d'une offre groupée.",
    params: ["bundle"],
  },
  {
    name: "cart",
    description:
      "Panier complet : lignes, total, code promo et paiement. Son contenu vit dans le navigateur du visiteur, jamais dans le contexte du gabarit.",
    params: [],
  },
  {
    name: "domain-search",
    description:
      "Recherche de disponibilité d'un nom de domaine, puis commande avec contact registrant.",
    params: [],
  },
  {
    name: "language-switcher",
    description: "Sélecteur de langue. Utilisable dans l'enveloppe comme dans une vue.",
    params: [],
  },

  // ---------------------------------------------------------------------------
  // Espace client. Tous marqués `area: "account"` : ils s'adressent à un client connecté et
  // n'apparaissent donc jamais dans une page publique créée au panel.
  //
  // La règle du lot 1 vaut telle quelle ici, et il faut la relire une fois de plus parce que la
  // liste ci-dessous contient un champ de mot de passe et une phrase anti-hameçonnage : ce sont
  // des composants **de l'hôte**, compilés dans le portail, que le thème se contente de placer.
  // Ce qui reste interdit est qu'un gabarit *écrive* lui-même un champ de mot de passe, et c'est
  // pourquoi les 8 pages d'authentification restent hors du registre des vues.
  //
  // Presque aucun ne déclare de `params`, à l'inverse de la vitrine, et la raison tient à qui
  // connaît quoi : ces îlots vivent sur une page qui a déjà chargé l'objet dont ils dépendent, et
  // c'est elle qui le leur passe — un gabarit n'a donc pas à écrire l'identifiant du service, et
  // surtout il ne doit pas pouvoir en désigner un autre. `invoice-pay` fait exception parce qu'il
  // est le seul répétable : dans une liste de factures, seul le gabarit sait de quelle ligne il
  // s'agit.
  // ---------------------------------------------------------------------------
  {
    name: "logout",
    description: "Bouton de déconnexion. Prévu pour l'enveloppe de l'espace client.",
    params: [],
    area: "account",
  },
  {
    name: "invoice-pay",
    description:
      "Paiement d'une facture. Le gabarit décide de l'entourer d'un test sur le statut : une facture réglée n'a rien à payer.",
    params: ["invoice"],
    area: "account",
  },
  {
    name: "service-actions",
    description: "Démarrer, arrêter, redémarrer un service. Les actions non offertes par le driver restent masquées.",
    params: [],
    area: "account",
  },
  {
    name: "service-credentials",
    description: "Révélation des identifiants de première connexion, à la demande.",
    params: [],
    area: "account",
  },
  {
    name: "service-reinstall",
    description: "Réinstallation du système d'exploitation, avec confirmation saisie.",
    params: [],
    area: "account",
  },
  {
    name: "service-snapshots",
    description: "Instantanés : liste, création, restauration, suppression.",
    params: [],
    area: "account",
  },
  {
    name: "service-backups",
    description: "Sauvegardes : liste et restauration.",
    params: [],
    area: "account",
  },
  {
    name: "service-reverse-dns",
    description: "Enregistrement PTR (reverse DNS) du service.",
    params: [],
    area: "account",
  },
  {
    name: "service-plan-change",
    description: "Changement de formule, avec le prorata calculé par le noyau.",
    params: [],
    area: "account",
  },
  {
    name: "service-addons",
    description: "Options d'abonnement attachées au service, et celles qui restent disponibles.",
    params: [],
    area: "account",
  },
  {
    name: "service-monitoring",
    description: "Sondes de supervision du service : liste, ajout, suppression.",
    params: [],
    area: "account",
  },
  {
    name: "service-early-renewal",
    description: "Renouvellement anticipé, quand une remise le rend possible.",
    params: [],
    area: "account",
  },
  {
    name: "service-cancellation",
    description: "Demande de résiliation, avec son motif.",
    params: [],
    area: "account",
  },
  {
    name: "service-console",
    description: "Console distante (noVNC) du service.",
    params: [],
    area: "account",
  },
  {
    name: "ticket-reply",
    description: "Réponse à un ticket, pièce jointe comprise si l'instance l'autorise.",
    params: [],
    area: "account",
  },
  {
    name: "ticket-satisfaction",
    description: "Note de satisfaction d'un ticket résolu.",
    params: [],
    area: "account",
  },
  {
    name: "ticket-new-form",
    description:
      "Ouverture d'un ticket : département, sujet, message, et suggestions d'articles au fil de la saisie.",
    params: [],
    area: "account",
  },
  {
    name: "domain-settings",
    description: "Serveurs de noms et verrou de transfert d'un domaine.",
    params: [],
    area: "account",
  },
  {
    name: "dns-create-zone",
    description: "Création d'une zone DNS.",
    params: [],
    area: "account",
  },
  {
    name: "dns-records-editor",
    description: "Éditeur d'enregistrements d'une zone : ajout, modification, suppression.",
    params: [],
    area: "account",
  },
  {
    name: "dns-use-host-ns",
    description: "Bascule d'un domaine vers les serveurs de noms de l'hébergeur.",
    params: [],
    area: "account",
  },
  {
    name: "dns-delete-zone",
    description: "Suppression d'une zone DNS, avec confirmation.",
    params: [],
    area: "account",
  },
  {
    name: "account-change-email",
    description: "Changement de l'adresse e-mail du compte.",
    params: [],
    area: "account",
  },
  {
    name: "account-change-password",
    description: "Changement de mot de passe, contrôlé par la politique de l'instance.",
    params: [],
    area: "account",
  },
  {
    name: "account-two-factor",
    description: "Activation et désactivation de la double authentification.",
    params: [],
    area: "account",
  },
  {
    name: "account-passkeys",
    description: "Clés d'accès (WebAuthn) : liste, ajout, suppression.",
    params: [],
    area: "account",
  },
  {
    name: "account-sso",
    description: "Comptes externes liés (Google, OIDC).",
    params: [],
    area: "account",
  },
  {
    name: "account-anti-phishing",
    description: "Phrase anti-hameçonnage, reprise dans les e-mails de l'instance.",
    params: [],
    area: "account",
  },
  {
    name: "account-billing-identity",
    description: "Identité de facturation : raison sociale, adresse, numéro de TVA, devise.",
    params: [],
    area: "account",
  },
  {
    name: "account-payment-methods",
    description: "Moyens de paiement enregistrés : ajout, retrait, choix du moyen par défaut.",
    params: [],
    area: "account",
  },
  {
    name: "account-privacy",
    description: "Droits RGPD : export des données et demande d'effacement.",
    params: [],
    area: "account",
  },
  {
    name: "account-referral-code",
    description: "Code de parrainage et copie du lien d'invitation.",
    params: [],
    area: "account",
  },
  {
    name: "account-team",
    description: "Sous-utilisateurs du compte : invitation, permissions, retrait.",
    params: [],
    area: "account",
  },
  {
    name: "reseller-create-client",
    description: "Création d'un client par un revendeur.",
    params: [],
    area: "account",
  },
  {
    name: "reseller-order-for-client",
    description: "Commande passée par un revendeur pour le compte d'un de ses clients.",
    params: [],
    area: "account",
  },
  {
    name: "reseller-branding",
    description:
      "Marque appliquée aux clients gérés d'un revendeur : nom, logo, couleurs, domaine dédié.",
    params: [],
    area: "account",
  },

  // ---------------------------------------------------------------------------
  // Authentification. Tous `area: "auth"`, donc jamais posables dans une page créée au panel.
  //
  // Aucun ne prend de `params` — et c'est la règle du groupe, pas une coïncidence. Ce qu'ils
  // reçoivent d'utile (jeton de réinitialisation, ticket SSO, code du fournisseur) vient de l'URL
  // et leur est passé par la page via `islandProps`, qui l'emporte sur les `data-*`. Un gabarit ne
  // peut donc ni fournir ces valeurs, ni les détourner vers un autre îlot.
  {
    name: "auth-login",
    description:
      "Formulaire de connexion client : e-mail, mot de passe, second facteur (TOTP ou clé d'accès), boutons SSO.",
    params: [],
    area: "auth",
  },
  {
    name: "auth-register",
    description: "Formulaire d'inscription publique : identité, mot de passe, CGV, code de parrainage.",
    params: [],
    area: "auth",
  },
  {
    name: "auth-forgot-password",
    description:
      "Demande de lien de réinitialisation. Répond toujours la même chose, compte existant ou non.",
    params: [],
    area: "auth",
  },
  {
    name: "auth-reset-password",
    description: "Choix d'un nouveau mot de passe à partir du jeton reçu par e-mail.",
    params: [],
    area: "auth",
  },
  {
    name: "auth-accept-invite",
    description:
      "Acceptation d'une invitation de sous-utilisateur : choix du mot de passe du nouveau contact.",
    params: [],
    area: "auth",
  },
  {
    name: "auth-sso-link",
    description:
      "Liaison d'une identité SSO à un compte existant : connexion complète exigée avant de lier.",
    params: [],
    area: "auth",
  },
  {
    name: "auth-sso-callback",
    description:
      "Retour du fournisseur SSO : échange du code, second facteur si besoin, puis redirection.",
    params: [],
    area: "auth",
  },
];

/**
 * Une vue thémable : un gabarit `templates/pages/<name>.liquid` et le contexte qui l'accompagne.
 *
 * Registre, pas union de types : ajouter une vue est une entrée de données, plus une modification
 * du contrat. C'est ce qui permet de convertir le portail page par page sans qu'un thème publié
 * cesse de fonctionner — un thème qui ne fournit pas le gabarit d'une vue retombe sur l'écran
 * React de l'hôte, vue par vue et non tout ou rien.
 */
export interface ThemeViewSpec {
  /** Nom de la vue, et donc du fichier attendu : `templates/pages/<name>.liquid`. */
  name: string;
  description: string;
  /**
   * Zone du portail, et par là même qui assemble le contexte — la seule chose que l'auteur d'un
   * thème n'a pas à savoir, mais que le noyau doit trancher vue par vue.
   *
   * `"marketing"` : le noyau. La page est publique, l'API la sert seule
   * (`GET /themes/render/view/:name`), et ce qu'elle contient ne dépend d'aucune session.
   *
   * `"auth"` : le noyau également, même route. Ces écrans sont servis sans session — il n'y en a
   * pas encore — et leur contexte tient dans des réglages d'instance que l'API a déjà sous la main.
   * Zone distincte de `"marketing"` malgré la source commune, parce que la distinction porte pour
   * l'auteur du thème : ces vues exigent l'îlot de leur formulaire, elles n'ont pas de navigation
   * de client connecté, et rien de ce qui rend le lien utilisable (jeton, ticket) ne leur est
   * transmis.
   *
   * `"account"` : la page. Tout ce qu'affiche l'espace client dépend du client connecté, et la
   * page Next a déjà ces données en main — elle les envoie à l'API, qui rend le gabarit
   * (`POST /themes/render/view/:name`). L'alternative aurait été de faire refaire à l'API les
   * requêtes que la page vient de faire, en dupliquant du même coup la mise en forme des dates et
   * des montants dans la locale du visiteur.
   */
  area: "marketing" | "account" | "auth";
  /**
   * Îlots sans lesquels la vue perd une action que rien d'autre ne rend.
   *
   * Vérifiés par `pnpm check-extension` : un gabarit de catalogue qui oublie `order-button`
   * s'affiche parfaitement et ne vend rien, ce qui est le pire des défauts — visible de personne
   * jusqu'au premier client qui renonce.
   */
  requiredIslands: string[];
}

export const THEME_VIEWS: ThemeViewSpec[] = [
  // --- Vitrine : contexte assemblé par l'API ---------------------------------------------------
  { name: "home", description: "Page d'accueil de la vitrine.", area: "marketing", requiredIslands: [] },
  {
    name: "catalog",
    description: "Catalogue : catégories, offres, offres groupées.",
    area: "marketing",
    requiredIslands: ["order-button"],
  },
  {
    name: "cart",
    description: "Panier. Tout son contenu est un îlot : il vit dans le navigateur du visiteur.",
    area: "marketing",
    requiredIslands: ["cart"],
  },
  {
    name: "domains",
    description: "Recherche et commande de noms de domaine.",
    area: "marketing",
    requiredIslands: ["domain-search"],
  },
  {
    name: "kb",
    description: "Base de connaissances : liste paginée, recherche, mots-clés.",
    area: "marketing",
    requiredIslands: [],
  },
  {
    name: "kb-article",
    description: "Un article de la base de connaissances.",
    area: "marketing",
    requiredIslands: [],
  },
  {
    name: "legal-privacy",
    description: "Politique de confidentialité.",
    area: "marketing",
    requiredIslands: [],
  },
  {
    name: "legal-terms",
    description: "Conditions générales de vente.",
    area: "marketing",
    requiredIslands: [],
  },
  {
    // Vue générique et non une vue par page : les pages créées au panel n'existent pas à l'écriture
    // du thème. C'est aussi pourquoi elle n'exige aucun îlot — c'est le rédacteur qui décide, bloc
    // par bloc, s'il en pose un, et un gabarit ne peut pas le savoir d'avance.
    name: "content-page",
    description:
      "Gabarit générique des pages créées par l'hébergeur depuis le back-office (blocs structurés).",
    area: "marketing",
    requiredIslands: [],
  },

  // --- Espace client : contexte fourni par la page ----------------------------------------------
  //
  // Les îlots obligatoires sont ici l'essentiel du contrôle : une page de service dont le gabarit
  // oublie `service-actions` s'affiche parfaitement et laisse le client sans moyen de redémarrer
  // sa machine. Un îlot placé sous condition (`{% if invoice.payable %}`) satisfait l'exigence :
  // le contrôle porte sur la source du gabarit, pas sur son rendu.
  {
    name: "dashboard",
    description: "Tableau de bord : compteurs, derniers services, dernières factures.",
    area: "account",
    requiredIslands: [],
  },
  {
    name: "services",
    description: "Liste paginée des services du client.",
    area: "account",
    requiredIslands: [],
  },
  {
    name: "service",
    description: "Un service : état, accès, et toutes ses actions self-service.",
    area: "account",
    requiredIslands: ["service-actions"],
  },
  {
    name: "service-console",
    description: "Console distante d'un service.",
    area: "account",
    requiredIslands: ["service-console"],
  },
  {
    name: "invoices",
    description: "Liste paginée des factures, et solde de compte s'il y en a un.",
    area: "account",
    requiredIslands: [],
  },
  {
    name: "invoice",
    description: "Une facture : lignes, totaux, paiement, téléchargement du PDF.",
    area: "account",
    requiredIslands: ["invoice-pay"],
  },
  {
    name: "tickets",
    description: "Liste paginée des tickets de support.",
    area: "account",
    requiredIslands: [],
  },
  {
    name: "ticket",
    description: "Un ticket : fil de messages, réponse, satisfaction.",
    area: "account",
    requiredIslands: ["ticket-reply"],
  },
  {
    name: "ticket-new",
    description: "Ouverture d'un ticket.",
    area: "account",
    requiredIslands: ["ticket-new-form"],
  },
  {
    name: "domains-mine",
    description: "Domaines du client : expiration, renouvellement automatique, verrou.",
    area: "account",
    requiredIslands: [],
  },
  {
    name: "domain",
    description: "Un domaine : serveurs de noms, verrou de transfert, code d'autorisation.",
    area: "account",
    requiredIslands: ["domain-settings"],
  },
  {
    name: "dns-zones",
    description: "Zones DNS du client.",
    area: "account",
    requiredIslands: ["dns-create-zone"],
  },
  {
    name: "dns-zone",
    description: "Une zone DNS : enregistrements et délégation.",
    area: "account",
    requiredIslands: ["dns-records-editor"],
  },
  {
    name: "history",
    description: "Historique du compte : commandes, paiements, événements de service.",
    area: "account",
    requiredIslands: [],
  },
  {
    // `/account/settings` n'a pas de vue : la page ne rend rien, elle redirige (permanentRedirect)
    // vers la section ou vers les moyens de paiement. Rien à rhabiller.
    name: "account",
    description: "Accueil de la section « Mon compte » : ses sous-pages, filtrées par permission.",
    area: "account",
    requiredIslands: [],
  },
  {
    name: "account-profile",
    description: "Adresse e-mail du compte.",
    area: "account",
    requiredIslands: ["account-change-email"],
  },
  {
    name: "account-security",
    description:
      "Sécurité : mot de passe, double authentification, clés d'accès, comptes liés, phrase anti-hameçonnage.",
    area: "account",
    requiredIslands: ["account-change-password"],
  },
  {
    name: "account-billing",
    description: "Identité de facturation et devise du client.",
    area: "account",
    requiredIslands: ["account-billing-identity"],
  },
  {
    name: "account-payment-methods",
    description: "Moyens de paiement enregistrés.",
    area: "account",
    requiredIslands: ["account-payment-methods"],
  },
  {
    name: "account-privacy",
    description: "Droits RGPD du client.",
    area: "account",
    requiredIslands: ["account-privacy"],
  },
  {
    name: "account-referral",
    description: "Parrainage : code, lien, filleuls.",
    area: "account",
    requiredIslands: ["account-referral-code"],
  },
  {
    name: "account-team",
    description: "Sous-utilisateurs du compte.",
    area: "account",
    requiredIslands: ["account-team"],
  },
  {
    name: "reseller-clients",
    description: "Clients d'un revendeur.",
    area: "account",
    requiredIslands: [],
  },
  {
    name: "reseller-client",
    description: "Un client d'un revendeur : ses services, et la commande passée pour lui.",
    area: "account",
    requiredIslands: ["reseller-order-for-client"],
  },
  {
    name: "reseller-branding",
    description: "Marque et domaine d'un revendeur, réglés par lui-même.",
    area: "account",
    requiredIslands: ["reseller-branding"],
  },
  {
    name: "reseller-client-new",
    description: "Création d'un client par un revendeur.",
    area: "account",
    requiredIslands: ["reseller-create-client"],
  },

  // --- Authentification : contexte assemblé par l'API, formulaire toujours obligatoire ----------
  //
  // `requiredIslands` porte ici tout le poids du contrôle, et davantage qu'ailleurs. Un gabarit de
  // catalogue qui oublie son bouton ne vend rien ; un gabarit de connexion qui oublie le sien
  // rend le portail entier inaccessible, y compris à l'hébergeur venu constater le problème.
  // `pnpm check-extension` refuse un tel thème avant qu'il n'atteigne une instance.
  {
    name: "login",
    description: "Connexion client.",
    area: "auth",
    requiredIslands: ["auth-login"],
  },
  {
    name: "register",
    description: "Inscription publique, quand l'hébergeur l'a ouverte.",
    area: "auth",
    requiredIslands: ["auth-register"],
  },
  {
    name: "forgot-password",
    description: "Demande d'un lien de réinitialisation de mot de passe.",
    area: "auth",
    requiredIslands: ["auth-forgot-password"],
  },
  {
    name: "reset-password",
    description: "Choix d'un nouveau mot de passe depuis le lien reçu par e-mail.",
    area: "auth",
    requiredIslands: ["auth-reset-password"],
  },
  {
    // Seule vue d'authentification sans îlot : elle n'a rien à saisir, la vérification est déjà
    // faite quand le gabarit s'exécute. Le gabarit lit `verified` et rend l'un des deux messages.
    name: "verify-email",
    description: "Résultat de la vérification d'adresse e-mail.",
    area: "auth",
    requiredIslands: [],
  },
  {
    name: "accept-invite",
    description: "Acceptation d'une invitation de sous-utilisateur.",
    area: "auth",
    requiredIslands: ["auth-accept-invite"],
  },
  {
    name: "sso-link",
    description: "Liaison d'une identité SSO à un compte existant.",
    area: "auth",
    requiredIslands: ["auth-sso-link"],
  },
  {
    name: "sso-callback",
    description: "Retour du fournisseur SSO, avant redirection vers l'espace client.",
    area: "auth",
    requiredIslands: ["auth-sso-callback"],
  },
];

/** Vues dont le contexte est assemblé par l'appelant plutôt que par l'API. */
export function isProvidedContextView(name: string): boolean {
  return themeViewSpec(name)?.area === "account";
}

/** Noms des vues connues, dans l'ordre du registre. */
export const THEME_VIEW_NAMES: string[] = THEME_VIEWS.map((view) => view.name);

export function themeViewSpec(name: string): ThemeViewSpec | undefined {
  return THEME_VIEWS.find((view) => view.name === name);
}

export function themeIslandSpec(name: string): ThemeIslandSpec | undefined {
  return THEME_ISLANDS.find((island) => island.name === name);
}

/** Tous les `data-island` qu'une source de gabarit déclare, dans l'ordre d'apparition. */
export function declaredIslands(templateSource: string): string[] {
  return [...templateSource.matchAll(/data-island\s*=\s*"([^"]*)"/g)].map(
    (match) => match[1] as string,
  );
}

/**
 * Îlots obligatoires d'une vue qu'un gabarit ne place nulle part.
 *
 * Contrôle textuel sur la **source** du gabarit, pas sur son rendu : un `{% for %}` peut ne rien
 * produire pour un catalogue vide, ce qui rendrait un contrôle au rendu faussement rassurant un
 * jour et faussement alarmant le lendemain. Une vue inconnue ne rend rien à corriger — c'est
 * `unknownIslands` qui signale ce cas de figure.
 */
export function missingRequiredIslands(templateSource: string, viewName: string): string[] {
  const spec = themeViewSpec(viewName);
  if (!spec) {
    return [];
  }
  const present = new Set(declaredIslands(templateSource));
  return spec.requiredIslands.filter((island) => !present.has(island));
}

/**
 * Un nom d'îlot calculé par le gabarit plutôt qu'écrit en clair — `data-island="{{ block.island }}"`.
 *
 * Nécessairement le cas du gabarit générique des pages de contenu (`content-page`) : il rend des
 * blocs saisis au panel, dont le nom d'îlot n'existe pas au moment où le thème est écrit.
 */
function isDynamicIslandName(name: string): boolean {
  return name.includes("{{") || name.includes("{%");
}

/**
 * `data-island` d'un gabarit qui ne désignent aucun composant de l'hôte — presque toujours une
 * faute de frappe.
 *
 * **Un nom calculé est ignoré**, jamais signalé : rien ne permet de le résoudre sans rendre le
 * gabarit, et le déclarer inconnu apprendrait à l'auteur à ne plus lire les erreurs de cet outil —
 * ce qui coûte plus cher que le contrôle ne rapporte. La garantie n'est pas perdue pour autant,
 * elle change simplement de moment : l'API refuse à l'enregistrement tout bloc dont l'îlot n'est
 * pas dans `THEME_ISLANDS`, et un nom qui arriverait quand même au portail n'y monte rien.
 *
 * `missingRequiredIslands` n'est pas assoupli de la même façon, et c'est voulu : un nom calculé ne
 * *prouve* pas qu'un îlot obligatoire est placé, donc il ne doit pas satisfaire l'exigence.
 */
export function unknownIslands(templateSource: string): string[] {
  return [...new Set(declaredIslands(templateSource))].filter(
    (name) => !isDynamicIslandName(name) && !themeIslandSpec(name),
  );
}

/** Forme d'un slug de page : minuscules, chiffres et tirets, sans tiret aux extrémités. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Gabarit attendu pour une page déclarée par le thème. */
export function themePageTemplatePath(slug: string, templatesDir = "templates"): string {
  return `${templatesDir}/custom/${slug}.liquid`;
}

/**
 * Ce qui empêche les pages déclarées par un thème de fonctionner, en clair.
 *
 * Rendu par `pnpm check-extension` avant qu'un hébergeur n'installe le thème, parce qu'aucun de ces
 * défauts ne se voit au rendu : un slug réservé donne une page qui ne s'affichera jamais (la route
 * statique du noyau gagne), un doublon donne une page qui en masque une autre selon l'ordre du
 * tableau, et un gabarit manquant donne un 404 sur un lien que le thème a lui-même mis en
 * navigation. Trois façons différentes de livrer un thème qui paraît complet.
 *
 * Le gabarit n'est vérifié que si `themeDir` est fourni — le contrôle de forme, lui, se fait sur le
 * seul manifeste.
 */
export function invalidThemePages(
  pages: ThemePageDeclaration[] | undefined,
  templateExists?: (relativePath: string) => boolean,
  templatesDir = "templates",
): string[] {
  if (!pages || pages.length === 0) {
    return [];
  }
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    const slug = typeof page?.slug === "string" ? page.slug.trim().toLowerCase() : "";
    if (!SLUG_PATTERN.test(slug)) {
      problems.push(
        `page « ${page?.slug ?? ""} » : slug invalide — minuscules, chiffres et tirets uniquement`,
      );
      continue;
    }
    if (isReservedPageSlug(slug)) {
      problems.push(
        `page « ${slug} » : ce chemin appartient au portail et ne peut pas être pris par un thème`,
      );
      continue;
    }
    if (seen.has(slug)) {
      problems.push(`page « ${slug} » : déclarée deux fois`);
      continue;
    }
    seen.add(slug);

    if (typeof page.title !== "string" || page.title.trim() === "") {
      problems.push(`page « ${slug} » : titre manquant`);
    }
    if (templateExists && !templateExists(themePageTemplatePath(slug, templatesDir))) {
      problems.push(`page « ${slug} » : gabarit ${themePageTemplatePath(slug, templatesDir)} absent`);
    }
  }

  return problems;
}

/**
 * Ce que reçoit `templates/email.liquid`.
 *
 * Le corps métier (`bodyHtml`/`bodyText`) reste celui que l'hébergeur a personnalisé dans
 * `EMAIL_TEMPLATES` — le thème fournit l'enveloppe, jamais le texte. Voir la note de
 * `email-templates.ts` sur cette séparation.
 */
export interface ThemeEmailContext {
  subject: string;
  /** Corps mis en paragraphes HTML, déjà échappé. */
  bodyHtml: string;
  /** Corps tel quel, pour un thème qui composerait différemment. */
  bodyText: string;
  companyName: string;
  logoUrl?: string;
  colors: ThemeColors;
}

/**
 * Le thème actif, tel que le noyau le résout et que les frontends le reçoivent.
 *
 * Distinct de `ThemeDefinition`, qui décrit ce qu'un thème *déclare* : celui-ci décrit ce que le
 * noyau a *décidé* après avoir empilé ses défauts, le thème choisi et les réglages de marque. Un
 * frontend n'a donc aucun empilement à refaire, ni même à savoir qu'il existe des thèmes.
 *
 * Vit dans le SDK bien qu'il ne serve pas aux auteurs de modules : c'est le seul paquet à la fois
 * inerte et commun à l'API, au worker et aux deux frontends. Le placer dans le paquet d'interface
 * aurait obligé l'API à en dépendre — donc à tirer React pour un type effacé à la compilation.
 */
export interface ResolvedTheme {
  /** Thème réellement appliqué. Diffère du thème demandé si celui-ci ne se charge plus. */
  themeId: string;
  tokens: ThemeTokens;
  fonts: ThemeFont[];
  /** Racine publique des ressources du thème, sans barre oblique finale. */
  assetBaseUrl: string;
  /** Feuille de style libre du thème, appliquée en dernier. */
  stylesheetUrl?: string;
  /**
   * Script du thème, chargé en `defer` sur toutes les pages du portail.
   *
   * Absent quand le thème n'en déclare pas — c'est-à-dire dans l'immense majorité des cas. Ne peut
   * jamais provenir des réglages de marque du panel : voir `ThemeDefinition.script`.
   */
  scriptUrl?: string;
  logoUrl?: string;
  companyName?: string;
}

/**
 * Valeurs de repli du noyau.
 *
 * Ce sont les tokens historiques de l'application, ceux qui étaient dans `tokens.css`. Ils vivent
 * ici et non dans une feuille de style parce que le thème actif se résout côté serveur, avant le
 * premier rendu : un défaut qui n'existerait qu'en CSS ne pourrait pas être fusionné.
 */
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  colorScheme: "dark",
  colors: {
    primary: "#6d28d9",
    accent: "#14b8a6",
    bg: "#0b0b10",
    surface: "#16161d",
    text: "#f2f2f5",
    muted: "#a1a1b0",
    border: "#2a2a35",
    success: "#22c55e",
    warning: "#f59e0b",
    danger: "#ef4444",
  },
  radii: { sm: "0.375rem", md: "0.625rem", lg: "1rem" },
  typography: {
    fontFamily: '"Inter", system-ui, sans-serif',
    headingFamily: '"Inter", system-ui, sans-serif',
    monoFamily: 'ui-monospace, "SFMono-Regular", "Menlo", monospace',
    baseSize: "1rem",
    bodyWeight: "400",
    headingWeight: "600",
  },
  density: "comfortable",
};

/**
 * Caractères qu'une valeur de token ne peut pas contenir.
 *
 * Ces valeurs finissent interpolées dans une balise `<style>` rendue côté serveur. Sans contrôle,
 * une couleur valant `red</style><script>…` sort de la balise, et une valant `red; position:fixed`
 * ajoute des déclarations que personne n'a écrites.
 *
 * On pourrait objecter que le modèle de confiance couvre déjà le cas : installer un thème équivaut
 * à installer un paquet npm. Mais la **même** fonction sert aux réglages de marque saisis dans le
 * panel, et un membre du staff autorisé à changer une couleur n'est pas autorisé à injecter du
 * script dans l'espace client. C'est cette seconde source, bien moins fiable, qui justifie le
 * contrôle — le thème n'en est que l'autre utilisateur.
 */
// Les guillemets, virgules et espaces restent autorisés : une pile de polices s'écrit
// `"Space Grotesk", system-ui, sans-serif` et n'a rien de suspect.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_IN_TOKEN = /[<>;{}\\]|[\x00-\x1f\x7f]/;

/** Une valeur de token est-elle sûre à interpoler dans une feuille de style ? */
export function isSafeTokenValue(value: string): boolean {
  return !FORBIDDEN_IN_TOKEN.test(value);
}

/**
 * Fusionne des tokens partiels sur une base, niveau par niveau.
 *
 * Sert à empiler défauts du noyau, puis thème actif, puis réglages de marque saisis par
 * l'hébergeur. Une fusion superficielle ne suffirait pas : un thème qui ne redéfinit que
 * `colors.primary` effacerait les neuf autres couleurs, et l'interface deviendrait illisible sur
 * une déclaration parfaitement légitime.
 */
export function mergeThemeTokens(base: ThemeTokens, override?: PartialThemeTokens): ThemeTokens {
  if (!override) {
    return base;
  }
  return {
    colorScheme: override.colorScheme ?? base.colorScheme,
    density: override.density ?? base.density,
    colors: { ...base.colors, ...definedOnly(override.colors) },
    radii: { ...base.radii, ...definedOnly(override.radii) },
    typography: { ...base.typography, ...definedOnly(override.typography) },
  };
}

/**
 * Écarte les clés à `undefined` avant l'étalement.
 *
 * `{...base, ...{primary: undefined}}` écrase `primary` par `undefined`, ce qui produit une
 * déclaration CSS `--color-primary: undefined`. Le cas n'a rien de théorique : il survient dès
 * qu'une couche vient d'un JSON où le champ est présent mais vide.
 */
function definedOnly<T extends object>(source: T | undefined): Partial<T> {
  if (!source) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  ) as Partial<T>;
}
