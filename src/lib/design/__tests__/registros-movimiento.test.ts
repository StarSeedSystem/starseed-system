import { describe, it, expect } from "vitest";
import { CURVA, DURACION } from "../movimiento";
import {
  REGISTROS_MOVIMIENTO,
  SECCIONES_MOVIMIENTO,
  aplicarMovimientoReducido,
  movimientoDe,
  type RegistroMovimiento,
  type SeccionMovimiento,
} from "../registros-movimiento";

const DURACIONES = Object.values(DURACION);
const CURVAS = Object.values(CURVA);

const PARES: Array<[RegistroMovimiento, SeccionMovimiento]> =
  REGISTROS_MOVIMIENTO.flatMap((registro) =>
    SECCIONES_MOVIMIENTO.map((seccion) => [registro, seccion] as [RegistroMovimiento, SeccionMovimiento]),
  );

describe("registros de movimiento · 18 pares", () => {
  it("cubre los tres registros y las seis secciones (18 pares)", () => {
    expect(REGISTROS_MOVIMIENTO.length).toBe(3);
    expect(SECCIONES_MOVIMIENTO.length).toBe(6);
    expect(PARES.length).toBe(18);
  });

  it("devuelve solo duraciones y curvas del OS en los 18 pares", () => {
    for (const [registro, seccion] of PARES) {
      const m = movimientoDe(registro, seccion);
      expect(DURACIONES).toContain(m.entrada.ms);
      expect(DURACIONES).toContain(m.salida.ms);
      expect(CURVAS).toContain(m.entrada.curva);
      expect(CURVAS).toContain(m.salida.curva);
    }
  });

  it("la salida siempre es más corta que la entrada", () => {
    for (const [registro, seccion] of PARES) {
      const m = movimientoDe(registro, seccion);
      expect(m.salida.ms).toBeLessThan(m.entrada.ms);
    }
  });

  it("la respiración queda entre 1–1,03 y 3500–6000 ms", () => {
    for (const [registro, seccion] of PARES) {
      const { escala, periodoMs } = movimientoDe(registro, seccion).respiracion;
      expect(escala).toBeGreaterThanOrEqual(1);
      expect(escala).toBeLessThanOrEqual(1.03);
      expect(periodoMs).toBeGreaterThanOrEqual(3500);
      expect(periodoMs).toBeLessThanOrEqual(6000);
    }
  });

  it("la cascada es un retardo no negativo y corto", () => {
    for (const [registro, seccion] of PARES) {
      const { cascadaMs } = movimientoDe(registro, seccion);
      expect(cascadaMs).toBeGreaterThanOrEqual(0);
      expect(cascadaMs).toBeLessThanOrEqual(120);
    }
  });
});

describe("carácter de cada registro", () => {
  it("sobrio usa normal/suave y nunca el elástico", () => {
    const m = movimientoDe("sobrio", "biblioteca");
    expect(m.entrada).toEqual({ ms: DURACION.normal, curva: CURVA.suave });
    expect(m.entrada.curva).not.toBe(CURVA.elastico);
    expect(m.salida.curva).not.toBe(CURVA.elastico);
  });

  it("expresivo entra pausado con la curva de entrada", () => {
    const m = movimientoDe("expresivo", "trinity");
    expect(m.entrada).toEqual({ ms: DURACION.pausado, curva: CURVA.entrada });
  });

  it("experimental usa escena/elástico solo en la entrada", () => {
    const m = movimientoDe("experimental", "protomolecula");
    expect(m.entrada).toEqual({ ms: DURACION.escena, curva: CURVA.elastico });
    expect(m.salida.curva).not.toBe(CURVA.elastico);
    expect(m.salida.ms).toBeLessThan(m.entrada.ms);
  });

  it("cada sección tiene su propio pulso sin romper los límites", () => {
    const periodos = SECCIONES_MOVIMIENTO.map(
      (seccion) => movimientoDe("expresivo", seccion).respiracion.periodoMs,
    );
    expect(new Set(periodos).size).toBeGreaterThan(1);
  });
});

describe("movimiento reducido", () => {
  it("deja ms y cascada en 0 y la escala en 1", () => {
    for (const [registro, seccion] of PARES) {
      const r = aplicarMovimientoReducido(movimientoDe(registro, seccion));
      expect(r.entrada.ms).toBe(0);
      expect(r.salida.ms).toBe(0);
      expect(r.cascadaMs).toBe(0);
      expect(r.respiracion.escala).toBe(1);
    }
  });

  it("conserva las curvas y el periodo del registro elegido", () => {
    const original = movimientoDe("experimental", "malla");
    const reducido = aplicarMovimientoReducido(original);
    expect(reducido.entrada.curva).toBe(original.entrada.curva);
    expect(reducido.salida.curva).toBe(original.salida.curva);
    expect(reducido.respiracion.periodoMs).toBe(original.respiracion.periodoMs);
  });
});
