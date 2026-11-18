/**
 * chat-herramientas · herramienta «Traductor universal» (TRA1116A, PARTE B):
 * forma del catálogo, ausencia de choque con `SKILL_CAPABILITIES` y
 * alternado con `alternarHerramienta`. Todo puro: sin red, sin DOM.
 */

import { describe, expect, it } from "vitest";
import {
  HERRAMIENTAS_ASTRAURA_VIVO,
  HERRAMIENTA_TRADUCTOR,
  alternarHerramienta,
} from "@/lib/astraura/chat-herramientas";
import { SKILL_CAPABILITIES } from "@/ai/astraura/skills";

/** Catálogo de ejemplo del picker, como el que usa el resto de pruebas. */
const TODOS_IDS = [
  "taste",
  "pm",
  "av-gen",
  "contenido-vivo",
  HERRAMIENTA_TRADUCTOR.id,
];

describe("herramienta Traductor universal en el catálogo", () => {
  it("tiene la forma del picker: id, etiqueta, paquete y encendida por defecto", () => {
    expect(HERRAMIENTA_TRADUCTOR.id).toBe("traductor-universal");
    expect(HERRAMIENTA_TRADUCTOR.label).toBe("Traductor universal");
    expect(HERRAMIENTA_TRADUCTOR.defaultOn).toBe(true);
    expect(HERRAMIENTA_TRADUCTOR.packageIds).toEqual(["app-traductor"]);
  });

  it("su systemPrompt explica cuándo usarla y la honestidad ante el fallo", () => {
    expect(HERRAMIENTA_TRADUCTOR.systemPrompt).toContain("Traductor universal");
    expect(HERRAMIENTA_TRADUCTOR.systemPrompt).toContain("idioma distinto");
    expect(HERRAMIENTA_TRADUCTOR.systemPrompt).toContain("traduce");
    expect(HERRAMIENTA_TRADUCTOR.systemPrompt).toContain("varias personas");
    expect(HERRAMIENTA_TRADUCTOR.systemPrompt).toContain("no inventes la traducción");
  });

  it("viaja en el catálogo exactamente una vez", () => {
    const veces = HERRAMIENTAS_ASTRAURA_VIVO.filter((h) => h.id === "traductor-universal");
    expect(veces).toHaveLength(1);
    expect(veces[0]).toBe(HERRAMIENTA_TRADUCTOR);
  });

  it("su id no choca con ninguna capacidad del catálogo base", () => {
    const idsBase = SKILL_CAPABILITIES.map((c) => c.id);
    expect(idsBase).not.toContain(HERRAMIENTA_TRADUCTOR.id);
  });
});

describe("alternado de la herramienta con alternarHerramienta", () => {
  it("desactivarla deja a las demás activas y la excluye", () => {
    const trasApagar = alternarHerramienta(undefined, TODOS_IDS, HERRAMIENTA_TRADUCTOR.id);
    expect(trasApagar).toEqual(["taste", "pm", "av-gen", "contenido-vivo"]);
  });

  it("reactivarla devuelve el catálogo completo y colapsa a «Todas»", () => {
    const apagada = alternarHerramienta(undefined, TODOS_IDS, HERRAMIENTA_TRADUCTOR.id);
    const reenciendida = alternarHerramienta(apagada, TODOS_IDS, HERRAMIENTA_TRADUCTOR.id);
    expect(reenciendida).toBeUndefined();
  });
});
