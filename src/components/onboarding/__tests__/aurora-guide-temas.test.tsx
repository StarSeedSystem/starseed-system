import { describe, it, expect, vi } from "vitest";
import { Compass } from "lucide-react";
import { STEPS } from "../aurora-guide";
import { ACENTOS_TRINITY } from "@/lib/onboarding/guia-completa";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";

/**
 * Ejecuta el «Ir» de un paso con un router de mentira y devuelve la ruta pedida.
 * `safeGoto` empuja primero por el router y deja un rescate con `setTimeout`:
 * los temporizadores falsos evitan que ese rescate navegue de verdad en jsdom.
 */
function rutaDelPaso(clave: string): unknown {
  const run = STEPS.find((p) => p.key === clave)?.go?.run;
  if (!run) return undefined;
  vi.useFakeTimers();
  try {
    const router = { push: vi.fn() };
    run({ router: router as never, setActiveEdge: () => {} });
    return router.push.mock.calls[0]?.[0];
  } finally {
    vi.useRealTimers();
  }
}

describe("aurora-guide · los diez temas del tour (Ola 1021G)", () => {
  const clavesTema = TODOS_LOS_TEMAS.map((t) => t.key);

  it("el tour recorre los diez temas, una vez cada uno y en el orden de TODOS_LOS_TEMAS", () => {
    const clavesTour = STEPS.map((p) => p.key);
    expect(clavesTour.length).toBeGreaterThan(clavesTema.length);
    const soloTemas = clavesTour.filter((k) => clavesTema.includes(k));
    expect(soloTemas).toEqual(clavesTema);
    for (const clave of clavesTema) {
      expect(clavesTour.filter((k) => k === clave), `el tema ${clave} se repite`).toHaveLength(1);
    }
  });

  it("cada tema del tour dice el texto de la fuente común (título, cuerpo, voz y pregunta)", () => {
    for (const tema of TODOS_LOS_TEMAS) {
      const paso = STEPS.find((p) => p.key === tema.key);
      expect(paso, `falta el paso del tema ${tema.key}`).toBeTruthy();
      expect(paso?.title).toBe(tema.titulo);
      expect(paso?.body).toBe(tema.cuerpo);
      expect(paso?.say).toBe(tema.voz);
      expect(paso?.ask).toBe(tema.preguntaAurora);
      // El catálogo único es la única fuente: el paso guardado también la copia.
      expect(paso?.paso.titulo).toBe(tema.titulo);
      expect(paso?.paso.texto).toBe(tema.cuerpo);
      expect(paso?.paso.voz).toBe(tema.voz);
      expect(paso?.paso.pregunta).toBe(tema.preguntaAurora);
      expect(paso?.paso.ruta).toBe(tema.ruta);
    }
  });

  it("cada tema lleva su icono lucide propio (no la brújula de reserva) y un color Trinity", () => {
    for (const tema of TODOS_LOS_TEMAS) {
      const paso = STEPS.find((p) => p.key === tema.key);
      expect(paso?.icon, `el tema ${tema.key} no tiene icono`).toBeDefined();
      expect(paso?.icon, `el tema ${tema.key} cae al icono de reserva`).not.toBe(Compass);
      expect(Object.values(ACENTOS_TRINITY)).toContain(paso?.accent);
    }
  });

  it("el «Ir» de cada tema navega a la ruta real de la fuente común", () => {
    for (const tema of TODOS_LOS_TEMAS) {
      expect(rutaDelPaso(tema.key), `el tema ${tema.key} no navega`).toBe(tema.ruta);
    }
  });

  it("el paso viejo «libreria» ya no existe: el tema es «libreria-biblioteca»", () => {
    const claves = STEPS.map((p) => p.key);
    expect(claves).toContain("libreria-biblioteca");
    expect(claves).not.toContain("libreria");
  });

  it("ningún paso del tour se repite", () => {
    const claves = STEPS.map((p) => p.key);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("el paso del cerebro lleva a /cerebro", () => {
    const paso = STEPS.find((p) => p.key === "neuronas-cerebro");
    expect(paso?.go?.run).toBeTruthy();
    expect(paso?.paso.ruta).toBe("/cerebro");
    expect(rutaDelPaso("neuronas-cerebro")).toBe("/cerebro");
  });
});
