import { describe, it, expect } from "vitest";
import { filasDeMedios, MEDIOS_PANEL, validarPeticion } from "../lanzamientos";

describe("filasDeMedios", () => {
  it("retorna filas para los 9 medios en el orden correcto", () => {
    const estado = { fase: "esperando-lista", detalle: "", version: "1.0.0", pasos: [], jobs: [], medios: {}, historial: [], pausado: false, tono: "normal" };
    const filas = filasDeMedios(estado, "1.0.0");
    expect(filas).toHaveLength(9);
    expect(filas[0].id).toBe("web");
    expect(filas[8].id).toBe("libreria");
  });

  it("construir url para web desde release_url", () => {
    const estado = { fase: "lanzado", detalle: "", version: "0.3.0", pasos: [], jobs: [], medios: { macos: { estado: "al-dia", faltan: [], pequenos: [] } }, historial: [], pausado: false, tono: "normal", release_url: "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0" };
    const filas = filasDeMedios(estado, "0.3.0");
    const macos = filas.find(f => f.id === "macos");
    expect(macos?.formatos[0].url).toContain("v0.3.0");
  });
});

describe("validarPeticion", () => {
  it("acepta petición lanzar válida", () => {
    expect(validarPeticion({ accion: "lanzar" })).toEqual({ accion: "lanzar" });
  });

  it("acepta regenerar con medio", () => {
    expect(validarPeticion({ accion: "regenerar", medio: "macos" })).toEqual({ accion: "regenerar", medio: "macos" });
  });

  it("acepta auto con activo", () => {
    expect(validarPeticion({ accion: "auto", activo: true })).toEqual({ accion: "auto", activo: true });
  });

  it("rechaza acción inválida", () => {
    expect(validarPeticion({ accion: "borrar" })).toEqual({ error: "Acción inválida" });
  });

  it("rechaza regenerar sin medio", () => {
    expect(validarPeticion({ accion: "regenerar" })).toEqual({ error: "Medio requerido" });
  });

  it("rechaza auto sin activo", () => {
    expect(validarPeticion({ accion: "auto" })).toEqual({ error: "Campo 'activo' requerido para 'auto'" });
  });
});
