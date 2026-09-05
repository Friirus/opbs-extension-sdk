import { DEFAULT_LOCALE, type SupportedLocale } from "./locale";
import type { ExtensionStorage, HostContext } from "./host";

/** Un appel capturé sur `logger`, dans l'ordre où le module l'a émis. */
export interface CapturedLogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
}

/** Un événement remonté via `emit`, dans l'ordre d'émission. */
export interface CapturedEvent {
  event: string;
  payload: Record<string, unknown>;
}

export interface TestHostContext extends HostContext {
  /** Tout ce que le module a écrit sur `logger`, consultable sans mock. */
  readonly logs: CapturedLogEntry[];
  /** Tout ce que le module a remonté via `emit`, consultable sans mock. */
  readonly events: CapturedEvent[];
}

export interface TestHostOptions {
  /** Figée telle quelle : `createTestHost` ne simule pas `parseConfig`, un test l'appelle lui-même. */
  config?: Record<string, unknown>;
  /** Défaut `"fr"` (`DEFAULT_LOCALE`), comme dans le vrai `HostContext`. */
  locale?: SupportedLocale;
  /**
   * Défaut : un stub qui rejette avec un message explicite. Un module dont le test ne fournit pas
   * `http` et qui appelle quand même `ctx.http` échoue donc net, plutôt que de tenter une vraie
   * requête réseau depuis la suite de tests.
   */
  http?: typeof fetch;
}

function rejectingHttp(): typeof fetch {
  return (() =>
    Promise.reject(
      new Error(
        "createTestHost(): aucun `http` fourni, mais le module a appelé ctx.http() — passez " +
          "un `http` de test si ce comportement est attendu.",
      ),
    )) as unknown as typeof fetch;
}

/**
 * `HostContext` de test : mêmes membres qu'un vrai appel, sans dépendance à Prisma ni au réseau.
 *
 * Seul `storage` a une vraie implémentation (une `Map` en mémoire, seul membre du `HostContext`
 * réel adossé à Prisma) — `logger` et `emit` capturent dans des tableaux plutôt que d'exécuter un
 * effet, pour qu'un test les inspecte sans mock ni espion propres à un test runner particulier.
 *
 * `check-extension` valide la forme d'un module, pas son comportement (voir EXTENSIONS.md
 * § « Écrire, vérifier, déposer ») ; `createTestHost` couvre ce que `check-extension` ne peut pas.
 */
export function createTestHost(options: TestHostOptions = {}): TestHostContext {
  const logs: CapturedLogEntry[] = [];
  const events: CapturedEvent[] = [];
  const memory = new Map<string, unknown>();

  function log(level: CapturedLogEntry["level"]) {
    return (message: string, meta?: Record<string, unknown>) => {
      logs.push(meta === undefined ? { level, message } : { level, message, meta });
    };
  }

  const storage: ExtensionStorage = {
    async get<T>(key: string): Promise<T | null> {
      return memory.has(key) ? (memory.get(key) as T) : null;
    },
    async set(key: string, value: unknown): Promise<void> {
      memory.set(key, value);
    },
    async setIfAbsent(key: string, value: unknown): Promise<boolean> {
      if (memory.has(key)) {
        return false;
      }
      memory.set(key, value);
      return true;
    },
    async delete(key: string): Promise<void> {
      memory.delete(key);
    },
    async keys(prefix: string): Promise<string[]> {
      return [...memory.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
  };

  return {
    config: options.config ?? {},
    locale: options.locale ?? DEFAULT_LOCALE,
    logger: {
      debug: log("debug"),
      info: log("info"),
      warn: log("warn"),
      error: log("error"),
    },
    http: options.http ?? rejectingHttp(),
    storage,
    emit(event: string, payload: Record<string, unknown>): void {
      events.push({ event, payload });
    },
    logs,
    events,
  };
}
