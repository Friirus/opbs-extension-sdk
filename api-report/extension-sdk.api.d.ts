// ==== config-conditions.d.ts ====
/**
 * Évaluation des conditions d'affichage (`visibleWhen`) d'un champ de configuration.
 *
 * Fonctions pures, sans rien de Node : ce fichier est réexporté par la racine du SDK, que les
 * bundles **navigateur** des apps Next.js lisent (voir la note de `index.ts`). Le panel les
 * appelle au rendu de chaque formulaire ; les réécrire côté panel, c'était la troisième copie
 * d'une règle que le lecteur de manifeste et `check-extension` connaissent déjà.
 */
import type { ConfigField, ConfigFieldCondition } from "./config-fields";
/** Valeurs d'un formulaire, telles que le panel les tient (chaînes) ou qu'un appelant les résout. */
export type ConfigFieldValues = Readonly<Record<string, unknown>>;
/** Ce dont l'évaluation a besoin d'un champ : son nom et sa condition. Une option s'y prête aussi. */
type Conditioned = Pick<ConfigField, "name" | "visibleWhen">;
/**
 * Les conditions d'un `visibleWhen`, toujours en tableau : une condition seule et un tableau d'une
 * condition disent la même chose, et aucun appelant n'a à distinguer les deux formes.
 */
export declare function configFieldConditions(visibleWhen: ConfigFieldCondition | readonly ConfigFieldCondition[] | undefined): ConfigFieldCondition[];
/**
 * Ce qui cloche dans la **forme** d'une condition, ou `null` si elle est bien formée.
 *
 * Partagé par le lecteur de manifeste (qui écarte la condition) et `invalidThemeSettings` (qui la
 * signale) : une seule définition de « bien formée », sans quoi l'un laisserait passer ce que
 * l'autre refuse. Une valeur booléenne est admise — `"equals": true` s'écrit naturellement dans un
 * JSON — et comparée sous sa forme texte.
 */
export declare function conditionShapeProblem(raw: unknown): string | null;
/**
 * La condition tient-elle pour ces valeurs ?
 *
 * Une condition mal formée — ce que le type interdit mais qu'un JSON peut contenir — est **ignorée**
 * (elle tient) : c'est ce que fait le lecteur de manifeste, qui l'écarte, et un champ affiché à tort
 * se remarque, là où un champ masqué à jamais disparaît sans que personne ne sache qu'il existe.
 */
export declare function conditionHolds(condition: ConfigFieldCondition, values: ConfigFieldValues): boolean;
/**
 * Le champ est-il affiché, compte tenu des autres champs et des valeurs du moment ?
 *
 * **Transitif** : un champ est visible si toutes ses conditions tiennent *et* si chaque champ
 * qu'elles nomment est lui-même visible. Sans cela, « Points de la conclusion » (qui dépend de
 * « Afficher la liste », qui dépend de « Afficher la conclusion ») restait affiché quand la
 * conclusion entière était masquée — un réglage sans effet, offert à l'édition.
 *
 * **Une boucle masque ses membres**, et tout ce qui en dépend : `A` visible si `B` l'est, `B` si
 * `A` l'est, rien ne permet de trancher. `invalidThemeSettings` refuse la boucle, mais un thème
 * déposé sans passer par `check-extension` ne doit pas pour autant faire tourner le panel à
 * l'infini. Un renvoi vers un champ inconnu ne compte que par sa condition (valeur absente = `""`).
 *
 * `field` peut être une option d'un `order` (`{ name, visibleWhen }`) : même règle.
 */
export declare function isConfigFieldVisible(field: Conditioned, fields: readonly Conditioned[], values: ConfigFieldValues): boolean;
/** Réservé au lecteur de manifeste. */
export declare function noteDiscardedConditions(owner: object, problems: readonly string[]): void;
/** Réservé à `invalidThemeSettings`. */
export declare function discardedConditionsOf(owner: object): readonly string[];
export {};

// ==== config-fields.d.ts ====
/**
 * Types de champ qu'un module peut déclarer. Le panel admin rend le formulaire à partir de cette
 * description : sans elle, chaque nouveau module imposerait son propre écran sur mesure, ce qui
 * fermerait de fait la porte aux modules tiers.
 */
export type ConfigFieldType = "text" | "textarea" | "number" | "boolean" | "select"
/** Saisie masquée, **chiffrée en base et jamais renvoyée en clair par l'API**. */
 | "password"
/**
 * Adresse web : rendue en `<input type="url">`, donc validée par le navigateur avant envoi.
 *
 * Ajouté pour les réglages de thème, où la moitié des champs visuels sont des images — et une
 * image se désigne par son adresse, comme le logo de Paramètres › Identité. Utile à tout module
 * qui demande une adresse de service plutôt qu'un identifiant.
 */
 | "url"
/**
 * Image téléversée depuis le panel, ou désignée par son adresse. **Réservé aux réglages de
 * thème** : le noyau ne stocke des fichiers que pour eux, et `pnpm check-extension` refuse ce
 * type ailleurs.
 *
 * La valeur reste une adresse — `/api/v1/theme-media/<id>.<ext>` après téléversement, ou une
 * adresse `https:` saisie à la main —, si bien qu'un gabarit l'écrit tel quel dans un `src`.
 */
 | "image"
/**
 * Couleur, saisie au sélecteur du panel. La valeur est un hexadécimal (`#rgb` ou `#rrggbb`) et
 * rien d'autre : c'est le seul format dont le noyau sait mesurer le contraste, et le seul qu'un
 * `<input type="color">` sache relire.
 *
 * Seule, une couleur n'arrive qu'aux gabarits. Pour qu'elle atteigne la feuille de style, le
 * champ la lie à un token (`token`) ou à une variable CSS du thème (`cssVar`).
 */
 | "color"
/**
 * Ordre d'une liste fermée — l'emplacement des blocs d'une page. `options` nomme les éléments,
 * le panel les rend déplaçables, et la valeur est la liste de leurs `value` séparés par des
 * virgules (`"families,steps,account"`), qu'un gabarit lit par `split`.
 *
 * Une chaîne et non un tableau : le type de `settings` ne change pas, donc aucun gabarit
 * existant ne casse. L'ordre ne masque rien — montrer ou cacher un bloc reste un `boolean`.
 */
 | "order"
/**
 * Liste d'éléments, chacun composé des sous-champs de `fields` — des avis, une FAQ, des liens.
 * L'hébergeur ajoute, retire et ordonne les éléments au panel ; le gabarit reçoit un tableau
 * d'objets (`{% for review in settings.reviews %}{{ review.author }}`). **Réservé aux réglages
 * de thème.** Un sous-champ ne peut être ni `list`, ni `order`, ni `password`, ni `provider`,
 * et ne porte ni `token` ni `cssVar`.
 */
 | "list"
/**
 * Lien : un chemin du site (`/catalog`, `/infrastructure`) ou une adresse externe (`https:`,
 * `mailto:`, `tel:`), validé par `isSafeLinkValue`. **Réservé aux réglages de thème**, admis comme
 * sous-champ de `list` (les colonnes d'un pied de page).
 *
 * Distinct de `url` parce que ce n'est pas la même chose qu'on demande à l'hébergeur : `url` est
 * une adresse de ressource (une image, un service), `link` une destination de navigation. Le
 * panel lui propose donc les pages qui existent — la vitrine, ses propres pages de contenu, celles
 * du thème — au lieu d'un champ vide où il faudrait deviner qu'on attend `/catalog`.
 */
 | "link"
/**
 * Famille de polices. **Réservé aux réglages de thème**, et liable aux seuls tokens
 * `typography.fontFamily` et `typography.headingFamily`.
 *
 * La valeur est l'une des `options` du thème (une pile, `"Figtree", system-ui, sans-serif`), ou
 * le nom d'une police que l'hébergeur a téléversée au panel (`Ma Police`), que le noyau complète
 * d'une pile de repli en l'émettant. Distinct de `select` parce que la liste n'est pas fermée par
 * le manifeste : les polices téléversées ne sont connues qu'à l'exécution, et les validateurs du
 * SDK les reçoivent en paramètre — le SDK ne lit aucune base.
 */
 | "font"
/**
 * Désigne une instance de fournisseur configurée pour ce module (un cluster, un vCenter, un
 * serveur). Le panel remplit lui-même la liste des choix : le module n'a pas à la connaître.
 */
 | "provider";
export interface ConfigFieldOption {
    value: string;
    label: string;
    /**
     * Valeurs que ce choix pose sur d'autres champs quand on le sélectionne — une palette qui
     * remplit six couleurs d'un coup. Clé : nom d'un champ déclaré ; valeur : ce qu'on y aurait tapé.
     *
     * Le panel applique, le noyau n'en sait rien : les champs remplis restent des champs ordinaires,
     * modifiables un à un ensuite. Réservé aux réglages de thème.
     */
    sets?: Record<string, string>;
    /**
     * Pour un champ `order` : l'élément n'apparaît sur la page que si cette condition tient
     * (`{ "field": "showSteps", "equals": "true" }`). Le panel le marque « masqué » dans la liste
     * plutôt que de le retirer — on peut placer un bloc avant de l'activer. Le noyau ne s'en sert
     * pas : c'est le gabarit qui montre ou cache.
     *
     * Un tableau de conditions veut dire « toutes », comme sur `ConfigField.visibleWhen`.
     */
    visibleWhen?: ConfigFieldCondition | ConfigFieldCondition[];
}
/**
 * Condition d'affichage d'un champ : il n'apparaît que si un autre champ a telle valeur, n'a pas
 * telle valeur, ou a l'une de plusieurs valeurs. **Exactement un opérateur** par condition.
 *
 * La valeur comparée est celle saisie dans l'autre champ, en chaîne : `"true"`/`"false"` pour un
 * `boolean`, la `value` de l'option pour un `select`. Une union et non trois clés facultatives sur
 * un même objet : `{ field, equals, in }` n'aurait aucun sens, et le type le refuse avant que le
 * lecteur de manifeste n'ait à le faire.
 *
 * Pur confort de formulaire. Le noyau ignore la condition — un champ masqué garde sa valeur et
 * le gabarit la reçoit toujours : c'est à lui de ne pas s'en servir. `conditionHolds` et
 * `isConfigFieldVisible` l'évaluent, pour que le panel et quiconque d'autre en tirent la même
 * réponse.
 */
export type ConfigFieldCondition = {
    field: string;
    equals: string;
} | {
    field: string;
    notEquals: string;
}
/** Tableau non vide : une liste vide ne tiendrait jamais, ce qui masquerait le champ pour toujours. */
 | {
    field: string;
    in: string[];
};
/**
 * Clés que le noyau se réserve dans l'objet des réglages d'un thème (`$customCss`, `$texts` — CSS
 * additionnel et textes du thème saisis au panel). Elles vivent dans le même JSON que les valeurs
 * des réglages déclarés, d'où le `$` : la règle de nom d'un réglage (une lettre, puis lettres,
 * chiffres ou `_`, voir `invalidThemeSettings`) ne peut pas en produire, si bien qu'aucun thème ne
 * peut déclarer un réglage qui les écraserait. **Toute clé commençant par `$` appartient au
 * noyau** ; celles-ci sont les seules utilisées aujourd'hui.
 */
export declare const THEME_RESERVED_SETTING_KEYS: readonly ["$customCss", "$texts"];
/** Unités qu'un champ `number` peut porter jusqu'à la feuille de style. */
export declare const CONFIG_FIELD_UNITS: readonly ["px", "rem", "em", "%", "vw", "vh", "ch"];
export type ConfigFieldUnit = (typeof CONFIG_FIELD_UNITS)[number];
export interface ConfigField {
    name: string;
    label: string;
    type: ConfigFieldType;
    required: boolean;
    /** Valeur pré-remplie à l'ouverture du formulaire. */
    defaultValue?: string;
    placeholder?: string;
    /** Texte d'aide affiché sous le champ. */
    help?: string;
    /** Pour les types `select`, `order` et `font`. */
    options?: ConfigFieldOption[];
    /**
     * Section sous laquelle le panel range ce champ : à la fois son titre et son **identifiant**.
     *
     * Sans lui, tous les champs se suivent dans l'ordre de déclaration — acceptable pour les trois
     * réglages d'un module d'encaissement, illisible pour les vingt-cinq d'un thème. Pour un thème,
     * la chaîne est celle du manifeste, jamais traduite : c'est elle que nomment
     * `ThemeDefinition.settingGroups[].name` et la règle de `block` (même section), et une traduction
     * incohérente couperait sinon une section en deux. Le panel affiche à côté un libellé traduit.
     * Ordre des sections : celui de `settingGroups`, puis les groupes non déclarés dans l'ordre de
     * leur première apparition.
     */
    group?: string;
    /**
     * **Thèmes seulement.** Intertitre repliable à l'intérieur de la section (`group`) — « Mode
     * sombre » dans « Couleurs ». Chaîne source du manifeste, traduisible au panel comme `group`.
     *
     * Exige `group`, et exclut `block` : un réglage rattaché à un bloc s'affiche dans ce bloc.
     */
    subgroup?: string;
    /**
     * **Thèmes seulement.** Rattache ce réglage à un élément d'un champ `order` de la **même
     * section** : la `value` d'une de ses options (`"steps"`). Le panel rend alors l'`order` en blocs
     * dépliables, chacun portant ses propres réglages — le titre des étapes sous le bloc « Étapes »,
     * plutôt qu'à trente lignes de là.
     *
     * Un champ `order` ne porte ni `block` ni `subgroup`.
     */
    block?: string;
    /**
     * **Thèmes seulement**, sur `textarea` (y compris sous-champ de `list`) : la valeur est un texte
     * riche, écrit dans le sous-ensemble markdown de `parseThemeMarkdown` (paragraphes, gras,
     * italique, liens, listes). Le panel ajoute une barre de mise en forme et un aperçu ; le gabarit
     * reçoit toujours le texte brut, et le met en forme par `{{ settings.x | markdown }}` — jamais
     * dans un attribut, où `pnpm check-extension` le signale.
     *
     * Une clé et non un type : la valeur reste un texte, localisable et borné comme les autres, et un
     * thème qui ne l'applique pas au rendu montre simplement les astérisques.
     */
    format?: "markdown";
    /**
     * Longueur maximale d'une valeur texte (`text`, `textarea`, `url`, `link`), en caractères.
     *
     * Le panel affiche un compteur quand elle est déclarée, et le noyau refuse une valeur plus
     * longue. Sans elle, pas de compteur : un compteur sans limite n'apprend rien à personne. Utile
     * surtout aux thèmes, dont la mise en page casse sur un titre trois fois trop long.
     */
    maxLength?: number;
    /**
     * Bornes et pas d'un champ `number`. Avec `min` **et** `max`, le panel rend un curseur ; le
     * noyau refuse une valeur hors bornes dans tous les cas.
     */
    min?: number;
    max?: number;
    step?: number;
    /**
     * Unité d'un champ `number` : affichée à côté de la valeur, et accolée à elle quand le champ
     * est lié à un token ou à une variable CSS (`18` + `px`). Le gabarit, lui, reçoit le nombre nu.
     *
     * Obligatoire pour un nombre lié à un token, sauf les tokens **sans unité** —
     * `typography.lineHeight`, `headingLineHeight` et `headingScale` —, où elle est au contraire
     * refusée : `1.5px` n'est pas la hauteur de ligne `1.5`, et `1.25rem` ne multiplie rien.
     */
    unit?: ConfigFieldUnit;
    /**
     * Le champ n'apparaît au panel que si cette condition est remplie — ou, pour un tableau, si
     * toutes le sont. **Transitif** : un champ dont la condition renvoie à un champ lui-même masqué
     * est masqué aussi (voir `isConfigFieldVisible`), sans quoi « Points de la conclusion » restait
     * affiché sous une conclusion désactivée. Une boucle de conditions masque tous ses membres ;
     * `pnpm check-extension` la refuse.
     */
    visibleWhen?: ConfigFieldCondition | ConfigFieldCondition[];
    /**
     * **Thèmes seulement.** Token que ce réglage remplace : `"colors.primary"`, `"radii.md"`,
     * `"typography.headingFamily"`, `"density"`… Le noyau pose la valeur par-dessus les tokens du
     * thème ; seule la marque d'un revendeur passe encore devant, sur ses domaines et pour ses
     * clients.
     *
     * Passer par un token plutôt que par une variable libre, c'est hériter de tout ce que le noyau
     * en dérive : la couleur lisible sur un aplat, l'échelle d'espacement d'une densité, la taille
     * des titres d'une échelle, les ombres d'un relief (`elevation`).
     */
    token?: string;
    /**
     * **Thèmes seulement.** Variable CSS du thème qui reçoit la valeur (`"--ag-hero-tint"`), émise
     * dans le même bloc `:root` que les tokens. Pour ce qu'aucun token ne décrit.
     *
     * Les préfixes du noyau (`--brand-`, `--radius-`, `--space-`, `--font-size-`) sont refusés : un
     * réglage qui les écraserait contournerait les valeurs dérivées. Types admis : `color`,
     * `number`, `select`.
     */
    cssVar?: string;
    /**
     * **Thèmes seulement**, sur `text` et `textarea` : une valeur par langue de l'instance. Le panel
     * montre un onglet par langue ; le gabarit reçoit la valeur de la langue de la page, sinon celle
     * de la langue par défaut de l'instance, sinon la première renseignée, sinon `defaultValue`.
     */
    localized?: boolean;
    /**
     * **Thèmes seulement**, avec `token` ou `cssVar` : la palette que ce réglage alimente. `"dark"`
     * vise le mode sombre (`ThemeDefinition.tokensDark`), `"light"` — le défaut — l'apparence
     * ordinaire. Sans mode sombre déclaré par le thème, un réglage `"dark"` n'a aucun effet.
     */
    scheme?: "light" | "dark";
    /**
     * **Thèmes seulement. Déprécié** au profit de `ThemeDefinition.settingGroups[].previewPath` : la
     * page d'aperçu est une propriété de la section, pas d'un réglage. Reste lu comme **repli** —
     * quand la section ne déclare pas la sienne, le premier réglage de la section qui en porte une
     * décide pour toute la section.
     *
     * Un chemin que `isThemePreviewPath` accepte : une page de `THEME_PREVIEW_PATHS` ou de
     * `THEME_ACCOUNT_PREVIEW_PATHS`, ou `/<slug>` d'une page déclarée par le thème.
     */
    previewPath?: string;
    /** Sous-champs d'un `list`. */
    fields?: ConfigField[];
    /** Nombre maximal d'éléments d'un `list`. Le noyau refuse au-delà. */
    maxItems?: number;
}
/** Une valeur de réglage telle qu'un gabarit la reçoit. */
export type ThemeSettingScalar = string | number | boolean;
export type ThemeSettingItem = Record<string, ThemeSettingScalar>;
export type ThemeSettingValue = ThemeSettingScalar | ThemeSettingItem[];
/**
 * Un champ dont la valeur ne doit jamais ressortir de la base.
 *
 * Fonction plutôt que test direct sur `type === "password"` disséminé dans le code : le jour où un
 * second type sensible apparaît, il y a un seul endroit à corriger — et surtout, un seul endroit à
 * relire pour vérifier qu'aucun secret ne fuit.
 */
