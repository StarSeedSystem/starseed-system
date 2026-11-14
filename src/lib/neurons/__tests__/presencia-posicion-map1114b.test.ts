import { describe, expect, it } from "vitest";
import { mediosDeEstado, type PresenciaMedio } from "../presencia";
import { anuncioParaAmbito, PREFERENCIA_POSICION_DEFECTO } from "@/lib/senales/geo/modelo-geo";

const base = { n: "n1", m: "m1", tipo: "web", etiqueta: "web", visible: true, desde: "", s: {} } as unknown as PresenciaMedio;

describe("presencia: campo de posición del anuncio (MAP1114B)", () => {
  it("el anuncio de zona viaja por la presencia sin el punto crudo", () => {
    const g = anuncioParaAmbito({ lat: 40.4168, lon: -3.7038, t: 5, fuente: "gps" }, { ...PREFERENCIA_POSICION_DEFECTO, cuenta: "zona" }, { tipo: "cuenta" })!;
    const [m] = mediosDeEstado({ x: [{ ...base, t: 5, g, c: ["capa:local"] }] });
    expect(m.g?.k).toBe("zona");
    expect(JSON.stringify(m)).not.toContain("40.4168");
    expect(m.c).toEqual(["capa:local"]);
  });

  it("una neurona antigua sin `g` ni `c` se lee igual: posición y capas desconocidas", () => {
    const [m] = mediosDeEstado({ x: [{ ...base, t: 5 }] });
    expect(m.g).toBeUndefined();
    expect(m.c).toBeUndefined();
  });
});
