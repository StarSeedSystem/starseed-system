import { describe, it, expect } from "vitest";
import { habilidadesPara } from "../habilidades-agente";
import { SkillCapability } from "@/ai/astraura/skills";

describe("habilidadesPara", () => {
  const capacidadesDePrueba: SkillCapability[] = [
    {
      id: "av-gen",
      label: "Generación audiovisual (imagen · audio · vídeo)",
      systemPrompt: "Puedes GENERAR contenido audiovisual...",
      defaultOn: true,
      routing: {},
    },
    {
      id: "taste",
      label: "Taste · calidad de UI y estética",
      systemPrompt: "Cuando generes interfaz, contenido visual o texto, aplica criterio de diseño de alto nivel...",
      routing: { preferStrong: true },
    },
    {
      id: "pm",
      label: "PM · producto y proyecto",
      systemPrompt: "Cuando el usuario planifique o defina trabajo, descompón en objetivo, alcance, riesgos y próximos pasos accionables...",
      routing: { preferStrong: true, planning: true },
    },
    {
      id: "web-senses",
      label: "Sentidos web (Agent-Reach)",
      systemPrompt: "Tienes sentidos web: si el usuario pega enlaces o pide contenido de X/Reddit/YouTube/páginas, razona sobre ese contenido...",
      routing: { web: true },
    },
    {
      id: "vision",
      label: "Visión",
      systemPrompt: "Puedes interpretar imágenes que el usuario comparte: describe lo relevante y actúa sobre ello con precisión...",
      routing: { vision: true },
    },
  ];

  const capacidadesDesactivadas: string[] = [];

  it("should select skills based on role", () => {
    const escritor = habilidadesPara("escritor", "cuenta", {
      capacidades: capacidadesDePrueba,
      desactivadas: capacidadesDesactivadas,
    });
    expect(escritor).toContain("av-gen");
    expect(escritor).toContain("taste");
    expect(escritor).toContain("web-senses");
    expect(escritor).toContain("vision");
    expect(escritor).toContain("pm");
  });

  it("should select skills for reviewer", () => {
    const revisor = habilidadesPara("revisor", "cuenta", {
      capacidades: capacidadesDePrueba,
      desactivadas: capacidadesDesactivadas,
    });
    expect(revisor).toContain("av-gen");
    expect(revisor).toContain("taste");
    expect(revisor).toContain("web-senses");
    expect(revisor).toContain("vision");
    expect(revisor).toContain("pm");
  });

  it("should select skills for chat", () => {
    const chat = habilidadesPara("chat", "cuenta", {
      capacidades: capacidadesDePrueba,
      desactivadas: capacidadesDesactivadas,
    });
    expect(chat).toContain("av-gen");
    expect(chat).toContain("taste");
    expect(chat).toContain("pm");
    expect(chat).toContain("web-senses");
    expect(chat).toContain("vision");
  });

  it("should select skills for vision", () => {
    const vision = habilidadesPara("visión", "cuenta", {
      capacidades: capacidadesDePrueba,
      desactivadas: capacidadesDesactivadas,
    });
    expect(vision).toContain("av-gen");
    expect(vision).toContain("taste");
    expect(vision).toContain("pm");
    expect(vision).toContain("web-senses");
    expect(vision).toContain("vision");
  });

  it("should exclude disabled skills", () => {
    const escritor = habilidadesPara("escritor", "cuenta", {
      capacidades: capacidadesDePrueba,
      desactivadas: ["av-gen", "taste"],
    });
    expect(escritor).not.toContain("av-gen");
    expect(escritor).not.toContain("taste");
    expect(escritor).toContain("pm");
    expect(escritor).toContain("web-senses");
    expect(escritor).toContain("vision");
  });

  it("should include skills without routing for any role", () => {
    const habilidades = habilidadesPara("código", "cuenta", {
      capacidades: capacidadesDePrueba,
      desactivadas: [],
    });
    expect(habilidades).toContain("av-gen");
  });
});