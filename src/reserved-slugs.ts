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
export const RESERVED_PAGE_SLUGS: string[] = [
  // Vitrine.
  "cart",
  "catalog",
  "domains",
  "kb",
  "legal",
  // Espace client.
  "account",
  "dashboard",
  "dns",
  "history",
  "invoices",
  "reseller",
  "services",
  "tickets",
  // Authentification et flux d'entrée.
  "accept-invite",
  "auth",
  "forgot-password",
  "impersonation",
  "login",
  "register",
  "reset-password",
  "sso",
  "verify-email",
  // Infrastructure du portail : jamais des pages, mais des chemins qui répondent déjà.
  "api",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  // Préfixes réservés aux pages contribuées par un module — `/m/<moduleId>/<page>` en zone client,
  // `/x/<moduleId>/<page>` en zone publique. Réservés **avant** d'être implémentés, et c'est le
  // point : un squat d'espace de noms est irréversible dès qu'il existe des pages dans la nature.
  "m",
  "x",
  // Pas encore des routes, mais des noms qu'on veut pouvoir prendre sans casser une instance :
  // la page de statut est déjà une application à part (`apps/status-page`), et `admin` désigne le
  // panel — servi sur `admin.<DOMAIN>`, donc pas ici, mais un lien vers `/admin` est un réflexe.
  "status",
  "admin",
];

const RESERVED = new Set(RESERVED_PAGE_SLUGS);

export function isReservedPageSlug(slug: string): boolean {
  return RESERVED.has(slug.toLowerCase());
}
