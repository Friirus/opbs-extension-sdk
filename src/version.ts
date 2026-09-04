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
 * **En 0.x, la moindre modification du contrat est une rupture** au sens de semver : `^0.1.0` ne
 * couvre pas `0.2.0`. C'est voulu tant que la surface n'est pas figée (voir `COMPATIBILITY.md`) —
 * un module écrit contre `0.1` doit cesser de se charger plutôt que d'appeler un contrat qui a
 * changé sous lui.
 *
 * Cette règle est restée lettre morte pendant quinze jours : la constante n'a pas bougé de `0.1.0`
 * alors que le contrat gagnait deux genres entiers et une demi-douzaine de capacités. Le mécanisme
 * de refus fonctionnait — il n'était simplement alimenté par rien. `CHANGELOG.md` reconstitue les
 * jalons franchis, et `public-surface.spec.ts` échoue désormais si la surface change sans que
 * cette ligne suive.
 */
export const HOST_CONTRACT_VERSION = "0.28.0";