export declare function isSecretField(field: ConfigField): boolean;
/** Noms des champs sensibles d'un module, pour expurger une configuration avant de la renvoyer. */
export declare function secretFieldNames(fields: readonly ConfigField[]): string[];
/** Accès typé à un champ d'un objet de configuration brut (issu de JSON ou d'un formulaire). */
export declare function readString(raw: unknown, key: string): string | undefined;
export declare function requireString(raw: unknown, key: string, label: string): string;
/**
 * Lit un nombre, qu'il arrive en nombre ou en chaîne — un formulaire HTML envoie toujours du
 * texte, et un JSON stocké renvoie un nombre. Les deux doivent donner le même résultat.
 */
export declare function readNumber(raw: unknown, key: string): number | undefined;
export declare function requireNumber(raw: unknown, key: string, label: string): number;
/**
 * Lit un booléen tolérant aux formes que prend une case à cocher selon le chemin emprunté :
 * `true`, `"true"`, `"on"` depuis un formulaire, `"1"` depuis une variable d'environnement.
 */
export declare function readBoolean(raw: unknown, key: string): boolean | undefined;
/** Valide qu'une valeur fait partie d'un ensemble fermé, en repliant sur un défaut si elle manque. */
export declare function requireOneOf<T extends string>(raw: unknown, key: string, label: string, allowed: readonly T[], fallback?: T): T;

// ==== errors.d.ts ====
/**
 * Configuration refusée par un module. Distinguée d'une erreur quelconque parce qu'elle est
 * *attendue* : elle remonte jusqu'au formulaire admin sous forme de message de validation, là où
 * une erreur inattendue donnerait un 500.
 */
export declare class ExtensionConfigError extends Error {
    constructor(message: string);
}
/** Module absent du registre : ni livré avec l'application, ni déposé sur l'instance. */
export declare class UnknownExtensionError extends Error {
    constructor(moduleId: string);
}

// ==== events.d.ts ====
/**
 * Événements métier canoniques, partagés par les webhooks sortants (`WebhookEndpoint.events`) et
 * les modules du genre `notification`.
 *
 * Une seule liste plutôt que deux : elle a longtemps existé en double (le DTO de création de
 * webhook, le formulaire du panel), et les deux copies avaient divergé — un événement réellement
 * émis (`invoice.disputed`) était absent des deux, invisible à quiconque aurait voulu s'y abonner.
 */
export declare const CORE_EVENTS: readonly ["order.created", "invoice.paid", "invoice.disputed", "service.provisioned", "subscription.cancelled", "ticket.created", "node.capacity.warning", "login.suspicious", "billing.oss_threshold.warning", "domain.registered", "domain.renewal.failed", "domain.expiring", "domain.transfer.completed", "service.monitor.down", "service.monitor.up", "dns.zone.created", "dns.zone.deleted", "dns.zone.error", "customer.registered", "referral.commission.earned", "invoice.refunded", "provisioning.approval.requested"];
export type CoreEvent = (typeof CORE_EVENTS)[number];
/**
 * Forme exacte de chaque événement canonique, telle qu'émise par ses 22 points de publication
 * (`apps/api/src/events/events.service.ts`, `apps/worker/src/events/publish-event.ts`). Un module
 * `notification` qui déclare `send(ctx, event: NotificationEvent<"invoice.paid">)` voit alors
 * `event.payload` typé `{ invoiceId: string; totalCents: number }` plutôt que `Record<string,
 * unknown>` — voir `NotificationEvent` dans `kinds/notification.ts`.
 *
 * `tone` est écrit en toutes lettres (`"positive" | "warning" | "negative"`) plutôt qu'importé de
 * `@opbs/shared-types` (`CapacityTone`) : ce paquet a délibérément une seule dépendance externe
 * (`SupportedLocale`), et `checkCapacityToneMirror` (`scripts/check-mirrors.ts`) ne cherche que des
 * fonctions qui *dérivent* une tonalité depuis un pourcentage — un type qui la nomme n'est pas la
 * dérivation qu'il traque.
 */
export interface CoreEventPayloads {
    "order.created": {
        subscriptionId: string;
        bundlePurchaseId: string;
    } | {
        subscriptionId: string;
        cartPurchaseId: string;
    } | {
        subscriptionId: string;
        invoiceId: string;
        domainId: string;
    };
    "invoice.paid": {
        invoiceId: string;
        totalCents: number;
    };
    "invoice.disputed": {
        invoiceId: string;
    };
    "service.provisioned": {
        provisionedServiceId: string;
        subscriptionId: string;
        moduleId: string;
        remoteId: string | null;
    };
    "subscription.cancelled": {
        subscriptionId: string;
        reason: string | null;
    };
    "ticket.created": {
        ticketId: string;
        subject: string;
    };
    "node.capacity.warning": {
        clusterId: string;
        clusterName: string;
        node: string;
        tone: "positive" | "warning" | "negative";
        cpuPercent: number | null;
        memPercent: number | null;
        diskPercent: number | null;
    };
    "login.suspicious": {
        subjectType: "contact" | "customer" | "staff";
        subjectId: string;
        email: string;
        ipAddress: string | null;
        device: string;
    };
    "billing.oss_threshold.warning": {
        year: number;
        totalCents: number;
        thresholdCents: number;
        tone: "positive" | "warning" | "negative";
    };
    "domain.registered": {
        domainId: string;
        subscriptionId: string;
        name: string;
        moduleId: string;
    };
    "domain.renewal.failed": {
        domainId: string;
        message: string;
    };
    "domain.expiring": {
        domainId: string;
        name: string;
        expiryDate: string | null;
    };
    "domain.transfer.completed": {
        domainId: string;
        subscriptionId: string;
        name: string;
        moduleId: string;
    };
    "service.monitor.down": {
        monitorId: string;
        subscriptionId: string;
        name: string;
        target: string;
    };
    "service.monitor.up": {
        monitorId: string;
        subscriptionId: string;
        name: string;
        target: string;
    };
    "dns.zone.created": {
        dnsZoneId: string;
        name: string;
        moduleId: string;
    };
    "dns.zone.deleted": {
        dnsZoneId: string;
        name: string;
        moduleId: string;
    };
    "dns.zone.error": {
        dnsZoneId: string;
        message: string;
    };
    "customer.registered": {
        customerId: string;
        email: string;
        referredById: string | null;
    };
    "referral.commission.earned": {
        referrerId: string;
        referredId: string;
        invoiceId: string;
        commissionCents: number;
        currency: string;
    };
    "invoice.refunded": {
        invoiceId: string;
        paymentId: string;
        amountCents: number;
        currency: string;
    };
    "provisioning.approval.requested": {
        subscriptionId: string;
        productId: string;
    };
}

// ==== host.d.ts ====
import type { SupportedLocale } from "./locale";
/**
 * Ce que le noyau met à disposition d'un module au moment de l'appeler.
 *
 * Décision structurante : **un module ne reçoit jamais le client de base de données.** Deux
 * raisons, et la première suffirait.
 *
 * 1. Le coupler au schéma le gèlerait. Si un module tiers lit `provisioned_services.proxmox_vmid`,
 *    renommer cette colonne casse son module — et avec vingt modules dans la nature, le schéma ne
 *    bouge plus jamais. C'est exactement ainsi que les tables de WHMCS sont figées depuis quinze
 *    ans. Voir `COMPATIBILITY.md`.
 * 2. Un module de notification n'a aucune raison de pouvoir lire les IBAN ou le fichier clients.
 *
 * Ce que le module ne reçoit pas ici, il le reçoit en paramètre d'appel, sous une forme que le
 * noyau contrôle et peut faire évoluer sans rien casser.
 *
 * À dire franchement : le `HostContext` réduit la surface d'API et le rayon d'une erreur, il n'est
 * **pas** une barrière de sécurité contre un module hostile — du code déposé sur le serveur
 * s'exécute avec les droits du processus Node. Le modèle de confiance, c'est l'installation par
 * dépôt de fichiers : installer une extension équivaut à installer un paquet npm.
 */
export interface HostContext {
    /**
     * Configuration du module, déchiffrée et **telle que son propre `parseConfig` la rend** — donc
     * normalisée, et non la saisie brute du formulaire. Un module qui transforme une zone de texte
     * en liste la retrouve ici en liste.
     */
    config: Record<string, unknown>;
    /**
     * Locale pertinente pour cet appel — pas nécessairement celle d'un client précis. Pour un module
     * `payment`, c'est la locale du client qui règle (quand elle est connue de l'appelant) ; pour un
     * canal `notification`, qui cible une destination fixe et non un client, c'est la langue
     * d'exploitation de l'hébergeur (`InstanceSettings.defaultLocale`). Un module qui ne trouve rien
     * à en faire peut l'ignorer sans risque : le repli `fr` (`DEFAULT_LOCALE`) est toujours valide.
     */
    locale: SupportedLocale;
    logger: ExtensionLogger;
    /** Requêtes sortantes encadrées : délai d'attente et taille de réponse plafonnés. */
    http: typeof fetch;
    /** Stockage libre, cloisonné par module. Évite qu'un module réclame une table à lui. */
    storage: ExtensionStorage;
    /** Remonte un événement au noyau, qui le relaie aux abonnés et aux webhooks sortants. */
    emit(event: string, payload: Record<string, unknown>): void;
}
/**
 * Journal du module. Préfixé par son identifiant et consultable depuis le panel : sans ça, une
 * extension tierce qui dysfonctionne est un silence, et l'hébergeur n'a aucun moyen de savoir
 * laquelle accuser.
 */
export interface ExtensionLogger {
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
}
/** Stockage clé-valeur cloisonné : deux modules ne peuvent pas se lire l'un l'autre. */
export interface ExtensionStorage {
    get<T = unknown>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    /**
     * Écrit seulement si la clé n'existe pas encore, et dit si l'écriture a eu lieu. Atomique côté
     * base : c'est la seule primitive qui permette à un module de **réserver** une ressource (un
     * port, un numéro, un créneau) sous une clé qui la nomme, sans que deux appels simultanés se
     * l'attribuent tous les deux. Un `get` suivi d'un `set` sur un blob unique ne l'est pas — le
     * noyau n'a jamais sérialisé les appels à un module, et ne le fera pas. Même plafond de clés
     * que `set`.
     */
    setIfAbsent(key: string, value: unknown): Promise<boolean>;
    delete(key: string): Promise<void>;
    /**
     * Clés du module commençant par `prefix` (`""` pour tout lister), triées. C'est ce qui manquait
     * à un module tenant une ressource par clé (un port par `port:<n>`) : sans `keys`, il ne peut ni
     * compter ce qu'il lui reste, ni retirer son offre une fois la plage pleine, ni proposer à
     * l'hébergeur un écran listant ce qu'il a alloué. Plafonné comme `set` : au plus
     * `MAX_STORAGE_KEYS_PER_MODULE` résultats, puisque c'est aussi le plafond de ce qu'un module peut
     * avoir écrit.
     */
    keys(prefix: string): Promise<string[]>;
}

// ==== index.d.ts ====
/**
 * Contrat public des extensions opbs.
 *
 * **Cette surface n'est pas encore figée.** Elle a été éprouvée sur trois passerelles de paiement
 * réelles, mais sur un seul hyperviseur : le second, qui devait la confronter à autre chose que
 * Proxmox, a été reporté faute de simulateur vSphere REST utilisable. Elle peut donc encore
 * changer — voir `COMPATIBILITY.md` à la racine du dépôt.
 *
 * Principe de rédaction suivi ici : **un contrat s'écrit avec sa première implémentation, jamais
 * avant.** Les sept genres ont désormais tous la leur ; `notification` et `theme`, longtemps nommés
 * dans `EXTENSION_KINDS` sans interface — la base de données devait les connaître avant que le
 * contrat n'existe —, ont rejoint les autres.
 *
 * Toute modification de ce qui suit est une rupture au sens de `HOST_CONTRACT_VERSION` : voir
 * `version.ts`, `CHANGELOG.md`, et le verrou `public-surface.spec.ts` qui échoue si l'un des trois
 * est oublié.
 */
