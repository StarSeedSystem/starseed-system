import { describe, it, expect } from "vitest";
import { habilidadesPara, capaParaModelo, type CapaModelo } from "../habilidades-agente";
import type { SkillCapability } from "@/ai/astraura/skills";

const capacidades: SkillCapability[] = [
  {
    id: "av-gen",
    label: "Generación audiovisual",
    systemPrompt: "Puedes generar contenido audiovisual para cualquier cuenta.",
  },
  {
    id: "taste",
    label: "Taste · calidad de UI y estética",
    systemPrompt: "Aplica criterio de diseño de alto nivel.",
    routing: { preferStrong: true },
  },
  {
    id: "pm",
    label: "PM · producto y proyecto",
    systemPrompt: "Descompón en objetivo, alcance y próximos pasos.",
    routing: { preferStrong: true, planning: true },
  },
  {
    id: "vision",
    label: "Visión",
    systemPrompt: "Puedes interpretar imágenes que el usuario comparte.",
    routing: { vision: true },
  },
  {
    id: "voice",
    label: "Voz de alta calidad (Kokoro)",
    systemPrompt: "Usa frases naturales y bien puntuadas.",
    routing: { web: true },
  },
  {
    id: "aprendizaje",
    label: "Aprendizaje de las olas",
    systemPrompt: "Lee las lecciones de las olas anteriores.",
    routing: { preferStrong: true },
  },
];

function ids(resultado: SkillCapability[]): string[] {
  return resultado.map((habilidad) => habilidad.id);
}

const base = { capacidades, desactivadas: [] as string[] };

describe("habilidadesPara", () => {
  it("da al escritor lo de fuerza y planificación, no la visión", () => {
    const lista = ids(habilidadesPara("escritor", "cuenta", base));
    expect(lista).toContain("av-gen");
    expect(lista).toContain("taste");
    expect(lista).toContain("pm");
    expect(lista).not.toContain("vision");
  });

  it("da a la visión su habilidad y no la de planificación", () => {
    const lista = ids(habilidadesPara("visión", "cuenta", base));
    expect(lista).toContain("vision");
    expect(lista).not.toContain("pm");
  });

  it("elige por etiqueta para directores (diseño y voz)", () => {
    expect(ids(habilidadesPara("diseño", "cuenta", base))).toContain("taste");
    expect(ids(habilidadesPara("voz", "cuenta", base))).toContain("voice");
    expect(ids(habilidadesPara("aprendizaje", "cuenta", base))).toContain("aprendizaje");
  });

  it("respeta las desactivadas por id y por ámbito", () => {
    expect(ids(habilidadesPara("escritor", "cuenta", { ...base, desactivadas: ["taste"] })))
      .not.toContain("taste");
    expect(ids(habilidadesPara("escritor", "cuenta", { ...base, desactivadas: ["cuenta:pm"] })))
      .not.toContain("pm");
    expect(ids(habilidadesPara("escritor", "otra", { ...base, desactivadas: ["cuenta:pm"] })))
      .toContain("pm");
    expect(ids(habilidadesPara("escritor", "cuenta", { ...base, desactivadas: ["*:vision"] })))
      .not.toContain("vision");
  });

  it("recorta por palabras según la capa", () => {
    const larga: SkillCapability[] = [
      { id: "larga", label: "Larga", systemPrompt: "a ".repeat(300).trim() },
    ];
    const tarjeta = habilidadesPara("escritor", "cuenta", { capacidades: larga, desactivadas: [] }, "tarjeta");
    const resumen = habilidadesPara("escritor", "cuenta", { capacidades: larga, desactivadas: [], capa: "resumen" });
    const completa = habilidadesPara("escritor", "cuenta", { capacidades: larga, desactivadas: [] });
    expect(tarjeta[0].systemPrompt.split(/\s+/)).toHaveLength(60);
    expect(tarjeta[0].systemPrompt.endsWith("...")).toBe(true);
    expect(resumen[0].systemPrompt.split(/\s+/)).toHaveLength(250);
    expect(completa[0].systemPrompt).toBe("a ".repeat(300).trim());
  });
});

describe("capaParaModelo", () => {
  it("asigna la capa por tamaño conocido del modelo", () => {
    const casos: Array<[string, CapaModelo]> = [
      ["needle-3", "tarjeta"],
      ["bitnet-158", "tarjeta"],
      ["bonsai-4b", "resumen"],
      ["opus", "completa"],
    ];
    for (const [modelo, capa] of casos) expect(capaParaModelo(modelo)).toBe(capa);
  });
});
