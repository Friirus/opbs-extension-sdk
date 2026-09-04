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