export { ExtensionConfigError, UnknownExtensionError } from "./errors";
export { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./locale";
export type { SupportedLocale } from "./locale";
export { isSecretField, readBoolean, readNumber, readString, requireNumber, requireOneOf, requireString, secretFieldNames, CONFIG_FIELD_UNITS, THEME_RESERVED_SETTING_KEYS, } from "./config-fields";
export { isSafeLinkValue } from "./links";
export { THEME_MARKDOWN_MAX_LENGTH, parseThemeMarkdown } from "./markdown";
export type { ThemeMarkdownBlock, ThemeMarkdownInline } from "./markdown";
export { conditionHolds, configFieldConditions, isConfigFieldVisible } from "./config-conditions";
export type { ConfigFieldValues } from "./config-conditions";
export type { ConfigField, ConfigFieldCondition, ConfigFieldOption, ConfigFieldType, ConfigFieldUnit, ThemeSettingItem, ThemeSettingScalar, ThemeSettingValue, } from "./config-fields";
export { HOST_CONTRACT_COMPATIBLE_SINCE, HOST_CONTRACT_VERSION } from "./version";
export { mergeDriverConfig, mergeResourceSpec } from "./merge";
export { EXTENSION_KINDS } from "./manifest";
export type { ExtensionDescriptor, ExtensionKind, ExtensionManifest } from "./manifest";
export type { ExtensionLogger, ExtensionStorage, HostContext } from "./host";
export { createTestHost } from "./testing";
export type { CapturedEvent, CapturedLogEntry, TestHostContext, TestHostOptions } from "./testing";
export { CORE_EVENTS } from "./events";
export type { CoreEvent, CoreEventPayloads } from "./events";
export { isEventDrivenChannel } from "./kinds/notification";
export type { NotificationChannelDescriptor, NotificationEvent, NotificationOutcome, } from "./kinds/notification";
export { invalidContributedPages, invalidContributedScreens, modulePageHref, modulePageThemeTemplatePath, PANEL_CONTRACT_VERSION, resolveContributedLabel, } from "./kinds/ui";
export type { ContributedLabel, ContributedPage, ContributedScreen, ModulePageActionRequest, ModulePageActionResult, ModulePageCustomer, ModulePageRequest, ModulePageResult, ModulePageService, PanelScreenHost, PanelScreenModule, PanelScreenMount, PanelScreenUnmount, ScreenActionSection, ScreenBundle, ScreenFormSection, ScreenSection, ScreenTableSection, } from "./kinds/ui";
export { missingNodeCapacityReporting, missingProvisioningOperations, missingStorageUsageReporting, missingUsageReporting, NO_CAPABILITIES, NO_PROVISIONING_CAPABILITIES, } from "./kinds/provisioning";
export type { BackupOutcome, ConsoleSession, NodeCapacitySnapshot, ProvisioningCapabilities, ProvisioningDescriptor, ProvisioningNetwork, ProvisioningNetworkAddress, ProvisioningOperation, ProvisioningOutcome, ProvisioningTarget, ResourceSpec, ServiceUsageSnapshot, StorageUsageSnapshot, SnapshotInfo, } from "./kinds/provisioning";
export { DEFAULT_THEME_TOKENS, THEME_ISLANDS, THEME_VIEWS, THEME_VIEW_NAMES, declaredIslands, invalidThemePages, isProvidedContextView, isSafeSettingUrl, isHexColor, THEME_TEXT_KEY_PATTERN, THEME_TEXT_MAX_LENGTH, themeTranslationReads, themeSettingStyle, themeSettingEditable, MAX_LIST_ITEMS, isSafeTokenValue, isSafeThemeFont, isSafeUploadedFontFamily, isAllowedFontValue, uploadedFontFaces, themeFontFaces, THEME_PREVIEW_PATHS, THEME_ACCOUNT_PREVIEW_PATHS, isThemePreviewPath, themePanelStrings, themeSettingWarnings, mergeThemeTokens, missingRequiredIslands, themeIslandSpec, themePageTemplatePath, themeSettingValues, invalidThemeSettings, themeViewSpec, unknownIslands, } from "./kinds/theme";
export type { PartialThemeTokens, ResolvedTheme, ThemeSettingResolveOptions, ThemeSettingGroup, ThemePreviewPath, ThemeTranslations, ThemeAcceptInviteView, ThemeAccountBillingView, ThemeAccountNav, ThemeAccountPaymentMethodsView, ThemeAccountPrivacyView, ThemeAccountProfileView, ThemeAccountReferralView, ThemeAccountSecurityView, ThemeAccountTeamView, ThemeAccountView, ThemeBundleView, ThemeCartView, ThemeCatalogView, ThemeCatalogFamily, ThemeCategorySection, ThemeColors, ThemeColorScheme, ThemeContentPageView, ThemeCustomPageView, ThemeDashboardView, ThemeDefinition, ThemeDensity, ThemeDnsZonesView, ThemeDnsZoneView, ThemeDomainsMineView, ThemeDomainsView, ThemeDomainView, ThemeElevation, ThemeEmailContext, ThemeFont, ThemeUploadedFont, ThemeForgotPasswordView, ThemeHistoryView, ThemeHomeView, ThemeInvoiceSummary, ThemeInvoicesView, ThemeInvoiceView, ThemeIslandSpec, ThemeKbArticle, ThemeKbArticleSummary, ThemeKbArticleView, ThemeKbView, ThemeLayout, ThemeLegalDocumentView, ThemeLegalPrivacyView, ThemeLegalTermsView, ThemeLoginView, ThemeNavLink, ThemePageBlock, ThemePageDeclaration, ThemePagination, ThemePasswordPolicy, ThemeProductView, ThemeRadii, ThemeRegisterView, ThemeResellerClientNewView, ThemeResellerBrandingView, ThemeResellerClientsView, ThemeResellerClientView, ThemeResetPasswordView, ThemeServiceCommitments, ThemeServiceConsoleView, ThemeServicesView, ThemeServiceSummary, ThemeServiceView, ThemeShellContext, ThemeSsoCallbackView, ThemeSsoLinkView, ThemeTicketNewView, ThemeTicketsView, ThemeTicketView, ThemeTokens, ThemeTypography, ThemeVerifyEmailView, ThemeViewContext, ThemeViewSpec, } from "./kinds/theme";
export { isReservedPageSlug, RESERVED_PAGE_SLUGS } from "./reserved-slugs";
export { missingAddonOperations } from "./kinds/addon";
export type { AddonDescriptor, AddonOffering, AddonOutcome, AddonSubscriptionContext, } from "./kinds/addon";
export { missingRegistrarOperations, NO_REGISTRAR_CAPABILITIES } from "./kinds/registrar";
export type { AvailabilityResult, DomainContact, RegistrarCapabilities, RegistrarDescriptor, RegistrarOperation, RegistrarOutcome, RegistrarTarget, } from "./kinds/registrar";
export { DNS_RECORD_TYPES, missingDnsOperations, NO_DNS_CAPABILITIES } from "./kinds/dns";
export type { DnsCapabilities, DnsDescriptor, DnsOperation, DnsOutcome, DnsRecordInput, DnsRecordType, DnsZoneTarget, PtrTarget, } from "./kinds/dns";
export { missingPaymentOperations, NO_PAYMENT_CAPABILITIES } from "./kinds/payment";
export type { ChargeOutcome, ChargeRequest, CheckoutOutcome, CheckoutRequest, GatewayEvent, MethodSetupOutcome, MethodSetupRequest, PaymentCapabilities, PaymentGatewayDescriptor, PaymentPurpose, RefundRequest, StoredMethodDetails, WebhookRequest, } from "./kinds/payment";

// ==== kinds/addon.d.ts ====
import type { HostContext } from "../host";
import type { ExtensionDescriptor } from "../manifest";
/**
 * Une option proposée par ce module pour un abonnement donné.
 *
 * `id` est stable *dans* le module, pas globalement — le noyau le combine avec l'identifiant du
 * module pour former une référence unique, sur le même principe que
 * `ProvisioningTarget.serviceId` : le module ne connaît que son propre espace de noms.
 */
export interface AddonOffering {
    id: string;
    name: string;
    description?: string;
    /** Hors taxe, comme `Product.priceCents` — même raison : la TVA dépend du client. */
    priceCents: number;
    currency: string;
}
/**
 * Ce que le noyau communique au module pour qu'il décide s'il propose une option et l'applique.
 *
 * Miroir de `ProvisioningTarget` (`kinds/provisioning.ts`) : rien ici ne vient directement du
 * schéma de la base, pour la même raison — un module ne reçoit jamais le client Prisma.
 */
export interface AddonSubscriptionContext {
    subscriptionId: string;
    productId: string;
    /**
     * Module de provisioning livrant ce produit (ex. `"proxmox-ve"`), ou `null` pour un produit sans
     * machine. Permet à un module d'options de ne se proposer que pour les abonnements d'un pilote
     * donné : une allocation de port supplémentaire n'a de sens que pour un serveur de jeu livré par
     * un panel comme Pterodactyl, pas pour une VM Proxmox — c'est au module d'options d'en décider,
     * le noyau ne fait que le lui dire.
     */
    driverId: string | null;
    /**
     * Identifiant du service chez le fournisseur qui le livre (`ProvisioningResult.remoteId` tel que
     * le module de provisioning l'a rendu), ou `null` tant que le service n'est pas livré — ou pour
     * un produit sans machine. C'est ce qui permet à un module d'options d'**agir** réellement chez
     * le prestataire (rattacher un port à ce serveur-là, activer une licence sur cette machine-là)
     * plutôt que de tenir une simple comptabilité interne. Un module qui en a besoin et le reçoit
     * `null` doit lever : l'échec est visible du support (`SubscriptionAddon.provisioningNote`), un
     * silence ne l'est pas.
     */
    remoteId: string | null;
    quantity: number;
}
/**
 * Ce que `onAttach` peut rendre en plus de réussir — additif, sur le modèle de
 * `ProvisioningOutcome` (`kinds/provisioning.ts`). Sans elle, un module qui alloue une ressource
 * portant une identité pour le client (un numéro de port, une adresse) n'avait aucun moyen de la
 * lui communiquer : `SubscriptionAddon.provisioningNote` n'était renseignée qu'en cas d'échec, et
 * le portail l'affiche pourtant quel que soit l'état.
 */
export interface AddonOutcome {
    /** Message destiné au client, posé dans `SubscriptionAddon.provisioningNote` — ex. « Port alloué : 25565 ». */
    note?: string;
}
/**
 * Contrat d'un module qui propose ses propres options d'abonnement, avec un effet réel à
 * l'ajout/au retrait — par opposition au catalogue interne (`AddonProduct`), purement tarifaire et
 * géré par le staff. Un module qui n'a rien à *faire* à l'ajout n'a pas sa place ici : autant créer
 * une entrée dans le catalogue interne.
 */
export interface AddonDescriptor<TConfig = Record<string, unknown>> extends ExtensionDescriptor<TConfig> {
    kind: "addon";
    /**
     * Options que ce module propose pour cet abonnement précis. Peut en écarter selon `driverId` ou
     * tout autre critère propre au module — c'est lui qui juge de sa pertinence, pas le noyau.
     */
    offeringsFor(ctx: HostContext, subscription: AddonSubscriptionContext): Promise<AddonOffering[]>;
    /**
     * Effet réel de l'ajout — ex. allouer un port chez Pterodactyl. Appelé après que la facture
     * d'ajustement (ou son absence) soit posée côté commercial : un échec ici ne doit jamais faire
     * disparaître une ligne déjà facturée, seulement laisser une note pour le support.
     *
     * Rejouable : appelée depuis un chemin qui peut être retenté après un échec réseau, elle doit
     * pouvoir s'exécuter deux fois sur la même offre sans dupliquer l'allocation — même exigence que
     * `ProvisioningDescriptor.create`.
     *
     * Le retour est optionnel : un module qui n'a rien à communiquer peut toujours ne rien rendre.
     */
    onAttach(ctx: HostContext, offeringId: string, subscription: AddonSubscriptionContext): Promise<AddonOutcome | void>;
    /** Symétrique : libère ce que `onAttach` avait alloué. Même exigence d'idempotence. */
    onDetach(ctx: HostContext, offeringId: string, subscription: AddonSubscriptionContext): Promise<void>;
}
/**
 * Vérifie qu'un module du genre `addon` expose bien les trois méthodes du contrat, et rend les
 * manques.
 *
 * Contrairement aux autres genres, aucune n'est optionnelle et il n'y a pas de `capabilities` à
 * cocher : un module qui n'implémenterait pas les trois n'a rien à faire ici — le catalogue
 * interne (`AddonProduct`) couvre déjà les options purement tarifaires, sans passer par une
 * extension.
 */
export declare function missingAddonOperations(descriptor: Partial<Pick<AddonDescriptor, "offeringsFor" | "onAttach" | "onDetach">>): string[];

// ==== kinds/dns.d.ts ====
import type { HostContext } from "../host";
import type { ExtensionDescriptor } from "../manifest";
/**
 * Ce qu'un module dns sait faire.
 *
 * Grosses mailles plutôt que CRUD par enregistrement : `syncZone` reçoit l'état complet voulu pour
 * la zone et fait le diff lui-même (créer/mettre à jour/supprimer les rrsets), sur le modèle de
 * `RegistrarDescriptor` — un fournisseur DNS expose presque toujours une API par zone entière
 * (PowerDNS, la plupart des registrars), jamais un enregistrement isolé.
 */
export interface DnsCapabilities {
    createZone: boolean;
    deleteZone: boolean;
    syncZone: boolean;
    /** Pose/efface un enregistrement PTR pour une IP assignée à un client — voir `setPtr`. */
    ptr: boolean;
}
export declare const NO_DNS_CAPABILITIES: DnsCapabilities;
export type DnsOperation = keyof DnsCapabilities;
/** Types d'enregistrement pris en charge en v1. Validés côté noyau — voir la validation dans `apps/api/src/dns`. */
export declare const DNS_RECORD_TYPES: readonly ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"];
export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];
/**
 * Un enregistrement DNS tel que le noyau le transmet à un module. Toujours *relatif* à la zone :
 * `name: "@"` désigne l'apex, `name: "www"` désigne `www.<zone>`. Le module reconstruit le nom
 * qualifié lui-même — il connaît déjà la zone (`DnsZoneTarget.name`).
 */
export interface DnsRecordInput {
    type: DnsRecordType;
    name: string;
    content: string;
    ttl: number;
    /** Requis pour MX/SRV, `null` pour tout autre type — imposé par la validation côté noyau. */
    priority: number | null;
}
/**
 * Ce que le noyau demande à un module de synchroniser pour une zone précise.
 *
 * Miroir de `RegistrarTarget` : rien ici ne vient directement du schéma de la base, un module ne
 * reçoit jamais le client Prisma.
 */
export interface DnsZoneTarget {
    /** Identifiant local de la zone. Opaque pour le module. */
    zoneId: string;
    /** Nom de la zone, ex. `"example.com"` — jamais de point final. */
    name: string;
    /** Référence de la zone chez le fournisseur, telle que `createZone` l'a rendue. `null` avant. */
    remoteId: string | null;
    /** Ce que le module avait demandé au noyau de retenir. Vide s'il n'a rien retenu. */
    remoteMeta: Record<string, unknown>;
    /** État complet voulu pour la zone — `syncZone` fait le diff, jamais un appel incrémental. */
    records: DnsRecordInput[];
}
/** Ce qu'une opération rend au noyau. Tous les champs sont optionnels, sur le modèle de `RegistrarOutcome`. */
export interface DnsOutcome {
    remoteId?: string;
    /** Remplace, ne fusionne pas — même règle que `Domain.registrarRemoteMeta`. */
    remoteMeta?: Record<string, unknown>;
    note?: string;
}
/**
 * Ce que le noyau demande à un module de poser/effacer pour une IP précise.
 *
 * Contrairement à `DnsZoneTarget`, ne porte ni nom de zone ni enregistrements : la zone
 * `in-addr.arpa`/`ip6.arpa` qui accueille réellement un PTR appartient à l'hébergeur, jamais au
 * client (voir `ROADMAP.md`), et c'est au module de la retrouver depuis `ip`/`ipVersion` — le
 * noyau ne qualifie jamais de nom reverse à sa place, même règle que `DnsZoneTarget.name` qui
 * reste relatif et laisse le module reconstruire ce que son fournisseur précis attend.
 */
export interface PtrTarget {
    /** Identifiant local de la demande. Opaque pour le module. */
    ptrRecordId: string;
    ip: string;
    ipVersion: 4 | 6;
    /** Référence chez le fournisseur, telle qu'un appel précédent l'a rendue. `null` avant. */
    remoteId: string | null;
    /** Ce que le module avait demandé au noyau de retenir. Vide s'il n'a rien retenu. */
    remoteMeta: Record<string, unknown>;
}
/**
 * Contrat d'un module dns : héberger des zones et leurs enregistrements pour le compte du client.
 *
 * Config à un seul niveau (`configFields`/`parseConfig` du socle commun), pas de fournisseur
 * séparé comme `RegistrarDescriptor` — un module dns pilote un unique service DNS par
 * installation (patron Stripe/SMTP), pas plusieurs comptes registrar.
 *
 * Comme pour `RegistrarDescriptor`, aucune méthode d'exécution n'a accès à la base, et toutes sont
 * appelées depuis une file qui rejoue en cas d'échec : **elles doivent être idempotentes** —
 * `createZone` peut être rappelée avec une zone déjà créée côté fournisseur (à traiter comme un
 * succès, pas une erreur), `syncZone` pousse un état complet donc un rejeu est par construction
 * sans effet de bord, `deleteZone` rappelée sur une zone déjà supprimée doit réussir.
 */
export interface DnsDescriptor<TConfig = Record<string, unknown>> extends ExtensionDescriptor<TConfig> {
    kind: "dns";
    capabilities: DnsCapabilities;
    /** Serveurs de noms publics à annoncer au client, pour qu'il les pointe chez son registrar. */
    nameserversOf(config: TConfig): string[];
    createZone?(ctx: HostContext, target: DnsZoneTarget): Promise<DnsOutcome>;
    deleteZone?(ctx: HostContext, target: DnsZoneTarget): Promise<DnsOutcome>;
    syncZone?(ctx: HostContext, target: DnsZoneTarget): Promise<DnsOutcome>;
    /**
     * Pose (`hostname` renseigné) ou efface (`hostname: null`) le PTR de `target.ip`. Rappelée avec
     * le même `hostname` déjà en place doit réussir sans effet (idempotence, même règle que
     * `createZone`/`syncZone`) ; rappelée sur un PTR déjà absent (`hostname: null` répété) doit
     * réussir aussi.
     */
    setPtr?(ctx: HostContext, target: PtrTarget, hostname: string | null): Promise<DnsOutcome>;
}
/**
 * Vérifie qu'un module tient ce que ses capacités annoncent, et rend les manques. Appelé au
 * chargement plutôt qu'à l'appel — voir `missingRegistrarOperations`, même raison. `ptr` est
 * traitée à part, sur le même patron que `whoisPrivacy`/`setWhoisPrivacy` côté registrar : elle se
 * tient par `setPtr`, dont le nom diffère de la capacité.
 */
export declare function missingDnsOperations(descriptor: Pick<DnsDescriptor<never>, "capabilities"> & Partial<Record<DnsOperation | "setPtr", unknown>>): DnsOperation[];

