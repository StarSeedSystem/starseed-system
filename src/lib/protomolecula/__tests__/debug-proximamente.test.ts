import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import { limpiarRegistro } from "../registro-atomos";
import type { HerramientaProto } from "../catalogo-herramientas";
import { CATEGORIAS_PROTOMOLECULA } from "../catalogo-herramientas";

function crearHerramienta(id: string, nombre: string, categoria: string = "imagen"): HerramientaProto {
  return {
    nombre: id,
    tipo: "app",
    origen: "otro",
    descripcion: `Descripción de ${id}.`,
    licencia: "MIT",
    codigo: `https://github.com/ejemplo/${id}`,
    web: null,
    medios: { web: "embebible", android: false, ios: false, macos: true, windows: true, linux: true, servidor: false },
    integracion: "iframe-aislado",
    formatos: { entrada: [], salida: [] },
    control: { via: ["postMessage"], notas: "" },
    actualizacion: { fuente: "github-releases", ref: `ejemplo/${id}`, ultimaVersion: null, fechaVersion: null },
    ia: [],
    estado: "integrable",
    motivo: "Licencia y vía comprobadas.",
    verificado: "2026-10-10",
    categoria: categoria as any,
  };
}

describe("debug-proximamente", () => {
  beforeEach(() => limpiarRegistro());

  it("should show proximamente when version estado is proximamente", () => {
    const catalogo = [crearHerramienta("future-tool", "Herramienta Futura")];
    // Override descripcion to have a known value
    catalogo[0].descripcion = "Esta es una descripción detallada desde el catálogo";

    const versiones = {
      "future-tool": {
        estado: "proximamente",
        motivo: "falta el build WASM"
      }
    };

    const resultado = fichasProtomolecula(versiones, catalogo);

    expect(resultado.length).toBeGreaterThan(0);
    expect(resultado[0].estado).toBe("proximamente");
    expect(resultado[0].proximamente).toBe("próximamente: falta el build WASM");
    expect(resultado[0].descripcion).toBe("Esta es una descripción detallada desde el catálogo");
  });
});