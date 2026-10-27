import { describe, it, expect } from "vitest";
import { CURVA, DURACION } from "../movimiento";
import {
    aplicarMovimientoReducido,
    movimientoDe,
    type RegistroMovimiento,
    type SeccionMovimiento,
} from "../registros-movimiento";

/* DAN1024B — registros de movimiento por sección, sobre los tokens del OS */

const REGISTROS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];
const SECCIONES: SeccionMovimiento[] = [
    "trinity",
    "astraura",
    "genesis",
    "malla",
    "biblioteca",
    "protomolecula",
];
const LAS_DURACIONES = Object.values(DURACION);
const LAS_CURVAS = Object.values(CURVA);

describe("registros de movimiento", () => {
  it("los 18 pares (registro × sección) devuelven tokens del OS", () => {
    for (const registro of REGISTROS) {
      for (const seccion of SECCIONES) {
        const m = movimientoDe(registro, seccion);
        expect(LAS_DURACIONES).toContain(m.entrada.ms);
        expect(LAS_DURACIONES).toContain(m.salida.ms);
        expect(LAS_CURVAS).toContain(m.entrada.curva);
        expect(LAS_CURVAS).toContain(m.salida.curva);
      }
    }
  });

  it("la salida siempre es más corta que la entrada, en los 18 pares", () => {
    for (const registro of REGISTROS) {
      for (const seccion of SECCIONES) {
        const m = movimientoDe(registro, seccion);
        expect(m.salida.ms).toBeLessThan(m.entrada.ms);
      }
    }
  });

  it("la respiración respira entre 1 y 1,03 con periodo de 3500–6000 ms", () => {
    for (const registro of REGISTROS) {
      for (const seccion of SECCIONES) {
        const { respiracion } = movimientoDe(registro, seccion);
        expect(respiracion.escala).toBeGreaterThanOrEqual(1);
        expect(respiracion.escala).toBeLessThanOrEqual(1.03);
        expect(respiracion.periodoMs).toBeGreaterThanOrEqual(3500);
        expect(respiracion.periodoMs).toBeLessThanOrEqual(6000);
      }
    }
  });

  it("el registro manda: sobrio sin elástico y experimental solo elástico en entrada", () => {
    for (const seccion of SECCIONES) {
      const sobrio = movimientoDe("sobrio", seccion);
      expect(sobrio.entrada.curva).toBe(CURVA.suave);
      expect(sobrio.salida.curva).not.toBe(CURVA.elastico);

      const experimental = movimientoDe("experimental", seccion);
      expect(experimental.entrada.curva).toBe(CURVA.elastico);
      expect(experimental.salida.curva).not.toBe(CURVA.elastico);
    }
  });

  it("la sección matiza la cascada sin romper la base por registro", () => {
    expect(movimientoDe("sobrio", "genesis").cascadaMs).toBe(56);
    expect(movimientoDe("sobrio", "trinity").cascadaMs).toBe(32);
    expect(movimientoDe("experimental", "genesis").cascadaMs).toBe(
      movimientoDe("experimental", "astraura").cascadaMs,
    );
  });

  it("aplicarMovimientoReducido deja ms en 0 y escala en 1, para los 18 pares", () => {
    for (const registro of REGISTROS) {
      for (const seccion of SECCIONES) {
        const r = aplicarMovimientoReducido(movimientoDe(registro, seccion));
        expect(r.entrada.ms).toBe(0);
        expect(r.salida.ms).toBe(0);
        expect(r.cascadaMs).toBe(0);
        expect(r.respiracion.escala).toBe(1);
      }
    }
  });
});
