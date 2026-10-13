/**
 * Pruebas puras del plan de radios de la malla Wi-Fi.
 * Solo funciones puras; sin vi.mock; describe/it/expect de vitest.
 */
import { describe, it, expect } from "vitest";
import { planRadios } from "../plan-radios";

describe("planRadios", () => {
  it("tres routers en triángulo no repiten canal en troncales", () => {
    const routers = [
      { id: "r1", radios: [{ id: "r1", banda: "5g" as const, anchosMhz: [80, 40] }] },
      { id: "r2", radios: [{ id: "r2", banda: "5g" as const, anchosMhz: [80, 40] }] },
      { id: "r3", radios: [{ id: "r3", banda: "5g" as const, anchosMhz: [80, 40] }] },
    ];
    const troncales: Array<[string, string]> = [["r1", "r2"], ["r2", "r3"], ["r3", "r1"]];
    const res = planRadios({ region: "EU", routers, troncales });
    const canales = res.troncales.map((t) => t.canal);
    expect(new Set(canales).size).toBe(3); // tres canales distintos
  });

  it("sin 5g usa 2g con aviso", () => {
    const routers = [
      { id: "r1", radios: [{ id: "r1", banda: "2g" as const, anchosMhz: [40] }] },
      { id: "r2", radios: [{ id: "r2", banda: "2g" as const, anchosMhz: [40] }] },
    ];
    const res = planRadios({ region: "EU", routers, troncales: [["r1", "r2"]] });
    expect(res.troncales[0].banda).toBe("2g");
    expect(res.avisos.some((a) => a.includes("2g"))).toBe(true);
  });

  it("región desconocida avisa y usa EU; PIRE dentro del perfil", () => {
    const routers = [
      { id: "r1", radios: [{ id: "r1", banda: "5g" as const, anchosMhz: [80] }] },
      { id: "r2", radios: [{ id: "r2", banda: "5g" as const, anchosMhz: [80] }] },
    ];
    const res = planRadios({ region: "XX", routers, troncales: [["r1", "r2"]] });
    expect(res.avisos.some((a) => a.includes("desconocida"))).toBe(true);
    expect(res.troncales[0].banda).toBe("5g");
    expect(res.troncales[0].pireDbm).toBeLessThanOrEqual(30);
  });

  it("clientes alternan 1/6/11 por router", () => {
    const routers = [
      { id: "ra", radios: [{ id: "ra", banda: "2g" as const, anchosMhz: [40] }] },
      { id: "rb", radios: [{ id: "rb", banda: "2g" as const, anchosMhz: [40] }] },
      { id: "rc", radios: [{ id: "rc", banda: "2g" as const, anchosMhz: [40] }] },
    ];
    const res = planRadios({ region: "EU", routers, troncales: [["ra", "rb"], ["rb", "rc"]] });
    const canalesClientes = res.clientes.map((c) => c.canal);
    expect(canalesClientes).toContain(1);
    expect(canalesClientes).toContain(6);
    expect(canalesClientes).toContain(11);
    expect(res.clientes.every((c) => c.banda === "2g")).toBe(true);
  });
});
