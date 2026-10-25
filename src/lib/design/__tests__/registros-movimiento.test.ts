import { describe, it, expect } from "vitest";
import { CURVA, DURACION } from "@/lib/design/movimiento";
import {
  aplicarMovimientoReducido,
  movimientoDe,
  type RegistroMovimiento,
  type SeccionMovimiento,
} from "@/lib/design/registros-movimiento";

const REGISTROS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];
const SECCIONES: SeccionMovimiento[] = [
  "trinity",
  "astraura",
  "genesis",
  "malla",
  "biblioteca",
  "protomolecula",
];
const DURACIONES = Object.values(DURACION);
const CURVAS = Object.values(CURVA);

describe("movimientoDe", () => {
  it("devuelve tokens del OS en los 18 pares", () => {
    for (const registro of REGISTROS) {
      for (const seccion of SECCIONES) {
        const r = movimientoDe(registro, seccion);
        expect(DURACIONES).toContain(r.entrada.ms);
        expect(DURACIONES).toContain(r.salida.ms);
        expect(CURVAS).toContain(r.entrada.curva);
        expect(CURVAS).toContain(r.salida.curva);
      }
    }
  });

  it("la salida siempre dura menos que la entrada", () => {
    for (const registro of REGISTROS) {
      for (const seccion of SECCIONES) {
        const r = movimientoDe(registro, seccion);
        expect(r.salida.ms).toBeLessThan(r.entrada.ms);
      }
    }
  });

  it("acota la respiración entre 1 y 1,03 durante 3500 a 6000 ms", () => {
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

  it("da identidad propia a cada sección", () => {
    const firmas = SECCIONES.map((seccion) => {
      const { cascadaMs, respiracion } = movimientoDe("expresivo", seccion);
      return `${cascadaMs}|${respiracion.periodoMs}`;
    });
    expect(new Set(firmas).size).toBe(SECCIONES.length);
  });

  it("sobrio usa normal/suave y no lleva elástico", () => {
    const r = movimientoDe("sobrio", "trinity");
    expect(r.entrada).toEqual({ ms: DURACION.normal, curva: CURVA.suave });
    expect(r.salida.curva).toBe(CURVA.salida);
  });

  it("expresivo entra pausado con la curva de entrada", () => {
    const r = movimientoDe("expresivo", "astraura");
    expect(r.entrada).toEqual({ ms: DURACION.pausado, curva: CURVA.entrada });
  });

  it("experimental reserva el elástico para la entrada", () => {
    const r = movimientoDe("experimental", "protomolecula");
    expect(r.entrada).toEqual({ ms: DURACION.escena, curva: CURVA.elastico });
    expect(r.salida.curva).toBe(CURVA.salida);
    expect(r.salida.curva).not.toBe(CURVA.elastico);
  });
});

describe("aplicarMovimientoReducido", () => {
  it("deja los 18 pares a 0 ms y escala 1", () => {
    for (const registro of REGISTROS) {
      for (const seccion of SECCIONES) {
        const r = aplicarMovimientoReducido(movimientoDe(registro, seccion));
        expect(r.entrada.ms).toBe(0);
        expect(r.salida.ms).toBe(0);
        expect(r.cascadaMs).toBe(0);
        expect(r.respiracion).toEqual({ escala: 1, periodoMs: 0 });
      }
    }
  });

  it("conserva las curvas y no muta el perfil original", () => {
    const r = movimientoDe("expresivo", "biblioteca");
    const entradaOriginal = { ...r.entrada };
    const reducido = aplicarMovimientoReducido(r);
    expect(reducido.entrada.curva).toBe(entradaOriginal.curva);
    expect(reducido.salida.curva).toBe(r.salida.curva);
    expect(r.entrada).toEqual(entradaOriginal);
  });
});
