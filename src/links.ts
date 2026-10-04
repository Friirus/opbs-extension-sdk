/** Blancs (espaces Unicode compris) et caractères de contrôle, refusés partout dans un lien. */
const UNSAFE_ANYWHERE = /[\s\x00-\x1f\x7f]/;

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
export function isSafeLinkValue(value: string): boolean {
  if (typeof value !== "string" || value === "" || UNSAFE_ANYWHERE.test(value)) {
    return false;
  }
  if (value.startsWith("/")) {
    return !value.includes("\\") && value[1] !== "/";
  }
  const scheme = /^(https?:\/\/|mailto:|tel:)/i.exec(value);
  return scheme !== null && value.length > scheme[0].length;
}