// ==== kinds/notification.d.ts ====
import type { HostContext } from "../host";
import type { CoreEvent, CoreEventPayloads } from "../events";
import type { ExtensionDescriptor } from "../manifest";
/**
 * Un événement relayé à un canal, tel que le bus le comprend.
 *
 * `type` n'est pas restreint à `CoreEvent` : un module remonte aussi les siens via
 * `HostContext.emit`, préfixés `extension.<moduleId>.<événement>`. Un canal ne connaît pas à
 * l'avance le vocabulaire de tous les modules installés — le restreindre ici l'empêcherait de
 * jamais recevoir un événement propre à un module tiers.
 *
 * `payload` se resserre quand `E` est un littéral de `CoreEvent` connu, ex.
 * `NotificationEvent<"invoice.paid">` donne `{ invoiceId: string; totalCents: number }`. Le
 * paramètre par défaut (`string`) ne vérifie aucun littéral particulier : `E extends CoreEvent` y
 * est faux, et `payload` reste `Record<string, unknown>` — la signature de `send` ci-dessous ne
 * change donc pas pour un canal qui ne se sert pas de ce narrowing.
 */
export interface NotificationEvent<E extends string = string> {
    type: E;
    payload: E extends CoreEvent ? CoreEventPayloads[E] : Record<string, unknown>;
    occurredAt: string;
}
export interface NotificationOutcome {
    delivered: boolean;
    error?: string;
}
/**
 * Contrat d'un canal de notification (Discord, Slack, Telegram, SMS…) : un module qui écoute des
 * événements et les pousse vers une destination fixe, configurée une fois dans le panel.
 *
 * Tous les modules du genre `notification` n'implémentent pas forcément `send` — SMTP en est un
 * qui ne l'est pas : il n'est pas piloté par le bus, `EmailService` l'appelle directement pour des
 * e-mails à destinataire choisi par l'appelant. Le bus distingue les deux par la présence de la
 * méthode, pas par un indicateur déclaratif séparé qui pourrait mentir.
 */
export interface NotificationChannelDescriptor<TConfig = Record<string, unknown>> extends ExtensionDescriptor<TConfig> {
    kind: "notification";
    /** Événements auxquels ce canal réagit. Absent : tous les événements canoniques. */
    supportedEvents?: readonly string[];
    send(ctx: HostContext, event: NotificationEvent): Promise<NotificationOutcome>;
    /** Bouton « Envoyer un essai » du panel. Optionnel : tous les canaux ne le justifient pas. */
    sendTest?(ctx: HostContext): Promise<NotificationOutcome>;
}
/** Un module `notification` est-il pilotable par le bus d'événements ? */
export declare function isEventDrivenChannel(descriptor: ExtensionDescriptor): descriptor is NotificationChannelDescriptor;

// ==== kinds/payment.d.ts ====
import type { HostContext } from "../host";
import type { ExtensionDescriptor } from "../manifest";
/**
 * Ce qu'une passerelle sait faire. Déclaré, jamais supposé.
 *
 * L'interface client n'affiche que ce qui est réellement possible : proposer « rembourser » à un
 * module de virement bancaire, qui n'a aucune prise sur le compte du client, produirait un bouton
 * qui échoue. Et le renouvellement automatique ne retient que les passerelles capables de
 * prélever hors session — sans quoi il attendrait indéfiniment un encaissement qui ne viendra pas.
 */
export interface PaymentCapabilities {
    /** Prélever sans que le client soit devant son écran. Condition du renouvellement automatique. */
    offSession: boolean;
    /** Rembourser depuis le panel. */
    refund: boolean;
    /** Recevoir et vérifier des notifications du prestataire. */
    webhook: boolean;
    /** Conserver un moyen de paiement réutilisable pour ce client. */
    storedMethods: boolean;
    /**
     * Enregistrer un moyen de paiement **hors de tout paiement**, pour le réutiliser ensuite.
     *
     * Distincte de `storedMethods`, qui ne dit que « je sais décrire et détacher ce qu'un règlement
     * a laissé derrière lui ». Sans celle-ci, un client dont la carte expire n'a aucun moyen de la
     * remplacer avant l'échec : il lui faut attendre une facture due pour repasser par un paiement.
     * Optionnelle parce que toutes les passerelles n'en sont pas capables — un virement bancaire n'a
     * rien à enregistrer, et une passerelle sans page d'empreinte ne peut rien proposer.
     */
    methodSetup: boolean;
}
/**
 * Aucune capacité. Même rôle que `NO_DNS_CAPABILITIES`/`NO_REGISTRAR_CAPABILITIES` : jusqu'ici
 * chaque genre en avait redéfini une localement dans son fichier de test au lieu de l'exporter
 * d'ici, et `provisioning.ts` l'exportait sous le nom générique `NO_CAPABILITIES`, jamais
 * `NO_PROVISIONING_CAPABILITIES` — une incohérence sans conséquence pour un module tiers, qui n'a
 * jamais besoin de ces constantes, mais qui gênait quiconque cherchait le même nom d'un genre à
 * l'autre.
 */
export declare const NO_PAYMENT_CAPABILITIES: PaymentCapabilities;
/** Ce qui est réglé, du point de vue du noyau. */
export type PaymentPurpose = "invoice" | "order";
export interface CheckoutRequest {
    purpose: PaymentPurpose;
    /**
     * Identifiant local de ce qui est payé (facture ou produit commandé). La passerelle le
     * transporte sans l'interpréter et le restitue dans l'événement : c'est ce qui permet au noyau
     * de retrouver la facture sans que la passerelle connaisse son schéma.
     */
    reference: string;
    /**
     * Référence telle qu'un humain la recopie : numéro de facture, numéro de commande.
     *
     * Distincte de `reference`, qui est un identifiant technique. Un virement bancaire se pointe à
     * la main sur le libellé saisi par le client — et personne ne recopie correctement un
     * identifiant de vingt-cinq caractères aléatoires dans le champ « motif » de sa banque. Absente
     * quand le noyau n'a encore rien numéroté (une commande dont la facture naîtra au paiement) :
     * le module retombe alors sur `reference`.
     */
    displayReference?: string;
    /** Montant **toutes taxes comprises** : c'est ce que le client débourse. */
    amountCents: number;
    currency: string;
    /** Libellé montré au client sur la page de paiement. */
    description: string;
    customer: {
        id: string;
        email: string;
        name?: string | null;
        /** Référence du client chez ce prestataire, si le noyau en a déjà mémorisé une. */
        gatewayCustomerRef?: string | null;
    };
    returnUrl: string;
    cancelUrl: string;
    /** Réémises telles quelles dans l'événement — le noyau y range ce dont il aura besoin. */
    metadata?: Record<string, string>;
}
/**
 * Comment le client règle, selon la passerelle.
 *
 * Deux formes irréductibles l'une à l'autre : une redirection vers le prestataire, ou des
 * instructions à afficher. Le virement bancaire n'a pas d'URL et n'encaisse rien tout de suite —
 * forcer une redirection pour tout le monde reviendrait à l'exclure du système.
 */
export type CheckoutOutcome = {
    kind: "redirect";
    url: string;
    /** Référence de la transaction chez le prestataire, quand elle existe déjà. */
    gatewayRef?: string;
    /** Référence client créée à cette occasion, à mémoriser pour les prélèvements suivants. */
    gatewayCustomerRef?: string;
} | {
    kind: "instructions";
    heading: string;
    lines: string[];
    /** Référence que le client doit rappeler — c'est la clé du rapprochement bancaire. */
    gatewayRef: string;
    /**
     * `true` quand la facture reste due après cette étape. Le virement n'encaisse rien : la
     * marquer payée à l'affichage des coordonnées livrerait le service avant l'argent.
     */
    stillDue: true;
};
export interface ChargeRequest {
    /** Facture à régler. Restituée dans l'événement et dans les métadonnées du prestataire. */
    reference: string;
    amountCents: number;
    currency: string;
    gatewayCustomerRef: string;
    gatewayMethodRef: string;
}
/**
 * Issue d'un prélèvement hors session.
 *
 * `requires_action` est distinct de `failed` à dessein : une banque européenne qui réclame une
 * authentification forte ne refuse pas le paiement, elle veut voir le client. Confondre les deux
 * suspendrait des clients parfaitement solvables.
 *
 * `pending` est du même ordre, pour un moyen dont le règlement prend plusieurs jours (un mandat
 * SEPA, typiquement) : ni un succès immédiat, ni un refus — le noyau doit attendre un événement
 * ultérieur (`payment.succeeded`/`payment.failed`) avant de savoir. Confondre `pending` avec
 * `failed` ferait échouer une tentative de prélèvement qui, en réalité, suit son cours.
 */
export type ChargeOutcome = {
    status: "succeeded";
    gatewayRef: string;
} | {
    status: "failed";
    gatewayRef?: string;
    message?: string;
} | {
    status: "requires_action";
    gatewayRef?: string;
    message?: string;
} | {
    status: "pending";
    gatewayRef: string;
}
/** Aucun moyen de paiement mémorisé : ce n'est pas un échec de paiement, rien n'a été tenté. */
 | {
    status: "no_method";
};
/**
 * Demande d'enregistrement d'un moyen de paiement, sans rien encaisser.
 *
 * Ne porte ni montant ni référence de facture : ce n'est pas un paiement. Le client y est identifié
 * pour que la passerelle rattache la carte au bon dossier chez le prestataire — c'est ce
 * rattachement, et lui seul, qui rendra le prélèvement hors session possible ensuite.
 */
export interface MethodSetupRequest {
    customer: {
        id: string;
        email: string;
        name?: string | null;
        /** Référence du client chez ce prestataire, si le noyau en a déjà mémorisé une. */
        gatewayCustomerRef?: string | null;
    };
    returnUrl: string;
    cancelUrl: string;
    /** Réémises telles quelles dans l'événement — le noyau y range ce dont il aura besoin. */
    metadata?: Record<string, string>;
}
/**
 * Où envoyer le client pour qu'il saisisse son moyen de paiement.
 *
 * Une seule forme, contrairement à `CheckoutOutcome` : des « instructions » n'ont pas de sens ici.
 * Une passerelle qui n'a rien à faire saisir n'a pas à déclarer `methodSetup`.
 */
export interface MethodSetupOutcome {
    kind: "redirect";
    url: string;
    /**
     * Référence client créée à cette occasion, à mémoriser. Souvent le premier contact avec le
     * prestataire pour ce client : la carte est enregistrée avant qu'aucune facture n'ait été réglée.
     */
    gatewayCustomerRef?: string;
}
export interface WebhookRequest {
    /**
     * Corps **brut**, non parsé. Toute vérification de signature porte sur les octets reçus : un
     * JSON re-sérialisé ne produit pas la même empreinte.
     */
    rawBody: Buffer;
    headers: Record<string, string | undefined>;
}
/**
 * Événement normalisé, tel que le noyau le comprend — quel que soit le prestataire.
 *
 * `ignored` est une réponse à part entière : les prestataires envoient quantité d'événements qui
 * ne concernent pas l'encaissement, et un module doit pouvoir dire « rien à faire » sans que le
 * noyau ait à connaître son vocabulaire.
 */
export type GatewayEvent = {
    type: "payment.succeeded";
    purpose: PaymentPurpose;
    reference: string;
    gatewayRef: string;
    gatewayCustomerRef?: string | null;
    gatewayMethodRef?: string | null;
    metadata: Record<string, string>;
} | {
    type: "payment.disputed";
    gatewayRef: string;
}
/**
 * Un paiement précédemment `pending` (voir `ChargeOutcome`) échoue finalement — un mandat SEPA
 * rejeté par la banque du client, par exemple, quelques jours après la tentative.
 *
 * Distinct de `payment.disputed`, qui suppose un règlement déjà validé (facture `PAID`) et
 * contesté après coup. Ici, la facture n'a jamais quitté son état `SENT`/`OVERDUE` — seul le
 * `Payment` en attente doit être débloqué pour que le cycle de relance reprenne son cours normal.
 */
 | {
    type: "payment.failed";
    gatewayRef: string;
}
/**
 * Un moyen de paiement vient d'être enregistré, sans qu'un centime ait changé de main.
 *
 * Volontairement séparé de `payment.succeeded` : les confondre ferait passer une facture pour
 * réglée alors que le client n'a fait que déposer une carte. `reference` porte l'identifiant que
 * le noyau avait confié à `createMethodSetup` (l'identifiant du client) — la passerelle le
 * transporte sans l'interpréter, comme pour un paiement.
 */
 | {
    type: "method.stored";
    reference: string;
    gatewayCustomerRef: string;
    gatewayMethodRef: string;
    metadata: Record<string, string>;
}
/**
 * Un remboursement fait depuis le tableau de bord du prestataire, hors de tout appel à
 * `refund()`. `gatewayRef` désigne l'encaissement d'origine — celui déjà posé sur `Payment.
 * gatewayRef` — et `refundRef` le remboursement lui-même, clé d'idempotence pour un webhook
 * rejoué. Sans cet événement, un remboursement fait chez le prestataire laisse la facture locale
 * `PAID` : le client a récupéré son argent et le service continue de tourner.
 */
 | {
    type: "payment.refunded";
    gatewayRef: string;
    refundRef: string;
    amountCents: number;
    currency: string;
    reason?: string;
}
/**
 * Un litige (`payment.disputed`) se referme, dans un sens ou dans l'autre. `won` : l'hébergeur
 * a gagné, la facture reste ce qu'elle était avant le litige. `lost` : les fonds sont repartis
 * chez le prestataire — comptablement un remboursement, mais que ni Stripe ni PayPal ne notifient
 * par leur événement de remboursement habituel, d'où la variante séparée.
 */
 | {
    type: "payment.dispute.closed";
    gatewayRef: string;
    outcome: "won" | "lost";
} | {
    type: "ignored";
};
/**
 * Moyen de paiement mémorisé, réduit à ce qui sert à l'affichage.
 *
 * `type`, `ibanLast4` et `bankCode` sont optionnels — pour rester additif : les modules déjà
 * compilés contre une version antérieure du contrat, qui ne renseignent que les champs carte,
 * continuent de fonctionner sans modification. `type` absent vaut `"card"`. `ibanLast4`/`bankCode`
 * sont absents ou `null` pour une carte, `brand`/`last4`/`expMonth`/`expYear` le sont pour un
 * mandat SEPA (sans marque ni expiration).
 */
export interface StoredMethodDetails {
    ref: string;
    type?: "card" | "sepa_debit";
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    /** Quatre derniers caractères de l'IBAN. Absent/`null` hors mandat SEPA. */
    ibanLast4?: string | null;
    /** Code de la banque du client (ex. code BIC/guichet). Absent/`null` hors mandat SEPA. */
    bankCode?: string | null;
}
export interface RefundRequest {
    gatewayRef: string;
    amountCents: number;
    /**
     * Devise de l'encaissement d'origine.
     *
     * Un prestataire refuse un remboursement libellé autrement, et tous ne la déduisent pas de la
     * transaction visée : sans elle, un module devrait la deviner, ce qui revient à supposer que
     * l'hébergeur n'encaisse qu'en euros.
     */
    currency: string;
    reason?: string;
}
/**
 * Contrat d'une passerelle de paiement.
 *
 * Les méthodes optionnelles le sont conformément aux `capabilities` déclarées : un module qui
 * annonce `offSession: true` doit implémenter `chargeOffSession`. Le noyau ne fait jamais d'appel
 * qu'une capacité n'autorise pas.
 *
 * Aucune méthode ne reçoit d'accès à la base : la passerelle reçoit ce dont elle a besoin en
 * paramètre et rend un résultat normalisé. C'est ce qui permet au noyau de faire évoluer son
 * schéma sans casser les modules — voir `COMPATIBILITY.md`.
 */
export interface PaymentGatewayDescriptor<TConfig = Record<string, unknown>> extends ExtensionDescriptor<TConfig> {
    kind: "payment";
    capabilities: PaymentCapabilities;
    /** Libellé du bouton présenté au client, ex. « Payer par carte ». */
    checkoutLabel: string;
    createCheckout(ctx: HostContext, request: CheckoutRequest): Promise<CheckoutOutcome>;
    chargeOffSession?(ctx: HostContext, request: ChargeRequest): Promise<ChargeOutcome>;
    /**
     * Ouvre une saisie de moyen de paiement sans encaissement.
     *
     * L'enregistrement effectif n'est pas rendu ici mais notifié plus tard par `method.stored` :
     * quand le client revient sur `returnUrl`, le prestataire n'a pas toujours fini de valider la
     * carte (authentification forte), et lui répondre « c'est enregistré » à ce moment-là serait
     * parfois faux.
     */
    createMethodSetup?(ctx: HostContext, request: MethodSetupRequest): Promise<MethodSetupOutcome>;
    verifyWebhook?(ctx: HostContext, request: WebhookRequest): Promise<GatewayEvent>;
    /** Détail d'affichage d'un moyen de paiement mémorisé. `null` s'il n'existe plus. */
    describeStoredMethod?(ctx: HostContext, methodRef: string): Promise<StoredMethodDetails | null>;
    /** Détache un moyen de paiement — appelé à l'effacement d'un client (art. 17 RGPD). */
    detachStoredMethod?(ctx: HostContext, methodRef: string): Promise<void>;
    refund?(ctx: HostContext, request: RefundRequest): Promise<{
        gatewayRef: string;
    }>;
}
/** Les capacités adossées à une seule méthode optionnelle. */
declare const OPERATION_NAMES: readonly ["chargeOffSession", "verifyWebhook", "refund", "createMethodSetup"];
/**
 * `storedMethods` est la seule capacité qui en recouvre deux : afficher un moyen mémorisé et le
 * détacher. Elle est donc vérifiée à part de la table ci-dessus, mais **par la même fonction** —
 * ce contrôle a longtemps vécu dans `scripts/check-extension.ts` seul, si bien qu'un module qui
 * annonçait `storedMethods` sans savoir détacher passait le chargement et n'échouait qu'à
 * l'effacement d'un client, au titre de l'article 17 du RGPD.
 */
