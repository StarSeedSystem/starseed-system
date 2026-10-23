import { describe, it, expect } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import type { HerramientaProto } from "../catalogo-herramientas";

function herramientaProximamente(id: string, motivo: string): HerramientaProto {
  return {
    id,
    categoria: "ia-generativa",
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
    estado: "proximamente",
    motivo,
    verificado: "2026-10-10",
  };
}

describe("depuración: herramienta del catálogo con estado proximamente", () => {
  it("la ficha queda en estado proximamente con «próximamente: <motivo>»", () => {
    const catalogo = [herramientaProximamente("future-tool", "falta el build WASM")];

    const resultado = fichasProtomolecula({}, catalogo);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].estado).toBe("proximamente");
    expect(resultado[0].proximamente).toBe("próximamente: falta el build WASM");
    expect(resultado[0].licencia).toBe("MIT");
  });
});
