import { describe, it, expect } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import type { HerramientaProto } from "../catalogo-herramientas";
import type { DefinicionAtomo, Parametro } from "../registro-atomos";
import { registrarAtomo } from "../registro-atomos";

function crearAtomoValido(id: string, nombre: string): DefinicionAtomo {
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
  };
}

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
  it("should show proximamente when catalog tool has estado proximamente", () => {
    // Create a catalog tool with estado: proximamente
    const catalogoItem = herramientaProximamente("future-tool", "Falta implementar el envoltorio nativo");
    
    // No need to register an atom for this test since we're testing catalog tools
    const registroResult = { ok: true }; // Mock value since we're not registering anything
    console.log("Registro result:", registroResult);
    
    const versiones = {}; // Empty versions object
    
    const resultado = fichasProtomolecula(versiones, [catalogoItem]);
    console.log("Resultado:", resultado);
    console.log("Resultado length:", resultado.length);
    
    if (resultado.length > 0) {
      console.log("First item:", resultado[0]);
      console.log("Estado:", resultado[0].estado);
      console.log("Proximamente:", resultado[0].proximamente);
      console.log("Description:", resultado[0].descripcion);
    }
    
    expect(resultado[0].estado).toBe("proximamente");
    expect(resultado[0].proximamente).toContain("próximamente");
  });
});
