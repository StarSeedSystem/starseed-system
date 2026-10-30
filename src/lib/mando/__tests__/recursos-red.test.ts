import { describe, it, expect } from "vitest";
import { resumirRecursosRed } from "../recursos-red";

describe("recursos-red", () => {
  it("agrupa ofertas por medio y cuenta medidos", () => {
    const res = resumirRecursosRed({
      ofertas: [
        { id: "1", medio: "neurona", medida: true },
        { id: "2", medio: "neurona" },
        { id: "3", medio: "servidor", medida: true },
      ],
      prestamos: [],
      volumenes: [],
    });
    expect(res.ofertasPorMedio).toHaveLength(2);
    const neurona = res.ofertasPorMedio.find(o => o.medio === "neurona")!;
    expect(neurona.total).toBe(2);
    expect(neurona.medidos).toBe(1);
    expect(neurona.sinMedir).toBe(1);
  });

  it("filtra préstamos vivos", () => {
    const res = resumirRecursosRed({
      ofertas: [],
      prestamos: [
        { id: "p1", recurso: "cpu", medio: "n1", activo: true },
        { id: "p2", recurso: "ram", medio: "n2", activo: false },
      ],
      volumenes: [],
    });
    expect(res.prestamosVivos).toHaveLength(1);
    expect(res.prestamosVivos[0].id).toBe("p1");
  });

  it("detecta volúmenes con réplicas bajas", () => {
    const res = resumirRecursosRed({
      ofertas: [],
      prestamos: [],
      volumenes: [
        { id: "v1", replicasActual: 1, replicasDeseadas: 3 },
        { id: "v2", replicasActual: 2, replicasDeseadas: 2 },
      ],
    });
    expect(res.volumenesBajos).toHaveLength(1);
    expect(res.volumenesBajos[0].id).toBe("v1");
  });
});
