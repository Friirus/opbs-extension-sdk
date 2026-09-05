import type { ConfigField } from "./config-fields";
import type { HostContext } from "./host";
import type {
  ContributedPage,
  ContributedScreen,
  ModulePageActionRequest,
  ModulePageActionResult,
  ModulePageRequest,
  ModulePageResult,
} from "./kinds/ui";
import type { ThemeDefinition } from "./kinds/theme";

/**
 * Genres de modules. La liste est fermée volontairement : chaque genre correspond à un point de
 * raccordement défini dans le noyau, avec son propre contrat. Un « genre libre » reviendrait à ne
 * rien promettre du tout.
 *
 * `notification` et `theme` ont longtemps figuré ici sans contrat : la base de données devait les
 * connaître avant qu'on sache quoi leur promettre, une énumération PostgreSQL ne s'étendant pas
 * sans migration. Les sept genres ont désormais tous le leur (`kinds/`).
 *
 * Ajouter un genre est la rupture la plus coûteuse du contrat : migration de l'énumération en
 * base, affichage dans le panel, et invalidation de la plage de compatibilité de tous les modules
 * installés. Voir `CHANGELOG.md`.
 */
export const EXTENSION_KINDS = [
  "provisioning",
  "payment",
  "notification",
  "theme",
  "addon",
  "registrar",
  "dns",
] as const;

export type ExtensionKind = (typeof EXTENSION_KINDS)[number];

/**
 * Carte d'identité d'un module, lue avant tout chargement de code.
 *
 * C'est volontairement une structure de données inerte : le noyau doit pouvoir afficher un module
 * incompatible ou cassé dans le panel — avec son nom et son auteur — sans jamais avoir exécuté la
 * moindre de ses lignes.
 */
export interface ExtensionManifest {
  /** Identifiant stable, unique sur l'instance. Sert de clé en base. Ex. `"stripe"`. */
  id: string;
  kind: ExtensionKind;
  /** Nom affiché dans le panel. */
  name: string;
  /** Une ligne décrivant ce que le module fait, montrée à côté de l'interrupteur. */
  description: string;
  /** Version du module, en semver. */
  version: string;
  author?: string;
  homepage?: string;
  /**
   * Plage de versions du noyau avec lesquelles ce module se déclare compatible, en semver
   * (ex. `"^1.0.0"`). Un module hors plage est signalé dans le panel et **n'est pas chargé** :
   * mieux vaut un module éteint qu'un module qui appelle un contrat qu'il croit connaître.
   */
  engines: { host: string };
  /**
   * Portées de l'API que le module demande. Affichées à l'administrateur au moment de
   * l'activation : c'est ce qui rend visible une extension de notification qui réclamerait
   * l'accès au fichier clients.
   */
  scopes?: string[];
  /** Chemin du fichier à charger, relatif au dossier du module. Absent pour un thème. */
  entry?: string;
  /**
   * Ce que le thème redéfinit. Réservé à `kind: "theme"`, et seul endroit où il s'exprime.
   *
   * Un thème n'a pas de descripteur puisqu'il n'a pas de code : la règle « le descripteur fait
   * foi » énoncée plus bas ne s'applique donc pas à lui, et le manifeste reste une source unique.
   */
  theme?: ThemeDefinition;
}

/**
 * Note sur les champs de configuration : ils sont déclarés par le **descripteur**, pas ici.
 *
 * Le manifeste a d'abord porté une liste `configFields` en double du descripteur. Le premier
 * module tiers écrit contre ce contrat a montré le piège : son auteur avait rempli la liste du
 * manifeste, le panel lisait celle du descripteur, et l'écran annonçait « ce module n'a pas de
 * réglage propre » à un module qui en réclamait deux. Deux sources de vérité pour la même chose
 * ne se contredisent pas un jour sur deux — elles se contredisent tout de suite.
 *
 * Le descripteur l'emporte parce que c'est lui que `parseConfig` valide, et parce qu'un module
 * refusé au chargement ne doit de toute façon pas voir son formulaire s'afficher : proposer de
 * configurer ce qui ne tournera pas n'aide personne.
 */