declare const STORED_METHOD_NAMES: readonly ["describeStoredMethod", "detachStoredMethod"];
type PaymentOperationName = (typeof OPERATION_NAMES)[number] | (typeof STORED_METHOD_NAMES)[number];
/**
 * Vérifie qu'un module de paiement tient ce que ses capacités annoncent, et rend les manques.
 *
 * Miroir de `missingProvisioningOperations` (`kinds/provisioning.ts`) : découvrir qu'un module
 * ment sur ses capacités au moment où un client clique, c'est déjà trop tard — la commande est
 * payée. Appelée au chargement (`discover.ts`) **et** par l'outil de vérification que lance un
 * auteur tiers : les deux doivent juger à l'identique, sinon `pnpm check-extension` cesse de
 * prédire ce que fera l'instance.
 */
export declare function missingPaymentOperations(descriptor: Pick<PaymentGatewayDescriptor, "capabilities"> & Partial<Record<PaymentOperationName, unknown>>): string[];
export {};

// ==== kinds/provisioning.d.ts ====
import type { ConfigField } from "../config-fields";
import type { HostContext } from "../host";
import type { ExtensionDescriptor } from "../manifest";
/**
 * Ce qu'un module de provisioning sait faire.
 *
 * Déclaré plutôt que supposé : l'interface client masque les actions qu'un module ne prend pas en
 * charge, au lieu de les proposer et d'échouer une fois le bouton pressé. Un module de livraison
 * manuelle ne sait rien redémarrer, et un client ne doit pas découvrir ça en essayant.
 *
 * Tous les drapeaux sont obligatoires : un module qui oublie d'en déclarer un dirait « je ne sais
 * pas faire » alors qu'il sait — ou l'inverse. Autant forcer la réponse.
 */
export interface ProvisioningCapabilities {
    create: boolean;
    suspend: boolean;
    resume: boolean;
    delete: boolean;
    /** Changement d'offre appliqué à la ressource existante, sans la recréer. */
    resize: boolean;
    reboot: boolean;
    /** Accès console distant (noVNC, SPICE, série…). */
    console: boolean;
    backup: boolean;
    restore: boolean;
    reinstall: boolean;
    /** Snapshots à la demande, distincts de `backup` : instantané local rapide (rollback), pas une copie hors du cluster. */
    snapshot: boolean;
}
/** Aucune capacité. Base commode pour un module qui n'en déclare que quelques-unes. */
export declare const NO_CAPABILITIES: ProvisioningCapabilities;
/**
 * Même valeur que `NO_CAPABILITIES` (conservé pour ne rien casser de ce qui l'importe déjà), sous
 * le nom que portent ses équivalents des autres genres — `NO_DNS_CAPABILITIES`,
 * `NO_PAYMENT_CAPABILITIES`, `NO_REGISTRAR_CAPABILITIES`. Seul `provisioning` avait échappé à cette
 * convention.
 */
export declare const NO_PROVISIONING_CAPABILITIES: ProvisioningCapabilities;
/** Les actions du cycle de vie, nommées une fois pour que noyau et modules parlent la même langue. */
export type ProvisioningOperation = keyof ProvisioningCapabilities;
/**
 * Caractéristiques vendues avec l'offre, telles que le catalogue les annonce au client.
 *
 * Le noyau les transmet sans les interpréter : à chaque module de décider ce qu'un « disque de
 * 40 Go » veut dire chez lui — un volume qcow2, un datastore VMware, un quota cPanel. `null`
 * lorsqu'une offre n'en déclare aucune, ce qui est le cas courant d'un service sans machine
 * (nom de domaine, prestation, licence).
 */
export interface ResourceSpec {
    cpu: number;
    ramMb: number;
    diskGb: number;
}
/** Une adresse allouée, telle que le noyau la connaît (`IpPool`/`IpAssignment`) — jamais une
 *  adresse choisie par le module lui-même. */
export interface ProvisioningNetworkAddress {
    address: string;
    prefixLength: number;
    /** Absente si le pool ne déclare pas de passerelle (rare, mais valide). */
    gateway?: string;
}
/**
 * Ce que le noyau a déjà alloué à ce service au moment de l'appel, pour un module qui a besoin de
 * configurer le réseau de l'invité lui-même (cloud-init, par exemple) plutôt que de compter sur un
 * DHCP côté hyperviseur. `undefined` : le service n'a pas d'IP allouée (pas de pool rattaché à
 * l'offre, ou pas encore alloué à cet instant du cycle de vie) — le module retombe alors sur son
 * propre comportement par défaut (DHCP, ou rien).
 */
export interface ProvisioningNetwork {
    ipv4?: ProvisioningNetworkAddress;
    ipv6?: ProvisioningNetworkAddress;
}
/**
 * Ce que le noyau demande à un module d'opérer.
 *
 * Un seul type pour toutes les opérations, plutôt qu'un par action : les modules se ressemblent
 * beaucoup plus par ce dont ils ont besoin que par ce qu'ils en font, et multiplier les types
 * obligerait à en ajouter un à chaque capacité nouvelle — donc à casser le contrat.
 *
 * Rien ici ne vient du schéma de la base. C'est la contrepartie de « pas de client Prisma dans le
 * `HostContext` » : si le module ne peut pas lire la base, le noyau doit lui remettre tout ce qui
 * lui manque, sous une forme qu'il contrôle et peut faire évoluer.
 */
export interface ProvisioningTarget<TProductConfig = Record<string, unknown>, TProviderConfig = Record<string, unknown>> {
    /**
     * Identifiant local du service. Opaque pour le module, qui s'en sert typiquement pour nommer la
     * ressource distante (`svc-…`) et la retrouver à l'œil dans l'interface de l'hyperviseur.
     */
    serviceId: string;
    /** Réglages de l'offre, déjà validés par `parseProductConfig`. */
    productConfig: TProductConfig;
    /**
     * Fournisseur ciblé, déchiffré et validé par `parseProviderConfig`. `null` pour un module qui
     * n'en utilise pas — une livraison manuelle ne se connecte à rien.
     */
    provider: TProviderConfig | null;
    /**
     * Référence de la ressource chez le fournisseur, telle que `create` l'a rendue. `null` tant que
     * rien n'a été créé : c'est la marque, pour le module, d'un service encore vide.
     */
    remoteId: string | null;
    /** Ce que le module avait demandé au noyau de retenir. Vide s'il n'a rien retenu. */
    remoteMeta: Record<string, unknown>;
    /** Caractéristiques de l'offre **courante** — celle d'après, lors d'un changement de formule. */
    spec: ResourceSpec | null;
    /** IP déjà allouée par le noyau à ce service, si l'offre a un pool rattaché — voir
     *  `ProvisioningNetwork`. `undefined` hors de `create`/`resume` ou sans pool configuré. */
    network?: ProvisioningNetwork;
}
/**
 * Ce qu'une opération rend au noyau.
 *
 * Tous les champs sont optionnels : la plupart des actions n'ont rien à signaler, et les rendre
 * obligatoires forcerait chaque module à écrire `return {}` sous une forme plus longue.
 */
export interface ProvisioningOutcome {
    /** Renseigné par `create`. Le noyau le persiste et le restituera à chaque appel suivant. */
    remoteId?: string;
    /**
     * Remplace intégralement les métadonnées retenues, il ne les complète pas. Une fusion silencieuse
     * empêcherait un module d'oublier une clé devenue fausse — un nœud après migration, par exemple.
     */
    remoteMeta?: Record<string, unknown>;
    /**
     * Ce que l'opération **n'a pas pu** appliquer, en une phrase destinée à un humain.
     *
     * Existe parce que le demi-succès est le cas normal ici, pas l'exception : Proxmox refuse de
     * réduire un disque, un hyperviseur refuse de baisser la RAM à chaud. Lever une erreur annulerait
     * un changement d'offre déjà facturé ; ne rien dire laisserait le client avec une machine qui ne
     * correspond pas à ce qu'il paie. Le noyau consigne cette note dans l'historique du changement.
     */
    note?: string;
    /**
     * `true` quand l'opération attend une intervention humaine pour être réellement effectuée.
     *
     * Le service reste alors « en attente » au lieu de passer actif. C'est ce qui distingue une
     * livraison manuelle d'une livraison automatique réussie : sans ce drapeau, un module sans
     * automatisation rendrait un succès et le client verrait « actif » un serveur que personne n'a
     * encore commandé. Le noyau ne suppose rien du travail restant, il se contente de ne pas
     * annoncer une livraison qui n'a pas eu lieu.
     */
    manualActionRequired?: boolean;
    /**
     * Délai après lequel le noyau doit **rappeler la même opération**, parce que le module a engagé
     * un travail dont il ne maîtrise pas le rythme.
     *
     * Existe parce que tous les fournisseurs ne livrent pas à l'appel. Une API qui prend commande —
     * panier, bon de commande, paiement — répond « c'est enregistré », puis livre des minutes ou des
     * heures plus tard, sans jamais rappeler personne : c'est au noyau d'aller voir.
     * `manualActionRequired` ne couvrait pas ce cas, il laisse le service en attente sans rien pour
     * l'en sortir, et un module ne peut pas se réveiller tout seul — il n'a ni file ni horloge.
     *
     * Le service reste « en attente » entre deux passages, exactement comme avec
     * `manualActionRequired`. Les deux disent la même chose au client, et ne diffèrent que sur qui
     * reprend la main : un humain, ou le noyau lui-même.
     *
     * **C'est ici que l'idempotence exigée plus haut se paie.** Le module est rappelé avec le même
     * `target`, `remoteMeta` compris — c'est là qu'il range de quoi se reconnaître au réveil. Un
     * `create` qui ne relit pas la commande qu'il a déjà passée en passe une deuxième, et chez un
     * fournisseur payant cela se compte en argent réel.
     *
     * Le noyau borne la valeur et plafonne le nombre de rappels : au-delà, l'opération est déclarée
     * en échec plutôt que rejouée sans fin. Un module n'a donc ni à compter ses passages, ni à se
     * défendre d'une boucle.
     */
    retryAfterSeconds?: number;
}
/**
 * Accès console, sous les deux formes qu'on rencontre réellement.
 *
 * `url` couvre les fournisseurs qui rendent un lien signé prêt à ouvrir ; `vnc-ticket` couvre ceux
 * qui, comme Proxmox, délivrent un billet à présenter à un client noVNC que l'hôte héberge
 * lui-même. Réduire les deux à une URL obligerait le second à en fabriquer une, donc à connaître
 * l'adresse publique de l'hôte — ce qu'un module n'a aucun moyen de savoir.
 *
 * `expiresAt` accepte `Date | string`, même raison que `SnapshotInfo.createdAt` : un module qui
 * relit cette date depuis une réponse JSON n'a aucune raison de la faire passer par `new Date(...)`
 * avant de la rendre. Normalisée à la lecture par le consommateur de `console()`.
 */
export type ConsoleSession = {
    kind: "url";
    url: string;
    expiresAt?: Date | string;
} | {
    kind: "vnc-ticket";
    host: string;
    port: number;
    ticket: string;
    expiresAt?: Date | string;
};
/** Sauvegarde déclenchée. La taille n'est connue qu'une fois l'opération terminée, d'où l'optionnel. */
export interface BackupOutcome {
    /** Référence de la sauvegarde chez le fournisseur, si elle en porte une. */
    remoteRef?: string;
    sizeBytes?: number;
}
/**
 * Un instantané tel que le fournisseur le connaît — jamais persisté côté noyau : la liste vient à
 * chaque fois du module, comme `NodeCapacitySnapshot`, pour ne jamais désynchroniser d'un état
 * distant que le client peut aussi modifier ailleurs (panel Proxmox direct, par exemple).
 */
export interface SnapshotInfo {
    /** Référence chez le fournisseur (nom du snapshot Proxmox, par ex.) — opaque pour le noyau. */
    id: string;
    label: string;
    /**
     * `Date | string` : un module qui relit cette date depuis l'API JSON d'un fournisseur n'a aucune
     * raison de la faire passer par `new Date(...)` avant de la rendre. Le panel normalise à la
     * lecture (`self-service.service.ts`).
     */
    createdAt: Date | string;
}
/**
 * Ce qu'un fournisseur observe sur un nœud physique, à l'instant du relevé — jamais ce qui est
 * vendu (`ResourceSpec`), toujours ce qui est mesuré. `nodeId` est l'identifiant technique du
 * fournisseur (nom d'hôte Proxmox, etc.) : le noyau ne l'expose jamais tel quel côté public, il
 * s'en sert pour retrouver/attribuer un libellé public choisi par l'hébergeur.
 */
export interface NodeCapacitySnapshot {
    nodeId: string;
    online: boolean;
    cpuPercent: number | null;
    memPercent: number | null;
    diskPercent: number | null;
}
/**
 * Contrat *catalogue* d'un module de provisioning : décrire sa configuration, la valider, dire quel
 * fournisseur elle cible et la résumer pour la liste des produits.
 *
 * Les méthodes d'exécution sont optionnelles en TypeScript, mais leur présence est **imposée par
 * les `capabilities`** : un module qui déclare `suspend: true` sans écrire `suspend` sera refusé au
 * chargement. Le noyau n'appelle jamais une opération qu'une capacité n'autorise pas, ce qui rend
 * le `?` sûr côté module — et l'incohérence bruyante côté auteur, au lieu de produire un bouton qui
 * échoue une fois pressé.
 */
