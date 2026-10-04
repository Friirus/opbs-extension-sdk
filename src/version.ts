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
export const HOST_CONTRACT_VERSION = "0.35.0";

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
 */
export const HOST_CONTRACT_COMPATIBLE_SINCE = "0.16.0";
