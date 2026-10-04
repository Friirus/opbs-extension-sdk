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

import {
  CONFIG_FIELD_UNITS,
  type ConfigField,
  type ConfigFieldType,
  type ThemeSettingItem,
  type ThemeSettingScalar,
  type ThemeSettingValue,
} from "../config-fields";
import {
  conditionShapeProblem,
  configFieldConditions,
  discardedConditionsOf,
} from "../config-conditions";
import { isSafeLinkValue } from "../links";
import { SUPPORTED_LOCALES, type SupportedLocale } from "../locale";
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
  /**
   * Couleur des liens du texte. Absente, elle vaut `accent` — **résolu**, pas celui des défauts :
   * un défaut littéral figerait les liens sur l'ancienne teinte d'un thème qui change son accent.
   * D'où l'optionnel, là où les dix couleurs ci-dessus sont toutes déclarées par le noyau.
   */
  link?: string;
  /** Anneau de focus clavier. Absente, elle vaut `accent`, pour la même raison que `link`. */
  focus?: string;
}

/** Rayons de bordure. Un thème anguleux met tout à `0`, et c'est un changement très visible. */
export interface ThemeRadii {
  sm: string;
  md: string;
  lg: string;
  /**
   * Rayon des boutons. Absent, il vaut `md` : un thème qui arrondit ses cartes arrondit aussi ses
   * boutons sans rien déclarer de plus, et seul celui qui veut des boutons en pilule le dit.
   */
  button?: string;
}

export interface ThemeTypography {
  /** Police du texte courant. */
  fontFamily: string;
  /**
   * Police des titres.
   *
   * Tant qu'aucune couche ne lui donne une valeur distincte de `fontFamily`, elle suit la police
   * du texte **résolue** — y compris celle qu'une marque pose par-dessus le thème (voir
   * `mergeThemeTokens`). Un thème qui ne déclare que `fontFamily` a donc ses titres dans sa police,
   * et non dans l'Inter des défauts du noyau.
   */
  headingFamily: string;
  /** Police à chasse fixe : identifiants de machines, empreintes, références de facture. */
  monoFamily: string;
  /**
   * Taille de base. Les titres en dérivent (`headingScale`) ; `--font-size-sm`, `-lg` et `-xl`
   * restent des constantes de la plateforme — aucun ratio unique ne redonne leurs valeurs
   * historiques, et les dériver aurait changé le rendu de toutes les instances.
   */
  baseSize: string;
  bodyWeight: string;
  headingWeight: string;
  /** Hauteur de ligne du texte courant, **sans unité** (`"1.5"`) : elle suit alors la taille de
   *  chaque élément au lieu d'être figée sur celle du parent. */
  lineHeight: string;
  /** Hauteur de ligne des titres, sans unité : plus serrée que le texte, un titre sur deux lignes
   *  se lit comme un bloc. */
  headingLineHeight: string;
  /** Interlettrage du texte courant, en longueur (`"0em"`, `"0.01em"`). */
  letterSpacing: string;
  /** Interlettrage des titres, en longueur. */
  headingLetterSpacing: string;
  /**
   * Rapport entre deux niveaux de titre, sans unité : `h3` vaut `baseSize` × ratio, `h2` × ratio²,
   * `h1` × ratio³. Un seul nombre plutôt que trois tailles : c'est l'échelle qui fait la cohérence
   * d'une typographie, et trois valeurs libres ne la garantiraient pas.
   */
  headingScale: string;
}

/** Place de la navigation de l'espace client : colonne à gauche, ou barre au-dessus du contenu. */
export type ThemeAccountNav = "sidebar" | "top";

/** Mise en page : ce qui ne relève ni de la couleur, ni de la typographie, ni des rayons. */
export interface ThemeLayout {
  /** Largeur maximale du contenu principal, en longueur (`"72rem"`). */
  containerMax: string;
  /** Lue par le portail, qui dispose l'enveloppe de l'espace client en conséquence : aucune
   *  variable CSS ne peut déplacer une navigation d'une colonne à une barre. */
  accountNav: ThemeAccountNav;
}

/**
 * Relief des surfaces : décide des ombres (`--shadow-sm`, `-md`, `-lg`).
 *
 * Un niveau plutôt que trois ombres libres : une ombre est une géométrie **et** une teinte, et la
 * teinte doit suivre la palette — une ombre noire écrite par un thème clair devient invisible, ou
 * sale, dès qu'une marque change le texte. `soft` reproduit les ombres historiques.
 */
export type ThemeElevation = "flat" | "soft" | "raised";

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
/**
 * Apparence du site. `auto` suit le système du visiteur (`prefers-color-scheme`) et n'a d'effet
 * que si le thème déclare `tokensDark` — sans palette sombre, il n'y a rien à basculer.
 *
 * Porté par `tokens.colorScheme`, qui décidait jusqu'ici de la seule apparence des contrôles
 * natifs. Le sens s'élargit sans se contredire : c'est toujours « en clair ou en sombre ? »,
 * posé une fois pour le site entier au lieu des seuls ascenseurs.
 */
export type ThemeColorScheme = "light" | "dark" | "auto";

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
  layout: ThemeLayout;
  elevation: ThemeElevation;
}

/** Tokens tels qu'un thème les déclare : partiels à tous les niveaux. */
export interface PartialThemeTokens {
  colorScheme?: ThemeColorScheme;
  colors?: Partial<ThemeColors>;
  radii?: Partial<ThemeRadii>;
  typography?: Partial<ThemeTypography>;
  density?: ThemeDensity;
  layout?: Partial<ThemeLayout>;
  elevation?: ThemeElevation;
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
  /**
   * Nom de famille, tel qu'il apparaît dans `typography`.
   *
   * Avec `src`, il finit dans le `@font-face` que le noyau émet, et n'y est admis que s'il ne
   * contient que des lettres ASCII, des chiffres, des espaces, `_` et `-` (64 caractères au plus,
   * guillemets de bord ignorés) : `"Libre Franklin 2.0"` est écartée, le point n'y figurant pas.
   * Voir `isSafeThemeFont`.
   */
  family: string;
  /**
   * Fichier de police, relatif au **dossier de ressources** du thème (`assets`, par défaut
   * `assets/`) et non au dossier du thème : il est servi sous la même URL que les autres ressources.
   * Le noyau en fabrique le `@font-face`. Absent, `href` doit être renseigné.
   */
  src?: string;
  /** Feuille de style externe qui déclare la police (Google Fonts, Bunny, fonderie). */
  href?: string;
  /**
   * Graisse du fichier : `normal`, `bold` ou un nombre de 1 à 1000 (`"400"`), ou deux valeurs
   * séparées d'un blanc pour une police variable (`"100 900"`). Une autre forme (`"semibold"`)
   * fait écarter la police entière de `@font-face` — voir `isSafeThemeFont`.
   */
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
  /**
   * Palette du **mode sombre**, empilée par-dessus `tokens` quand le système du visiteur le
   * demande (`prefers-color-scheme: dark`) et que le thème a choisi de le suivre.
   *
   * Déclarée par le thème et jamais dérivée : inverser mécaniquement une palette claire donne des
   * gris boueux et des aplats de marque illisibles. Sans cette clé, aucun bloc sombre n'est émis,
   * quel que soit le réglage — un thème qui n'a pas pensé son mode sombre ne doit pas en avoir un
   * de force.
   */
  tokensDark?: PartialThemeTokens;
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
   * Dossier des traductions du thème, relatif à son dossier. Défaut `locales`.
   *
   * Un fichier par langue (`fr.json`, `en.json`…), plat, valeurs texte uniquement. Le noyau les
   * charge et les pose sous `t` dans **tous** les contextes de gabarit :
   * `{{ t.searchPlaceholder }}`. Une clé absente de la langue de la page retombe sur la langue par
   * défaut de l'instance, puis disparaît — jamais de clé affichée brute.
   *
   * Exister était nécessaire : le portail est multilingue, les gabarits d'un thème ne l'étaient
   * pas. `locale` permettait bien d'écrire `{% if locale == "en" %}…{% endif %}`, tenable pour
   * trois phrases et pas pour une centaine — d'où des thèmes livrés dans une seule langue, dont
   * les libellés se mélangeaient à ceux du noyau, eux traduits, sur la même page.
   *
   * Chaque clé est aussi **modifiable au panel**, langue par langue (« Textes du thème ») : le noyau
   * range ces surcharges dans ses réglages (`$texts`) et les pose par-dessus le fichier au rendu.
   * Un gabarit n'a rien à faire pour en profiter ; il peut marquer la zone qui affiche un texte
   * (`data-theme-text="clé"`) pour que l'aperçu du panel y mène.
   */
  locales?: string;
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
   * les réglages publiés au panel face aux tokens déclarés par le thème (voir
   * `resolveActiveTheme`). Ignorer ce qu'un administrateur vient de saisir est le pire des deux
   * mondes — il le ressaisirait en boucle sans jamais comprendre.
   */
  pages?: ThemePageDeclaration[];
  /**
   * Réglages que l'hébergeur peut modifier depuis le panel, sans toucher un fichier.
   *
   * C'est la moitié qui manquait au contrat. Sans elle, un thème n'était paramétrable que par ses
   * tokens — couleurs, rayons, polices — et tout le reste vivait en dur dans ses gabarits : le
   * titre du hero, les libellés des boutons, l'image de présentation, les blocs à montrer ou non.
   * Un hébergeur qui voulait changer une phrase devait éditer un `.liquid` par SSH, et son
   * changement disparaissait à la mise à jour du thème.
   *
   * Mêmes `ConfigField` que les modules, donc même formulaire rendu par le panel et même
   * validation : un thème n'obtient rien qu'un module n'ait déjà. Deux types sont refusés ici et
   * `pnpm check-extension` le dit — `password`, parce qu'un thème n'a pas de code pour se servir
   * d'un secret et qu'il n'a donc aucune raison d'en demander un ; `provider`, parce qu'il ne
   * pilote aucun fournisseur.
   *
   * Les valeurs arrivent aux gabarits sous `settings` : `{{ settings.heroTitle }}`,
   * `{% if settings.showSteps %}`. Un champ non renseigné prend son `defaultValue`, et un champ
   * que le thème ne déclare plus disparaît du contexte — les valeurs stockées ne sont jamais
   * rendues telles quelles, elles sont filtrées par la déclaration en cours.
   */
  settings?: ConfigField[];
  /**
   * Sections du panel de réglages, dans l'ordre où le rail les montre, chacune rattachée aux
   * réglages dont le `group` porte son `name`.
   *
   * Sans elles, une section n'était qu'un titre déduit des champs : pas de description, pas de
   * page d'aperçu propre (le premier champ décidait, voir `ConfigField.previewPath`), et un rail
   * qui perdait une section dès que tous ses champs étaient masqués par une condition. Une section
   * déclarée reste dans le rail en toutes circonstances. Les groupes non déclarés suivent, dans
   * l'ordre de leur première apparition.
   */
  settingGroups?: ThemeSettingGroup[];
  /**
   * Langue dans laquelle le manifeste est écrit — libellés, aides, groupes, sous-groupes, options,
   * descriptions de section. Défaut `"en"`.
   *
   * Le panel traduit ces textes dans la langue du membre du staff à partir de
   * `<locales>/panel/<langue>.json` (clé = chaîne source exacte du manifeste, valeur = traduction) ;
   * pour cette langue-ci, il n'y a rien à traduire et aucun fichier n'est lu. `pnpm check-extension`
   * signale un fichier manquant, une chaîne non traduite ou une clé orpheline pour chaque autre
   * langue de `SUPPORTED_LOCALES`.
   */
  settingsLocale?: SupportedLocale;
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
  /**
   * Capture d'écran du thème, relative à son dossier (et non au dossier `assets`, comme `logo`).
   *
   * Affichée dans le sélecteur de thèmes du panel, pour qu'un hébergeur voie ce qu'il applique
   * avant de l'appliquer. PNG, JPEG ou WebP ; 1200 × 750 (16:10) recommandé, 400 Ko au plus.
   * Absente, le panel dessine une vignette à partir des tokens du thème.
   */
  screenshot?: string;
}

