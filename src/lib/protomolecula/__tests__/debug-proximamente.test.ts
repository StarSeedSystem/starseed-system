import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro } from "../registro-atomos";
import type { DefinicionAtomo, Parametro } from "../registro-atomos";
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

function atomo(id: string): DefinicionAtomo {
  const parametro: Parametro = { id: "p", nombre: "P", tipo: "numero" };
  return {
    herramientaId: id,
    nombre: id,
    categoria: "ia",
    integracion: "libreria-js",
    control: "total",
    parametros: [parametro],
    entradas: [],
    salidas: [],
  };
}

describe("depuración: herramienta del catálogo con estado proximamente", () => {
  beforeEach(() => limpiarRegistro());

  it("un átomo registrado gana al 'proximamente' del catálogo", () => {
    const catalogo = [herramientaProximamente("future-tool", "falta el build WASM")];
    registrarAtomo(atomo("future-tool"));

    const resultado = fichasProtomolecula({}, catalogo);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].estado).toBe("integrada");
    expect(resultado[0].proximamente).toBeUndefined();
  });
});
