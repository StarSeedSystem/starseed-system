/**
 * Detector de interrupción por voz (Ola 1015V · voz-fusionada-astraura.md §4).
 *
 * Solo pruebas de funciones PURAS con muestras sintéticas: sin red, sin
 * micrófono, sin procesos, sin violín de tiempo real (el estado y «ahora»
 * entran por parámetro, así que las llamadas son deterministas).
 */
import { describe, expect, it } from "vitest";
import {
  DB_SILENCIO,
  HISTERESIS_DB,
  MINIMO_MS_DEFECTO,
  decidirInterrupcion,
  dbDesdeMuestras,
  guardiaEcoDesde,
  umbralDeCalla,
} from "@/lib/aurora/interrumpir-por-voz";

/** Trama de habla sintética con el pico dado. */
function habla(pico: number): number[] {
  return Array.from({ length: 16 }, (_, i) => Math.sin(i) * pico);
}

const SILENCIO: number[] = new Array(16).fill(0);
const estadoInicial = (ahora: number) => ({ registroMs: null, disparado: false, ahora });
/** Opciones tipo contrato: umbral −30 dBFS y 250 ms de habla (voz fusionada §4). */
const opciones = { umbralDb: -30, minimoMs: MINIMO_MS_DEFECTO };

describe("dbDesdeMuestras", () => {
  it("convierte silencio absoluto al piso", () => {
    expect(dbDesdeMuestras(SILENCIO)).toBe(DB_SILENCIO);
  });

  it("un pico de 0,5 equivale a -6 dBFS", () => {
    const db = dbDesdeMuestras(habla(0.5));
    expect(db).toBeCloseTo(-6.02, 1);
  });
});

describe("histéresis", () => {
  it("el umbral de callar queda por debajo del de arranque", () => {
    expect(umbralDeCalla(-30)).toBe(-30 - HISTERESIS_DB);
  });
});

describe("decidirInterrupcion", () => {
  it("en silencio no interrumpe ni abre registro", () => {
    const v = decidirInterrupcion(SILENCIO, estadoInicial(0), opciones);
    expect(v.interrumpir).toBe(false);
    expect(v.estado.registroMs).toBeNull();
  });

  it("arranca el tramo al primer tramo por encima del umbral", () => {
    const v = decidirInterrupcion(habla(0.2), estadoInicial(0), opciones);
    expect(v.interrumpir).toBe(false);
    expect(v.estado.registroMs).toBe(0);
  });

  it("dispara al superar los 250 ms de habla seguida", () => {
    const inicio = decidirInterrupcion(habla(0.2), estadoInicial(0), opciones);
    const v = decidirInterrupcion(
      habla(0.2),
      { ...inicio.estado, ahora: 250 },
      opciones,
    );
    expect(v.interrumpir).toBe(true);
    expect(v.estado.registroMs).toBe(0);
  });

  it("habiendo hablado poco tiempo no dispara todavía", () => {
    const inicio = decidirInterrupcion(habla(0.2), estadoInicial(0), opciones);
    const v = decidirInterrupcion(
      habla(0.2),
      { ...inicio.estado, ahora: 249 },
      opciones,
    );
    expect(v.interrumpir).toBe(false);
  });

  it("una pausa breve en la zona de histéresis sostiene el tramo", () => {
    const inicio = decidirInterrupcion(habla(0.2), estadoInicial(0), opciones);
    const pausa = decidirInterrupcion(
      habla(0.03), // -26 dBFS: entre el umbral de callar (-36) y el de arranque (-30)
      { ...inicio.estado, ahora: 100 },
      opciones,
    );
    expect(pausa.estado.registroMs).toBe(0);
    const v = decidirInterrupcion(
      habla(0.2),
      { ...pausa.estado, ahora: 300 },
      opciones,
    );
    expect(v.interrumpir).toBe(true);
  });

  it("una caída por debajo del umbral de callar rompe el tramo", () => {
    const inicio = decidirInterrupcion(habla(0.2), estadoInicial(0), opciones);
    const caida = decidirInterrupcion(
      SILENCIO,
      { ...inicio.estado, ahora: 100 },
      opciones,
    );
    expect(caida.estado.registroMs).toBeNull();
    const v = decidirInterrupcion(
      habla(0.2),
      { ...caida.estado, ahora: 300 },
      opciones,
    );
    expect(v.interrumpir).toBe(false);
  });

  it("dispara UNA vez por tramo: repetir exige silencio primero", () => {
    const inicio = decidirInterrupcion(habla(0.2), estadoInicial(0), opciones);
    const disparo = decidirInterrupcion(
      habla(0.2),
      { ...inicio.estado, ahora: 250 },
      opciones,
    );
    expect(disparo.interrumpir).toBe(true);
    const sigue = decidirInterrupcion(
      habla(0.2),
      { ...disparo.estado, ahora: 500 },
      opciones,
    );
    expect(sigue.interrumpir).toBe(false);
  });
});

describe("ventana de eco propio", () => {
  it("durante `ventanaEcoMs` desde el arranque no se interrumpe", () => {
    const guardia = guardiaEcoDesde({}, 0);
    const v = decidirInterrupcion(
      habla(0.3),
      { registroMs: null, disparado: false, ahora: 300, guardiaHastaMs: guardia },
      opciones,
    );
    expect(v.interrumpir).toBe(false);
    expect(v.estado.registroMs).toBeNull();
  });

  it("pasada la ventana anti-eco vuelve a escuchar", () => {
    const guardia = guardiaEcoDesde({}, 0);
    const v = decidirInterrupcion(
      habla(0.3),
      { registroMs: null, disparado: false, ahora: guardia + 1, guardiaHastaMs: guardia },
      opciones,
    );
    expect(v.estado.registroMs).toBe(guardia + 1);
    expect(v.interrumpir).toBe(false); // el tramo acaba de abrirse: aún no
  });

  it("la ventana en móvil es más larga que en escritorio", () => {
    expect(guardiaEcoDesde({ movil: true }, 0)).toBeGreaterThan(guardiaEcoDesde({}, 0));
  });
});
