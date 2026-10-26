/**
 * GUI1021C · los diez temas en el recorrido de Aurora y los pasos viejos corregidos.
 *
 * El tour toma los textos de `TODOS_LOS_TEMAS` (fuente de verdad del §3 de
 * `architecture/guias-introduccion.md`), no los copia a mano: si un texto cambia en el
 * catálogo puro, el paso cambia con él. `neuronas-cerebro` y `libreria-biblioteca` ocupan
 * el sitio de los antiguos `cerebros`/`libreria`, y el cerebro lleva a `/cerebro`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { STEPS } from "../aurora-guide";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";

const claves = (): string[] => STEPS.map((p) => p.key);

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("aurora-guide · los diez temas del tour (GUI1021C)", () => {
  it("los diez temas están juntos y en el orden del catálogo", () => {
    const esperadas = TODOS_LOS_TEMAS.map((t) => t.key);
    const tour = claves();
    const inicio = tour.indexOf(esperadas[0]);

    expect(esperadas).toHaveLength(10);
    expect(inicio).toBeGreaterThanOrEqual(0);
    expect(tour.slice(inicio, inicio + esperadas.length)).toEqual(esperadas);
  });

  it("cada tema copia los textos de la fuente común (título, cuerpo, voz y pregunta)", () => {
    for (const tema of TODOS_LOS_TEMAS) {
      const paso = STEPS.find((p) => p.key === tema.key);
      expect(paso, `falta el paso del tema ${tema.key}`).toBeTruthy();
      expect(paso?.title).toBe(tema.titulo);
      expect(paso?.body).toBe(tema.cuerpo);
      expect(paso?.say).toBe(tema.voz);
      expect(paso?.ask).toBe(tema.preguntaAurora);
    }
  });

  it("ningún paso del tour se repite", () => {
    const tour = claves();
    expect(new Set(tour).size).toBe(tour.length);
  });

  it("no queda el paso viejo «libreria»: lo sustituye «libreria-biblioteca»", () => {
    expect(claves()).not.toContain("libreria");
    expect(claves()).toContain("libreria-biblioteca");
  });

  it("el paso del cerebro lleva a /cerebro", () => {
    const paso = STEPS.find((p) => p.key === "neuronas-cerebro");
    expect(paso?.go, "el paso neuronas-cerebro debe tener «Ir»").toBeTruthy();

    vi.useFakeTimers();
    const push = vi.fn();
    paso?.go?.run({ router: { push } as never, setActiveEdge: () => {} });
    expect(push).toHaveBeenCalledWith("/cerebro");
  });
});
