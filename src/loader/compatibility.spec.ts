import { HOST_CONTRACT_COMPATIBLE_SINCE, HOST_CONTRACT_VERSION } from "../version";
import { incompatibilityReason } from "./compatibility";

// Vecteurs fixes plutôt que les constantes réelles : ce fichier teste l'algorithme du plancher,
// pas la version courante du contrat, qui n'a aucune raison de rester "0.30.0"/"0.16.0".
const HOST_VERSION = "0.30.0";
const COMPATIBLE_SINCE = "0.16.0";

describe("incompatibilityReason", () => {
  it.each([
    ["^0.28.0"],
    ["~0.28.2"],
    ["0.29.x"],
    [">=0.20.0 <0.25.0"],
    ["*"],
    [">=0.1.0"],
  ])("couvre %s : écrit après le plancher, ou plage permissive", (range) => {
    expect(incompatibilityReason(range, HOST_VERSION, COMPATIBLE_SINCE)).toBeNull();
  });

  it("refuse une plage écrite avant le plancher de compatibilité", () => {
    expect(incompatibilityReason("^0.1.0", HOST_VERSION, COMPATIBLE_SINCE)).toMatch(/plancher/);
  });

  it("refuse une plage prévue pour un noyau majeur différent", () => {
    expect(incompatibilityReason("^2.0.0", HOST_VERSION, COMPATIBLE_SINCE)).toMatch(
      /prévu pour un noyau/,
    );
  });

  it("refuse une plage sans version minimale (>1.0.0 <1.0.0)", () => {
    // minVersion() rend null sur une plage qui n'admet aucune version : ni satisfies, ni le
    // second chemin (qui a besoin d'un minimum à comparer) ne peuvent s'appliquer.
    expect(incompatibilityReason(">1.0.0 <1.0.0", HOST_VERSION, COMPATIBLE_SINCE)).toMatch(
      /prévu pour/,
    );
  });

  it("refuse une plage illisible", () => {
    expect(incompatibilityReason("à peu près la 1", HOST_VERSION, COMPATIBLE_SINCE)).toMatch(
      /illisible/,
    );
  });

  it("couvre une préversion du noyau lui-même", () => {
    expect(incompatibilityReason("^0.30.0-beta.1", HOST_VERSION, COMPATIBLE_SINCE)).toBeNull();
  });

  it("utilise HOST_CONTRACT_COMPATIBLE_SINCE et HOST_CONTRACT_VERSION par défaut", () => {
    expect(incompatibilityReason(`^${HOST_CONTRACT_COMPATIBLE_SINCE}`)).toBeNull();
    expect(incompatibilityReason(`^${HOST_CONTRACT_VERSION}`)).toBeNull();
  });
});
