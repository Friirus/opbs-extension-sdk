import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ts from "typescript";
import { EXTENSION_KINDS } from "../manifest";
import { main as checkMain, type CliIo } from "./check-extension";
import { main as createMain } from "./create-extension";

const SDK_ROOT = join(__dirname, "..", "..");

/** Capture au lieu d'écrire sur la console — mêmes fonctions `main`, sans bruit dans les tests. */
function capture(): { io: CliIo; lines: string[] } {
  const lines: string[] = [];
  return { io: { log: (m) => lines.push(m), error: (m) => lines.push(m) }, lines };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "opbs-extension-cli-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("create puis check", () => {
  it.each(EXTENSION_KINDS)("%s : le squelette généré passe le contrôle sans erreur", (kind) => {
    const created = capture();
    expect(createMain([kind, `demo-${kind}`, "--dir", root], created.io)).toBe(0);

    const checked = capture();
    expect(checkMain([join(root, `demo-${kind}`)], checked.io)).toBe(0);
    expect(checked.lines.some((line) => line.includes("erreur "))).toBe(false);
  });
});

describe("create : refus", () => {
  it("refuse d'écraser un dossier existant", () => {
    createMain(["dns", "demo", "--dir", root], capture().io);

    const second = capture();
    expect(createMain(["dns", "demo", "--dir", root], second.io)).toBe(1);
  });

  it("refuse un identifiant invalide", () => {
    expect(createMain(["dns", "Pas Valide !", "--dir", root], capture().io)).toBe(1);
  });

  it("refuse un genre inconnu", () => {
    expect(createMain(["hyperviseur", "demo", "--dir", root], capture().io)).toBe(1);
  });

  it("refuse un appel sans argument", () => {
    expect(createMain([], capture().io)).toBe(1);
  });
});

describe("check : refus", () => {
  it("refuse un appel sans argument", () => {
    expect(checkMain([], capture().io)).toBe(1);
  });

  it("refuse un dossier sans module", () => {
    expect(checkMain([root], capture().io)).toBe(1);
  });
});

/**
 * Générateur et contrat d'accord au niveau des types, pas seulement au niveau du chargeur : les
 * six squelettes non-thème sont typés avec `@ts-check` + un `@type` qui nomme leur descripteur —
 * si le générateur oublie une propriété requise (ou que le contrat en ajoute une), `checkJs` le
 * signale ici, avant qu'un auteur tiers ne le découvre dans son éditeur.
 */
describe("rapport d'API du générateur", () => {
  it("les 6 squelettes non-thème typent sans diagnostic contre le contrat réel", () => {
    const kinds = EXTENSION_KINDS.filter((kind) => kind !== "theme");
    for (const kind of kinds) {
      expect(createMain([kind, `typecheck-${kind}`, "--dir", root], capture().io)).toBe(0);
    }

    const configFile = ts.readConfigFile(join(SDK_ROOT, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, SDK_ROOT);

    const options: ts.CompilerOptions = {
      ...parsed.options,
      allowJs: true,
      checkJs: true,
      noEmit: true,
      declaration: false,
      declarationMap: false,
      strict: true,
      paths: { "@opbs/extension-sdk": [join(SDK_ROOT, "src", "index.ts")] },
    };
    delete options.rootDir;
    delete options.outDir;

    const files = kinds.map((kind) => join(root, `typecheck-${kind}`, "index.js"));
    const program = ts.createProgram(files, options);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const formatted = diagnostics
      .map((d) => {
        const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
        if (d.file && d.start !== undefined) {
          const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
          return `${d.file.fileName}:${line + 1}:${character + 1} - ${message}`;
        }
        return message;
      })
      .join("\n");

    expect(formatted).toBe("");
  });
});
