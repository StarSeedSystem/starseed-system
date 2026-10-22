import { describe, it, expect } from "vitest";
import type { SkillCapability } from "@/ai/astraura/skills";
import { habilidadesPara, recortarPorCapa } from "../habilidades-agente";

/** Fichas de prueba, mismas formas que el manifiesto real de skills. */
const ficha = (
  id: string,
  label: string,
  routing: SkillCapability["routing"] = undefined,
  extra: Partial<SkillCapability> = {}
): SkillCapability => ({
  id,
  label,
  systemPrompt: "prompt de " + id,
  routing,
  ...extra,
});

const CAPACIDADES: SkillCapability[] = [
  ficha("av-gen", "Generación audiovisual (imagen · audio · vídeo)", {}, { defaultOn: true }),
  ficha("taste", "Taste · calidad de UI y estética", { preferStrong: true }),
  ficha("pm", "PM · producto y proyecto", { preferStrong: true, planning: true }),
  ficha("vision", "Visión", { vision: true }),
  ficha("voz-es", "Voz de alta calidad (Kokoro)", undefined),
  ficha("router", "Enrutado y proxy de modelos (9Router · RouteLLM)"),
];

const identidad = { capacidades: CAPACIDADES, desactivadas: [] };
const ids = (r: SkillCapability[]) => r.map((h) => h.id);

describe("habilidadesPara · por papel", () => {
  it("el escritor solo se lleva lo enrutado a peso o planificación", () => {
    expect(ids(habilidadesPara("escritor", "cuenta", identidad))).toEqual([
      "taste",
      "pm",
    ]);
  });

  it("el revisor solo se lleva lo enrutado a modelos fuertes", () => {
    expect(ids(habilidadesPara("revisor", "cuenta", identidad))).toEqual([
      "taste",
      "pm",
    ]);
  });

  it("el chat se lleva además las habilidades por defecto encendidas", () => {
    expect(ids(habilidadesPara("chat", "cuenta", identidad))).toContain("av-gen");
  });

  it("visión se lleva lo visual por routing y lo de imagen por etiqueta", () => {
    const r = ids(habilidadesPara("visión", "cuenta", identidad));
    expect(r).toContain("vision");
    expect(r).toContain("av-gen");
    expect(r).not.toContain("taste");
  });
});

describe("habilidadesPara · por director", () => {
  it("diseno se lo lleva la etiqueta de diseño, no el peso del modelo", () => {
    const r = ids(habilidadesPara("diseno", "cuenta", identidad));
    expect(r).toContain("taste");
    expect(r).not.toContain("pm");
  });

  it("produccion se lo lleva la generación audiovisual por su etiqueta", () => {
    expect(ids(habilidadesPara("produccion", "cuenta", identidad))).toContain("av-gen");
  });

  it("optimizador, nube, medidores y aprendizaje eligen por etiqueta", () => {
    expect(ids(habilidadesPara("optimizador", "cuenta", identidad))).toContain("router");
  });
});

describe("habilidadesPara · voz, imagen, código y ámbito", () => {
  it("voz solo se lleva la de voz (por etiqueta); imagen la audiovisual", () => {
    expect(ids(habilidadesPara("voz", "cuenta", identidad))).toContain("voz-es");
    expect(ids(habilidadesPara("imagen", "cuenta", identidad))).toEqual(["av-gen"]);
    expect(ids(habilidadesPara("código", "cuenta", identidad))).toEqual(["taste", "pm"]);
  });

  it("respeta las habilidades desactivadas del ámbito", () => {
    const r = habilidadesPara("chat", "cuenta", { capacidades: CAPACIDADES, desactivadas: ["av-gen"] });
    expect(ids(r)).not.toContain("av-gen");
  });
});

describe("recortarPorCapa", () => {
  const largo = Array.from({ length: 300 }, (_, i) => `palabra${i}`).join(" ");

  it("recorta a ≤ 60 palabras en tarjeta y ≤ 250 en resumen, con el signo pegado", () => {
    expect(recortarPorCapa(largo, "tarjeta").split(" ")).toHaveLength(60);
    expect(recortarPorCapa(largo, "tarjeta").endsWith("…")).toBe(true);
    expect(recortarPorCapa(largo, "resumen").split(" ")).toHaveLength(250);
    expect(recortarPorCapa("corto", "tarjeta")).toBe("corto");
  });

  it("habilidadesPara entrega la capa pedida SIN mutar el manifiesto", () => {
    const r = habilidadesPara("escritor", "cuenta", identidad);
    expect(CAPACIDADES[1].systemPrompt).toBe("prompt de taste");
    expect(r[0].systemPrompt).toBe("prompt de taste");
  });

  it("y respeta la capa que pide la capa del modelo elegido (tarjeta)", () => {
    const largas: SkillCapability[] = [{ ...CAPACIDADES[0], systemPrompt: largo }];
    const r = habilidadesPara("produccion", "cuenta", { capacidades: largas, desactivadas: [], capa: "tarjeta" });
    expect(r[0].systemPrompt.split(" ")).toHaveLength(60);
  });
});