export interface ProvisioningDescriptor<TProductConfig = Record<string, unknown>, TProviderConfig = Record<string, unknown>> extends ExtensionDescriptor<Record<string, unknown>> {
    kind: "provisioning";
    capabilities: ProvisioningCapabilities;
    /**
     * Réglages d'une **instance de fournisseur** : un cluster Proxmox, un vCenter, un serveur cPanel.
     *
     * Troisième niveau de configuration, et le seul qui porte des identifiants d'accès. Il est
     * distinct des deux autres parce qu'un hébergeur exploite plusieurs clusters avec un seul module,
     * et vend plusieurs offres sur chaque cluster. Liste vide = module sans fournisseur, et le panel
     * cesse alors d'en réclamer un.
     */
    providerConfigFields: ConfigField[];
    /** Valide les réglages d'un fournisseur. Lève `ExtensionConfigError` s'ils sont inexploitables. */
    parseProviderConfig?(raw: unknown): TProviderConfig;
    /**
     * Éprouve la liaison avec un fournisseur, sur demande depuis le panel.
     *
     * Rend un message dans les deux cas : « connecté » sans détail n'apprend rien, et un échec sans
     * la raison oblige l'hébergeur à deviner entre une URL fausse, un jeton révoqué et un certificat
     * refusé.
     */
    checkProvider?(ctx: HostContext, provider: TProviderConfig): Promise<{
        ok: boolean;
        message: string;
    }>;
    /**
     * Réglages saisis **par offre du catalogue** : quel template cloner, quel gabarit de ressources.
     *
     * Distincts de `configFields`, qui règle le module une fois pour toutes. Un même module de
     * provisioning sert autant d'offres que l'hébergeur en vend, chacune avec son propre template —
     * les mélanger obligerait à un module par offre.
     */
    productConfigFields: ConfigField[];
    /** Valide la configuration d'une offre. Lève `ExtensionConfigError` si elle est inexploitable. */
    parseProductConfig(raw: unknown): TProductConfig;
    /**
     * Identifiant du fournisseur (cluster, vCenter, serveur…) ciblé par cette offre, ou `null` si le
     * module n'en utilise pas. Permet au noyau de déclencher un provisioning sans rien savoir du
     * module.
     */
    providerIdOf(config: TProductConfig): string | null;
    /** Résumé court pour la liste des produits, ex. « template 9000 · qemu ». */
    summarize(config: TProductConfig): string;
    create?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>): Promise<ProvisioningOutcome>;
    suspend?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>): Promise<ProvisioningOutcome>;
    resume?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>): Promise<ProvisioningOutcome>;
    delete?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>): Promise<ProvisioningOutcome>;
    /** Applique à la ressource existante l'offre courante, sans la recréer. Voir `note`. */
    resize?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>): Promise<ProvisioningOutcome>;
    reboot?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>): Promise<ProvisioningOutcome>;
    reinstall?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>): Promise<ProvisioningOutcome>;
    console?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>): Promise<ConsoleSession>;
    backup?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>): Promise<BackupOutcome>;
    /**
     * Restaure une sauvegarde déclenchée via `backup`, en place — écrase l'état courant de la
     * ressource, ne crée jamais de nouvelle ressource. `remoteRef` vient de `BackupOutcome.remoteRef`,
     * tel que persisté par le noyau sur `BackupJob` : opaque, seul le module qui l'a produit sait le
     * lire (URL vzdump Proxmox, snapshot ID vCenter…).
     */
    restore?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>, remoteRef: string): Promise<ProvisioningOutcome>;
    /**
     * Les quatre méthodes suivantes ne forment qu'une seule capacité (`snapshot`) : un module qui la
     * déclare doit toutes les fournir, pas un sous-ensemble — voir `missingProvisioningOperations`,
     * qui les vérifie ensemble plutôt qu'une par une comme le reste du cycle de vie.
     */
    listSnapshots?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>): Promise<SnapshotInfo[]>;
    createSnapshot?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>, params: {
        label?: string;
    }): Promise<SnapshotInfo>;
    deleteSnapshot?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>, snapshotId: string): Promise<void>;
    /** Restaure l'état capturé. La machine cible se retrouve dans l'état du snapshot, pas l'inverse. */
    rollbackSnapshot?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>, snapshotId: string): Promise<ProvisioningOutcome>;
    /**
     * Rapporte-t-il l'usage de ses nœuds physiques (CPU/RAM/disque) ? Séparé de `capabilities` à
     * dessein : ce n'est pas une action *par service* comme `suspend`/`resize`, mais une capacité du
     * fournisseur lui-même, interrogée indépendamment de tout service provisionné — la mélanger à
     * `ProvisioningCapabilities` la ferait apparaître à tort dans le dispatch d'actions par service.
     * Absent ou `false` : le module n'a simplement pas de notion de nœud physique (livraison
     * manuelle, panel de jeu sans accès à l'hôte…), ce qui est le cas courant.
     */
    reportsNodeCapacity?: boolean;
    /** Présent et exploitable si et seulement si `reportsNodeCapacity` vaut `true`. */
    listNodeCapacity?(ctx: HostContext, provider: TProviderConfig): Promise<NodeCapacitySnapshot[]>;
    /**
     * Rapporte-t-il l'usage d'un service livré (bande passante) ? Même principe que
     * `reportsNodeCapacity`, mais par service au lieu de par fournisseur : ce n'est toujours pas une
     * action déclenchée depuis le dispatch par service (`suspend`/`resize`…), donc hors de
     * `capabilities`, mais cette fois interrogée pour une cible précise plutôt que pour tout le
     * fournisseur. Absent ou `false` : le module n'a pas de compteur exploitable (livraison
     * manuelle, service sans notion de trafic réseau), ce qui reste le cas courant.
     */
    reportsUsage?: boolean;
    /**
     * Relevé instantané d'un compteur cumulé, jamais un delta — au noyau de comparer avec le relevé
     * précédent pour en tirer une consommation sur la période. Présent et exploitable si et
     * seulement si `reportsUsage` vaut `true`.
     */
    reportUsage?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>): Promise<ServiceUsageSnapshot>;
    /**
     * Rapporte-t-il l'espace de stockage occupé par un service livré ? Même principe que
     * `reportsUsage`, mais une capacité à part plutôt qu'un second champ sur `ServiceUsageSnapshot` :
     * le stockage occupé est une **jauge** (valeur instantanée), pas un compteur cumulé qui repart de
     * zéro au redémarrage — le mélanger à `reportUsage` obligerait le noyau à deviner laquelle des
     * deux sémantiques s'applique à quel champ. Absent ou `false` : le module n'a pas de mesure
     * fiable de l'espace occupé (le cas le plus courant : Proxmox ne le rapporte que pour un
     * conteneur LXC, pas pour une VM QEMU sans agent invité).
     */
    reportsStorageUsage?: boolean;
    /** Présent et exploitable si et seulement si `reportsStorageUsage` vaut `true`. */
    reportStorageUsage?(ctx: HostContext, target: ProvisioningTarget<TProductConfig, TProviderConfig>): Promise<StorageUsageSnapshot>;
}
/**
 * Compteur cumulé observé à l'instant du relevé sur un service livré — jamais persisté tel quel
 * côté noyau, qui n'en retient que le dernier relevé pour calculer un delta au relevé suivant
 * (`ProvisionedService.lastUsageCounterBytes`). Repart de zéro à chaque redémarrage de la
 * ressource distante (comportement des compteurs d'interface réseau habituels) : une chute du
 * compteur d'un relevé à l'autre signale ce redémarrage, pas une erreur.
 */
export interface ServiceUsageSnapshot {
    bandwidthBytesCumulative: number;
}
/**
 * Espace occupé, relevé à l'instant du sondage — une jauge, pas un compteur : contrairement à
 * `ServiceUsageSnapshot`, le noyau ne calcule pas de delta entre deux relevés, il retient le
 * maximum observé sur la période (voir `ProvisionedService.periodStorageGbPeak`), pour facturer
 * fidèlement un pic de consommation même redescendu avant la fin de la période.
 */
export interface StorageUsageSnapshot {
    storageBytes: number;
}
/**
 * Vérifie qu'un module tient ce que ses capacités annoncent, et rend les manques.
 *
 * Appelé au chargement plutôt qu'à l'appel : découvrir qu'un module ment sur ses capacités au
 * moment où un client clique, c'est déjà trop tard — la commande est payée. Rendre la liste plutôt
 * que lever laisse l'appelant choisir entre refuser le module et l'afficher en rouge dans le panel.
 */
/** Méthodes que `snapshot: true` engage — noms distincts de la capacité, donc vérifiés à part. */
declare const SNAPSHOT_METHOD_NAMES: readonly ["listSnapshots", "createSnapshot", "deleteSnapshot", "rollbackSnapshot"];
export declare function missingProvisioningOperations(descriptor: Pick<ProvisioningDescriptor<never, never>, "capabilities"> & Partial<Record<ProvisioningOperation, unknown>> & Partial<Record<(typeof SNAPSHOT_METHOD_NAMES)[number], unknown>>): ProvisioningOperation[];
/**
 * `true` si le module déclare `reportsNodeCapacity: true` sans fournir `listNodeCapacity` —
 * même défaut de cohérence que `missingProvisioningOperations`, pour une capacité hors du dispatch
 * par service.
 */
export declare function missingNodeCapacityReporting(descriptor: Pick<ProvisioningDescriptor<never, never>, "reportsNodeCapacity" | "listNodeCapacity">): boolean;
/**
 * `true` si le module déclare `reportsUsage: true` sans fournir `reportUsage` — même défaut de
 * cohérence que `missingNodeCapacityReporting`, pour un compteur par service au lieu de par
 * fournisseur.
 */
export declare function missingUsageReporting(descriptor: Pick<ProvisioningDescriptor<never, never>, "reportsUsage" | "reportUsage">): boolean;
/**
 * `true` si le module déclare `reportsStorageUsage: true` sans fournir `reportStorageUsage` —
 * même défaut de cohérence que `missingUsageReporting`, pour la jauge de stockage.
 */
export declare function missingStorageUsageReporting(descriptor: Pick<ProvisioningDescriptor<never, never>, "reportsStorageUsage" | "reportStorageUsage">): boolean;
export {};

// ==== kinds/registrar.d.ts ====
import type { ConfigField } from "../config-fields";
import type { HostContext } from "../host";
import type { ExtensionDescriptor } from "../manifest";
/**
 * Ce qu'un module registrar sait faire.
 *
 * Même principe que `ProvisioningCapabilities` (`kinds/provisioning.ts`) : déclaré plutôt que
 * supposé, pour que l'interface masque un bouton qu'un module ne prend pas en charge au lieu de le
 * proposer et d'échouer une fois pressé. Un module de livraison manuelle ne sait pas verrouiller un
 * transfert programmatiquement, et un client ne doit pas le découvrir en cliquant.
 */
export interface RegistrarCapabilities {
    checkAvailability: boolean;
    register: boolean;
    renew: boolean;
    transfer: boolean;
    updateNameservers: boolean;
    updateContact: boolean;
    setTransferLock: boolean;
    /** Masquage des coordonnées du titulaire dans le WHOIS public. */
    whoisPrivacy: boolean;
}
export declare const NO_REGISTRAR_CAPABILITIES: RegistrarCapabilities;
export type RegistrarOperation = keyof RegistrarCapabilities;
/**
 * Coordonnées du titulaire d'un domaine, telles qu'exigées par la plupart des registres (ICANN et
 * la majorité des ccTLD). Le noyau les transmet sans les interpréter : à chaque module de les
 * traduire vers les champs propres à son registrar.
 */
export interface DomainContact {
    firstName: string;
    lastName: string;
    organization?: string;
    email: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state?: string;
    postalCode: string;
    countryCode: string;
}
/**
 * Ce que le noyau demande à un module d'opérer sur un domaine précis.
 *
 * Miroir de `ProvisioningTarget` : rien ici ne vient directement du schéma de la base, pour la
 * même raison — un module ne reçoit jamais le client Prisma.
 */
export interface RegistrarTarget<TProductConfig = Record<string, unknown>, TProviderConfig = Record<string, unknown>> {
    /** Identifiant local du domaine. Opaque pour le module. */
    domainId: string;
    /** Nom complet, ex. `"example.com"`. */
    name: string;
    /** TLD isolé, ex. `".com"`. */
    tld: string;
    /** Réglages de l'offre (le TLD vendu), déjà validés par `parseProductConfig`. */
    productConfig: TProductConfig;
    /** Fournisseur ciblé, déchiffré et validé par `parseProviderConfig`. `null` si le module n'en utilise pas. */
    provider: TProviderConfig | null;
    /** Référence du domaine chez le registrar, telle que `register` l'a rendue. `null` avant l'enregistrement. */
    remoteId: string | null;
    /** Ce que le module avait demandé au noyau de retenir. Vide s'il n'a rien retenu. */
    remoteMeta: Record<string, unknown>;
    registrantContact: DomainContact;
    nameservers: string[];
}
/** Ce qu'une opération rend au noyau. Tous les champs sont optionnels, sur le modèle de `ProvisioningOutcome`. */
export interface RegistrarOutcome {
    remoteId?: string;
    remoteMeta?: Record<string, unknown>;
    /**
     * Renseignée par `register`/`renew`/`transfer` : nouvelle date d'expiration chez le registrar.
     *
     * `Date | string` plutôt que `Date` seul : la plupart des API REST de registrar rendent une
     * chaîne ISO, et rien n'oblige un module à la faire passer par `new Date(...)` avant de la
     * rendre — un module `// @ts-check` qui renvoie la chaîne telle quelle a raison de le faire. Le
     * noyau normalise à la lecture (`domain-actions.processor.ts`).
     */
    expiryDate?: Date | string;
    note?: string;
    /** Même sémantique que `ProvisioningOutcome.manualActionRequired` : le domaine reste « en attente » tant que vrai. */
    manualActionRequired?: boolean;
    /**
     * Même sémantique que `ProvisioningOutcome.retryAfterSeconds`, et pour la même raison : chez la
     * plupart des registrars, un enregistrement ou un transfert n'est pas acquis au retour de
     * l'appel. Un transfert attend l'accord du registre perdant, ce qui se compte en jours.
     *
     * Le domaine reste dans son état d'attente entre deux passages, et le module est rappelé avec le
     * même `target` — `remoteMeta` compris, où il aura rangé sa référence de commande.
     */
    retryAfterSeconds?: number;
}
export interface AvailabilityResult {
    available: boolean;
    /** `true` si le domaine est soumis à un tarif premium, distinct du tarif catalogue habituel du TLD. */
    premium?: boolean;
    /** Prix constaté chez le registrar pour ce nom précis, s'il diffère du tarif catalogue (cas premium). */
    priceCents?: number;
}
/**
 * Contrat *catalogue* d'un module registrar : décrire sa configuration, la valider, et résumer un
 * TLD pour la grille de tarification. Les méthodes d'exécution sont optionnelles en TypeScript,
 * mais leur présence est imposée par les `capabilities` — voir `missingRegistrarOperations`.
 *
 * Comme pour `ProvisioningDescriptor`, aucune méthode d'exécution n'a accès à la base, et toutes
 * sont appelées depuis une file qui rejoue en cas d'échec : **elles doivent être idempotentes**.
 */
export interface RegistrarDescriptor<TProductConfig = Record<string, unknown>, TProviderConfig = Record<string, unknown>> extends ExtensionDescriptor<Record<string, unknown>> {
    kind: "registrar";
    capabilities: RegistrarCapabilities;
    /** Réglages d'un compte registrar (clé API, identifiant revendeur…). Liste vide = module sans fournisseur (livraison manuelle). */
    providerConfigFields: ConfigField[];
    parseProviderConfig?(raw: unknown): TProviderConfig;
    checkProvider?(ctx: HostContext, provider: TProviderConfig): Promise<{
        ok: boolean;
        message: string;
    }>;
    /** Réglages saisis par TLD vendu (ex. le TLD lui-même). */
    productConfigFields: ConfigField[];
    parseProductConfig(raw: unknown): TProductConfig;
    providerIdOf(config: TProductConfig): string | null;
    summarize(config: TProductConfig): string;
    checkAvailability?(ctx: HostContext, name: string, provider: TProviderConfig | null): Promise<AvailabilityResult>;
    register?(ctx: HostContext, target: RegistrarTarget<TProductConfig, TProviderConfig>, years: number): Promise<RegistrarOutcome>;
    renew?(ctx: HostContext, target: RegistrarTarget<TProductConfig, TProviderConfig>, years: number): Promise<RegistrarOutcome>;
    transfer?(ctx: HostContext, target: RegistrarTarget<TProductConfig, TProviderConfig>, authCode: string): Promise<RegistrarOutcome>;
    updateNameservers?(ctx: HostContext, target: RegistrarTarget<TProductConfig, TProviderConfig>, nameservers: string[]): Promise<RegistrarOutcome>;
    updateContact?(ctx: HostContext, target: RegistrarTarget<TProductConfig, TProviderConfig>, contact: DomainContact): Promise<RegistrarOutcome>;
    setTransferLock?(ctx: HostContext, target: RegistrarTarget<TProductConfig, TProviderConfig>, locked: boolean): Promise<RegistrarOutcome>;
    setWhoisPrivacy?(ctx: HostContext, target: RegistrarTarget<TProductConfig, TProviderConfig>, enabled: boolean): Promise<RegistrarOutcome>;
}
/**
 * Vérifie qu'un module tient ce que ses capacités annoncent, et rend les manques. Appelé au
 * chargement plutôt qu'à l'appel — voir `missingProvisioningOperations`, même raison.
 *
 * Noms d'opération et de méthode coïncident ici (contrairement à `snapshot`/`ProvisioningCapabilities`
 * qui recouvre quatre méthodes) : pas besoin d'indirection entre les deux.
 */
export declare function missingRegistrarOperations(descriptor: Pick<RegistrarDescriptor<never, never>, "capabilities"> & Partial<Record<RegistrarOperation | "setWhoisPrivacy", unknown>>): RegistrarOperation[];

