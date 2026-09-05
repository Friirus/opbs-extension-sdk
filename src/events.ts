/**
 * Événements métier canoniques, partagés par les webhooks sortants (`WebhookEndpoint.events`) et
 * les modules du genre `notification`.
 *
 * Une seule liste plutôt que deux : elle a longtemps existé en double (le DTO de création de
 * webhook, le formulaire du panel), et les deux copies avaient divergé — un événement réellement
 * émis (`invoice.disputed`) était absent des deux, invisible à quiconque aurait voulu s'y abonner.
 */
export const CORE_EVENTS = [
  "order.created",
  "invoice.paid",
  "invoice.disputed",
  "service.provisioned",
  "subscription.cancelled",
  "ticket.created",
  "node.capacity.warning",
  "login.suspicious",
  "billing.oss_threshold.warning",
  "domain.registered",
  "domain.renewal.failed",
  "domain.expiring",
  "domain.transfer.completed",
  "service.monitor.down",
  "service.monitor.up",
  "dns.zone.created",
  "dns.zone.deleted",
  "dns.zone.error",
  "customer.registered",
  "referral.commission.earned",
  "invoice.refunded",
  "provisioning.approval.requested",
] as const;

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
  "order.created":
    | { subscriptionId: string; bundlePurchaseId: string }
    | { subscriptionId: string; cartPurchaseId: string }
    | { subscriptionId: string; invoiceId: string; domainId: string };
  "invoice.paid": { invoiceId: string; totalCents: number };
  "invoice.disputed": { invoiceId: string };
  "service.provisioned": {
    provisionedServiceId: string;
    subscriptionId: string;
    moduleId: string;
    remoteId: string | null;
  };
  "subscription.cancelled": { subscriptionId: string; reason: string | null };
  "ticket.created": { ticketId: string; subject: string };
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
  "domain.renewal.failed": { domainId: string; message: string };
  "domain.expiring": { domainId: string; name: string; expiryDate: string | null };
  "domain.transfer.completed": {
    domainId: string;
    subscriptionId: string;
    name: string;
    moduleId: string;
  };
  "service.monitor.down": { monitorId: string; subscriptionId: string; name: string; target: string };
  "service.monitor.up": { monitorId: string; subscriptionId: string; name: string; target: string };
  "dns.zone.created": { dnsZoneId: string; name: string; moduleId: string };
  "dns.zone.deleted": { dnsZoneId: string; name: string; moduleId: string };
  "dns.zone.error": { dnsZoneId: string; message: string };
  "customer.registered": { customerId: string; email: string; referredById: string | null };
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
  "provisioning.approval.requested": { subscriptionId: string; productId: string };
}

type Assert<T extends true> = T;
/**
 * Verrou d'exhaustivité : un événement ajouté à `CORE_EVENTS` sans entrée dans
 * `CoreEventPayloads` (ou l'inverse) fait échouer la compilation ici plutôt qu'au premier module
 * qui essaie de le typer. Jamais lu, jamais exporté — sa seule fonction est d'exister.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _Exhaustive = Assert<
  [
    Exclude<CoreEvent, keyof CoreEventPayloads>,
    Exclude<keyof CoreEventPayloads, CoreEvent>,
  ] extends [never, never]
    ? true
    : false
>;