/**
 * Une section du panel de réglages, déclarée par le thème (`ThemeDefinition.settingGroups`).
 *
 * Tout y est facultatif sauf le nom : une section déclarée sans rien d'autre sert déjà à fixer sa
 * place dans le rail et à l'y garder quand ses champs sont masqués.
 */
export interface ThemeSettingGroup {
  /**
   * Identifiant de la section : la valeur de `ConfigField.group` des réglages qu'elle range. Chaîne
   * source du manifeste, jamais traduite — le panel reçoit son libellé traduit à côté.
   */
  name: string;
  /** Une ou deux phrases affichées en tête de section au panel. Traduisible comme les libellés. */
  description?: string;
  /**
   * Intertitre du rail sous lequel la section se range : l'apparence (couleurs, typographie,
   * mise en forme) ou le contenu (textes, blocs, pages). Défaut `"content"`.
   */
  category?: "appearance" | "content";
  /**
   * Page que l'aperçu ouvre quand on entre dans la section — un chemin que `isThemePreviewPath`
   * accepte. Absente, le premier réglage de la section qui déclare un `previewPath` (déprécié)
   * décide ; sinon l'aperçu reste où il est.
   */
  previewPath?: string;
  /**
   * Clés des textes du thème (`t.<clé>`, voir `ThemeDefinition.locales`) que cette section affiche :
   * le panel les rend dans la section, sous l'intertitre « Textes », une entrée par clé, le texte du
   * thème en indication. Sans elles, un texte ne se modifie que dans la section « Textes du thème »
   * du noyau, qui les liste tous — loin du réglage d'à côté qui façonne le même bloc.
   *
   * Des identifiants et non des chaînes à traduire : `themePanelStrings` ne les compte pas, le
   * panel montre la clé et le texte du thème dans la langue éditée. Une clé ne se range que dans une
   * section ; `pnpm check-extension` signale une clé absente des traductions du thème.
   */
  texts?: string[];
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
/**
 * Engagements de service annoncés par l'hébergeur.
 *
 * Chaque champ est absent tant qu'aucune valeur n'a été saisie, et c'est le point : un gabarit
 * doit tester avant d'afficher. Le thème livré « encre » annonçait « 99,9 % de disponibilité »,
 * « quatorze jours de sauvegarde » et « quatre heures de réponse » écrits en dur dans son gabarit
 * — chaque hébergeur qui l'installait publiait donc, sous sa propre signature, des engagements
 * qu'il n'avait jamais pris. Un thème peut décrire *où* ces chiffres apparaissent ; seul
 * l'hébergeur peut décider *lesquels*.
 *
 * Déjà mis en forme, jamais bruts : `99,9 %` et non `999`. Un gabarit Liquid n'a pas accès à
 * `Intl`, et laisser chaque thème formater produirait autant de conventions que de thèmes.
 */
export interface ThemeServiceCommitments {
  /** Disponibilité annoncée, formatée dans la locale de l'instance (« 99,9 % »). */
  uptime?: string;
  /** Rétention des sauvegardes, en jours. */
  backupRetentionDays?: number;
  /** Délai de première réponse du support, en heures ouvrées. */
  supportResponseHours?: number;
}

export interface ThemeCustomPageView extends ThemeViewContext {
  view: "theme-page";
  /**
   * Ce que l'hébergeur s'engage à tenir, s'il l'a renseigné. Objet toujours présent, champs
   * toujours facultatifs : un gabarit teste `commitments.uptime`, jamais `commitments`.
   */
  commitments: ThemeServiceCommitments;
  page: { slug: string; title: string };
}

/**
 * Une famille du catalogue, telle que l'enveloppe la reçoit — **avec ses sous-familles et ses
 * offres**.
 *
 * La première version ne portait qu'un nom et un prix d'appel, et c'était trop peu : le menu
 * déroulant qu'attend une vitrine d'hébergeur montre les familles en colonnes et, sous chacune,
 * les offres avec leur prix. Un thème n'avait alors que deux mauvaises options — écrire ces offres
 * en dur, donc publier le catalogue d'un autre, ou renvoyer vers une page pour la moindre
 * information.
 *
 * L'arbre est rendu tel qu'il est saisi au back-office : `children` porte les sous-catégories, et
 * une famille peut parfaitement n'en avoir aucune. Un gabarit qui n'en veut pas lit `products` et
 * ignore `children` ; un gabarit qui construit un menu à colonnes lit les deux.
 *
 * Le volume est celui du catalogue publié, pas davantage : mêmes offres que la vue `catalog`, sans
 * les caractéristiques techniques. Un thème qui ne veut montrer que les premières limite dans son
 * gabarit (`{% for product in family.products limit: 5 %}`) — le noyau ne tronque pas à sa place,
 * il ne saurait pas où.
 */
export interface ThemeCatalogFamily {
  id: string;
  name: string;
  description?: string;
  /** Offres de cette famille seule, sous-familles exclues. */
  products: ThemeProductView[];
  /** Sous-familles, dans l'ordre du back-office. Vide si la famille n'en a pas. */
  children: ThemeCatalogFamily[];
  /** Offres de la famille **et** de toutes ses sous-familles : ce qu'annonce un menu. */
  productCount: number;
  /** Prix de l'offre la moins chère de la famille, sous-familles comprises, déjà mis en forme. */
  fromPriceFormatted?: string;
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
  /**
   * Documents légaux **réellement publiés** par l'hébergeur (mentions légales, CGV, politique de
   * confidentialité, remboursement, cookies), à poser en pied de page.
   *
   * Séparé de `nav` parce qu'ils n'ont pas la même place ni le même rôle : `nav` mène à ce qu'on
   * vend, ceux-ci à ce qu'on doit dire. Un thème qui ignore ce tableau prive son instance des
   * seuls liens que la loi impose de rendre accessibles — c'est pourquoi les deux thèmes livrés
   * les rendent, et pourquoi le rendu de repli du portail les rend aussi.
   *
   * Ne contient que les documents dont le texte existe : un lien vers une page qui annonce
   * « non encore publié » est pire que pas de lien, il donne l'apparence de la conformité.
   */
  legalLinks: ThemeNavLink[];
  /**
   * Familles du catalogue — **vitrine uniquement**, absent dans l'espace client.
   *
   * De quoi écrire le menu déroulant qu'a toute vitrine d'hébergeur. Sans lui, un thème n'avait
   * d'autre choix que d'écrire les familles en dur dans son en-tête, donc de publier le catalogue
   * d'un autre. Un gabarit teste `catalogFamilies.size` avant de dérouler quoi que ce soit : une
   * instance sans catalogue actif n'en reçoit aucune.
   */
  catalogFamilies?: ThemeCatalogFamily[];
  /**
   * Réglages du thème actif, tels que l'hébergeur les a saisis au panel — valeurs par défaut du
   * thème appliquées, booléens convertis (voir `themeSettingValues`).
   *
   * Présent dans l'enveloppe comme dans chaque vue : un thème a besoin de son libellé de bouton
   * dans son en-tête et de son titre de section dans sa page d'accueil. Objet vide si le thème
   * n'en déclare aucun.
   */
  settings: Record<string, ThemeSettingValue>;
  /** Vitrine publique ou espace client authentifié : un thème peut vouloir deux structures. */
  area: "marketing" | "account";
  /**
   * Le visiteur a-t-il une session client ? Toujours `true` dans l'espace client ; en vitrine,
   * `true` quand le portail a demandé l'enveloppe avec le jeton du visiteur, vérifié par l'API.
   *
   * De quoi choisir entre « Se connecter » et « Mon espace » dans un en-tête. **Affichage
   * seulement** : un gabarit ne protège rien, chaque page de l'espace client refait sa propre
   * vérification. Une session expirée entre deux requêtes peut montrer « Mon espace » une fois de
   * trop ; le clic mène alors à l'écran de connexion, jamais à des données.
   */
  authenticated: boolean;
  /**
   * Adresse de support saisie dans Paramètres › Identité, ou celle du revendeur sous sa marque.
   *
   * Absente tant que personne ne l'a saisie : un pied de page qui affiche une adresse inventée
   * enverrait les clients vers une boîte que personne ne lit. Un gabarit teste sa présence.
   */
  supportEmail?: string;
  /**
   * URL publique de la page de statut de l'instance (`apps/status-page`), si l'instance en
   * annonce une.
   *
   * Absente quand l'hébergeur n'en publie pas, et sous la marque d'un revendeur : cette page est
   * celle de l'hébergeur, et un lien vers elle défairait la marque blanche. Même règle que
   * `supportEmail` — un lien vers une page qui n'existe pas est pire que pas de lien.
   */
  statusPageUrl?: string;
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
  /**
   * Offre que l'hébergeur a cochée « mise en avant » dans le formulaire produit du panel.
   *
   * Un booléen et non un libellé : le badge (« Recommandé », « Populaire »…) appartient au thème,
   * qui le rédige dans ses propres textes. Le noyau ne dit que *quelle* offre, jamais *comment*
   * l'annoncer. Plusieurs offres peuvent l'être à la fois ; `false` pour toutes par défaut.
   */
  featured: boolean;
}

/** Section du catalogue : une catégorie et les offres qu'elle contient. */
export interface ThemeCategorySection {
  id: string | null;
  name: string;
  description?: string;
  /** Profondeur dans l'arbre des catégories, pour un gabarit qui voudrait indenter. */
  depth: number;
  products: ThemeProductView[];
  /**
   * Prix de l'offre la moins chère de la section, déjà mis en forme (« dès 2,39 € TTC »).
   *
   * Fourni par le noyau parce qu'un gabarit ne peut pas le calculer : `priceFormatted` est une
   * chaîne, et Liquid n'a ni comparaison numérique ni `Intl`. Trier les chaînes donne un résultat
   * faux dès que deux montants n'ont pas le même nombre de chiffres — « 11,88 » passe avant
   * « 2,39 ». Absent seulement si la section n'a aucune offre, ce qui n'arrive pas dans
   * `sections` (les sections vides en sont retirées).
   */
  fromPriceFormatted?: string;
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
 * Ne dérive pas du résumé : un article ouvert n'a pas d'extrait, il a son corps. Le corps existe
 * sous deux formes, et c'est `bodyHtml` qu'un gabarit affiche : `body` est le texte source tel que
 * saisi au panel, que le moteur échappe comme toute valeur — un gabarit ne peut pas le rendre en
 * HTML, `| raw` et les balises `echo` et `cycle` y passent aussi.
 */
export interface ThemeKbArticle {
  slug: string;
  title: string;
  /**
   * Le texte source de l'article, en Markdown limité (titres `##`, listes, citations, code, gras,
   * italique, liens, images). Échappé à la sortie : à réserver à ce qui n'a pas besoin de mise en
   * forme (une balise `<meta>`, un extrait). Les thèmes écrits avant 0.35.0, qui l'affichaient avec
   * `white-space: pre-wrap`, continuent de rendre le texte brut, balisage visible.
   */
  body: string;
  /**
   * Le corps rendu en HTML par le noyau (0.35.0), à placer tel quel : `{{ article.bodyHtml }}`, sans
   * `| raw`. C'est une des trois sorties du contexte que le moteur n'échappe pas, parce que le
   * noyau l'a construite : aucune balise n'y vient de la saisie (`<script>` écrit dans un article
   * reste du texte), tout texte et toute valeur d'attribut sont échappés, et seuls ces éléments
   * peuvent apparaître — `h2`, `h3`, `h4` (chacun avec un `id` préfixé `kb-`), `p`, `ul`, `ol`, `li`,
   * `blockquote` (qui contient un `p`), `pre` > `code` (`class="language-…"` si la langue est
   * connue), `hr`, `strong`, `em`, `code`, `br`, `a` (`rel="noopener noreferrer"` et
   * `target="_blank"` sur un lien externe) et `img` (une image téléversée au panel, `loading="lazy"`).
   * Le titre de l'article est le `h1` de la page : il n'y en a pas dans `bodyHtml`.
   *
   * Le noyau ne pose aucun style sur ces éléments : c'est au thème de mettre en forme sa prose. Un
   * filtre qui transforme la valeur (`| truncate`, `| upcase`) rend une chaîne ordinaire, échappée.
   */
  bodyHtml: string;
  /**
   * Description pour les moteurs de recherche et les aperçus de partage (0.35.0) : celle que le
   * rédacteur a saisie, sinon un extrait du corps (160 caractères au plus, sans balisage). Texte
   * brut, échappé à la sortie. Vide pour un article sans texte (une image seule) : en Liquid, une
   * chaîne vide est vraie, testez `{% if article.metaDescription != blank %}`.
   */
  metaDescription: string;
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
   * Réglages du thème actif. Voir `ThemeDefinition.settings` pour ce qu'un thème peut déclarer, et
   * `ThemeShellContext.settings`, qui porte les mêmes valeurs dans l'enveloppe.
   */
  settings: Record<string, ThemeSettingValue>;
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
/**
 * Accueil de la vitrine.
 *
 * Reçoit le catalogue et les engagements, et non le seul nom de l'entreprise : sans eux, un
 * gabarit d'accueil n'avait le choix qu'entre ne rien montrer et écrire des offres en dur — donc
 * publier le catalogue d'un autre hébergeur que celui qui installe le thème. Les deux clés du
 * catalogue sont exactement celles de `ThemeCatalogView`, pour qu'un gabarit écrit pour l'une se
 * relise sans effort dans l'autre.
 */
export interface ThemeHomeView extends ThemeViewContext {
  view: "home";
  sections: ThemeCategorySection[];
  bundles: ThemeBundleView[];
  /**
   * Ce que l'hébergeur s'engage à tenir, s'il l'a renseigné. Objet toujours présent, champs
   * toujours facultatifs : un gabarit teste `commitments.uptime`, jamais `commitments`.
   */
  commitments: ThemeServiceCommitments;
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
 * Mentions légales, politique de remboursement et politique de cookies partagent un seul contexte,
 * parce qu'elles ont un seul contenu : un texte publié, ou rien. `view` les distingue, ce qui
 * suffit à un gabarit qui voudrait les rendre différemment.
 *
 * La fiche d'identité de l'exploitant accompagne les trois plutôt que les seules mentions
 * légales : c'est le noyau qui décide de l'afficher ou non dans son rendu de repli, mais un thème
 * qui veut la rappeler en pied de page de sa politique de cookies n'a pas à être empêché.
 */
export interface ThemeLegalDocumentView extends ThemeViewContext {
  view: "legal-notice" | "legal-refund" | "legal-cookies";
  /** `null` tant que l'hébergeur n'a rien rédigé — le gabarit doit prévoir ce cas. */
  body: string | null;
  /** Identité de l'exploitant, déjà réduite aux lignes non vides. */
  identity: string[];
  contactEmail?: string;
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
  {
    name: "cookie-preferences",
    description:
      "Bouton rouvrant le choix de consentement aux traceurs. Utilisable dans l'enveloppe comme " +
      "dans une vue — sa place naturelle est le pied de page ou la politique de cookies.",
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
    name: "legal-notice",
    description: "Mentions légales : identité de l'exploitant du site.",
    area: "marketing",
    requiredIslands: [],
  },
  {
    name: "legal-refund",
    description: "Politique de remboursement.",
    area: "marketing",
    requiredIslands: [],
  },
  {
    name: "legal-cookies",
    description: "Politique de cookies : ce que le site dépose sur le terminal du visiteur.",
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
  //
  // La règle qui décide de la liste : **un îlot qui est le seul chemin vers une fonction est
  // obligatoire**. Un thème choisit où il apparaît, jamais s'il existe. Le portail ne rend pas
  // l'écran React quand un gabarit existe, donc un îlot oublié n'est pas « mal placé » : la
  // fonction disparaît pour tous les clients de l'instance, sans message ni lien de secours. La
  // sécurité du compte (double authentification, clés d'accès, comptes liés, phrase
  // anti-hameçonnage), la résiliation (qui doit rester aussi simple que la souscription, droit de
  // la consommation), le changement d'offre ou la suppression d'une zone n'ont pas d'autre
  // entrée que leur îlot. Avant la 0.34.0, ces quatre vues n'exigeaient qu'un îlot chacune, et un
  // thème par ailleurs complet pouvait retirer tout le reste sans que rien ne le signale.
  //
  // `service-console` reste hors de `service` : la console a sa propre vue, et la fiche n'y mène
  // que par un lien.
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
    requiredIslands: [
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
    ],
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
    requiredIslands: ["ticket-reply", "ticket-satisfaction"],
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
    requiredIslands: ["dns-records-editor", "dns-use-host-ns", "dns-delete-zone"],
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
    requiredIslands: [
      "account-change-password",
      "account-two-factor",
      "account-passkeys",
      "account-sso",
      "account-anti-phishing",
    ],
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
  /**
   * Corps mis en paragraphes HTML par le noyau, à partir du texte qu'il a lui-même échappé.
   *
   * `{{ bodyHtml }}` le rend tel quel, sans `| raw` : c'est la seule valeur de ce contexte que le
   * moteur n'échappe pas, parce que le noyau l'a construite. Un filtre qui la transforme
   * (`| upcase`, `| truncate`) rend une chaîne ordinaire, qui repasse par l'échappement.
   */
  bodyHtml: string;
  /** Corps tel quel, pour un thème qui composerait différemment. */
  bodyText: string;
  companyName: string;
  logoUrl?: string;
  colors: ThemeColors;
}

/**
 * Pages de la vitrine et de l'authentification que l'aperçu du panel sait ouvrir.
 *
 * Liste fermée, et partagée : le panel s'en sert pour peupler son sélecteur, `isThemePreviewPath`
 * pour valider le `previewPath` d'une section. Toutes servies sans session. Le portail ne la lit
 * plus pour ouvrir l'aperçu : il accepte tout chemin de sa propre origine, pour que le panel puisse
 * recharger la page où l'on a navigué dans le cadre.
 */
export const THEME_PREVIEW_PATHS = [
  "/",
  "/catalog",
  "/cart",
  "/domains",
  "/kb",
  "/legal/terms",
  "/legal/privacy",
  "/legal/notice",
  "/legal/refund",
  "/legal/cookies",
  "/login",
  "/register",
  "/forgot-password",
] as const;

export type ThemePreviewPath = (typeof THEME_PREVIEW_PATHS)[number];

/**
 * Pages statiques de l'espace client qu'un réglage peut désigner comme page d'aperçu.
 *
 * Séparées de `THEME_PREVIEW_PATHS` parce qu'elles ne s'ouvrent pas de la même façon : elles
 * exigent un client connecté, que l'aperçu n'a pas. Sans session, le portail les sert en page
 * d'exemple (données fictives, actions désactivées) ; avec une session client, ce sont les vraies
 * pages, habillées du brouillon. Ni pages de détail (`/services/[id]` : il faudrait un
 * identifiant), ni pages revendeur, ni `/m/*`.
 */
export const THEME_ACCOUNT_PREVIEW_PATHS = [
  "/dashboard",
  "/services",
  "/invoices",
  "/tickets",
  "/tickets/new",
  "/domains/mine",
  "/dns",
  "/history",
  "/account",
  "/account/profile",
  "/account/security",
  "/account/billing",
  "/account/payment-methods",
  "/account/privacy",
  "/account/referral",
  "/account/team",
  "/account/settings",
] as const;

/**
 * Un chemin que l'aperçu d'un thème peut viser : une page de la vitrine ou de l'authentification,
 * une page statique de l'espace client, ou `/<slug>` d'une page que le thème déclare lui-même.
 *
 * Pure et sans état : la liste des slugs vient de l'appelant (`ThemeDefinition.pages`), puisque
 * c'est le manifeste du thème, et lui seul, qui dit quelles pages il apporte. Comparaison exacte,
 * sans normalisation — un chemin d'aperçu s'écrit comme la liste l'écrit.
 */
export function isThemePreviewPath(path: string, themePageSlugs: readonly string[] = []): boolean {
  if ((THEME_PREVIEW_PATHS as readonly string[]).includes(path)) {
    return true;
  }
  if ((THEME_ACCOUNT_PREVIEW_PATHS as readonly string[]).includes(path)) {
    return true;
  }
  return themePageSlugs.some((slug) => SLUG_PATTERN.test(slug) && path === `/${slug}`);
}

/** Traductions d'un thème pour une langue : des clés plates, des valeurs texte. */
export type ThemeTranslations = Record<string, string>;

/**
 * Le thème actif, tel que le noyau le résout et que les frontends le reçoivent.
 *
 * Distinct de `ThemeDefinition`, qui décrit ce qu'un thème *déclare* : celui-ci décrit ce que le
 * noyau a *décidé* après avoir empilé ses défauts, le thème choisi, les réglages publiés de ce
 * thème et, le cas échéant, la marque d'un revendeur. Un frontend n'a donc aucun empilement à
 * refaire, ni même à savoir qu'il existe des thèmes.
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
  /**
   * Variables CSS que les réglages du thème posent (`ConfigField.cssVar`), à émettre avec les
   * tokens. Absent quand aucun réglage n'en lie — le cas de tout thème écrit avant `0.29.0`.
   */
  cssVars?: Record<string, string>;
  /**
   * Tokens à appliquer sous `prefers-color-scheme: dark`, ou absent. Absent couvre les deux cas
   * qui doivent se traiter pareil : le thème n'a pas de palette sombre, ou il en a une mais
   * l'hébergeur a fixé l'apparence en clair ou en sombre.
   */
  tokensDark?: ThemeTokens;
  /** Variables du thème pour le mode sombre — voir `ConfigField.scheme`. */
  cssVarsDark?: Record<string, string>;
  /**
   * Polices téléversées au panel, dont le portail émet les `@font-face` (`uploadedFontFaces`)
   * avant les tokens. Absent quand il n'y en a aucune. Toutes, pas seulement celles que les
   * réglages choisissent : un `@font-face` ne télécharge rien tant qu'aucun texte ne s'en sert, et
   * le CSS additionnel peut en nommer une.
   */
  uploadedFonts?: ThemeUploadedFont[];
}

/**
 * Valeurs de repli du noyau.
 *
 * Ce sont les tokens historiques de l'application, ceux qui étaient dans `tokens.css`. Ils vivent
 * ici et non dans une feuille de style parce que le thème actif se résout côté serveur, avant le
 * premier rendu : un défaut qui n'existerait qu'en CSS ne pourrait pas être fusionné.
 */
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  colorScheme: "light",
  colors: {
    primary: "#18181b",
    accent: "#0d7d74",
    bg: "#fbfaf8",
    surface: "#ffffff",
    text: "#1b1b19",
    muted: "#6b6a63",
    border: "#e6e4de",
    success: "#15803d",
    warning: "#b45309",
    danger: "#b91c1c",
  },
  radii: { sm: "0.375rem", md: "0.625rem", lg: "1rem" },
  typography: {
    fontFamily: '"Inter", system-ui, sans-serif',
    headingFamily: '"Inter", system-ui, sans-serif',
    monoFamily: 'ui-monospace, "SFMono-Regular", "Menlo", monospace',
    baseSize: "1rem",
    bodyWeight: "400",
    // 700 et non 600 : c'est la graisse que le navigateur donne à `h1`-`h3`, donc celle que toutes
    // les instances affichaient tant que rien ne lisait `--brand-weight-heading`. Brancher enfin la
    // variable sur les titres (`components.css`) ne devait changer l'apparence d'aucune d'entre
    // elles — seulement rendre effectif le choix d'un thème qui en déclare une autre.
    headingWeight: "700",
    lineHeight: "1.5",
    headingLineHeight: "1.2",
    letterSpacing: "0em",
    headingLetterSpacing: "-0.01em",
    headingScale: "1.25",
  },
  density: "comfortable",
  // `72rem` : la largeur que la vitrine écrivait en dur, et qu'elle lit désormais ici.
  layout: { containerMax: "72rem", accountNav: "sidebar" },
  elevation: "soft",
};

/**
 * Ce qu'une valeur de token ne peut pas contenir.
 *
 * Ces valeurs finissent interpolées dans une balise `<style>` rendue côté serveur. Sans contrôle,
 * une couleur valant `red</style><script>…` sort de la balise, et une valant `red; position:fixed`
 * ajoute des déclarations que personne n'a écrites.
 *
 * Rester dans la déclaration ne suffit pas : une couleur valant `url(https://…)` y reste, mais le
 * navigateur de chaque visiteur va chercher cette adresse dès que la variable sert de fond — une
 * requête vers un tiers, sans consentement, sur toutes les pages. D'où le refus des fonctions qui
 * acceptent une adresse (`url(`, `image(`, `image-set(` et donc `-webkit-image-set(`,
 * `cross-fade(`, `element(`, `src(`), d'`expression(`, reste d'Internet Explorer qui exécutait du
 * script, et de `@`, qui n'annonce que des règles (`@import`) et n'a sa place dans aucune valeur.
 * La recherche ignore la casse, comme le CSS lui-même : `URL(` charge la même chose que `url(`.
 * Un échappement (`u\72l(`) ne la contourne pas, puisque `\` est refusé ; un commentaire glissé
 * dans le nom non plus, puisqu'il coupe la fonction pour le navigateur aussi.
 *
 * On pourrait objecter que le modèle de confiance couvre déjà le cas : installer un thème équivaut
 * à installer un paquet npm. Mais la **même** fonction sert à deux sources qui ne sont pas le
 * thème : les réglages du thème saisis au panel, où un membre du staff autorisé à changer une
 * couleur n'est pas autorisé à injecter du script dans l'espace client, et la marque d'un
 * revendeur saisie au portail, où un client écrit dans les pages que verront ses propres clients.
 * Ce sont ces deux sources, bien moins fiables, qui justifient le contrôle — le thème n'en est que
 * le troisième utilisateur.
 */
// Les guillemets, virgules, espaces et parenthèses restent autorisés : une pile de polices s'écrit
// `"Space Grotesk", system-ui, sans-serif`, une teinte `color-mix(in srgb, #fff 20%, transparent)`.
const FORBIDDEN_IN_TOKEN =
  /[<>;{}\\@]|[\x00-\x1f\x7f]|(?:url|image|image-set|cross-fade|element|src|expression)\(/i;

/**
 * Types de champ qu'un thème ne peut pas déclarer dans `settings`.
 *
 * `password` : un thème n'exécute aucun code, il n'a donc rien à faire d'un secret — et en
 * réclamer un entraînerait un hébergeur à coller une clé d'API dans un champ que seuls des
 * gabarits liront. `provider` : il ne pilote aucun fournisseur, et le panel n'aurait aucune liste
 * à y mettre.
 */
const THEME_SETTING_FORBIDDEN_TYPES = new Set<ConfigFieldType>(["password", "provider"]);

/**
 * Défauts d'une déclaration `theme.settings`, en clair, pour `pnpm check-extension`.
 *
 * Rend un tableau vide quand tout va bien. Les noms en doublon sont refusés parce que la valeur
 * écrasée serait silencieusement perdue, et un `select` sans option parce que le panel afficherait
 * une liste vide — deux défauts qu'on ne voit qu'en ouvrant la page de configuration.
 *
 * `theme` apporte ce que les champs seuls ne disent pas : les pages que le thème déclare (un
 * `previewPath` peut viser `/<slug>` de l'une d'elles), ses sections (`settingGroups`) et la langue
 * de son manifeste. Omis, ces contrôles-là portent sur un thème sans page ni section.
 */
export function invalidThemeSettings(
  fields: readonly ConfigField[] | undefined,
  theme?: Pick<ThemeDefinition, "pages" | "settingGroups" | "settingsLocale">,
): string[] {
  const problems: string[] = [];
  const pageSlugs = (theme?.pages ?? []).map((page) => page.slug);
  problems.push(...invalidSettingGroups(theme?.settingGroups, pageSlugs));
  if (
    theme?.settingsLocale !== undefined &&
    !(SUPPORTED_LOCALES as readonly string[]).includes(theme.settingsLocale)
  ) {
    problems.push(
      `« settingsLocale » vaut « ${theme.settingsLocale} » : langue inconnue (${SUPPORTED_LOCALES.join(", ")})`,
    );
  }
  if (!fields) {
    return problems;
  }
  const seen = new Set<string>();
  for (const field of fields) {
    if (!field.name || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.name)) {
      problems.push(
        `réglage « ${field.name || "(sans nom)"} » : le nom doit être alphanumérique et commencer par une lettre, puisqu'un gabarit le lit en « settings.<nom> »`,
      );
      continue;
    }
    if (seen.has(field.name)) {
      problems.push(`réglage « ${field.name} » déclaré deux fois : la seconde valeur écraserait la première`);
    }
    seen.add(field.name);
    if (THEME_SETTING_FORBIDDEN_TYPES.has(field.type)) {
      problems.push(
        `réglage « ${field.name} » de type « ${field.type} » : un thème n'exécute aucun code, il n'a donc ni secret à garder ni fournisseur à piloter`,
      );
    }
    if (field.type === "select" && (field.options ?? []).length === 0) {
      problems.push(`réglage « ${field.name} » de type « select » sans option : la liste serait vide`);
    }
    if (
      field.maxLength !== undefined &&
      (!Number.isInteger(field.maxLength) || field.maxLength <= 0)
    ) {
      problems.push(
        `réglage « ${field.name} » : « maxLength » doit être un entier strictement positif`,
      );
    }
    if (
      (field.type === "url" || field.type === "image") &&
      field.defaultValue &&
      !isSafeSettingUrl(field.defaultValue)
    ) {
      problems.push(
        `réglage « ${field.name} » : la valeur par défaut doit être une adresse https:, http: ou un chemin commençant par « / »`,
      );
    }
    if (field.type === "color" && field.defaultValue && !isHexColor(field.defaultValue)) {
      problems.push(
        `réglage « ${field.name} » : la couleur par défaut doit être un hexadécimal (« #3f6350 »)`,
      );
    }
    if (field.type === "link" && field.defaultValue && !isSafeLinkValue(field.defaultValue)) {
      problems.push(
        `réglage « ${field.name} » : le lien par défaut doit être un chemin du site (« /catalog ») ou une adresse https:, http:, mailto: ou tel:`,
      );
    }
    problems.push(...invalidFormat(field, `réglage « ${field.name} »`));
    if (field.type === "order") {
      const known = (field.options ?? []).map((option) => option.value);
      if (known.length < 2) {
        problems.push(`réglage « ${field.name} » de type « order » : au moins deux options à ordonner`);
      }
      if (known.some((value) => !/^[a-zA-Z0-9_-]+$/.test(value))) {
        problems.push(
          `réglage « ${field.name} » de type « order » : une valeur d'option ne peut contenir que lettres, chiffres, « - » et « _ », puisqu'une virgule les sépare`,
        );
      }
      const listed = (field.defaultValue ?? "").split(",").filter((value) => value !== "");
      if (listed.some((value) => !known.includes(value))) {
        problems.push(`réglage « ${field.name} » : l'ordre par défaut cite une option qui n'existe pas`);
      }
    }
    for (const bound of ["min", "max", "step"] as const) {
      if (field[bound] !== undefined && (field.type !== "number" || !Number.isFinite(field[bound]))) {
        problems.push(`réglage « ${field.name} » : « ${bound} » est un nombre, réservé au type « number »`);
      }
    }
    if (field.min !== undefined && field.max !== undefined && field.min >= field.max) {
      problems.push(`réglage « ${field.name} » : « min » doit être inférieur à « max »`);
    }
    if (field.step !== undefined && field.step <= 0) {
      problems.push(`réglage « ${field.name} » : « step » doit être strictement positif`);
    }
    if (field.unit !== undefined) {
      if (field.type !== "number") {
        problems.push(`réglage « ${field.name} » : « unit » est réservé au type « number »`);
      } else if (!(CONFIG_FIELD_UNITS as readonly string[]).includes(field.unit)) {
        problems.push(
          `réglage « ${field.name} » : unité « ${field.unit} » inconnue (${CONFIG_FIELD_UNITS.join(", ")})`,
        );
      }
    }
    if ((field.type === "select" || field.type === "font") && field.defaultValue) {
      if (!(field.options ?? []).some((option) => option.value === field.defaultValue)) {
        problems.push(`réglage « ${field.name} » : la valeur par défaut n'est pas l'une des options`);
      }
    }
    // Une police finit toujours dans une feuille de style — par un token, ou par le gabarit qui la
    // recopie dans un `style` : ses options passent le même filtre qu'une valeur de token, liée ou
    // non. Les polices téléversées, elles, ne sont pas dans le manifeste : `isSafeThemeFont` les
    // filtre à l'envoi et à l'émission.
    if (field.type === "font" && (field.options ?? []).some((o) => !isSafeTokenValue(o.value))) {
      problems.push(
        `réglage « ${field.name} » de type « font » : une option contient un caractère interdit dans une feuille de style`,
      );
    }
    if (field.localized && field.type !== "text" && field.type !== "textarea") {
      problems.push(`réglage « ${field.name} » : « localized » n'a de sens que sur text ou textarea`);
    }
    if (field.type === "list") {
      problems.push(...invalidListField(field));
    } else if (field.fields !== undefined || field.maxItems !== undefined) {
      problems.push(`réglage « ${field.name} » : « fields » et « maxItems » sont réservés au type « list »`);
    }
    if (field.previewPath !== undefined && !isThemePreviewPath(field.previewPath, pageSlugs)) {
      problems.push(
        `réglage « ${field.name} » : « previewPath » « ${field.previewPath} » n'est pas une page que l'aperçu sait ouvrir (THEME_PREVIEW_PATHS, THEME_ACCOUNT_PREVIEW_PATHS ou /<slug> d'une page du thème)`,
      );
    }
    if (field.subgroup !== undefined && field.block !== undefined) {
      problems.push(
        `réglage « ${field.name} » : « subgroup » ou « block », pas les deux — un réglage rattaché à un bloc s'affiche dans ce bloc`,
      );
    }
    if (field.type === "order" && (field.subgroup !== undefined || field.block !== undefined)) {
      problems.push(
        `réglage « ${field.name} » de type « order » : ni « subgroup » ni « block » — c'est lui qui porte les blocs`,
      );
    }
    if (field.subgroup !== undefined && field.group === undefined) {
      problems.push(
        `réglage « ${field.name} » : « subgroup » sans « group » — un intertitre se range dans une section`,
      );
    }
    if (field.scheme !== undefined) {
      if (field.scheme !== "light" && field.scheme !== "dark") {
        problems.push(`réglage « ${field.name} » : « scheme » vaut « light » ou « dark »`);
      } else if (field.token === undefined && field.cssVar === undefined) {
        problems.push(
          `réglage « ${field.name} » : « scheme » ne veut rien dire sans « token » ni « cssVar » — c'est la palette qu'il choisit, pas le champ`,
        );
      }
    }
    if (field.token !== undefined) {
      problems.push(...invalidTokenBinding(field));
    }
    if (field.cssVar !== undefined) {
      if (!/^--[a-z][a-z0-9-]*$/.test(field.cssVar)) {
        problems.push(
          `réglage « ${field.name} » : « cssVar » doit s'écrire « --nom-en-minuscules »`,
        );
      } else if (RESERVED_CSS_VAR_PREFIXES.some((prefix) => field.cssVar?.startsWith(prefix))) {
        problems.push(
          `réglage « ${field.name} » : « ${field.cssVar} » appartient au noyau — liez le réglage à un token (« token ») ou préfixez la variable du nom du thème`,
        );
      }
      if (!CSS_BOUND_TYPES.has(field.type)) {
        problems.push(
          `réglage « ${field.name} » : « cssVar » n'est admis que sur les types color, number et select`,
        );
      }
      if (field.type === "select" && (field.options ?? []).some((o) => !isSafeTokenValue(o.value))) {
        problems.push(
          `réglage « ${field.name} » : une option liée à une variable CSS contient un caractère interdit dans une feuille de style`,
        );
      }
    }
  }
  // Second passage : les renvois d'un champ à un autre ne se jugent qu'une fois tous les noms vus.
  const byName = new Map(fields.map((field) => [field.name, field]));
  for (const field of fields) {
    problems.push(
      ...invalidConditions(`réglage « ${field.name} »`, field, field.name, byName),
    );
    if (field.block !== undefined) {
      // Le bloc se cherche dans la même section : c'est là que le panel rend l'`order` en blocs,
      // et un réglage rattaché à l'`order` d'une autre section s'afficherait loin de son bloc.
      const owner = fields.find(
        (candidate) =>
          candidate.type === "order" &&
          candidate.group === field.group &&
          (candidate.options ?? []).some((option) => option.value === field.block),
      );
      if (!owner) {
        problems.push(
          `réglage « ${field.name} » : « block » vaut « ${field.block} », qui n'est l'option d'aucun champ « order » de la même section`,
        );
      }
    }
    for (const option of field.options ?? []) {
      problems.push(
        ...invalidConditions(
          `réglage « ${field.name} », option « ${option.value} »`,
          option,
          field.name,
          byName,
        ),
      );
      for (const [target, value] of Object.entries(option.sets ?? {})) {
        const targetField = byName.get(target);
        if (!targetField || target === field.name) {
          problems.push(
            `réglage « ${field.name} », option « ${option.value} » : « sets » remplit « ${target} », qui n'est pas un autre réglage déclaré`,
          );
        } else if (targetField.type === "color" && !isHexColor(value)) {
          problems.push(
            `réglage « ${field.name} », option « ${option.value} » : « ${value} » n'est pas une couleur hexadécimale pour « ${target} »`,
          );
        }
      }
    }
  }
  problems.push(...conditionCycles(fields, byName));
  return problems;
}

/**
 * Défauts des conditions d'un champ ou d'une option : forme (celles que le lecteur de manifeste a
 * écartées, et celles qu'un thème écrit en TypeScript aurait forcées au-delà du type), renvoi vers
 * un réglage inconnu, renvoi vers soi-même. Les boucles plus longues se jugent sur l'ensemble,
 * dans `conditionCycles`.
 */
function invalidConditions(
  where: string,
  owner: Pick<ConfigField, "visibleWhen">,
  selfName: string,
  byName: ReadonlyMap<string, ConfigField>,
): string[] {
  const problems = discardedConditionsOf(owner).map(
    (reason) => `${where} : condition « visibleWhen » ignorée — ${reason}`,
  );
  for (const condition of configFieldConditions(owner.visibleWhen)) {
    const shape = conditionShapeProblem(condition);
    if (shape !== null) {
      problems.push(`${where} : condition « visibleWhen » ignorée — ${shape}`);
      continue;
    }
    if (condition.field === selfName) {
      problems.push(
        `${where} : « visibleWhen » renvoie à « ${condition.field} » lui-même — il ne s'afficherait jamais`,
      );
    } else if (!byName.has(condition.field)) {
      problems.push(
        `${where} : « visibleWhen » renvoie à « ${condition.field} », qui n'est pas un autre réglage déclaré`,
      );
    }
  }
  return problems;
}

/**
 * Boucles de conditions entre réglages (`a` visible si `b`, `b` visible si `a`), à toute profondeur.
 *
 * La visibilité est transitive (`isConfigFieldVisible`) : un membre de boucle ne peut jamais
 * s'afficher, et le panel les masque tous. Une boucle est signalée une fois, quel que soit le
 * membre par lequel le parcours y entre ; l'auto-référence l'est déjà par `invalidConditions`.
 */
function conditionCycles(
  fields: readonly ConfigField[],
  byName: ReadonlyMap<string, ConfigField>,
): string[] {
  const edges = (field: ConfigField): string[] =>
    configFieldConditions(field.visibleWhen)
      .filter((condition) => conditionShapeProblem(condition) === null)
      .map((condition) => condition.field)
      .filter((target) => target !== field.name && byName.has(target));

  const problems: string[] = [];
  const reported = new Set<string>();
  const done = new Set<string>();
  const path: string[] = [];
  const onPath = new Set<string>();

  const visit = (name: string): void => {
    if (done.has(name)) {
      return;
    }
    if (onPath.has(name)) {
      const cycle = path.slice(path.indexOf(name));
      const key = [...cycle].sort().join("\u0000");
      if (!reported.has(key)) {
        reported.add(key);
        problems.push(
          `réglages ${[...cycle, name].map((member) => `« ${member} »`).join(" → ")} : conditions « visibleWhen » en boucle — aucun ne s'afficherait`,
        );
      }
      return;
    }
    path.push(name);
    onPath.add(name);
    for (const target of edges(byName.get(name)!)) {
      visit(target);
    }
    path.pop();
    onPath.delete(name);
    done.add(name);
  };

  for (const field of fields) {
    if (byName.get(field.name) === field) {
      visit(field.name);
    }
  }
  return problems;
}

/**
 * Défauts des sections déclarées : nom en double (deux sections du rail se disputeraient les mêmes
 * réglages), `category` inconnue, `previewPath` que l'aperçu ne sait pas ouvrir.
 */
function invalidSettingGroups(
  groups: readonly ThemeSettingGroup[] | undefined,
  pageSlugs: readonly string[],
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  // Clé de texte → section qui l'a déjà rangée : une même entrée dans deux sections laisserait le
  // panel hésiter sur celle à ouvrir quand on clique la zone dans l'aperçu.
  const textOwners = new Map<string, string>();
  for (const group of groups ?? []) {
    const where = `section « ${group.name} »`;
    if (seen.has(group.name)) {
      problems.push(`${where} déclarée deux fois dans « settingGroups »`);
    }
    seen.add(group.name);
    if (group.category !== undefined && group.category !== "appearance" && group.category !== "content") {
      problems.push(`${where} : « category » vaut « appearance » ou « content »`);
    }
    if (group.previewPath !== undefined && !isThemePreviewPath(group.previewPath, pageSlugs)) {
      problems.push(
        `${where} : « previewPath » « ${group.previewPath} » n'est pas une page que l'aperçu sait ouvrir (THEME_PREVIEW_PATHS, THEME_ACCOUNT_PREVIEW_PATHS ou /<slug> d'une page du thème)`,
      );
    }
    for (const key of group.texts ?? []) {
      if (typeof key !== "string" || !THEME_TEXT_KEY_PATTERN.test(key)) {
        problems.push(
          `${where} : « texts » cite « ${String(key)} », qui n'est pas une clé de texte (une lettre, puis lettres, chiffres ou « _ », comme dans « t.<clé> »)`,
        );
        continue;
      }
      const owner = textOwners.get(key);
      if (owner !== undefined) {
        problems.push(
          owner === group.name
            ? `${where} : « texts » cite « ${key} » deux fois`
            : `${where} : « texts » cite « ${key} », déjà rangée dans la section « ${owner} » — une clé ne s'affiche que dans une section`,
        );
        continue;
      }
      textOwners.set(key, group.name);
    }
  }
  return problems;
}

/**
 * Forme d'une clé de texte du thème : celle que `t.<clé>` sait lire dans un gabarit. Les mêmes
 * règles que le nom d'un réglage, et pour la même raison — c'est un identifiant Liquid.
 */
export const THEME_TEXT_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** Longueur maximale d'un texte du thème saisi au panel, par langue. */
export const THEME_TEXT_MAX_LENGTH = 2000;

/**
 * Ce qu'un gabarit lit sous `t`, par lecture statique de sa source : les clés écrites `t.<clé>`,
 * et `indexed` quand il indexe `t` par une variable (`t[key]`).
 *
 * Une seule lecture pour les deux lecteurs qui en ont besoin : `pnpm check-extension`, qui réclame
 * chaque clé lue dans les traductions, et le panel, qui range chaque texte du thème sous les
 * gabarits qui l'affichent. Deux expressions finiraient par ne pas trouver les mêmes clés. Une clé
 * lue seulement par `t[variable]` ne se voit pas ici — le panel la range dans « Autres ».
 */
export function themeTranslationReads(source: string): { keys: string[]; indexed: boolean } {
  const keys = new Set<string>();
  for (const match of source.matchAll(/\bt\.([a-zA-Z][\w]*)/g)) {
    keys.add(match[1]!);
  }
  return { keys: [...keys], indexed: /\bt\[/.test(source) };
}

/**
 * Avis sur les réglages d'un thème : ce qui ne casse rien mais trahit presque toujours une erreur.
 * Rendus par `pnpm check-extension` comme des avis, jamais comme des erreurs.
 *
 * Aujourd'hui : une section déclarée dans `settingGroups` qu'aucun réglage ne nomme dans son
 * `group`. Elle apparaît vide dans le rail — souvent un nom de groupe retouché d'un seul côté.
 */
export function themeSettingWarnings(
  theme: Pick<ThemeDefinition, "settings" | "settingGroups">,
): string[] {
  const used = new Set((theme.settings ?? []).map((field) => field.group));
  // Une section qui ne range que des textes du thème (`texts`) n'est pas vide pour autant.
  return (theme.settingGroups ?? [])
    .filter((group) => !used.has(group.name) && (group.texts ?? []).length === 0)
    .map(
      (group) =>
        `section « ${group.name} » déclarée dans « settingGroups » mais qu'aucun réglage ne nomme dans son « group » et qui ne range aucun texte (« texts ») — elle restera vide au panel`,
    );
}

/**
 * Toutes les chaînes du manifeste que le panel traduit, dans l'ordre de première apparition et
 * sans doublon : libellés, aides, textes indicatifs, groupes, sous-groupes, libellés d'option,
 * sous-champs de liste, descriptions de section.
 *
 * C'est la liste des clés attendues dans `<locales>/panel/<langue>.json`, et ce que
 * `pnpm check-extension` confronte à chaque fichier. Les noms de section (`settingGroups[].name`)
 * sont déjà des `group` : ils ne sont comptés qu'une fois.
 */
export function themePanelStrings(
  theme: Pick<ThemeDefinition, "settings" | "settingGroups">,
): string[] {
  const found = new Set<string>();
  const add = (value: string | undefined): void => {
    if (value !== undefined && value.trim() !== "") {
      found.add(value);
    }
  };
  const walk = (fields: readonly ConfigField[]): void => {
    for (const field of fields) {
      add(field.label);
      add(field.help);
      add(field.placeholder);
      add(field.group);
      add(field.subgroup);
      for (const option of field.options ?? []) {
        add(option.label);
      }
      walk(field.fields ?? []);
    }
  };
  for (const group of theme.settingGroups ?? []) {
    add(group.name);
    add(group.description);
  }
  walk(theme.settings ?? []);
  return [...found];
}

const LIST_SUBFIELD_TYPES = new Set<ConfigFieldType>([
  "text",
  "textarea",
  "number",
  "boolean",
  "select",
  "url",
  "image",
  "color",
  "link",
]);

/**
 * `format` : une seule valeur connue, `markdown`, et seulement sur un `textarea` — un texte d'une
 * ligne n'a pas de paragraphe à mettre en forme, et un autre type n'est pas du texte.
 */
function invalidFormat(field: ConfigField, where: string): string[] {
  if (field.format === undefined) {
    return [];
  }
  if (field.format !== "markdown") {
    return [`${where} : « format » vaut « markdown », seule mise en forme connue`];
  }
  return field.type === "textarea"
    ? []
    : [`${where} : « format » est réservé au type « textarea »`];
}

function invalidListField(field: ConfigField): string[] {
  const problems: string[] = [];
  const subs = field.fields ?? [];
  if (subs.length === 0) {
    problems.push(`réglage « ${field.name} » de type « list » sans « fields » : rien à saisir par élément`);
  }
  if (field.maxItems !== undefined && (!Number.isInteger(field.maxItems) || field.maxItems <= 0)) {
    problems.push(`réglage « ${field.name} » : « maxItems » doit être un entier strictement positif`);
  }
  if (field.token !== undefined || field.cssVar !== undefined) {
    problems.push(`réglage « ${field.name} » : un « list » ne se lie ni à un token ni à une variable CSS`);
  }
  if (field.defaultValue !== undefined) {
    // Le contenu d'origine du thème, en JSON : un tableau d'objets dont les clés sont les
    // sous-champs. Écrit tel quel dans le manifeste, c'est la seule forme qu'un fichier JSON
    // permette — d'où le contrôle ici, plutôt qu'une confiance aveugle au rendu.
    let parsed: unknown;
    try {
      parsed = JSON.parse(field.defaultValue);
    } catch {
      parsed = undefined;
    }
    if (!Array.isArray(parsed)) {
      problems.push(
        `réglage « ${field.name} » : le contenu d'origine d'un « list » est un tableau JSON d'éléments (« [{"…": "…"}] »)`,
      );
    } else {
      if (field.maxItems !== undefined && parsed.length > field.maxItems) {
        problems.push(`réglage « ${field.name} » : le contenu d'origine dépasse « maxItems »`);
      }
      const known = new Set(subs.map((sub) => sub.name));
      for (const [index, entry] of parsed.entries()) {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          problems.push(`réglage « ${field.name} » : élément ${index + 1} du contenu d'origine — objet attendu`);
          continue;
        }
        for (const key of Object.keys(entry as Record<string, unknown>)) {
          if (!known.has(key)) {
            problems.push(
              `réglage « ${field.name} » : élément ${index + 1} du contenu d'origine — « ${key} » n'est pas un sous-champ déclaré`,
            );
          }
        }
      }
    }
  }
  const seen = new Set<string>();
  for (const sub of subs) {
    const where = `réglage « ${field.name} », sous-champ « ${sub.name || "(sans nom)"} »`;
    if (!sub.name || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(sub.name)) {
      problems.push(`${where} : nom alphanumérique commençant par une lettre attendu`);
      continue;
    }
    if (seen.has(sub.name)) {
      problems.push(`${where} déclaré deux fois`);
    }
    seen.add(sub.name);
    if (!LIST_SUBFIELD_TYPES.has(sub.type)) {
      problems.push(`${where} : type « ${sub.type} » impossible dans un élément de liste`);
    }
    if (sub.token !== undefined || sub.cssVar !== undefined) {
      problems.push(`${where} : ni « token » ni « cssVar » dans un élément de liste`);
    }
    // Un élément de liste se range dans son élément, pas dans une section ni un bloc.
    if (sub.subgroup !== undefined || sub.block !== undefined) {
      problems.push(`${where} : ni « subgroup » ni « block » dans un élément de liste`);
    }
    for (const reason of discardedConditionsOf(sub)) {
      problems.push(`${where} : condition « visibleWhen » ignorée — ${reason}`);
    }
    if (sub.type === "select" && (sub.options ?? []).length === 0) {
      problems.push(`${where} de type « select » sans option`);
    }
    if (sub.localized && sub.type !== "text" && sub.type !== "textarea") {
      problems.push(`${where} : « localized » n'a de sens que sur text ou textarea`);
    }
    if (sub.type === "color" && sub.defaultValue && !isHexColor(sub.defaultValue)) {
      problems.push(`${where} : couleur par défaut invalide`);
    }
    if ((sub.type === "url" || sub.type === "image") && sub.defaultValue && !isSafeSettingUrl(sub.defaultValue)) {
      problems.push(`${where} : adresse par défaut invalide`);
    }
    if (sub.type === "link" && sub.defaultValue && !isSafeLinkValue(sub.defaultValue)) {
      problems.push(`${where} : lien par défaut invalide`);
    }
    problems.push(...invalidFormat(sub, where));
  }
  return problems;
}

/**
 * Valeurs telles que le **panel** les édite, en chaînes : un `list` et un texte localisé y sont
 * du JSON (le tableau d'éléments, l'objet langue → texte), le reste est la chaîne stockée ou le
 * défaut. Distinct de `themeSettingValues`, qui rend ce qu'un gabarit lit dans *une* langue —
 * l'éditeur, lui, doit voir toutes les langues et tous les éléments.
 */
export function themeSettingEditable(
  fields: readonly ConfigField[] | undefined,
  stored: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields ?? []) {
    const raw = stored?.[field.name];
    if (field.type === "list") {
      const parsed = listSource(field, raw);
      const items = Array.isArray(parsed)
        ? parsed
            .filter((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry))
            .map((entry) => editableItem(field.fields ?? [], entry as Record<string, unknown>))
        : [];
      out[field.name] = JSON.stringify(items);
      continue;
    }
    out[field.name] = editableScalar(field, raw);
  }
  return out;
}

function editableItem(fields: readonly ConfigField[], entry: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(fields.map((sub) => [sub.name, editableScalar(sub, entry[sub.name])]));
}

function editableScalar(field: ConfigField, raw: unknown): string {
  if (field.localized && (field.type === "text" || field.type === "textarea")) {
    const table = localizedTable(raw);
    if (table !== null) {
      return JSON.stringify(table);
    }
    // Chaîne nue (stockée avant la localisation) : elle vaut pour toutes les langues, l'éditeur
    // la montre dans chacune.
    return typeof raw === "string" && raw.trim() !== "" ? JSON.stringify({ "*": raw.trim() }) : "";
  }
  if (field.type === "font" && typeof raw === "string" && raw.trim() !== "") {
    // Tel que stocké : une police téléversée n'est pas dans les `options`, et la résolution sans la
    // liste des familles la ramènerait au défaut — l'éditeur montrerait alors un autre choix que
    // celui enregistré. Le rendu, lui, refiltre avec la liste.
    return raw.trim();
  }
  const resolved = themeSettingValues([field], raw === undefined ? null : { [field.name]: raw });
  const value = resolved[field.name];
  return value === undefined ? "" : String(value);
}

/**
 * Préfixes des variables que `themeToCss` émet lui-même : un `cssVar` ne peut pas les porter.
 *
 * `--shadow-` et `--layout-` depuis qu'elles sont des tokens : avant, un thème pouvait poser
 * `--shadow-md` en `cssVar`, et c'était même le seul moyen de toucher aux ombres. Laissé libre, ce
 * nom serait désormais écrasé en silence par la déclaration du noyau, écrite après.
 */
const RESERVED_CSS_VAR_PREFIXES = [
  "--brand-",
  "--radius-",
  "--space-",
  "--font-size-",
  "--shadow-",
  "--layout-",
];

const CSS_BOUND_TYPES = new Set<ConfigFieldType>(["color", "number", "select"]);

/** `#rgb` ou `#rrggbb`. Pas d'alpha : `readableTextOn` ne saurait pas quoi mesurer derrière. */
export function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

/**
 * Tokens qu'un réglage peut remplacer, et les types de champ qui y ont droit.
 *
 * Table fermée plutôt que chemin libre : `colors.primaire` doit échouer à `check-extension`, pas
 * produire un thème dont un réglage ne fait rien.
 */
const BINDABLE_TOKENS: Record<string, readonly ConfigFieldType[]> = {
  colorScheme: ["select"],
  density: ["select"],
  elevation: ["select"],
  ...Object.fromEntries(
    [
      "primary",
      "accent",
      "bg",
      "surface",
      "text",
      "muted",
      "border",
      "success",
      "warning",
      "danger",
      "link",
      "focus",
    ].map((name) => [`colors.${name}`, ["color"] as const]),
  ),
  "radii.sm": ["number", "select"],
  "radii.md": ["number", "select"],
  "radii.lg": ["number", "select"],
  "radii.button": ["number", "select"],
  // `font` : les deux familles que le panel propose au choix, polices téléversées comprises. La
  // chasse fixe reste un `select` — on ne téléverse pas une police de code pour une vitrine.
  "typography.fontFamily": ["select", "font"],
  "typography.headingFamily": ["select", "font"],
  "typography.monoFamily": ["select"],
  "typography.baseSize": ["number", "select"],
  "typography.bodyWeight": ["select"],
  "typography.headingWeight": ["select"],
  "typography.lineHeight": ["number", "select"],
  "typography.headingLineHeight": ["number", "select"],
  "typography.letterSpacing": ["number", "select"],
  "typography.headingLetterSpacing": ["number", "select"],
  "typography.headingScale": ["number", "select"],
  "layout.containerMax": ["number", "select"],
  "layout.accountNav": ["select"],
};

/**
 * Tokens sans unité : un `number` qui s'y lie n'en déclare pas, et ne doit pas en déclarer.
 *
 * `1.5` et `1.5px` sont deux hauteurs de ligne différentes — la première suit la taille de chaque
 * élément, la seconde fige celle du parent — et `1.25rem` ne multiplie rien : l'échelle des titres
 * en sortirait invalide, donc absente.
 */
const UNITLESS_TOKENS: ReadonlySet<string> = new Set([
  "typography.lineHeight",
  "typography.headingLineHeight",
  "typography.headingScale",
]);

/**
 * Valeurs admises des tokens à liste fermée. Exportée pour le chargeur du manifeste
 * (`loader/manifest.ts`), qui en dérive ses contrôles plutôt que d'en tenir une copie — deux listes
 * écrites à la main finissent toujours par diverger, et c'est un thème refusé d'un côté et accepté
 * de l'autre. Hors de l'index : ce n'est pas une surface publique.
 */
export const ENUM_TOKENS: Readonly<Record<string, readonly string[]>> = {
  colorScheme: members<ThemeColorScheme>({ light: true, dark: true, auto: true }),
  density: members<ThemeDensity>({ compact: true, comfortable: true, spacious: true }),
  elevation: members<ThemeElevation>({ flat: true, soft: true, raised: true }),
  "layout.accountNav": members<ThemeAccountNav>({ sidebar: true, top: true }),
};

/**
 * Les valeurs d'un type à liste fermée, tirées d'un objet dont les clés **sont** ce type : un membre
 * ajouté au type sans l'être ici — ou l'inverse — ne compile pas. Sans cette garde, `ENUM_TOKENS`
 * serait un miroir de plus des unions du contrat, tenu à la main.
 */
function members<T extends string>(set: Record<T, true>): readonly T[] {
  return Object.keys(set) as T[];
}

/**
 * Chemins de `theme.tokens` qu'un thème déclare en vain : clé inconnue de cette version du noyau.
 *
 * Le chargeur les accepte — refuser un token que cette version ne connaît pas empêcherait un thème
 * d'être compatible avec deux versions du noyau à la fois —, mais `check-extension` les signale :
 * `colors.primaire` ou `typography.lineheight` ne produisent aucune erreur et aucun effet, et c'est
 * précisément la faute de frappe qu'on ne trouve qu'en comparant deux captures. Les chemins connus
 * sont ceux de `BINDABLE_TOKENS`, où tout token est liable : une seule table, pas deux à tenir.
 * Hors de l'index, comme `ENUM_TOKENS`.
 */
export function unknownThemeTokenPaths(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [];
  }
  const known = Object.keys(BINDABLE_TOKENS);
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (BINDABLE_TOKENS[key] !== undefined) {
      continue;
    }
    const isGroup = known.some((path) => path.startsWith(`${key}.`));
    if (!isGroup || typeof value !== "object" || value === null || Array.isArray(value)) {
      unknown.push(key);
      continue;
    }
    for (const name of Object.keys(value as Record<string, unknown>)) {
      if (BINDABLE_TOKENS[`${key}.${name}`] === undefined) {
        unknown.push(`${key}.${name}`);
      }
    }
  }
  return unknown;
}