// ==== kinds/theme.d.ts ====
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
import { type ConfigField, type ThemeSettingValue } from "../config-fields";
import { type SupportedLocale } from "../locale";
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
    page: {
        slug: string;
        title: string;
    };
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
    resourceSpec?: {
        cpu: number;
        ramMb: number;
        diskGb: number;
    };
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
/** Un service, tel qu'il apparaît dans une liste. */
export interface ThemeServiceSummary {
    id: string;
    href: string;
    name: string;
    categoryName: string;
    /** Absent pour un produit sans machine derrière (hébergement mutualisé, licence). */
    resourceSpec?: {
        cpu: number;
        ramMb: number;
        diskGb: number;
    };
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
    counters: {
        services: number;
        unpaidInvoices: number;
    };
    recentServices: {
        id: string;
        href: string;
        name: string;
        status: string;
    }[];
    recentInvoices: {
        id: string;
        href: string;
        totalFormatted: string;
        status: string;
    }[];
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
        resourceSpec?: {
            cpu: number;
            ramMb: number;
            diskGb: number;
        };
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
    service: {
        id: string;
        backHref: string;
    };
}
export interface ThemeInvoicesView extends ThemeViewContext {
    view: "invoices";
    invoices: ThemeInvoiceSummary[];
    /** Vide dans le cas courant : un solde n'existe qu'après un avoir ou un trop-perçu. */
    creditBalances: {
        formatted: string;
    }[];
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
        items: {
            description: string;
            quantity: number;
            amountFormatted: string;
        }[];
    };
}
export interface ThemeTicketsView extends ThemeViewContext {
    view: "tickets";
    tickets: {
        id: string;
        href: string;
        subject: string;
        status: string;
    }[];
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
            attachments: {
                filename: string;
                sizeFormatted: string;
                href: string;
            }[];
        }[];
        /** Renseigné seulement si le client a déjà noté le ticket. */
        satisfaction: {
            rating: number;
            stars: string;
            comment: string | null;
        } | null;
    };
}
export interface ThemeTicketNewView extends ThemeViewContext {
    view: "ticket-new";
    departments: {
        id: string;
        name: string;
    }[];
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
    zones: {
        id: string;
        href: string;
        name: string;
        status: string;
        statusLabel: string;
    }[];
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
    entries: {
        id: string;
        action: string;
        createdAtFormatted: string;
    }[];
    pagination: ThemePagination;
}
export interface ThemeAccountView extends ThemeViewContext {
    view: "account";
    /** Déjà filtrées par les permissions du visiteur : un sous-utilisateur en voit moins. */
    sections: {
        key: string;
        href: string;
        title: string;
        description: string;
    }[];
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
    currencies: {
        code: string;
        label: string;
    }[];
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
    gateways: {
        moduleId: string;
        label: string;
    }[];
    canManage: boolean;
    /** Retour de la passerelle après un enregistrement de carte : de quoi confirmer au client. */
    justAdded: boolean;
}
export interface ThemeAccountPrivacyView extends ThemeViewContext {
    view: "account-privacy";
    pendingErasure: boolean;
    requests: {
        kind: string;
        status: string;
    }[];
}
export interface ThemeAccountReferralView extends ThemeViewContext {
    view: "account-referral";
    referralCode: string;
    earned: {
        currency: string;
        formatted: string;
    }[];
    referrals: {
        email: string;
        joinedAtFormatted: string;
    }[];
}
export interface ThemeAccountTeamView extends ThemeViewContext {
    view: "account-team";
    contacts: {
        id: string;
        email: string;
        permissions: string[];
    }[];
    grantablePermissions: {
        key: string;
        description: string;
    }[];
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
    client: {
        id: string;
        email: string;
        companyName: string | null;
        sinceFormatted: string;
    };
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
export declare const THEME_ISLANDS: ThemeIslandSpec[];
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
export declare const THEME_VIEWS: ThemeViewSpec[];
/** Vues dont le contexte est assemblé par l'appelant plutôt que par l'API. */
export declare function isProvidedContextView(name: string): boolean;
/** Noms des vues connues, dans l'ordre du registre. */
export declare const THEME_VIEW_NAMES: string[];
export declare function themeViewSpec(name: string): ThemeViewSpec | undefined;
export declare function themeIslandSpec(name: string): ThemeIslandSpec | undefined;
/** Tous les `data-island` qu'une source de gabarit déclare, dans l'ordre d'apparition. */
export declare function declaredIslands(templateSource: string): string[];
/**
 * Îlots obligatoires d'une vue qu'un gabarit ne place nulle part.
 *
 * Contrôle textuel sur la **source** du gabarit, pas sur son rendu : un `{% for %}` peut ne rien
 * produire pour un catalogue vide, ce qui rendrait un contrôle au rendu faussement rassurant un
 * jour et faussement alarmant le lendemain. Une vue inconnue ne rend rien à corriger — c'est
 * `unknownIslands` qui signale ce cas de figure.
 */
export declare function missingRequiredIslands(templateSource: string, viewName: string): string[];
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
export declare function unknownIslands(templateSource: string): string[];
/** Gabarit attendu pour une page déclarée par le thème. */
export declare function themePageTemplatePath(slug: string, templatesDir?: string): string;
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
export declare function invalidThemePages(pages: ThemePageDeclaration[] | undefined, templateExists?: (relativePath: string) => boolean, templatesDir?: string): string[];
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
export declare const THEME_PREVIEW_PATHS: readonly ["/", "/catalog", "/cart", "/domains", "/kb", "/legal/terms", "/legal/privacy", "/legal/notice", "/legal/refund", "/legal/cookies", "/login", "/register", "/forgot-password"];
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
export declare const THEME_ACCOUNT_PREVIEW_PATHS: readonly ["/dashboard", "/services", "/invoices", "/tickets", "/tickets/new", "/domains/mine", "/dns", "/history", "/account", "/account/profile", "/account/security", "/account/billing", "/account/payment-methods", "/account/privacy", "/account/referral", "/account/team", "/account/settings"];
/**
 * Un chemin que l'aperçu d'un thème peut viser : une page de la vitrine ou de l'authentification,
 * une page statique de l'espace client, ou `/<slug>` d'une page que le thème déclare lui-même.
 *
 * Pure et sans état : la liste des slugs vient de l'appelant (`ThemeDefinition.pages`), puisque
 * c'est le manifeste du thème, et lui seul, qui dit quelles pages il apporte. Comparaison exacte,
 * sans normalisation — un chemin d'aperçu s'écrit comme la liste l'écrit.
 */
export declare function isThemePreviewPath(path: string, themePageSlugs?: readonly string[]): boolean;
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
export declare const DEFAULT_THEME_TOKENS: ThemeTokens;
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
export declare function invalidThemeSettings(fields: readonly ConfigField[] | undefined, theme?: Pick<ThemeDefinition, "pages" | "settingGroups" | "settingsLocale">): string[];
/**
 * Forme d'une clé de texte du thème : celle que `t.<clé>` sait lire dans un gabarit. Les mêmes
 * règles que le nom d'un réglage, et pour la même raison — c'est un identifiant Liquid.
 */
export declare const THEME_TEXT_KEY_PATTERN: RegExp;
/** Longueur maximale d'un texte du thème saisi au panel, par langue. */
export declare const THEME_TEXT_MAX_LENGTH = 2000;
/**
 * Ce qu'un gabarit lit sous `t`, par lecture statique de sa source : les clés écrites `t.<clé>`,
 * et `indexed` quand il indexe `t` par une variable (`t[key]`).
 *
 * Une seule lecture pour les deux lecteurs qui en ont besoin : `pnpm check-extension`, qui réclame
 * chaque clé lue dans les traductions, et le panel, qui range chaque texte du thème sous les
 * gabarits qui l'affichent. Deux expressions finiraient par ne pas trouver les mêmes clés. Une clé
 * lue seulement par `t[variable]` ne se voit pas ici — le panel la range dans « Autres ».
 */
export declare function themeTranslationReads(source: string): {
    keys: string[];
    indexed: boolean;
};
/**
 * Avis sur les réglages d'un thème : ce qui ne casse rien mais trahit presque toujours une erreur.
 * Rendus par `pnpm check-extension` comme des avis, jamais comme des erreurs.
 *
 * Aujourd'hui : une section déclarée dans `settingGroups` qu'aucun réglage ne nomme dans son
 * `group`. Elle apparaît vide dans le rail — souvent un nom de groupe retouché d'un seul côté.
 */
export declare function themeSettingWarnings(theme: Pick<ThemeDefinition, "settings" | "settingGroups">): string[];
/**
 * Toutes les chaînes du manifeste que le panel traduit, dans l'ordre de première apparition et
 * sans doublon : libellés, aides, textes indicatifs, groupes, sous-groupes, libellés d'option,
 * sous-champs de liste, descriptions de section.
 *
 * C'est la liste des clés attendues dans `<locales>/panel/<langue>.json`, et ce que
 * `pnpm check-extension` confronte à chaque fichier. Les noms de section (`settingGroups[].name`)
 * sont déjà des `group` : ils ne sont comptés qu'une fois.
 */
export declare function themePanelStrings(theme: Pick<ThemeDefinition, "settings" | "settingGroups">): string[];
/**
 * Valeurs telles que le **panel** les édite, en chaînes : un `list` et un texte localisé y sont
 * du JSON (le tableau d'éléments, l'objet langue → texte), le reste est la chaîne stockée ou le
 * défaut. Distinct de `themeSettingValues`, qui rend ce qu'un gabarit lit dans *une* langue —
 * l'éditeur, lui, doit voir toutes les langues et tous les éléments.
 */
export declare function themeSettingEditable(fields: readonly ConfigField[] | undefined, stored: Record<string, unknown> | null | undefined): Record<string, string>;
/** `#rgb` ou `#rrggbb`. Pas d'alpha : `readableTextOn` ne saurait pas quoi mesurer derrière. */
export declare function isHexColor(value: string): boolean;
/**
 * Valeurs admises des tokens à liste fermée. Exportée pour le chargeur du manifeste
 * (`loader/manifest.ts`), qui en dérive ses contrôles plutôt que d'en tenir une copie — deux listes
 * écrites à la main finissent toujours par diverger, et c'est un thème refusé d'un côté et accepté
 * de l'autre. Hors de l'index : ce n'est pas une surface publique.
 */
export declare const ENUM_TOKENS: Readonly<Record<string, readonly string[]>>;
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
export declare function unknownThemeTokenPaths(raw: unknown): string[];
/**
 * Ce que les réglages d'un thème changent à sa feuille de style : des tokens remplacés, et des
 * variables CSS propres au thème.
 *
 * `values` sort de `themeSettingValues` — défauts déjà appliqués, booléens déjà convertis. Une
 * valeur qui ne passerait pas dans une feuille de style est écartée ici une seconde fois, pour la
 * même raison que partout ailleurs : une donnée en base peut précéder la règle qui l'aurait
 * refusée.
 */
export declare function themeSettingStyle(fields: readonly ConfigField[] | undefined, values: Record<string, ThemeSettingValue>, 
/** `"dark"` ne retient que les réglages marqués `scheme: "dark"`, et inversement. */
scheme?: "light" | "dark", 
/** Familles des polices téléversées, pour un réglage `font` (voir `ThemeSettingResolveOptions`). */
uploadedFontFamilies?: readonly string[]): {
    tokens: PartialThemeTokens;
    cssVars: Record<string, string>;
};
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
export declare function isSafeSettingUrl(value: string): boolean;
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
export declare function themeSettingValues(fields: readonly ConfigField[] | undefined, stored: Record<string, unknown> | null | undefined, options?: ThemeSettingResolveOptions): Record<string, ThemeSettingValue>;
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
/** Plafond d'un `list` sans `maxItems` : de quoi lister des avis, pas un catalogue. */
export declare const MAX_LIST_ITEMS = 50;
/**
 * Une valeur de token est-elle sûre à interpoler dans une feuille de style ? Refuse, sans égard à
 * la casse, ce qui sortirait de la déclaration ou de la balise `<style>`, `@`, et les fonctions qui
 * font charger une adresse au navigateur (`url(`, `image(`, `image-set(`, `cross-fade(`,
 * `element(`, `src(`) ou exécutaient du script (`expression(`).
 */
export declare function isSafeTokenValue(value: string): boolean;
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
export declare function isSafeThemeFont(font: Pick<ThemeFont, "family" | "weight" | "style" | "display">): boolean;
/**
 * Les `@font-face` des polices que le thème livre lui-même.
 *
 * Les polices déclarées par `href` n'apparaissent pas ici : ce sont des feuilles externes, servies
 * par une balise `<link>` (voir `themeFontHrefs`). Les deux existent parce que les deux cas se
 * rencontrent — un thème qui embarque ses fichiers reste utilisable hors ligne, un thème qui
 * pointe une fonderie se met à jour tout seul.
 */
export declare function themeFontFaces(theme: Pick<ResolvedTheme, "fonts" | "assetBaseUrl">): string;
/**
 * Une valeur `font` est-elle admise : l'une des `options` du réglage, ou la famille d'une police
 * téléversée ? Le contrôle des validateurs (enregistrement d'un brouillon), qui reçoivent la liste
 * des familles de l'appelant — le SDK ne lit aucune base.
 */
export declare function isAllowedFontValue(field: Pick<ConfigField, "options">, value: string, uploadedFontFamilies?: readonly string[]): boolean;
/**
 * Une police téléversée au panel : sa famille et l'adresse publique de son fichier WOFF2
 * (`/api/v1/theme-media/<id>.woff2`).
 */
export interface ThemeUploadedFont {
    family: string;
    url: string;
}
/**
 * Le nom d'une police téléversée est-il admis ? La liste blanche de `isSafeThemeFont`, **sans**
 * sa tolérance aux guillemets de bord ni aux blancs autour : ce nom est saisi au panel, stocké tel
 * quel, puis comparé à la lettre aux valeurs des réglages — `"Ma Police"` et `Ma Police` seraient
 * deux polices.
 */
export declare function isSafeUploadedFontFamily(family: string): boolean;
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
export declare function uploadedFontFaces(fonts: readonly ThemeUploadedFont[] | undefined): string;
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
export declare function mergeThemeTokens(base: ThemeTokens, override?: PartialThemeTokens): ThemeTokens;

// ==== kinds/ui.d.ts ====
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
    columns: {
        key: string;
        label: string;
    }[];
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
    actions: {
        id: string;
        label: string;
        confirm?: string;
    }[];
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
export declare const PANEL_CONTRACT_VERSION = "1.0.0";
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
export type PanelScreenMount = (container: HTMLElement, host: PanelScreenHost) => PanelScreenUnmount | void | Promise<PanelScreenUnmount | void>;
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
export declare function invalidContributedScreens(screens: ContributedScreen[] | undefined, fileExists?: (relativePath: string) => boolean): string[];
/**
 * Le libellé d'une page dans une langue donnée.
 *
 * Ne rend jamais de chaîne vide : un lien de navigation sans texte est un lien qu'on ne peut pas
 * cliquer, et le module ne saurait pas d'où vient le trou.
 */
export declare function resolveContributedLabel(label: ContributedLabel, locale: string): string;
/** Adresse d'une page contribuée. Le préfixe découle de la zone, jamais du module. */
export declare function modulePageHref(moduleId: string, page: ContributedPage): string;
/**
 * Gabarit par lequel un **thème** rhabille la page d'un module.
 *
 * Premier maillon de la cascade — gabarit du thème, gabarit du module, sections — et le seul que
 * l'auteur du module ne connaît pas. Un thème peut donc reprendre la page d'une extension sans que
 * son auteur ait rien prévu.
 */
export declare function modulePageThemeTemplatePath(moduleId: string, pageId: string, templatesDir?: string): string;
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
export declare function invalidContributedPages(pages: ContributedPage[] | undefined, fileExists?: (relativePath: string) => boolean): string[];

// ==== links.d.ts ====
/**
 * Un lien saisi au panel — réglage `link`, lien d'un texte markdown, bouton d'une page de contenu —
 * peut-il finir dans un `href` ?
 *
 * **Un seul validateur** pour tous ces chemins, parce que chaque copie de la règle a fini par en
 * oublier un morceau : `isSafeSettingUrl` ne refusait les blancs qu'en tête, et `/<tabulation>/hote`
 * passait pour un chemin alors que le navigateur, qui retire tabulations et sauts de ligne de toute
 * adresse, y lisait `//hote`. Le panel valide avec cette même fonction avant d'envoyer, l'API à
 * l'enregistrement, le moteur au rendu : un lien accepté ici est accepté partout, et inversement.
 *
 * Deux formes, jugées sur la valeur **brute** (aucun `trim` : un blanc de bord sert justement à
 * masquer un schéma) :
 *
 * - un chemin du site : un seul `/` en tête (`//hote` et `/\hote` sortent du site sous l'apparence
 *   d'un chemin), et ni blanc, ni caractère de contrôle, ni barre oblique inverse **nulle part** ;
 * - une adresse `https:`/`http:` (suivie de `//` et d'au moins un caractère), `mailto:` ou `tel:`
 *   (suivis d'au moins un caractère), schéma insensible à la casse, sans blanc ni caractère de
 *   contrôle.
 *
 * Liste blanche de formes et non liste noire de schémas : `javascript:`, `data:`, `vbscript:` et
 * leurs variantes de casse ou d'entités ne ressemblent à aucune des deux. Une entité (`&#58;`)
 * reste inerte, puisque le rendu échappe `&`.
 *
 * Distinct de `isSafeSettingUrl`, qui garde les réglages `url` et `image` : une image ne se charge
 * pas depuis `mailto:`, et ces deux types gardent leur règle.
 */
export declare function isSafeLinkValue(value: string): boolean;

// ==== loader/compatibility.d.ts ====
/**
 * Le module se déclare-t-il compatible avec ce noyau ?
 *
 * Renvoie `null` quand oui, sinon la raison — le panel doit dire à l'hébergeur *quelle* version
 * son module réclame, faute de quoi « incompatible » ne lui laisse rien à faire.
 *
 * Un module hors plage n'est **pas chargé**. C'est la décision structurante du chargement : mieux
 * vaut un module éteint qu'un module qui appelle un contrat qu'il croit connaître. Une signature
 * changée ne se manifeste pas par une erreur claire mais par un `undefined` qui voyage jusqu'à
 * l'encaissement.
 *
 * Deux chemins mènent à `null`. D'abord le `satisfies` semver classique — la plage couvre la
 * version courante. Sinon, le plancher : si la version la plus basse que la plage accepte
 * (`minVersion`) se situe entre `compatibleSince` et `hostVersion`, le module a été écrit contre un
 * contrat plus ancien mais aucune rupture n'a eu lieu depuis — il reste chargé. Sans ce second
 * chemin, la moindre mineure du contrat (même purement additive) éteindrait tout module installé,
 * y compris ceux qui n'utilisent aucun des ajouts. Les bornes hautes explicites d'une plage
 * (`<0.25.0`, par exemple) sont ignorées par ce second chemin : en 0.x elles ne disent rien de plus
 * que le caret.
 */
export declare function incompatibilityReason(range: string, hostVersion?: string, compatibleSince?: string): string | null;

// ==== loader/discover.d.ts ====
import type { ExtensionDescriptor, ExtensionManifest } from "../manifest";
/** État d'un module trouvé sur le disque. Reprend l'énumération stockée en base. */
export type DiscoveredStatus = "OK" | "INCOMPATIBLE" | "LOAD_ERROR";
/**
 * Un module déposé sur l'instance, tel que le chargeur l'a trouvé.
 *
 * Un module en échec est **décrit quand même**. C'est le point de tout ce fichier : un module
 * cassé qui disparaît de l'écran est indiscernable d'un module jamais installé, et l'hébergeur
 * qui vient de le déposer cherche alors une erreur de chemin là où il y a une erreur de code.
 */
export interface DiscoveredExtension {
    moduleId: string;
    /** Dossier d'où il vient, pour que le message d'erreur désigne un endroit réel. */
    path: string;
    /** `null` quand le manifeste lui-même est illisible : on ne sait alors rien du module. */
    manifest: ExtensionManifest | null;
    version: string;
    status: DiscoveredStatus;
    statusMessage: string | null;
    /** Présent uniquement quand `status` vaut `OK`. Rien d'autre n'a été exécuté. */
    descriptor?: ExtensionDescriptor<unknown>;
}
export interface DiscoverOptions {
    /** Dossier scanné. Chaque sous-dossier portant un `extension.json` est un module. */
    dir: string;
    /** Version du contrat à confronter aux `engines.host`. Injectable pour les tests. */
    hostVersion?: string;
    /**
     * Plancher de compatibilité — `HOST_CONTRACT_COMPATIBLE_SINCE` par défaut. Injectable pour les
     * tests, sur le même principe que `hostVersion`.
     */
    compatibleSince?: string;
    /** Chargement du code. Injectable pour les tests, `require` en production. */
    load?: (entryPath: string) => unknown;
}
/**
 * Parcourt le dossier des extensions et rend ce qu'on y trouve.
 *
 * **Ne lève jamais.** Un module tiers ne doit pas pouvoir empêcher l'application de démarrer : ni
 * par un manifeste illisible, ni par une exception au chargement, ni en revendiquant l'identifiant
 * d'un autre. Chaque échec devient une ligne rouge dans le panel, et le reste de l'instance
 * continue de fonctionner — y compris d'encaisser.
 */
export declare function discoverExtensions(options: DiscoverOptions): DiscoveredExtension[];

// ==== loader/index.d.ts ====
/**
 * Le chargeur réel du contrat d'extension : ce qui permet à un auteur tiers de valider son module
 * sans le monorepo (`@opbs/extensions` dépend de `@opbs/database`, non publiable — voir
 * ROADMAP.md, entrée P1).
 *
 * Entrée séparée du reste du SDK (`@opbs/extension-sdk/loader`, pas
 * `@opbs/extension-sdk`) : ce module lit le système de fichiers (`node:fs`) et charge du code
 * avec un `require()` dynamique, deux choses qu'un bundle **navigateur** ne peut pas résoudre.
 * `@opbs/ui` importe le SDK principal pour les jetons de thème et alimente ainsi les bundles
 * client des trois apps Next.js — y laisser ce fichier faisait échouer leur build.
 *
 * Même discipline de version que le reste du contrat : `HOST_CONTRACT_VERSION`,
 * `public-surface.spec.ts` (section « chargeur »), `CHANGELOG.md`.
 */
export { discoverExtensions } from "./discover";
export type { DiscoveredExtension, DiscoveredStatus, DiscoverOptions } from "./discover";
export { incompatibilityReason } from "./compatibility";
export { MANIFEST_FILENAME, ManifestError, parseManifest } from "./manifest";
export { inspectDescriptor } from "./inspect";
export type { InspectDescriptorOptions } from "./inspect";
export { inspectThemeTemplates } from "./islands";
export type { ThemeTemplateFinding } from "./islands";

// ==== loader/inspect.d.ts ====
import type { ExtensionDescriptor } from "../manifest";
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
export declare function inspectDescriptor(descriptor: ExtensionDescriptor<unknown>, options: InspectDescriptorOptions): string[];

// ==== loader/islands.d.ts ====
import { type ThemeViewSpec } from "../kinds/theme";
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
    /**
     * Cibles de `{% render %}` / `{% include %}` introuvables dans le thème.
     *
     * Le chemin part de la **racine du thème**, pas du gabarit qui l'écrit :
     * `templates/partials/icon` et non `partials/icon`. Écrit en relatif — le réflexe de tous ceux
     * qui viennent de Jekyll, où `include` part d'un dossier dédié — LiquidJS lève un `ENOENT`, le
     * noyau retombe sur son écran React et la page reste parfaitement présentable. En apparence
     * seulement : plus une ligne du thème ne s'affiche, et rien à l'écran ne le dit. C'est le même
     * genre de défaut qu'un îlot oublié, et c'est pourquoi il se vérifie ici plutôt qu'au rendu.
     */
    missingPartials: string[];
}
export declare function inspectThemeTemplates(themeDir: string, templatesDir?: string): ThemeTemplateFinding[];

