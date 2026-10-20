import { describe, it, expect } from "vitest";
import { habilidadesPara, CapaModelo } from "../habilidades-agente";
import { SkillCapability } from "@/ai/astraura/skills";

describe("habilidadesPara", () => {
  const capacidadesDePrueba: SkillCapability[] = [
    {
      id: "av-gen",
      label: "Generación audiovisual",
      systemPrompt: "Puedes GENERAR contenido audiovisual para cualquier cuenta.",
      defaultOn: true,
      routing: {},
    },
    {
      id: "taste",
      label: "Taste",
      systemPrompt: "Aplica criterio de diseño de alto nivel cuando generes interfaz.",
      routing: { preferStrong: true },
    },
    {
      id: "pm",
      label: "PM",
      systemPrompt: "Descompón en objetivo, alcance y próximos pasos con criterios de aceptación.",
      routing: { preferStrong: true, planning: true },
    },
    {
      id: "vision",
      label: "Visión",
      systemPrompt: "Puedes interpretar imágenes que el usuario comparte con precisión.",
      routing: { vision: true },
    },
  ];

  it("debe seleccionar habilidades según papel", () => {
    const resultado = habilidadesPara("escritor", "cuenta", {
      capacidades: capacidadesDePrueba,
      desactivadas: [],
    });
    const ids = resultado.map((h) => h.id);
    expect(ids).toContain("av-gen");
    expect(ids).toContain("taste");
    expect(ids).toContain("pm");
    expect(ids).toContain("vision");
  });

  it("debe excluir habilidades desactivadas", () => {
    const resultado = habilidadesPara("escritor", "cuenta", {
      capacidades: capacidadesDePrueba,
      desactivadas: ["av-gen", "taste"],
    });
    const ids = resultado.map((h) => h.id);
    expect(ids).not.toContain("av-gen");
    expect(ids).not.toContain("taste");
    expect(ids).toContain("pm");
  });

  it("debe recortar a tarjeta (≤60 palabras) en capa tarjeta", () => {
    const textoLargo = "a ".repeat(100).trim();
    const capacidadLarga: SkillCapability[] = [
      {
        id: "largo",
        label: "Largo",
        systemPrompt: textoLargo,
        routing: {},
      },
    ];
    const resultado = habilidadesPara("escritor", "cuenta", {
      capacidades: capacidadLarga,
      desactivadas: [],
    }, "tarjeta");
    expect(resultado).toHaveLength(1);
    const palabras = resultado[0].systemPrompt.split(/\s+/).filter(Boolean);
    expect(palabras.length).toBeLessThanOrEqual(60);
  });

  it("debe recortar a resumen (≤250 palabras) en capa resumen", () => {
    const textoLargo = "a ".repeat(300).trim();
    const capacidadLarga: SkillCapability[] = [
      {
        id: "largo",
        label: "Largo",
        systemPrompt: textoLargo,
        routing: {},
      },
    ];
    const resultado = habilidadesPara("escritor", "cuenta", {
      capacidades: capacidadLarga,
      desactivadas: [],
    }, "resumen");
    expect(resultado).toHaveLength(1);
    const palabras = resultado[0].systemPrompt.split(/\s+/).filter(Boolean);
    expect(palabras.length).toBeLessThanOrEqual(250);
  });

  it("debe conservar completo en capa completa", () => {
    const texto = "texto completo sin recorte esperado";
    const capacidad: SkillCapability[] = [
      {
        id: "c",
        label: "C",
        systemPrompt: texto,
        routing: {},
      },
    ];
    const resultado = habilidadesPara("escritor", "cuenta", {
      capacidades: capacidad,
      desactivadas: [],
    }, "completa");
    expect(resultado[0].systemPrompt).toBe(texto);
  });

  it("debe incluir habilidades con routing vacío para cualquier papel", () => {
    const resultado = habilidadesPara("código", "cuenta", {
      capacidades: capacidadesDePrueba,
      desactivadas: [],
    });
    const ids = resultado.map((h) => h.id);
    expect(ids).toContain("av-gen");
  });
});
