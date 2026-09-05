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
export interface NotificationChannelDescriptor<TConfig = Record<string, unknown>>
  extends ExtensionDescriptor<TConfig> {
  kind: "notification";
  /** Événements auxquels ce canal réagit. Absent : tous les événements canoniques. */
  supportedEvents?: readonly string[];
  send(ctx: HostContext, event: NotificationEvent): Promise<NotificationOutcome>;
  /** Bouton « Envoyer un essai » du panel. Optionnel : tous les canaux ne le justifient pas. */
  sendTest?(ctx: HostContext): Promise<NotificationOutcome>;
}

/** Un module `notification` est-il pilotable par le bus d'événements ? */
export function isEventDrivenChannel(
  descriptor: ExtensionDescriptor,
): descriptor is NotificationChannelDescriptor {
  return descriptor.kind === "notification" && typeof (descriptor as { send?: unknown }).send === "function";
}