function invalidTokenBinding(field: ConfigField): string[] {
  const token = field.token ?? "";
  const allowed = BINDABLE_TOKENS[token];
  if (!allowed) {
    return [`réglage « ${field.name} » : token « ${token} » inconnu (${Object.keys(BINDABLE_TOKENS).join(", ")})`];
  }
  const problems: string[] = [];
  if (!allowed.includes(field.type)) {
    problems.push(
      `réglage « ${field.name} » : le token « ${token} » attend un champ de type ${allowed.join(" ou ")}`,
    );
  }
  if (field.type === "number" && UNITLESS_TOKENS.has(token)) {
    if (field.unit) {
      problems.push(`réglage « ${field.name} » : « ${token} » est sans unité — retirez « unit »`);
    }
  } else if (field.type === "number" && !field.unit) {
    problems.push(`réglage « ${field.name} » : un nombre lié à « ${token} » doit déclarer son unité (« unit »)`);
  }
  const values = (field.options ?? []).map((option) => option.value);
  const closed = ENUM_TOKENS[token];
  if (closed && values.some((value) => !closed.includes(value))) {
    problems.push(`réglage « ${field.name} » : « ${token} » n'accepte que ${closed.join(", ")}`);
  }
  if (values.some((value) => !isSafeTokenValue(value))) {
    problems.push(
      `réglage « ${field.name} » : une option liée à « ${token} » contient un caractère interdit dans une feuille de style`,
    );
  }
  if (field.cssVar !== undefined) {
    problems.push(`réglage « ${field.name} » : « token » ou « cssVar », pas les deux`);
  }
  return problems;
}

