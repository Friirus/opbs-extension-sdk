import { gte, lte, minVersion, satisfies, validRange } from "semver";
import { HOST_CONTRACT_COMPATIBLE_SINCE, HOST_CONTRACT_VERSION } from "../version";

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
export function incompatibilityReason(
  range: string,
  hostVersion: string = HOST_CONTRACT_VERSION,
  compatibleSince: string = HOST_CONTRACT_COMPATIBLE_SINCE,
): string | null {
  if (!validRange(range)) {
    // Une plage qu'on ne sait pas lire n'est pas une plage permissive : la traiter comme telle
    // chargerait du code sur la foi d'une chaîne dont personne ne sait ce qu'elle voulait dire.
    return `plage de compatibilité illisible : "${range}"`;
  }
  if (satisfies(hostVersion, range, { includePrerelease: true })) {
    return null;
  }
  const wrote = minVersion(range);
  if (wrote && gte(wrote, compatibleSince) && lte(wrote, hostVersion)) {
    return null;
  }
  if (wrote && lte(wrote, hostVersion)) {
    return (
      `module écrit contre le contrat ${wrote.version}, antérieur au plancher de compatibilité ` +
      `${compatibleSince} de ce noyau (${hostVersion}) — à relire contre le contrat actuel`
    );
  }
  return `module prévu pour un noyau ${range}, celui-ci est en ${hostVersion}`;
}
