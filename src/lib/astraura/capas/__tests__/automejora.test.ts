/**
 * Pruebas del módulo puro de la automejora Meta^n (MTN1027K): normalizadores
 * tolerantes, acciones de la config y el texto de acierto frente a la anterior.
 */
import { describe, expect, it } from "vitest";

import {
  ACCIONES,
  aplicarAccion,
  configCapa,
  configCapaDefecto,
  normalizarConfigAutomejora,
  normalizarNocheAutomejora,
  textoAcierto,
} from "../automejora";
import type { ArchivoDirectivas, DirectivaCapa } from "../directivas";

const directiva = (parcial: Partial<DirectivaCapa> & Pick<DirectivaCapa, "version" | "estado">): DirectivaCapa => ({
  capa: "juicio", texto: "pauta", sha256: "sha", acierto: 0.52, base: 0.48, n: 30,
  fecha: "2026-11-02", origen: "meta-n caja", ...parcial,
});

const archivo = (historial: DirectivaCapa[], activa: number | null): ArchivoDirectivas => ({ v: 1, capa: "juicio", activa, historial });

describe("normalizarConfigAutomejora", () => {
  it("ajeno o roto responde vacío, sin error", () => {
    expect(normalizarConfigAutomejora(null)).toEqual({});
    expect(normalizarConfigAutomejora("no")).toEqual({});
    expect(normalizarConfigAutomejora([1])).toEqual({});
  });

  it("rellena los defectos de cada capa y suelta capas vacías", () => {
    const config = normalizarConfigAutomejora({ juicio: { encendida: true }, "": { encendida: true } });
    expect(config.juicio).toEqual(configCapaDefecto() && { ...configCapaDefecto(), encendida: true });
    expect(Object.keys(config)).toEqual(["juicio"]);
  });
});

describe("normalizarNocheAutomejora", () => {
  it("sin fecha no hubo noche", () => {
    expect(normalizarNocheAutomejora(null)).toBeNull();
    expect(normalizarNocheAutomejora({ llamadas: 3 })).toBeNull();
  });

  it("dice dónde corrió, llamadas, qué propuso y qué aprobó el juez", () => {
    const noche = normalizarNocheAutomejora({
      fecha: "2026-11-02", donde: "A1", llamadas: 18, propuso: "Pauta de juicio",
      aprobadas: 1, propuestas: 2, tareas: 1, extra: "se cae",
    });
    expect(noche).toEqual({
      fecha: "2026-11-02", donde: "A1", llamadas: 18, propuso: "Pauta de juicio",
      aprobadas: 1, propuestas: 2, tareas: 1,
    });
  });
});

describe("aplicarAccion", () => {
  it("enciende y apaga la capa", () => {
    let config = aplicarAccion({}, "juicio", "encender");
    expect(config.juicio?.encendida).toBe(true);
    config = aplicarAccion(config, "juicio", "apagar");
    expect(config.juicio?.encendida).toBe(false);
  });

  it("gira «aportar» sin valor y la respeta con valor", () => {
    const girada = aplicarAccion({}, "juicio", "aportar");
    expect(girada.juicio?.aportar).toBe(false);
    expect(aplicarAccion(girada, "juicio", "aportar", true).juicio?.aportar).toBe(true);
  });

  it("«preguntarme antes de activar» se guarda por capa", () => {
    expect(aplicarAccion({}, "palabra", "preguntar", true).palabra?.preguntar).toBe(true);
  });

  it("«volver» no toca la config y una capa vacía no cambia nada", () => {
    expect(aplicarAccion({}, "juicio", "volver")).toEqual({});
    expect(aplicarAccion({}, "", "encender")).toEqual({});
  });

  it("las acciones permitidas son las del contrato", () => {
    expect(ACCIONES).toEqual(["encender", "apagar", "volver", "aportar", "preguntar"]);
  });
});

describe("textoAcierto", () => {
  it("sin archivo ni activa no dice nada", () => {
    expect(textoAcierto(null)).toBe("");
    expect(textoAcierto(archivo([], null))).toBe("");
    expect(textoAcierto(archivo([directiva({ version: 1, estado: "retirada" })], null))).toBe("");
  });

  it("compara la versión activa con la anterior", () => {
    const historial = [directiva({ version: 1, estado: "anterior", acierto: 0.483 }), directiva({ version: 2, estado: "activa", acierto: 0.517 })];
    expect(textoAcierto(archivo(historial, 2))).toBe("52 % ahora · 48 % antes");
  });

  it("primera versión: solo la activa", () => {
    expect(textoAcierto(archivo([directiva({ version: 1, estado: "activa" })], 1))).toBe("52 % ahora");
  });
});

describe("configCapa", () => {
  it("una capa que aún no está en el archivo recibe su defecto", () => {
    const cfg = configCapa(normalizarConfigAutomejora({ juicio: { encendida: true } }), "palabra");
    expect(cfg).toEqual(configCapaDefecto());
  });
});

