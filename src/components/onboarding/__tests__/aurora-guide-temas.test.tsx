/**
 * GUI1021C · los diez temas en el recorrido de Aurora (y cerebros/librería corregidos).
 *
 * En el contexto de hoy (Ola 1025U) los pasos del tour salen del catálogo único
 * `guia-completa.ts` (`STEPS = PASOS_GUIA.map(decorar)`), el mismo que recorre la ventana de
 * acceso. Esta prueba verifica el PROPÓSITO del paso: los diez temas están en el tour, en orden,
 * con los textos de la fuente común (`guia-temas-sistema.ts` + `guia-temas-red.ts`, §3 de
 * `architecture/guias-introduccion.md`), ningún paso repetido y el paso del cerebro llevando a
 * `/cerebro`.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));

import { STEPS } from "../aurora-guide";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";

describe("aurora-guide · los diez temas del tour (Ola 1021G)", () => {
  it("los diez temas están en el recorrido, en orden", () => {
    const clavesTour = STEPS.map((p) => p.key);
    const temas = TODOS_LOS_TEMAS.map((t) => t.key);
    const temasEnTour = clavesTour.filter((k) => temas.includes(k));
    expect(temasEnTour).toEqual(temas);
    expect(clavesTour.length).toBeGreaterThan(temas.length);
  });

  it("cada tema del tour dice el texto de la fuente común (título, cuerpo, voz y pregunta)", () => {
    for (const tema of TODOS_LOS_TEMAS) {
      const paso = STEPS.find((p) => p.key === tema.key);
      expect(paso, `falta el paso del tema ${tema.key}`).toBeTruthy();
      expect(paso?.title).toBe(tema.titulo);
      expect(paso?.body).toBe(tema.cuerpo);
      expect(paso?.say).toBe(tema.voz);
      expect(paso?.ask).toBe(tema.preguntaAurora);
    }
  });

  it("ningún paso del recorrido se repite", () => {
    const claves = STEPS.map((p) => p.key);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("el paso del cerebro lleva a /cerebro", () => {
    vi.useFakeTimers();
    try {
      // El tema «neuronas-cerebro» y el paso corregido «cerebros» («Tu cerebro») a la misma ruta.
      for (const clave of ["neuronas-cerebro", "cerebros"]) {
        const paso = STEPS.find((p) => p.key === clave);
        expect(paso, `falta el paso ${clave}`).toBeTruthy();
        expect(paso?.go?.run, `el paso ${clave} no lleva a un lugar`).toBeTruthy();
        const router = { push: vi.fn() };
        paso?.go?.run({ router: router as never, setActiveEdge: () => {} });
        expect(router.push).toHaveBeenCalledWith("/cerebro");
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
