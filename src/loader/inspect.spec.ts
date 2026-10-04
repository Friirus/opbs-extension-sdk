import type { ExtensionDescriptor } from "../manifest";
import { inspectDescriptor } from "./inspect";

describe("inspectDescriptor — champs réservés aux thèmes", () => {
  it("refuse `link` et `format` dans la configuration d'un module", () => {
    const descriptor = {
      configFields: [
        { name: "site", label: "Site", type: "link", required: false },
        { name: "notes", label: "Notes", type: "textarea", required: false, format: "markdown" },
        { name: "cle", label: "Clé", type: "text", required: true },
      ],
    } as unknown as ExtensionDescriptor<unknown>;

    expect(inspectDescriptor(descriptor, { exists: () => true })).toEqual([
      'configFields : champ "site" de type "link", réservé aux réglages de thème',
      'configFields : champ "notes" — "format" n\'a de sens que dans les réglages d\'un thème',
    ]);
  });
});
