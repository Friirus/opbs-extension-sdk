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
}