// ==== loader/manifest.d.ts ====
import type { ExtensionManifest } from "../manifest";
/** Nom du fichier qu'un module dépose à la racine de son dossier. */
export declare const MANIFEST_FILENAME = "extension.json";
/**
 * Manifeste refusé. Distinguée d'une erreur quelconque parce qu'elle est *attendue* : elle remonte
 * dans le panel comme l'état d'un module, pas comme un incident du noyau.
 */
export declare class ManifestError extends Error {
    constructor(message: string);
}
/**
 * Valide un manifeste **déjà lu**, sans toucher au disque.
 *
 * Séparé de la lecture pour que la validation soit testable sur des objets, et surtout pour que la
 * frontière soit nette : à ce stade, aucune ligne du module n'a été exécutée et aucune ne le sera
 * si ce qui suit refuse. C'est tout l'intérêt d'un manifeste séparé du code.
 */
export declare function parseManifest(raw: unknown, source: string): ExtensionManifest;

// ==== locale.d.ts ====
/**
 * Copie volontaire de `SUPPORTED_LOCALES`/`SupportedLocale`/`DEFAULT_LOCALE`
 * (`packages/shared-types/src/index.ts`), et non un import de ce paquet.
 *
 * Le SDK n'a besoin que de ces trois identifiants sur toute la surface de `@opbs/shared-types`
 * — publier ce paquet en plus (capacity-tone, ssh-public-key, domain-name...) pour eux seuls serait
 * disproportionné. `pnpm check-mirrors` compare les deux listes à chaque CI : une langue ajoutée
 * d'un côté sans l'autre s'y voit.
 */
export declare const SUPPORTED_LOCALES: readonly ["fr", "en", "de"];
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export declare const DEFAULT_LOCALE: SupportedLocale;

// ==== manifest.d.ts ====
import type { ConfigField } from "./config-fields";
import type { HostContext } from "./host";
import type { ContributedPage, ContributedScreen, ModulePageActionRequest, ModulePageActionResult, ModulePageRequest, ModulePageResult } from "./kinds/ui";
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
export declare const EXTENSION_KINDS: readonly ["provisioning", "payment", "notification", "theme", "addon", "registrar", "dns"];
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
    engines: {
        host: string;
    };
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
    runScreenEntryPoint?(ctx: HostContext, entryPoint: string, input: Record<string, unknown>): Promise<unknown>;
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
    runPageAction?(ctx: HostContext, request: ModulePageActionRequest): Promise<ModulePageActionResult>;
}

// ==== markdown.d.ts ====
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
export declare const THEME_MARKDOWN_MAX_LENGTH = 20000;
/** Un morceau de texte à l'intérieur d'un paragraphe ou d'un élément de liste. */
export type ThemeMarkdownInline = {
    type: "text";
    text: string;
}
/** Saut de ligne simple à l'intérieur d'un paragraphe. */
 | {
    type: "break";
} | {
    type: "strong";
    children: ThemeMarkdownInline[];
} | {
    type: "em";
    children: ThemeMarkdownInline[];
}
/** `href` déjà passé par `isSafeLinkValue` : un lien refusé ne devient jamais ce nœud. */
 | {
    type: "link";
    href: string;
    children: ThemeMarkdownInline[];
};
export type ThemeMarkdownBlock = {
    type: "paragraph";
    children: ThemeMarkdownInline[];
} | {
    type: "list";
    ordered: boolean;
    items: ThemeMarkdownInline[][];
};
/**
 * Analyse un texte markdown restreint (voir l'en-tête du fichier). Ne lève jamais : une valeur qui
 * n'est pas une chaîne donne une liste vide, une syntaxe incomplète reste du texte.
 */
export declare function parseThemeMarkdown(text: string): ThemeMarkdownBlock[];

// ==== merge.d.ts ====
import type { ResourceSpec } from "./kinds/provisioning";
/**
 * Fusionne des patches JSON opaques sur une configuration de driver, dans l'ordre (un patch plus
 * tardif écrase les clés posées par un patch antérieur).
 *
 * Ni le noyau ni cette fonction ne savent ce que les clés signifient (Proxmox, ou tout autre
 * driver) — c'est le rôle du descripteur de provisioning (`ProvisioningDescriptor.parseProductConfig`)
 * de les interpréter, en aval de cette fusion.
 */
export declare function mergeDriverConfig(base: unknown, patches: Array<Record<string, unknown>>): Record<string, unknown>;
/**
 * Extrait les seules clés génériques que le noyau connaît (`cpu`, `ramMb`, `diskGb`, voir
 * `ResourceSpec`) d'une suite de patches opaques, pour les fusionner sur une spécification de
 * base. Les autres clés d'un patch (ex. `templateRef`) restent dans `driverConfig` : elles ne
 * transitent jamais par `spec`, qui est le seul canal générique partagé par tous les drivers.
 */
export declare function mergeResourceSpec(base: ResourceSpec | null, patches: Array<Record<string, unknown>>): ResourceSpec | null;

// ==== reserved-slugs.d.ts ====
/**
 * Premiers segments d'URL que le portail se réserve — ni une page créée au panel, ni une page
 * déclarée par un thème ne peuvent les prendre.
 *
 * **Le risque n'est pas celui qu'on croit.** En App Router, une route statique gagne toujours sur
 * un attrape-tout : une page créée avec le slug `catalog` ne masquerait *pas* `/catalog`, c'est
 * structurel. Le danger est l'inverse et il est silencieux — l'hébergeur crée `/status`, le noyau
 * ajoute cette route six mois plus tard, et sa page devient injoignable sans le moindre message.
 * D'où un refus à la création, plutôt qu'une liste noire au rendu qui arriverait trop tard.
 *
 * Miroir tenu à la main, revérifié par `pnpm check-mirrors` : tout premier segment de route de
 * `apps/web-portal/app` doit figurer ici. C'est le même service que rend `NAV_BY_AREA`, et pour la
 * même raison — personne ne pense à revenir dans ce fichier en ajoutant une page au portail.
 *
 * Dans le SDK et non dans l'API, depuis que les thèmes déclarent leurs propres pages : la liste
 * contraint désormais deux producteurs de slug, et `pnpm check-extension` doit pouvoir refuser un
 * manifeste fautif sans avoir l'API sous la main. C'est aussi ce qu'un auteur de thème a besoin de
 * lire avant de choisir une URL.
 */
export declare const RESERVED_PAGE_SLUGS: string[];
export declare function isReservedPageSlug(slug: string): boolean;

// ==== testing.d.ts ====
import { type SupportedLocale } from "./locale";
import type { HostContext } from "./host";
/** Un appel capturé sur `logger`, dans l'ordre où le module l'a émis. */
export interface CapturedLogEntry {
    level: "debug" | "info" | "warn" | "error";
    message: string;
    meta?: Record<string, unknown>;
}
/** Un événement remonté via `emit`, dans l'ordre d'émission. */
export interface CapturedEvent {
    event: string;
    payload: Record<string, unknown>;
}
export interface TestHostContext extends HostContext {
    /** Tout ce que le module a écrit sur `logger`, consultable sans mock. */
    readonly logs: CapturedLogEntry[];
    /** Tout ce que le module a remonté via `emit`, consultable sans mock. */
    readonly events: CapturedEvent[];
}
export interface TestHostOptions {
    /** Figée telle quelle : `createTestHost` ne simule pas `parseConfig`, un test l'appelle lui-même. */
    config?: Record<string, unknown>;
    /** Défaut `"fr"` (`DEFAULT_LOCALE`), comme dans le vrai `HostContext`. */
    locale?: SupportedLocale;
    /**
     * Défaut : un stub qui rejette avec un message explicite. Un module dont le test ne fournit pas
     * `http` et qui appelle quand même `ctx.http` échoue donc net, plutôt que de tenter une vraie
     * requête réseau depuis la suite de tests.
     */
    http?: typeof fetch;
}
/**
 * `HostContext` de test : mêmes membres qu'un vrai appel, sans dépendance à Prisma ni au réseau.
 *
 * Seul `storage` a une vraie implémentation (une `Map` en mémoire, seul membre du `HostContext`
 * réel adossé à Prisma) — `logger` et `emit` capturent dans des tableaux plutôt que d'exécuter un
 * effet, pour qu'un test les inspecte sans mock ni espion propres à un test runner particulier.
 *
 * `check-extension` valide la forme d'un module, pas son comportement (voir EXTENSIONS.md
 * § « Écrire, vérifier, déposer ») ; `createTestHost` couvre ce que `check-extension` ne peut pas.
 */
export declare function createTestHost(options?: TestHostOptions): TestHostContext;

// ==== version.d.ts ====
/**
 * Version du **contrat** d'extension, celle que `engines.host` d'un manifeste encadre.
 *
 * Délibérément distincte de la version du produit. Ce qu'un module tiers doit savoir, ce n'est pas
 * en quelle version l'application est publiée — c'est quelle forme ont les interfaces qu'il
 * importe. Lier les deux obligerait à sortir une majeure du contrat à chaque refonte d'un écran
 * qui ne le concerne pas, et à faire mentir tous les manifestes installés.
 *
 * Constante compilée plutôt que lue dans un `package.json` à l'exécution : dans une image Docker,
 * ce fichier n'est pas toujours là où le code s'attend à le trouver, et une version introuvable
 * rendrait *tous* les modules incompatibles d'un coup.
 *
 * **Cette constante monte à chaque modification du contrat, additive ou non** — c'est ce qui
 * garde `CHANGELOG.md` complet sur ce qu'un auteur peut observer depuis le paquet. Elle ne dit en
 * revanche rien, à elle seule, de ce qui reste chargé : un module écrit contre une version
 * antérieure continue de fonctionner tant que sa plage `engines.host` couvre une version dans
 * `[HOST_CONTRACT_COMPATIBLE_SINCE, HOST_CONTRACT_VERSION]` (voir `loader/compatibility.ts` et
 * `COMPATIBILITY.md`) — seul le franchissement du plancher l'éteint.
 *
 * Cette règle est restée lettre morte pendant quinze jours : la constante n'a pas bougé de `0.1.0`
 * alors que le contrat gagnait deux genres entiers et une demi-douzaine de capacités. Le mécanisme
 * de refus fonctionnait — il n'était simplement alimenté par rien. `CHANGELOG.md` reconstitue les
 * jalons franchis, et `public-surface.spec.ts` échoue désormais si la surface change sans que
 * cette ligne suive.
 */
export declare const HOST_CONTRACT_VERSION = "0.36.0";
/**
 * Plus ancienne version du contrat encore compatible avec ce noyau.
 *
 * `HOST_CONTRACT_VERSION` monte à chaque changement, même additif — sans plancher, une instance de
 * longue durée éteindrait un module tiers à chaque mineure, y compris celles qu'il n'utilise même
 * pas. `loader/compatibility.ts` charge un module dont `engines.host` a été écrit contre une
 * version comprise entre ce plancher et `HOST_CONTRACT_VERSION`, que la version courante ait
 * avancé ou non depuis.
 *
 * Ne monte que sur une rupture non additive du contrat (signature changée, champ devenu
 * obligatoire, genre retiré) — jamais sur un simple ajout. Vaut `0.16.0` : dernière rupture non
 * additive à ce jour (voir `CHANGELOG.md`). La 0.33.0 est additive : les réglages de thème liés au
 * CSS, les listes, les textes localisés, le mode sombre et les dictionnaires n'ôtent rien à ce
 * qu'un module pouvait déjà lire. La 0.34.0 l'est aussi, à une exception annoncée : des îlots
 * deviennent obligatoires, ce qui fait échouer `check-extension` sur un thème qui ne les pose pas,
 * sans l'empêcher de se charger — le moteur ne vérifie pas les îlots au chargement. La 0.35.0 est
 * purement additive : deux champs de plus sur `ThemeKbArticle`, que les gabarits existants ignorent.
 * La 0.36.0 l'est aussi : deux variantes de plus sur `GatewayEvent`, qu'un module `payment` qui ne
 * les émet pas n'a aucune raison de connaître.
 */
export declare const HOST_CONTRACT_COMPATIBLE_SINCE = "0.16.0";
