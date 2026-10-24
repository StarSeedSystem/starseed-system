import { describe, it, expect } from "vitest";
import { habilidadesPara, CapaModelo } from "../habilidades-agente";
import { SkillCapability } from "@/ai/astraura/skills";

const capacidadesDePrueba: SkillCapability[] = [
  { id: "av-gen", label: "Generación audiovisual", systemPrompt: "Puedes GENERAR contenido audiovisual.", defaultOn: true, routing: {} },
  { id: "taste", label: "Taste", systemPrompt: "Criterio de diseño de alto nivel para interfaz.", routing: { preferStrong: true } },
  { id: "pm", label: "PM", systemPrompt: "Descompón en objetivo, alcance y próximos pasos.", routing: { preferStrong: true, planning: true } },
  { id: "vision", label: "Visión", systemPrompt: "Interpreta imágenes con precisión.", routing: { vision: true } },
];

function idsDe(lista: SkillCapability[]): string[] {
  return lista.map((h) => h.id);
}

describe("habilidadesPara", () => {
  it("selecciona habilidades para el papel escritor", () => {
    const resultado = habilidadesPara("escritor", "cuenta", { capacidades: capacidadesDePrueba, desactivadas: [] });
    const ids = idsDe(resultado);
    expect(ids).toContain("av-gen");
    expect(ids).toContain("taste");
    expect(ids).toContain("pm");
  });

  it("aplica las señales también a los directores del ámbito", () => {
    const resultado = habilidadesPara("medidores", "cuenta", { capacidades: capacidadesDePrueba, desactivadas: [] });
    const ids = idsDe(resultado);
    expect(ids).toContain("pm");
    expect(ids).toContain("taste");
    expect(ids).not.toContain("vision");
  });

  it("incluye habilidades cuya etiqueta menciona el papel (visión)", () => {
    const soloVisionYPm: SkillCapability[] = capacidadesDePrueba.filter((h) => h.id !== "av-gen");
    const resultado = habilidadesPara("visión", "cuenta", { capacidades: soloVisionYPm, desactivadas: [] });
    expect(idsDe(resultado)).toContain("vision");
  });

  it("rescata por etiqueta una habilidad cuyo routing no encaja con el director", () => {
    const diseno: SkillCapability[] = [
      { id: "ui-arte", label: "Diseño de pantallas", systemPrompt: "Cuidado visual.", routing: { web: true } },
    ];
    const resultado = habilidadesPara("diseño", "cuenta", { capacidades: diseno, desactivadas: [] });
    expect(resultado).toHaveLength(1);
  });

  it("excluye las habilidades desactivadas", () => {
    const resultado = habilidadesPara("escritor", "cuenta", { capacidades: capacidadesDePrueba, desactivadas: ["av-gen", "taste"] });
    const ids = idsDe(resultado);
    expect(ids).not.toContain("av-gen");
    expect(ids).not.toContain("taste");
    expect(ids).toContain("pm");
  });

  it("para un papel desconocido solo pasan las preferStrong y las sin señales", () => {
    const resultado = habilidadesPara("explorador", "cuenta", { capacidades: capacidadesDePrueba, desactivadas: [] });
    const ids = idsDe(resultado);
    expect(ids).toContain("av-gen");
    expect(ids).toContain("taste");
    expect(ids).toContain("pm");
    expect(ids).not.toContain("vision");
  });

  it("debe recortar a tarjeta (≤60 palabras) en capa tarjeta", () => {
    const largo = "a ".repeat(100).trim();
    const caps: SkillCapability[] = [{ id: "largo", label: "Largo", systemPrompt: largo, routing: {} }];
    const resultado = habilidadesPara("escritor", "cuenta", { capacidades: caps, desactivadas: [] }, "tarjeta");
    expect(resultado).toHaveLength(1);
    const palabras = resultado[0].systemPrompt.split(/\s+/).filter(Boolean);
    expect(palabras.length).toBeLessThanOrEqual(60);
  });

  it("debe recortar a resumen (≤250 palabras) en capa resumen", () => {
    const largo = "a ".repeat(300).trim();
    const caps: SkillCapability[] = [{ id: "largo", label: "Largo", systemPrompt: largo, routing: {} }];
    const resultado = habilidadesPara("escritor", "cuenta", { capacidades: caps, desactivadas: [] }, "resumen");
    expect(resultado).toHaveLength(1);
    const palabras = resultado[0].systemPrompt.split(/\s+/).filter(Boolean);
    expect(palabras.length).toBeLessThanOrEqual(250);
  });

  it("conserva el texto completo en capa completa", () => {
    const texto = "texto completo sin recorte esperado";
    const caps: SkillCapability[] = [{ id: "c", label: "C", systemPrompt: texto, routing: {} }];
    const resultado = habilidadesPara("escritor", "cuenta", { capacidades: caps, desactivadas: [] }, "completa" as CapaModelo);
    expect(resultado[0].systemPrompt).toBe(texto);
  });
});
