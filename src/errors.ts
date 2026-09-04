/**
 * Configuration refusée par un module. Distinguée d'une erreur quelconque parce qu'elle est
 * *attendue* : elle remonte jusqu'au formulaire admin sous forme de message de validation, là où
 * une erreur inattendue donnerait un 500.
 */
export class ExtensionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtensionConfigError";
  }
}

/** Module absent du registre : ni livré avec l'application, ni déposé sur l'instance. */
export class UnknownExtensionError extends Error {
  constructor(moduleId: string) {
    super(`Extension inconnue : "${moduleId}"`);
    this.name = "UnknownExtensionError";
  }
}