/**
 * Ce que les réglages d'un thème changent à sa feuille de style : des tokens remplacés, et des
 * variables CSS propres au thème.
 *
 * `values` sort de `themeSettingValues` — défauts déjà appliqués, booléens déjà convertis. Une
 * valeur qui ne passerait pas dans une feuille de style est écartée ici une seconde fois, pour la
 * même raison que partout ailleurs : une donnée en base peut précéder la règle qui l'aurait
 * refusée.
 */
export function themeSettingStyle(
  fields: readonly ConfigField[] | undefined,
  values: Record<string, ThemeSettingValue>,
  /** `"dark"` ne retient que les réglages marqués `scheme: "dark"`, et inversement. */
  scheme: "light" | "dark" = "light",
  /** Familles des polices téléversées, pour un réglage `font` (voir `ThemeSettingResolveOptions`). */
  uploadedFontFamilies: readonly string[] = [],
): { tokens: PartialThemeTokens; cssVars: Record<string, string> } {
  const tokens: Record<string, unknown> = {};
  const cssVars: Record<string, string> = {};
  for (const field of fields ?? []) {
    if (field.token === undefined && field.cssVar === undefined) {
      continue;
    }
    if ((field.scheme ?? "light") !== scheme) {
      continue;
    }
    const raw = values[field.name];
    if (raw === undefined || typeof raw === "boolean" || Array.isArray(raw)) {
      continue;
    }
    const plain = typeof raw === "number" ? `${raw}${field.unit ?? ""}` : raw;
    // Une police se refiltre ici, liste en main : un nom téléversé devient une pile avec repli, et
    // un nom que ni le thème ni le panel ne connaissent n'atteint pas la feuille.
    const value = field.type === "font" ? (fontChoice(field, plain, uploadedFontFamilies) ?? "") : plain;
    if (value === "" || !isSafeTokenValue(value) || (field.type === "color" && !isHexColor(value))) {
      continue;
    }
    if (field.cssVar !== undefined) {
      if (
        /^--[a-z][a-z0-9-]*$/.test(field.cssVar) &&
        !RESERVED_CSS_VAR_PREFIXES.some((prefix) => field.cssVar?.startsWith(prefix))
      ) {
        cssVars[field.cssVar] = value;
      }
      continue;
    }
    const token = field.token ?? "";
    if (!BINDABLE_TOKENS[token]?.includes(field.type)) {
      continue;
    }
    const closed = ENUM_TOKENS[token];
    if (closed && !closed.includes(value)) {
      continue;
    }
    const [group, key] = token.split(".");
    if (key === undefined) {
      tokens[token] = value;
    } else {
      tokens[group as string] = { ...(tokens[group as string] as object | undefined), [key]: value };
    }
  }
  return { tokens: tokens as PartialThemeTokens, cssVars };
}

