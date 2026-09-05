import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import * as ts from "typescript";

/**
 * Instantané des `.d.ts` que `tsc` produit réellement pour les deux entrées publiques
 * (`src/index.ts`, `src/loader/index.ts`) — pas une relecture du code source comme
 * `public-surface.spec.ts`, qui verrouille les *noms* exportés. Ici c'est la forme compilée,
 * complète : signatures de méthode, généricité, unions. Un changement qui ne toucherait aucun nom
 * mais élargirait une signature (un paramètre optionnel devenu requis, par exemple) échapperait au
 * premier verrou et pas à celui-ci.
 *
 * Mesuré 1,7 s sur le SDK actuel — pas de dépendance à `dist/`, tourne aussi dans la CI du miroir
 * (`api-report/` y est synchronisé, voir `sync-extension-sdk-mirror.yml`).
 */
const ROOT = join(__dirname, "..");
const REPORT_PATH = join(ROOT, "api-report", "extension-sdk.api.d.ts");

function generateReport(): string {
  const configFile = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT);

  const roots = [join(ROOT, "src", "index.ts"), join(ROOT, "src", "loader", "index.ts")];
  const options: ts.CompilerOptions = {
    ...parsed.options,
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
    declarationMap: false,
    outDir: "/__virtual__",
  };

  const program = ts.createProgram(roots, options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    const formatted = diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      .join("\n");
    throw new Error(`api-report : le SDK ne compile pas — corrigez avant de régénérer :\n${formatted}`);
  }

  const emitted = new Map<string, string>();
  program.emit(
    undefined,
    (fileName, text) => {
      if (fileName.endsWith(".d.ts")) {
        emitted.set(relative("/__virtual__", fileName), text);
      }
    },
    undefined,
    true,
  );

  return [...emitted.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fileName, text]) => `// ==== ${fileName} ====\n${text.replace(/\r\n/g, "\n")}`)
    .join("\n");
}

describe("rapport d'API du SDK", () => {
  it("la surface .d.ts compilée correspond à l'instantané commité", () => {
    const report = generateReport();

    if (process.env.UPDATE_API_REPORT === "1") {
      mkdirSync(dirname(REPORT_PATH), { recursive: true });
      writeFileSync(REPORT_PATH, report);
      return;
    }

    if (!existsSync(REPORT_PATH)) {
      throw new Error(
        `${REPORT_PATH} n'existe pas. Générez-le avec UPDATE_API_REPORT=1 pnpm --filter ` +
          `@opbs/extension-sdk test -- api-report, puis commitez-le.`,
      );
    }

    const expected = readFileSync(REPORT_PATH, "utf8");
    if (report !== expected) {
      // eslint-disable-next-line no-console
      console.error(
        "Surface .d.ts du SDK modifiée. Si c'est voulu : régénérez avec " +
          "UPDATE_API_REPORT=1 pnpm --filter @opbs/extension-sdk test -- api-report, puis " +
          "suivez le RAPPEL de public-surface.spec.ts (version, CHANGELOG, plancher si non additif).",
      );
    }
    expect(report).toBe(expected);
  });
});
