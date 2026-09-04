import { satisfies, validRange } from "semver";
import { HOST_CONTRACT_VERSION } from "../version";

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
 */
export function incompatibilityReason(
  range: string,
  hostVersion: string = HOST_CONTRACT_VERSION,
): string | null {
  if (!validRange(range)) {
    // Une plage qu'on ne sait pas lire n'est pas une plage permissive : la traiter comme telle
    // chargerait du code sur la foi d'une chaîne dont personne ne sait ce qu'elle voulait dire.
    return `plage de compatibilité illisible : "${range}"`;
  }
  if (!satisfies(hostVersion, range, { includePrerelease: true })) {
    return `module prévu pour un noyau ${range}, celui-ci est en ${hostVersion}`;
  }
  return null;
}
