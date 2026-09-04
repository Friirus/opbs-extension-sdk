import { mergeDriverConfig, mergeResourceSpec } from "./merge";

describe("mergeDriverConfig", () => {
  it("fusionne les patches dans l'ordre, un patch plus tardif écrasant le précédent", () => {
    expect(
      mergeDriverConfig({ templateRef: "9000", clusterId: "c1" }, [
        { templateRef: "9001" },
        { templateRef: "9002", ramMb: 4096 },
      ]),
    ).toEqual({ templateRef: "9002", clusterId: "c1", ramMb: 4096 });
  });

  it("ne modifie pas driverConfig quand il n'y a aucun patch (rétrocompatibilité)", () => {
    const base = { templateRef: "9000" };
    expect(mergeDriverConfig(base, [])).toEqual(base);
  });

  it("traite une base non-objet comme vide plutôt que de planter", () => {
    expect(mergeDriverConfig(null, [{ a: 1 }])).toEqual({ a: 1 });
    expect(mergeDriverConfig(undefined, [])).toEqual({});
    expect(mergeDriverConfig(["not", "an", "object"], [{ a: 1 }])).toEqual({ a: 1 });
  });
});

describe("mergeResourceSpec", () => {
  it("fusionne uniquement les clés cpu/ramMb/diskGb reconnues, dans l'ordre des patches", () => {
    expect(
      mergeResourceSpec({ cpu: 1, ramMb: 1024, diskGb: 20 }, [
        { ramMb: 2048 },
        { cpu: 2, templateRef: "9002" },
      ]),
    ).toEqual({ cpu: 2, ramMb: 2048, diskGb: 20 });
  });

  it("retourne la base telle quelle quand aucun patch ne porte de clé de ressource", () => {
    const base = { cpu: 1, ramMb: 1024, diskGb: 20 };
    expect(mergeResourceSpec(base, [{ templateRef: "9002" }])).toEqual(base);
  });

  it("reste null quand il n'y a ni base ni patch de ressource (produit sans options)", () => {
    expect(mergeResourceSpec(null, [])).toBeNull();
    expect(mergeResourceSpec(null, [{ templateRef: "9002" }])).toBeNull();
  });

  it("part de zéro quand un patch pose une ressource sans base", () => {
    expect(mergeResourceSpec(null, [{ ramMb: 4096 }])).toEqual({ cpu: 0, ramMb: 4096, diskGb: 0 });
  });
});