/**
 * Une adresse saisie dans un réglage peut-elle finir dans un `href` ou un `src` ?
 *
 * Liquid échappe le HTML, pas le protocole : `{{ settings.ctaHref }}` dans un `href` exécute un
 * `javascript:` aussi bien échappé que brut. On n'accepte donc que `https:`, `http:` et un chemin
 * du site (`/catalog`), et on refuse `//hote`, qui sort du site sous l'apparence d'un chemin.
 *
 * Refuser `//` en tête ne suffit pas : le navigateur retire tabulations et sauts de ligne d'une
 * adresse avant de l'analyser, et lit `\` comme `/`. `/<tabulation>/hote` et `/<saut>/hote`
 * passaient donc pour des chemins, où le navigateur lisait `//hote`. Un chemin ne contient ainsi
 * ni blanc, ni caractère de contrôle, ni barre oblique inverse, **nulle part** et pas seulement en
 * tête ; une adresse absolue, ni blanc ni caractère de contrôle.
 */
export function isSafeSettingUrl(value: string): boolean {
  const url = value.trim();
  if (url.startsWith("/")) {
    return !/[\s\x00-\x1f\x7f\\]/.test(url) && !url.startsWith("//");
  }
  return /^https?:\/\/[^\s\x00-\x1f\x7f]+$/i.test(url);
}

