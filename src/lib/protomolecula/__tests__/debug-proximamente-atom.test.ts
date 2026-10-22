// Un átomo propio del OS (los que registra `atomos/index.ts`) también tiene
// ficha en la Biblioteca: sale como integrada y verificada. Contrato:
// architecture/protomolecula.md §F2 («una ficha por herramienta… estado real»).
// Módulo puro: la proyección no toca disco ni red.

import { describe, it, expect, beforeEach } from "vitest";
import { listProtoLibraryItems } from "@/lib/library/oss-catalog-bridge";
import { registrarAtomo, limpiarRegistro } from "../registro-atomos";
import type { DefinicionAtomo, Parametro } from "../registro-atomos";

function crearAtomoValido(id: string, nombre: string, extra: Partial<DefinicionAtomo> = {}): DefinicionAtomo {
  const parametro: Parametro = { id: "p", nombre: "P", tipo: "numero" };
  return {
    herramientaId: id,
    nombre,
    categoria: "imagen",
    integracion: "libreria-js",
    control: "total",
    parametros: [parametro],
    entradas: [],
    salidas: [],
    ...extra,
  };
}

describe("átomos propios en las fichas de la Biblioteca", () => {
  beforeEach(() => limpiarRegistro());

  it("un átomo registrado llega como ficha verificada, con su licencia y sus enlaces", () => {
    registrarAtomo(crearAtomoValido("herramienta-propia", "Herramienta Propia", {
      ficha: { licencia: "MIT", web: "https://web.propia", repo: "https://github.com/ale/propia" },
    }));

    const item = listProtoLibraryItems().find((i) => i.id === "proto-herramienta-propia");
    expect(item).toBeDefined();
    expect(item!.title).toBe("Herramienta Propia");
    expect(item!.category).toBe("protomolecula");
    expect(item!.verified).toBe(true);
    expect(item!.license).toBe("MIT");
    expect(item!.sourceLabel).toBe("Protomolécula · integrada");
    expect(item!.description).toContain("Herramienta Propia");
    expect(item!.tags).toContain("protomolecula");
    expect(item!.tags).toContain("imagen");
    expect(item!.links?.find((l) => l.label === "Web oficial")?.url).toBe("https://web.propia");
    expect(item!.links?.find((l) => l.label === "Repositorio")?.url).toBe("https://github.com/ale/propia");
  });
});
