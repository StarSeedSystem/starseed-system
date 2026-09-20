import { describe, it, expect } from "vitest";
import {
  construirPromptNeedle,
  normalizarRespuestaNeedle,
  cargarNeedleWasm,
  decidirEnDispositivo,
  DEFAULT_URL_ENGINE,
  DEFAULT_URL_PESOS,
} from "../needle-wasm";
import type { HerramientaNeedle } from "../needle3-client";

describe("needle-wasm", () => {
  const herramientasEjemplo: HerramientaNeedle[] = [
    {
      name: "apariencia",
      description: "Cambiar apariencia de UI",
      parameters: { type: "object", properties: { tema: { type: "string" } } },
    },
  ];

  it("construirPromptNeedle genera el prompt con sistema y herramientas", () => {
    const prompt = construirPromptNeedle("poner modo oscuro", herramientasEjemplo, "Sistema OS");
    expect(prompt).toContain("Sistema OS");
    expect(prompt).toContain("Herramientas:");
    expect(prompt).toContain("apariencia");
    expect(prompt).toContain("Consulta: poner modo oscuro");
  });

  it("normalizarRespuestaNeedle maneja respuestas vacías o inválidas", () => {
    const vacia = normalizarRespuestaNeedle("");
    expect(vacia.ok).toBe(false);
    expect(vacia.error).toContain("Respuesta vacía");

    const invalida = normalizarRespuestaNeedle("no json");
    expect(invalida.ok).toBe(false);
    expect(invalida.error).toContain("Error de parseo");
  });

  it("normalizarRespuestaNeedle procesa respuestas JSON estructuradas", () => {
    const raw = JSON.stringify({
      function_calls: [{ name: "apariencia", args: { tema: "oscuro" } }],
      confidence: 0.92,
      reasoning: "El usuario solicitó cambiar a modo oscuro",
    });

    const res = normalizarRespuestaNeedle(raw, 42);
    expect(res.ok).toBe(true);
    expect(res.motor).toBe("needle3-wasm");
    expect(res.confianza).toBe(0.92);
    expect(res.razonamiento).toBe("El usuario solicitó cambiar a modo oscuro");
    expect(res.ms).toBe(42);
    expect(res.llamadas).toHaveLength(1);
    expect(res.llamadas?.[0].nombre).toBe("apariencia");
    expect(res.llamadas?.[0].argumentos).toEqual({ tema: "oscuro" });
  });

  it("cargarNeedleWasm inicializa el estado con URLs por defecto", async () => {
    const engine = await cargarNeedleWasm();
    expect(engine.cargado).toBe(true);
    expect(engine.origenEngine).toBe(DEFAULT_URL_ENGINE);
    expect(engine.origenPesos).toBe(DEFAULT_URL_PESOS);
  });

  it("decidirEnDispositivo devuelve una decisión estructurada", async () => {
    const dec = await decidirEnDispositivo("activar modo oscuro", herramientasEjemplo);
    expect(dec.ok).toBe(true);
    expect(dec.motor).toBe("needle3-wasm");
    expect(typeof dec.ms).toBe("number");
  });
});
