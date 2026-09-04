import { createTestHost } from "./testing";

describe("createTestHost", () => {
  it("figure la config telle quelle et retombe sur la locale fr", () => {
    const host = createTestHost({ config: { pool: ["srv-1"] } });
    expect(host.config).toEqual({ pool: ["srv-1"] });
    expect(host.locale).toBe("fr");
  });

  it("accepte une locale explicite", () => {
    const host = createTestHost({ locale: "de" });
    expect(host.locale).toBe("de");
  });

  it("capture les appels au logger dans l'ordre, sans mock", () => {
    const host = createTestHost();
    host.logger.info("checkout créé");
    host.logger.warn("délai dépassé", { attempt: 2 });
    expect(host.logs).toEqual([
      { level: "info", message: "checkout créé" },
      { level: "warn", message: "délai dépassé", meta: { attempt: 2 } },
    ]);
  });

  it("capture les événements émis dans l'ordre", () => {
    const host = createTestHost();
    host.emit("order.created", { orderId: "ord_1" });
    expect(host.events).toEqual([{ event: "order.created", payload: { orderId: "ord_1" } }]);
  });

  it("stocke et relit par clé, sans persistance entre deux hôtes", async () => {
    const host = createTestHost();
    expect(await host.storage.get("k")).toBeNull();
    await host.storage.set("k", { v: 1 });
    expect(await host.storage.get("k")).toEqual({ v: 1 });
    await host.storage.delete("k");
    expect(await host.storage.get("k")).toBeNull();

    const other = createTestHost();
    expect(await other.storage.get("k")).toBeNull();
  });

  it("rejette explicitement un appel http sans stub fourni", async () => {
    const host = createTestHost();
    await expect(host.http("https://example.test")).rejects.toThrow(/aucun `http` fourni/);
  });

  it("utilise le stub http fourni", async () => {
    const response = new Response("ok");
    const http = jest.fn().mockResolvedValue(response);
    const host = createTestHost({ http: http as unknown as typeof fetch });
    await expect(host.http("https://example.test")).resolves.toBe(response);
    expect(http).toHaveBeenCalledWith("https://example.test");
  });
});
