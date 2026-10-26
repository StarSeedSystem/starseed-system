// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ABRIR_GRABAR_EVENT,
  MENSAJE_ABIERTA,
  MENSAJE_SIN_OYENTE,
  MENSAJE_SIN_VENTANA,
  URL_CAP,
  abrirGrabar,
  detalleDe,
  escucharAbrirGrabar,
  type DetalleAbrirGrabar,
  type EmisorEventos,
} from "../grabar-pantalla";

/** Un emisor de verdad (un EventTarget) para probar el contrato sin tocar `window`. */
function emisor(): EventTarget & EmisorEventos {
  return new EventTarget();
}

afterEach(() => vi.unstubAllGlobals());

describe("grabar-pantalla · el contrato del evento", () => {
  it("el evento tiene un nombre claro y propio", () => {
    expect(ABRIR_GRABAR_EVENT).toBe("starseed:abrir-grabar");
    expect(URL_CAP).toBe("https://cap.so");
  });

  it("si nadie escucha, lo dice tal cual: no se abrió nada", () => {
    const r = abrirGrabar({ destino: emisor() });
    expect(r).toEqual({ abierto: false, razon: "sin-oyente", mensaje: MENSAJE_SIN_OYENTE });
    expect(MENSAJE_SIN_OYENTE).toMatch(/no se ha abierto nada/);
    expect(MENSAJE_SIN_OYENTE).toMatch(/a mano desde el Centro de Control/);
    expect(MENSAJE_SIN_OYENTE).not.toMatch(/Pedí abrir/);
  });

  it("un oyente que NO reclama el evento (no hace preventDefault) tampoco cuenta como abierto", () => {
    const destino = emisor();
    const visto = vi.fn();
    destino.addEventListener(ABRIR_GRABAR_EVENT, visto);
    expect(abrirGrabar({ destino })).toMatchObject({ abierto: false, razon: "sin-oyente" });
    expect(visto).toHaveBeenCalledTimes(1);
  });

  it("si un oyente lo reclama, se abrió: y recibe quién lo pide y para qué, limpios", () => {
    const destino = emisor();
    const recibido: DetalleAbrirGrabar[] = [];
    escucharAbrirGrabar((d) => recibido.push(d), destino);
    const r = abrirGrabar({ destino, origen: "  biblioteca ", motivo: "Tutorial\n de   la   malla" });
    expect(r).toEqual({ abierto: true, mensaje: MENSAJE_ABIERTA });
    expect(recibido).toEqual([{ origen: "biblioteca", motivo: "Tutorial de la malla" }]);
    expect(MENSAJE_ABIERTA).toMatch(/eres tú quien pulsa «grabar»/);
  });

  it("el origen por defecto es astraura, sin motivo es null y los textos largos se recortan", () => {
    const destino = emisor();
    const recibido: DetalleAbrirGrabar[] = [];
    escucharAbrirGrabar((d) => recibido.push(d), destino);
    abrirGrabar({ destino });
    abrirGrabar({ destino, origen: "x".repeat(200), motivo: "y".repeat(500) });
    expect(recibido[0]).toEqual({ origen: "astraura", motivo: null });
    expect(recibido[1]?.origen).toHaveLength(40);
    expect(recibido[1]?.motivo).toHaveLength(200);
  });

  it("al desapuntarse el oyente, vuelve a decir que nadie escucha", () => {
    const destino = emisor();
    const quitar = escucharAbrirGrabar(() => undefined, destino);
    expect(abrirGrabar({ destino }).abierto).toBe(true);
    quitar();
    expect(abrirGrabar({ destino })).toMatchObject({ abierto: false, razon: "sin-oyente" });
  });

  it("funciona con la ventana real y no lanza aunque el emisor falle", () => {
    const quitar = escucharAbrirGrabar(() => undefined);
    expect(abrirGrabar({ origen: "prueba" }).abierto).toBe(true);
    quitar();
    expect(abrirGrabar({ origen: "prueba" }).abierto).toBe(false);
    const roto: EmisorEventos = {
      dispatchEvent: () => {
        throw new Error("explotó");
      },
    };
    expect(abrirGrabar({ destino: roto })).toMatchObject({ abierto: false, razon: "sin-oyente" });
  });

  it("sin ventana ni emisor (servidor) lo dice y no hace nada", () => {
    vi.stubGlobal("window", undefined);
    expect(abrirGrabar()).toEqual({ abierto: false, razon: "sin-ventana", mensaje: MENSAJE_SIN_VENTANA });
    expect(escucharAbrirGrabar(() => undefined)()).toBeUndefined();
  });

  it("un evento ajeno o sin detalle da valores por defecto en vez de romper", () => {
    expect(detalleDe(new Event(ABRIR_GRABAR_EVENT))).toEqual({ origen: "desconocido", motivo: null });
    expect(detalleDe(new CustomEvent(ABRIR_GRABAR_EVENT, { detail: { origen: 7, motivo: {} } }))).toEqual({ origen: "desconocido", motivo: null });
  });
});

describe("grabar-pantalla · el módulo es puro (CLAUDE.md, trampa 11)", () => {
  it("no importa nada del OS, ni node:*, ni «use client»", () => {
    const fuente = readFileSync(path.resolve(__dirname, "../grabar-pantalla.ts"), "utf8");
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/^\s*import\s/m);
    expect(codigo).not.toMatch(/^\s*["']use client["']/m);
    // Solo ABRE la sección: no pide la captura de pantalla por su cuenta.
    expect(codigo).not.toMatch(/getDisplayMedia|MediaRecorder/);
  });
});
