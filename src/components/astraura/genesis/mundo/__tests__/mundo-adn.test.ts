import { describe, it, expect } from "vitest";
import { adnEfectivo } from "../mundo-adn";
import { derivarAdn } from "@/lib/astraura/genesis-dna";
import type { SerListado } from "@/lib/astraura/genesis-types";

function ser(parcial: Partial<SerListado> & { id: string }): SerListado {
  return {
    nombre: parcial.id,
    rol: "explorador",
    estado: "activo",
    color: null,
    adn: null,
    generacion: 0,
    comunidades: [],
    experiencia: 0,
    ...parcial,
  };
}

describe("adnEfectivo", () => {
  it("devuelve el ADN ya calculado tal cual, sin recalcular", () => {
    const propio = derivarAdn({ id: "a", nombre: "Nova" });
    const s = ser({ id: "a", nombre: "Nova", adn: propio });
    expect(adnEfectivo(s)).toBe(propio); // misma referencia: no se toca lo que ya existe
  });

  it("sin ADN, deriva exactamente lo mismo que derivarAdn con los mismos datos", () => {
    const s = ser({ id: "b", nombre: "Kai", color: "#ff0000", generacion: 2, experiencia: 40 });
    const esperado = derivarAdn({
      id: "b",
      nombre: "Kai",
      colorPersonalidad: "#ff0000",
      generacion: 2,
      experiencia: 40,
    });
    expect(adnEfectivo(s)).toEqual(esperado);
  });
});
