import { describe, expect, it } from "vitest";
import { mediosDeEstado, type PresenciaMedio } from "../presencia";

const base = { n: "n1", m: "m1", tipo: "web", etiqueta: "web", visible: true, desde: "", s: {} } as unknown as PresenciaMedio;

describe("presencia: campo de posición del anuncio (MAP1114C)", () => {
  it("si una neurona anuncia su posición, llega exacta, sin zona ni redondeo", () => {
    const g = { lat: 19.432612345, lon: -99.133212345, precisionM: 6, t: 5 };
    const [m] = mediosDeEstado({ x: [{ ...base, t: 5, g, c: ["capa:local"] } as never] });
    expect(m.g).toMatchObject(g);
    expect(JSON.stringify(m)).not.toMatch(/"k":|zona/);
    expect(m.c).toEqual(["capa:local"]);
  });

  it("una neurona antigua sin `g` ni `c` se lee igual: posición y capas desconocidas", () => {
    const [m] = mediosDeEstado({ x: [{ ...base, t: 5 }] });
    expect(m.g).toBeUndefined();
    expect(m.c).toBeUndefined();
  });
});