/**
 * Socle commun à tous les descripteurs, quel que soit le genre. Un descripteur est ce que le
 * module expose une fois chargé ; le manifeste est ce qu'on sait de lui avant de le charger.
 */
export interface ExtensionDescriptor<TConfig = Record<string, unknown>> {
  id: string;
  kind: ExtensionKind;
  label: string;
  description: string;
  /**
   * Réglages du **module lui-même**, saisis une fois dans l'écran Extensions : clé d'API d'un
   * encaisseur, serveur SMTP, jeton d'un fournisseur.
   *
   * À ne pas confondre avec ce qui se règle par produit ou par instance de fournisseur. Un module
   * de provisioning déclare le premier ici et le second dans `productConfigFields` : sans cette
   * séparation, l'écran Extensions demanderait « quel template cloner ? » pour un module qui sert
   * cent offres différentes. Une liste vide est légitime et fréquente.
   */
  configFields: ConfigField[];
  /**
   * Valide la configuration du module et la renvoie normalisée. Lève `ExtensionConfigError` sinon.
   *
   * Une configuration invalide doit être refusée à la saisie, pas découverte au moment où un
   * client paie.
   */
  parseConfig(raw: unknown): TConfig;
  /**
   * Écrans que ce module ajoute au panel. Absent ou vide : le module n'en contribue aucun.
   *
   * Déclaratif par défaut, quel que soit le genre du module — un canal de notification peut
   * vouloir un bouton d'essai, un provisionneur un tableau de bord — rendu par le panel avec le
   * même moteur que `configFields`. Depuis le SDK 0.22.0, un écran peut aussi livrer son propre
   * rendu (`ContributedScreen.bundle`, un fichier ESM déjà construit que le panel importe à
   * l'exécution) : `sections` reste alors le repli si ce bundle est refusé ou absent.
   */
  contributesScreens?: ContributedScreen[];
  /**
   * Résout un point d'entrée déclaré par un des écrans ci-dessus : lit des lignes pour une
   * section `table`, traite une soumission pour une section `form` ou `actions`. Un seul point
   * d'extension pour les deux usages, exactement comme `parseConfig` ne distingue pas lecture et
   * écriture — c'est au module de décider de son effet.
   */
  runScreenEntryPoint?(
    ctx: HostContext,
    entryPoint: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  /**
   * Pages que ce module ajoute au **portail client**. Absent ou vide : le module n'en ajoute
   * aucune.
   *
   * À distinguer de `contributesScreens`, qui vit dans le panel d'administration : ce ne sont ni la
   * même audience, ni la même portée de données. Voir `ContributedPage`.
   */
  contributesPages?: ContributedPage[];
  /**
   * Rend le contexte d'une des pages ci-dessus. Appelé sur le chemin de rendu, donc **sans effet
   * de bord** : un robot qui parcourt une page publique ne doit rien déclencher.
   *
   * Séparé de `runPageAction` pour cette seule raison. Le contrat ne distingue pas ailleurs lecture
   * et écriture (`parseConfig`, `runScreenEntryPoint`), mais ici la lecture arrive par un GET que
   * n'importe qui peut provoquer et l'écriture par un POST délibéré : les confondre ferait d'un
   * passage de crawler un déclencheur d'action.
   */
  runPageData?(ctx: HostContext, request: ModulePageRequest): Promise<ModulePageResult>;
  /**
   * Traite un bouton ou un formulaire d'une page contribuée.
   *
   * Lever décrit un échec qu'un humain doit lire : le message remonte au visiteur. Un module qui
   * rend un résultat sans lever a réussi.
   */
  runPageAction?(
    ctx: HostContext,
    request: ModulePageActionRequest,
  ): Promise<ModulePageActionResult>;
}
