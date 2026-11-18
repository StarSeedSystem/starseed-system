/**
 * IMG-agentes-reimaginada-profunda-corregir-te-d2 (parte 2) · planificación del
 * respiro del temporizador de la guía. Función pura: entrada (última
 * interacción, ahora, respiro) → salida (cuándo revisar y cuánto esperar). Sin
 * red, sin disco, sin window.
 */
import { describe, expect, it } from "vitest";
import {
  RESPIRO_POR_DEFECTO_MS,
  planificarRespiro,
} from "../use-timeout-interaction";

describe("planificarRespiro", () => {
  it("usa el respiro de la guía (900 ms) cuando no se indica otro", () => {
    expect(RESPIRO_POR_DEFECTO_MS).toBe(900);
    const plan = planificarRespiro(1_000, 1_000);
    expect(plan.esperaMs).toBe(RESPIRO_POR_DEFECTO_MS);
    expect(plan.revisarEnMs).toBe(1_000 + RESPIRO_POR_DEFECTO_MS);
  });

  it("con una interacción reciente espera solo lo que falta del respiro", () => {
    const plan = planificarRespiro(10_000 - 100, 10_000, 900);
    expect(plan).toEqual({
      ultimaInteraccionMs: 9_900,
      revisarEnMs: 10_800,
      esperaMs: 800,
    });
  });

  it("con el respiro ya cumplido no hace esperar: revisa de inmediato", () => {
    const plan = planificarRespiro(10_000 - 5_000, 10_000, 900);
    expect(plan.esperaMs).toBe(0);
    expect(plan.revisarEnMs).toBe(5_900);
  });

  it("justo en el límite del respiro la espera es cero", () => {
    expect(planificarRespiro(9_100, 10_000, 900).esperaMs).toBe(0);
    expect(planificarRespiro(9_101, 10_000, 900).esperaMs).toBe(1);
  });

  it("sin señal de interacción revisa de inmediato sin inventar una marca", () => {
    for (const sinSenal of [0, null, undefined, Number.NaN, -5, Number.POSITIVE_INFINITY]) {
      const plan = planificarRespiro(sinSenal, 4_200, 900);
      expect(plan).toEqual({
        ultimaInteraccionMs: 0,
        revisarEnMs: 4_200,
        esperaMs: 0,
      });
    }
  });

  it("un respiro inválido no espera: la puerta de apertura decidirá", () => {
    for (const respiroInvalido of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(planificarRespiro(9_900, 10_000, respiroInvalido).esperaMs).toBe(0);
    }
  });

  it("un `ahora` inválido se normaliza a 0 y no produce esperas negativas", () => {
    expect(planificarRespiro(1_000, Number.NaN, 900).esperaMs).toBe(1_900);
    expect(planificarRespiro(1_000, Number.NaN, 900).revisarEnMs).toBe(1_900);
  });
});
