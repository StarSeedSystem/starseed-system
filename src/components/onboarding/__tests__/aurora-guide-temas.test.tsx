import { describe, it, expect, vi } from "vitest";
import { STEPS } from "../aurora-guide";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";

describe("aurora-guide · los diez temas del tour (Ola 1021G)", () => {
  const clavesTema = TODOS_LOS_TEMAS.map((t) => t.key);

  it("el tour recorre los diez temas, en el orden de TODOS_LOS_TEMAS", () => {
    const clavesTour = STEPS.map((p) => p.key);
    expect(clavesTour.length).toBeGreaterThan(clavesTema.length);
    const soloTemas = clavesTour.filter((k) => clavesTema.includes(k));
    expect(soloTemas).toEqual(clavesTema);
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

  it("ningún paso del tour se repite", () => {
    const claves = STEPS.map((p) => p.key);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("el paso del cerebro lleva a /cerebro", () => {
    const paso = STEPS.find((p) => p.key === "neuronas-cerebro");
    expect(paso?.go?.run).toBeTruthy();
    vi.useFakeTimers();
    try {
      const router = { push: vi.fn() };
      paso?.go?.run({ router: router as never, setActiveEdge: () => {} });
      expect(router.push).toHaveBeenCalledWith("/cerebro");
    } finally {
      vi.useRealTimers();
    }
  });
});
