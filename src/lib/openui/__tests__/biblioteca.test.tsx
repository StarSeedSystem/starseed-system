import { describe, expect, it } from "vitest";

import {
  ETIQUETAS_COMPONENTES,
  NOMBRES_COMPONENTES,
  biblioteca,
  promptDeSistema,
} from "../biblioteca";

const ESPERADOS = ["Tarjeta", "Tabla", "Pasos", "Comparacion", "LineaDeTiempo", "Lista", "Accion"];

describe("biblioteca OpenUI de StarSeed · componentes Trinity", () => {
  it("tiene los siete componentes pedidos, sin duplicados", () => {
    expect(Object.keys(biblioteca.components).sort()).toEqual([...ESPERADOS].sort());
    expect(biblioteca.root).toBe("Tarjeta");
    expect(biblioteca.id).toBe("starseed-trinity");
  });

  it("cada componente declara nombre, descripción, props Zod y render", () => {
    for (const nombre of NOMBRES_COMPONENTES) {
      const componente = biblioteca.components[nombre];
      expect(componente.name, nombre).toBe(nombre);
      expect(componente.description.length, nombre).toBeGreaterThan(10);
      expect(typeof componente.props.parse, nombre).toBe("function");
      expect(typeof componente.component, nombre).toBe("function");
    }
  });

  it("la etiqueta visible conserva los acentos de cada contexto", () => {
    expect(ETIQUETAS_COMPONENTES.Comparacion).toBe("Comparación");
    expect(ETIQUETAS_COMPONENTES.LineaDeTiempo).toBe("LíneaDeTiempo");
    expect(ETIQUETAS_COMPONENTES.Accion).toBe("Acción");
  });
});

describe("biblioteca OpenUI de StarSeed · prompt de sistema", () => {
  it("sale de la biblioteca y nombra los siete componentes", () => {
    const prompt = promptDeSistema();
    for (const nombre of NOMBRES_COMPONENTES) expect(prompt, nombre).toContain(nombre);
    expect(prompt).toContain("root = Tarjeta");
    expect(prompt).toContain("Tarjeta(titulo: string");
  });

  it("nombra también las etiquetas visibles con acentos", () => {
    const prompt = promptDeSistema();
    for (const etiqueta of Object.values(ETIQUETAS_COMPONENTES)) {
      expect(prompt, etiqueta).toContain(etiqueta);
    }
  });

  it("es estable y no ejecuta nada: Acción solo declara id, etiqueta y variante", () => {
    const prompt = promptDeSistema();
    expect(promptDeSistema()).toBe(prompt);
    expect(prompt).toContain("Accion(id: string, etiqueta: string");
    expect(prompt).toContain("nunca la ejecuta");
  });
});
