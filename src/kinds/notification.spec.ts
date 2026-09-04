import type { ExtensionDescriptor } from "../manifest";
import { isEventDrivenChannel } from "./notification";

function descriptor(over: Partial<ExtensionDescriptor> & Record<string, unknown>) {
  return {
    id: "acme",
    kind: "notification",
    label: "Acme",
    description: "",
    configFields: [],
    parseConfig: (raw: unknown) => raw as Record<string, unknown>,
    ...over,
  } as ExtensionDescriptor;
}

/**
 * Le bus distingue un canal piloté par événements d'un module `notification` qui ne l'est pas — le
 * cas réel étant SMTP, appelé directement par `EmailService` avec un destinataire choisi par
 * l'appelant. La distinction se fait sur la **présence de `send`** plutôt que sur un indicateur
 * déclaratif, précisément parce qu'un indicateur peut mentir alors qu'une méthode absente ne le
 * peut pas.
 */
describe("isEventDrivenChannel", () => {
  it("reconnaît un canal qui sait recevoir un événement", () => {
    expect(isEventDrivenChannel(descriptor({ send: () => Promise.resolve({ delivered: true }) }))).toBe(
      true,
    );
  });

  it("écarte un module notification sans `send`, comme SMTP", () => {
    expect(isEventDrivenChannel(descriptor({}))).toBe(false);
  });

  it("écarte un `send` qui n'est pas une fonction", () => {
    // Un module tiers peut très bien exporter une propriété `send` non appelable ; l'invoquer
    // ferait tomber la publication de l'événement pour tous les autres canaux.
    expect(isEventDrivenChannel(descriptor({ send: "oui" }))).toBe(false);
  });

  it("écarte un module d'un autre genre, même s'il expose un `send`", () => {
    expect(
      isEventDrivenChannel(
        descriptor({ kind: "payment", send: () => Promise.resolve({ delivered: true }) }),
      ),
    ).toBe(false);
  });
});