/**
 * Valeurs des réglages telles qu'un gabarit les reçoit.
 *
 * Trois règles, et chacune corrige un piège :
 *
 * 1. **La déclaration en cours fait loi.** Un réglage stocké que le thème ne déclare plus
 *    disparaît, au lieu de traîner dans le contexte d'un gabarit qui ne l'attend plus.
 * 2. **Un champ vide prend son défaut.** Sans quoi un hébergeur qui efface un titre obtient un
 *    trou dans sa page, alors qu'il voulait revenir au texte d'origine.
 * 3. **Les booléens sont de vrais booléens.** Un formulaire HTML envoie `"false"`, qui est *vrai*
 *    en Liquid comme en JavaScript : sans conversion, décocher une case allumerait la section.
 */
export function themeSettingValues(
  fields: readonly ConfigField[] | undefined,
  stored: Record<string, unknown> | null | undefined,
  options: ThemeSettingResolveOptions = {},
): Record<string, ThemeSettingValue> {
  const values: Record<string, ThemeSettingValue> = {};
  for (const field of fields ?? []) {
    if (field.type === "list") {
      values[field.name] = listItems(field, stored?.[field.name], options);
      continue;
    }
    const scalar = scalarValue(field, stored?.[field.name], options);
    if (scalar !== undefined) {
      values[field.name] = scalar;
    }
  }
  return values;
}

