import { describe, it, expect } from "vitest";
import {
  decidirInterrupcion,
  estadoInicialInterrupcion,
} from "@/lib/aurora/interrumpir-por-voz";
import type { MuestraMicro } from "@/lib/aurora/interrumpir-por-voz";

const m = (ahoraMs: number, nivelDb: number): MuestraMicro => ({ ahoraMs, nivelDb });

describe("decidirInterrupcion (detector de interrupción por voz)", () => {
  it("con silencio claro no interrumpe nunca", () => {
    const muestras = [m(0, -80), m(100, -75), m(250, -82), m(600, -60)];
    const r = decidirInterrupcion(muestras, estadoInicialInterrupcion());
    expect(r.interrumpir).toBe(false);
  });

  it("contando modo tanda: voz sostenida 250 ms o más interrumpe", () => {
    const muestras = [m(0, -30), m(120, -28), m(250, -32), m(400, -30)];
    const r = decidirInterrupcion(muestras, estadoInicialInterrupcion(), { umbralDb: -40, minimoMs: 250 });
    expect(r.interrumpir).toBe(true);
    expect(r.estado.altaDesdeMs).toBe(0);
  });

  it("menos de 250 ms de voz no interrumpe (marca mínima del contrato)", () => {
    const muestras = [m(0, -30), m(100, -28), m(199, -30), m(200, -28)];
    const r = decidirInterrupcion(muestras, estadoInicialInterrupcion());
    expect(r.interrumpir).toBe(false);
  });

  it("acumula entre tandas con el estado que devuelve", () => {
    const primera = decidirInterrupcion([m(0, -30), m(200, -28)], estadoInicialInterrupcion());
    expect(primera.interrumpir).toBe(false);
    const segunda = decidirInterrupcion([m(260, -30)], primera.estado);
    expect(segunda.interrumpir).toBe(true);
  });

  it("la histéresis aguanta un respiro entre activación y vuelta, y no corta", () => {
    const muestras = [m(0, -30), m(100, -42), m(200, -30), m(250, -32)];
    const r = decidirInterrupcion(muestras, estadoInicialInterrupcion());
    expect(r.interrumpir).toBe(true); // de 0 a 250 ms sin silencio claro
  });

  it("un silencio claro (por debajo de la histéresis) reinicia la cuenta", () => {
    const muestras = [m(0, -30), m(100, -30), m(150, -55), m(300, -30)];
    const r = decidirInterrupcion(muestras, estadoInicialInterrupcion());
    expect(r.interrumpir).toBe(false);
    expect(r.estado.altaDesdeMs).toBe(300);
  });

  it("respeta la ventana de eco: energía anterior al armado no cuenta", () => {
    const muestras = [m(0, -20), m(200, -20), m(420, -20), m(520, -20)];
    const r = decidirInterrupcion(muestras, estadoInicialInterrupcion(), { armadoDesdeMs: 500 });
    expect(r.interrumpir).toBe(false);
    expect(r.estado.altaDesdeMs).toBe(520);
  });

  it("sin ventana de eco, esa misma energía sostenida sí interrumpe", () => {
    const muestras = [m(0, -20), m(200, -20), m(300, -20)];
    const r = decidirInterrupcion(muestras, estadoInicialInterrupcion());
    expect(r.interrumpir).toBe(true);
  });

  it("con eco propio evidenciado (esEco) no interrumpe", () => {
    const muestras = [m(0, -20), m(300, -20), m(600, -20)];
    const r = decidirInterrupcion(muestras, estadoInicialInterrupcion(), { esEco: true });
    expect(r.interrumpir).toBe(false);
  });

  it("muestras fuera de orden se ordenan por su marca de tiempo", () => {
    const r = decidirInterrupcion([m(300, -30), m(0, -30), m(100, -30)], estadoInicialInterrupcion());
    expect(r.interrumpir).toBe(true);
    expect(r.estado.altaDesdeMs).toBe(0);
  });

  it("umbral por defecto -40 dBFS: una palabra clara a -35 interrumpe, un rumor a -45 no", () => {
    const palabra = decidirInterrupcion([m(0, -35), m(300, -35)], estadoInicialInterrupcion());
    expect(palabra.interrumpir).toBe(true);
    const rumor = decidirInterrupcion([m(0, -45), m(300, -45)], estadoInicialInterrupcion());
    expect(rumor.interrumpir).toBe(false); // -45 está en la banda de histéresis
  });

  it("tanda vacía devuelve la decisión falsa y el estado intacto", () => {
    const estado = { altaDesdeMs: 123 };
    const r = decidirInterrupcion([], estado);
    expect(r.interrumpir).toBe(false);
    expect(r.estado).toEqual(estado);
  });
});
