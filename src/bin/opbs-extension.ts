#!/usr/bin/env node
/**
 * `npx @opbs/extension-sdk check <dossier>` / `create <genre> <id> [--dir <dossier>]`
 *
 * Un seul `bin` avec deux sous-commandes plutôt que deux paquets : `check` et `create` partagent
 * le même contrat et n'ont chacun de sens qu'en présence de l'autre.
 */
import { main as checkMain } from "../cli/check-extension";
import { main as createMain } from "../cli/create-extension";

const [command, ...rest] = process.argv.slice(2);

function usage(): void {
  console.error("Usage : opbs-extension check <dossier> | create <genre> <id> [--dir <dossier>]");
}

if (command === "check") {
  process.exitCode = checkMain(rest);
} else if (command === "create") {
  process.exitCode = createMain(rest);
} else {
  usage();
  process.exitCode = 1;
}