export interface ThemeSettingResolveOptions {
  /** Langue de la page rendue, pour les champs `localized`. */
  locale?: string | null;
  /** Langue par défaut de l'instance : repli d'un champ `localized` non traduit. */
  fallbackLocale?: string | null;
  /**
   * Familles des polices téléversées au panel : une valeur `font` est admise si elle est l'une des
   * `options` du thème **ou** l'une de celles-ci. Passées par l'appelant, qui seul lit la base ;
   * absentes, seules les options du thème sont admises.
   */
  uploadedFontFamilies?: readonly string[];
}

/**
 * Éléments d'un `list`, chacun résolu comme un petit formulaire : mêmes règles que les champs de
 * premier niveau, sans-quoi un sous-champ `image` laisserait passer ce que le champ refuse.
 */
function listItems(
  field: ConfigField,
  raw: unknown,
  options: ThemeSettingResolveOptions,
): ThemeSettingItem[] {
  const parsed = listSource(field, raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  const items: ThemeSettingItem[] = [];
  for (const entry of parsed.slice(0, field.maxItems ?? MAX_LIST_ITEMS)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const item: ThemeSettingItem = {};
    for (const sub of field.fields ?? []) {
      const value = scalarValue(sub, (entry as Record<string, unknown>)[sub.name], options);
      if (value !== undefined) {
        item[sub.name] = value;
      }
    }
    items.push(item);
  }
  return items;
}

/**
 * Ce qu'une liste doit rendre : les éléments stockés, ou le contenu d'origine du thème quand rien
 * ne l'est.
 *
 * Le pivot est la distinction entre **rien** et **vide**. Une liste effacée par l'hébergeur vaut
 * `[]` en base : elle doit rester vide, sans quoi la section qu'il vient de retirer reparaîtrait
 * à chaque rendu. Une liste jamais touchée n'a aucune valeur en base : elle prend le contenu que
 * le thème livre, comme n'importe quel autre champ prend son `defaultValue` — c'est ce qui permet
 * à un thème de livrer ses quatre étapes et de les laisser modifier, au lieu d'afficher un trou
 * sur une instance neuve.
 */
function listSource(field: ConfigField, raw: unknown): unknown {
  const parsed = parseJson(raw);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  return parseJson(field.defaultValue);
}

/** Plafond d'un `list` sans `maxItems` : de quoi lister des avis, pas un catalogue. */
export const MAX_LIST_ITEMS = 50;

function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Texte d'un champ `localized` pour une langue : la langue de la page, sinon celle de l'instance,
 * sinon la première renseignée. Un texte stocké avant que le champ soit localisé (une chaîne nue)
 * vaut pour toutes les langues.
 */
function localizedText(raw: unknown, options: ThemeSettingResolveOptions): string {
  const table = localizedTable(raw);
  if (table === null) {
    return typeof raw === "string" ? raw.trim() : "";
  }
  const pick = (locale: string | null | undefined) =>
    locale && typeof table[locale] === "string" ? (table[locale] as string).trim() : "";
  return (
    pick(options.locale) ||
    pick(options.fallbackLocale) ||
    Object.values(table)
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .find((value) => value !== "") ||
    ""
  );
}

/** L'objet langue → texte d'un champ localisé, ou `null` si la valeur est une chaîne nue. */
function localizedTable(raw: unknown): Record<string, unknown> | null {
  const parsed = parseJson(raw);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function scalarValue(
  field: ConfigField,
  raw: unknown,
  options: ThemeSettingResolveOptions,
): ThemeSettingScalar | undefined {
  {
    const asText =
      field.localized && (field.type === "text" || field.type === "textarea")
        ? localizedText(raw, options)
        : typeof raw === "string"
          ? raw.trim()
          : raw;
    const provided = asText !== undefined && asText !== null && asText !== "";

    if (field.type === "boolean") {
      return provided
        ? asText === true || asText === "true" || asText === "1" || asText === "on"
        : field.defaultValue === "true";
    }
    if (field.type === "number") {
      const source = provided ? asText : field.defaultValue;
      const parsed = typeof source === "number" ? source : Number.parseFloat(String(source ?? ""));
      if (Number.isFinite(parsed)) {
        return Math.min(field.max ?? parsed, Math.max(field.min ?? parsed, parsed));
      }
      return undefined;
    }
    if (field.type === "order") {
      return orderedValues(field, provided ? String(asText) : "");
    }
    const text = provided ? String(asText) : (field.defaultValue ?? "");
    if (field.type === "color" && text !== "" && !isHexColor(text)) {
      return undefined;
    }
    if (field.type === "font" && text !== "" && fontChoice(field, text, options.uploadedFontFamilies) === null) {
      // Une police téléversée supprimée depuis, ou une option retirée du thème : le défaut, comme
      // pour un `select`, plutôt qu'un nom que plus aucun `@font-face` ne déclare.
      return field.defaultValue || undefined;
    }
    if (field.type === "select" && text !== "" && !(field.options ?? []).some((o) => o.value === text)) {
      // Une option retirée par une mise à jour du thème : le défaut, plutôt qu'une valeur que le
      // gabarit ne sait plus traiter — et qui, liée à une variable CSS, finirait dans la feuille.
      return field.defaultValue || undefined;
    }
    // Filtré ici aussi, pas seulement à l'enregistrement : une valeur déjà en base avant que la
    // règle existe ne doit pas atteindre un gabarit.
    if ((field.type === "url" || field.type === "image") && text !== "" && !isSafeSettingUrl(text)) {
      return undefined;
    }
    if (field.type === "link" && text !== "" && !isSafeLinkValue(text)) {
      // Un lien refusé retombe sur celui du thème plutôt que de disparaître : un bouton sans
      // destination est pire qu'un bouton qui mène là où le thème l'avait prévu.
      return field.defaultValue && isSafeLinkValue(field.defaultValue) ? field.defaultValue : undefined;
    }
    return text !== "" ? text : undefined;
  }
}

/**
 * Ordre complet d'un champ `order` : ce qui est stocké d'abord, puis le défaut, puis la
 * déclaration — sans doublon ni élément inconnu.
 *
 * Toujours **complet**, et c'est le point : un thème mis à jour avec un bloc de plus doit le
 * montrer à la suite, pas le perdre parce que l'ordre enregistré date d'avant lui.
 */
function orderedValues(field: ConfigField, stored: string): string {
  const known = (field.options ?? []).map((option) => option.value);
  const result: string[] = [];
  for (const value of [...stored.split(","), ...(field.defaultValue ?? "").split(","), ...known]) {
    const trimmed = value.trim();
    if (known.includes(trimmed) && !result.includes(trimmed)) {
      result.push(trimmed);
    }
  }
  return result.join(",");
}

/**
 * Une valeur de token est-elle sûre à interpoler dans une feuille de style ? Refuse, sans égard à
 * la casse, ce qui sortirait de la déclaration ou de la balise `<style>`, `@`, et les fonctions qui
 * font charger une adresse au navigateur (`url(`, `image(`, `image-set(`, `cross-fade(`,
 * `element(`, `src(`) ou exécutaient du script (`expression(`).
 */
export function isSafeTokenValue(value: string): boolean {
  return !FORBIDDEN_IN_TOKEN.test(value);
}

/** Lettres, chiffres, espace, `_` et `-` : de quoi nommer une police, rien pour sortir du `<style>`. */
const FONT_FAMILY = /^[A-Za-z0-9 _-]{1,64}$/;
const FONT_STYLES: readonly string[] = ["normal", "italic"];
const FONT_DISPLAYS: readonly string[] = ["auto", "block", "swap", "fallback", "optional"];

/** Une graisse (`400`, `bold`), ou deux pour une police variable (`100 900`), de 1 à 1000. */
function isFontWeight(weight: string): boolean {
  const parts = weight.trim().split(/\s+/);
  return (
    parts.length <= 2 &&
    parts.every(
      (part) =>
        part === "normal" ||
        part === "bold" ||
        (/^\d{1,4}$/.test(part) && Number(part) >= 1 && Number(part) <= 1000),
    )
  );
}

/**
 * Le noyau émettra-t-il le `@font-face` de cette police ?
 *
 * Chaque valeur d'une police livrée (`src`) est interpolée dans un `<style>` posé tel quel dans la
 * page : une famille valant `x</style><script>…` fermerait la balise pour tout le portail. D'où une
 * liste blanche, appliquée au point d'émission (`themeFontFaces`, plus bas) quelle que soit la
 * source de la police : famille faite de lettres ASCII, chiffres, espaces, `_` et `-` (64
 * caractères au plus, guillemets de bord ignorés), graisse `normal`, `bold` ou de 1 à 1000 (deux
 * valeurs pour une police variable), style `normal` ou `italic`, `display` parmi les cinq du CSS.
 * Une police refusée est omise en entier et le texte retombe sur la suite de la pile de polices ;
 * `check-extension` le signale à l'auteur, par ce même prédicat, pour que la liste ne vive qu'ici.
 */
export function isSafeThemeFont(
  font: Pick<ThemeFont, "family" | "weight" | "style" | "display">,
): boolean {
  const family = font.family.replace(/["']/g, "").trim();
  return (
    FONT_FAMILY.test(family) &&
    FONT_DISPLAYS.includes(font.display ?? "swap") &&
    (!font.weight || isFontWeight(font.weight)) &&
    (!font.style || FONT_STYLES.includes(font.style))
  );
}

/**
 * Les `@font-face` des polices que le thème livre lui-même.
 *
 * Les polices déclarées par `href` n'apparaissent pas ici : ce sont des feuilles externes, servies
 * par une balise `<link>` (voir `themeFontHrefs`). Les deux existent parce que les deux cas se
 * rencontrent — un thème qui embarque ses fichiers reste utilisable hors ligne, un thème qui
 * pointe une fonderie se met à jour tout seul.
 */
export function themeFontFaces(theme: Pick<ResolvedTheme, "fonts" | "assetBaseUrl">): string {
  return theme.fonts
    .filter((font) => font.src)
    .map((font) => fontFace(font, theme.assetBaseUrl))
    .filter((face): face is string => face !== null)
    .join("\n");
}

/**
 * Le `@font-face` d'une police, ou `null` dès qu'une de ses valeurs n'a pas la forme attendue.
 *
 * Chaque valeur interpolée est refiltrée ici, au point d'émission, et pas seulement à la lecture
 * du manifeste : ce bloc part dans un `<style>` posé par `dangerouslySetInnerHTML`, où une famille
 * valant `x</style><script>…` fermerait la balise pour tout le portail. Une liste blanche à cet
 * endroit tient quelle que soit la source de la police. Une police refusée est omise en entier
 * plutôt qu'émise en partie : le texte retombe sur la suite de la pile de polices, ce qui se voit et
 * se corrige, là où une déclaration à moitié juste passerait inaperçue.
 *
 * La liste blanche est `isSafeThemeFont`, que `check-extension` lit aussi pour avertir l'auteur
 * d'une police que ce filtre écartera sans bruit en production.
 */
function fontFace(font: ThemeFont, assetBaseUrl: string): string | null {
  if (!isSafeThemeFont(font)) {
    return null;
  }
  const family = font.family.replace(/["']/g, "").trim();
  const display = font.display ?? "swap";
  let url: string;
  try {
    url = encodeURI(`${assetBaseUrl}/${String(font.src).replace(/^\/+/, "")}`);
  } catch {
    // `encodeURI` lève sur une chaîne mal formée (demi-paire de substitution) : mieux vaut perdre
    // cette police que le rendu de la page entière.
    return null;
  }
  const parts = [`font-family: "${family}";`, `src: url("${url}");`, `font-display: ${display};`];
  if (font.weight) {
    parts.push(`font-weight: ${font.weight.trim()};`);
  }
  if (font.style) {
    parts.push(`font-style: ${font.style};`);
  }
  return `@font-face { ${parts.join(" ")} }`;
}

/**
 * Pile de repli d'une police téléversée : le nom seul laisserait le navigateur retomber sur sa
 * police par défaut (souvent à empattements) le temps du chargement, ou pour toujours si le
 * fichier disparaît.
 */
const UPLOADED_FONT_FALLBACK = "system-ui, sans-serif";

/**
 * Ce qu'une valeur `font` donne à la feuille de style : l'option du thème telle quelle, la pile
 * d'une police téléversée, ou `null` si ni l'une ni l'autre ne la connaît.
 *
 * Une option l'emporte sur une police téléversée du même nom : c'est le thème qui a écrit la pile,
 * avec ses propres replis.
 */
function fontChoice(
  field: ConfigField,
  value: string,
  uploadedFontFamilies: readonly string[] | undefined,
): string | null {
  if ((field.options ?? []).some((option) => option.value === value)) {
    return value;
  }
  if ((uploadedFontFamilies ?? []).includes(value) && isSafeUploadedFontFamily(value)) {
    return `"${value}", ${UPLOADED_FONT_FALLBACK}`;
  }
  return null;
}

/**
 * Une valeur `font` est-elle admise : l'une des `options` du réglage, ou la famille d'une police
 * téléversée ? Le contrôle des validateurs (enregistrement d'un brouillon), qui reçoivent la liste
 * des familles de l'appelant — le SDK ne lit aucune base.
 */
export function isAllowedFontValue(
  field: Pick<ConfigField, "options">,
  value: string,
  uploadedFontFamilies: readonly string[] = [],
): boolean {
  return fontChoice(field as ConfigField, value, uploadedFontFamilies) !== null;
}

/**
 * Une police téléversée au panel : sa famille et l'adresse publique de son fichier WOFF2
 * (`/api/v1/theme-media/<id>.woff2`).
 */
export interface ThemeUploadedFont {
  family: string;
  url: string;
}

/** Adresse d'une police téléversée, telle que le noyau la produit — et rien d'autre. */
const UPLOADED_FONT_URL = /^\/api\/v1\/theme-media\/[0-9a-f-]{36}\.woff2$/;

/**
 * Le nom d'une police téléversée est-il admis ? La liste blanche de `isSafeThemeFont`, **sans**
 * sa tolérance aux guillemets de bord ni aux blancs autour : ce nom est saisi au panel, stocké tel
 * quel, puis comparé à la lettre aux valeurs des réglages — `"Ma Police"` et `Ma Police` seraient
 * deux polices.
 */
export function isSafeUploadedFontFamily(family: string): boolean {
  return family === family.trim() && isSafeThemeFont({ family }) && !/["']/.test(family);
}

/**
 * Les `@font-face` des polices téléversées au panel, à placer avec ceux du thème, **avant** les
 * tokens (qui les nomment).
 *
 * Fonction distincte de `themeFontFaces` parce que la source diffère : la famille vient d'un
 * champ saisi au panel et l'adresse est absolue (pas sous `assetBaseUrl`). Chaque valeur est
 * refiltrée ici, au point d'émission, quelle que soit la validation faite à l'envoi : ce bloc part
 * dans un `<style>` posé par `dangerouslySetInnerHTML`, où une famille valant `x</style><script>`
 * fermerait la balise pour tout le portail. Une police refusée est omise en entier.
 */
export function uploadedFontFaces(fonts: readonly ThemeUploadedFont[] | undefined): string {
  return (fonts ?? [])
    .filter((font) => isSafeUploadedFontFamily(font.family) && UPLOADED_FONT_URL.test(font.url))
    .map(
      (font) =>
        `@font-face { font-family: "${font.family}"; src: url("${font.url}") format("woff2"); font-display: swap; }`,
    )
    .join("\n");
}

/**
 * Fusionne des tokens partiels sur une base, niveau par niveau.
 *
 * Sert à empiler défauts du noyau, puis thème actif, puis ses réglages publiés, puis la marque
 * d'un revendeur. Une fusion superficielle ne suffirait pas : un thème qui ne redéfinit que
 * `colors.primary` effacerait les neuf autres couleurs, et l'interface deviendrait illisible sur
 * une déclaration parfaitement légitime.
 *
 * Une seule valeur n'est pas recopiée telle quelle : `typography.headingFamily`, qui suit
 * `fontFamily` tant qu'aucune couche ne l'en distingue.
 */
export function mergeThemeTokens(base: ThemeTokens, override?: PartialThemeTokens): ThemeTokens {
  if (!override) {
    return base;
  }
  const declared = definedOnly(override.typography);
  const typography = { ...base.typography, ...declared };
  // Les défauts du noyau portent la même police pour le texte et les titres. Recopier ce défaut
  // tel quel faisait qu'un thème ne déclarant que `fontFamily` gardait ses titres en Inter, et
  // qu'une marque changeant la police du texte laissait les titres du thème Classique derrière
  // elle. La règle : une couche qui ne dit rien des titres les laisse suivre le texte, **sauf** si
  // la base les distinguait déjà — une police de titre choisie (Encre, Argile) n'est pas écrasée
  // par une police de texte posée par-dessus.
  if (
    declared.headingFamily === undefined &&
    base.typography.headingFamily === base.typography.fontFamily
  ) {
    typography.headingFamily = typography.fontFamily;
  }
  return {
    colorScheme: override.colorScheme ?? base.colorScheme,
    density: override.density ?? base.density,
    elevation: override.elevation ?? base.elevation,
    colors: { ...base.colors, ...definedOnly(override.colors) },
    radii: { ...base.radii, ...definedOnly(override.radii) },
    typography,
    // Chaque groupe est nommé ici : un groupe oublié serait perdu à la première couche, et le
    // thème qui le déclare retomberait sur les défauts sans que rien ne le signale.
    layout: { ...base.layout, ...definedOnly(override.layout) },
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
