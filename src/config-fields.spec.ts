import {
  isSecretField,
  readBoolean,
  readNumber,
  readString,
  requireNumber,
  requireOneOf,
  requireString,
  secretFieldNames,
  type ConfigField,
} from "./config-fields";
import { ExtensionConfigError } from "./errors";

function field(overrides: Partial<ConfigField> & Pick<ConfigField, "name" | "type">): ConfigField {
  return { label: overrides.name, required: false, ...overrides };
}

describe("lecture d'une configuration de module", () => {
  describe("readString", () => {
    it("rogne les blancs et traite une chaîne vide comme absente", () => {
      expect(readString({ a: "  x  " }, "a")).toBe("x");
      // Un champ de formulaire laissé vide arrive en chaîne vide, pas en `undefined` : sans ça,
      // « requis » ne voudrait rien dire pour un champ texte.
      expect(readString({ a: "   " }, "a")).toBeUndefined();
    });

    it("ne suppose pas que l'entrée est un objet", () => {
      expect(readString(null, "a")).toBeUndefined();
      expect(readString("texte", "a")).toBeUndefined();
      expect(readString({ a: 42 }, "a")).toBeUndefined();
    });

    it("lève un message exploitable en formulaire quand un champ requis manque", () => {
      expect(() => requireString({}, "apiKey", "Clé d'API")).toThrow(ExtensionConfigError);
      expect(() => requireString({}, "apiKey", "Clé d'API")).toThrow(/Clé d'API/);
    });
  });

  describe("readNumber", () => {
    /**
     * Le même réglage arrive en nombre depuis un JSON stocké et en chaîne depuis un formulaire
     * HTML. Les deux chemins doivent donner le même résultat, sinon un module se comporte
     * différemment selon qu'on vient de le configurer ou qu'on l'a rechargé.
     */
    it("accepte indifféremment un nombre et sa forme texte", () => {
      expect(readNumber({ port: 8006 }, "port")).toBe(8006);
      expect(readNumber({ port: "8006" }, "port")).toBe(8006);
      expect(readNumber({ port: " 8006 " }, "port")).toBe(8006);
    });

    it("refuse ce qui n'est pas un nombre exploitable", () => {
      expect(readNumber({ port: "abc" }, "port")).toBeUndefined();
      expect(readNumber({ port: "" }, "port")).toBeUndefined();
      expect(readNumber({ port: Number.NaN }, "port")).toBeUndefined();
      expect(readNumber({ port: Infinity }, "port")).toBeUndefined();
      expect(() => requireNumber({}, "port", "Port")).toThrow(ExtensionConfigError);
    });

    it("conserve zéro, qui est une valeur légitime", () => {
      // Un `?? défaut` mal placé transformerait 0 en valeur par défaut — typiquement un délai
      // « immédiat » qui deviendrait silencieusement « 7 jours ».
      expect(readNumber({ delay: 0 }, "delay")).toBe(0);
      expect(readNumber({ delay: "0" }, "delay")).toBe(0);
    });
  });

  describe("readBoolean", () => {
    it("reconnaît les formes que prend une case à cocher selon le chemin", () => {
      // Formulaire HTML : "on". Variable d'environnement : "1"/"true". JSON : booléen.
      for (const value of [true, "true", "TRUE", "on", "1", "yes", "oui"]) {
        expect(readBoolean({ tls: value }, "tls")).toBe(true);
      }
      for (const value of [false, "false", "off", "0", "no", "non"]) {
        expect(readBoolean({ tls: value }, "tls")).toBe(false);
      }
    });

    it("renvoie undefined plutôt que false sur une valeur incomprise", () => {
      // La distinction compte : « non renseigné » doit pouvoir retomber sur le défaut du module,
      // là où `false` est une réponse.
      expect(readBoolean({ tls: "peut-être" }, "tls")).toBeUndefined();
      expect(readBoolean({}, "tls")).toBeUndefined();
    });
  });

  describe("requireOneOf", () => {
    const GUESTS = ["qemu", "lxc"] as const;

    it("accepte une valeur permise et replie sur le défaut si absente", () => {
      expect(requireOneOf({ t: "lxc" }, "t", "Type", GUESTS)).toBe("lxc");
      expect(requireOneOf({}, "t", "Type", GUESTS, "qemu")).toBe("qemu");
    });

    it("refuse une valeur hors de l'ensemble en nommant ce qui était attendu", () => {
      expect(() => requireOneOf({ t: "docker" }, "t", "Type", GUESTS)).toThrow(
        /Type invalide : "docker" \(attendu qemu ou lxc\)/,
      );
    });

    it("refuse l'absence quand aucun défaut n'est prévu", () => {
      expect(() => requireOneOf({}, "t", "Type", GUESTS)).toThrow(ExtensionConfigError);
    });
  });

  describe("champs sensibles", () => {
    it("désigne les champs à ne jamais renvoyer en clair", () => {
      const fields = [
        field({ name: "apiUrl", type: "text" }),
        field({ name: "secretKey", type: "password" }),
        field({ name: "webhookSecret", type: "password" }),
      ];
      expect(secretFieldNames(fields)).toEqual(["secretKey", "webhookSecret"]);
      expect(isSecretField(fields[0] as ConfigField)).toBe(false);
      expect(isSecretField(fields[1] as ConfigField)).toBe(true);
    });
  });
});
