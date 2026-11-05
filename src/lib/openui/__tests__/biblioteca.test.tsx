import { describe, expect, it } from "vitest";
import { biblioteca, promptDeSistema } from "../biblioteca";

// Identificadores ASCII: el lexer de OpenUI Lang solo acepta [A-Za-z0-9_].
const NOMBRES = [
  "Tarjeta",
  "Tabla",
  "Pasos",
  "Comparacion",
  "LineaDeTiempo",
  "Lista",
  "Accion",
];

describe("biblioteca OpenUI de StarSeed", () => {
  it("expone los siete componentes Trinity", () => {
    expect(Object.keys(biblioteca.components).sort()).toEqual([...NOMBRES].sort());
  });

  it("genera el prompt desde la biblioteca y nombra los siete componentes", () => {
    const prompt = promptDeSistema();

    for (const nombre of NOMBRES) {
      expect(prompt).toContain(nombre);
    }
    expect(prompt).toContain("Tarjeta(");
    expect(prompt).toContain("Accion(");
  });

  it("declara las props de cada componente en su JSON Schema", () => {
    const defs = biblioteca.toJSONSchema().$defs ?? {};

    for (const nombre of NOMBRES) {
      expect(defs[nombre]).toBeTruthy();
    }
  });
});
