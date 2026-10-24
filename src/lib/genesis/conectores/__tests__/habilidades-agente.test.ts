import { describe, it, expect } from "vitest";
import { habilidadesPara } from "../habilidades-agente";
import type { SkillCapability } from "@/ai/astraura/skills";

/** Texto de `palabras` palabras para probar los recortes por capa. */
function texto(palabras: number): string {
  return Array.from({ length: palabras }, (_, i) => `palabra${i}`).join(" ");
}

const caps: SkillCapability[] = [
  { id: "av-gen", label: "Generación audiovisual", systemPrompt: "Genera contenido audiovisual.", defaultOn: true, routing: {} },
  { id: "taste", label: "Taste de diseño", systemPrompt: "Aplica criterio de diseño de alto nivel.", routing: { preferStrong: true } },
  { id: "pm", label: "PM de producto", systemPrompt: "Descompón el trabajo en objetivos y próximos pasos.", routing: { preferStrong: true, planning: true } },
  { id: "vision", label: "Visión", systemPrompt: "Interpreta imágenes con precisión.", routing: { vision: true } },
  { id: "voz", label: "Voz por endpoint", systemPrompt: "Habla frases fluidas.", routing: { web: true } },
  { id: "web-senses", label: "Sentidos web (Agent-Reach)", systemPrompt: "Lee enlaces sin inventar fuentes.", routing: { web: true } },
];

const opciones = { capacidades: caps, desactivadas: [] as string[] };

describe("habilidadesPara", () => {
  it("selecciona por papel según el routing de cada capacidad", () => {
    const ids = habilidadesPara("escritor", "cuenta", opciones).map((h) => h.id);
    expect(ids).toContain("av-gen");
    expect(ids).toContain("pm");
    expect(ids).not.toContain("vision");
    expect(ids).not.toContain("web-senses");
  });

  it("excluye las capacidades desactivadas", () => {
    const ids = habilidadesPara("escritor", "cuenta", { ...opciones, desactivadas: ["pm", "taste"] }).map((h) => h.id);
    expect(ids).not.toContain("pm");
    expect(ids).not.toContain("taste");
    expect(ids).toContain("av-gen");
  });

  it("sirve a los directores por routing, con o sin acentos en el papel", () => {
    expect(habilidadesPara("diseno", "grupo", opciones).map((h) => h.id)).toContain("taste");
    expect(habilidadesPara("diseño", "grupo", opciones).map((h) => h.id)).toContain("taste");
    expect(habilidadesPara("aprendizaje", "grupo", opciones).map((h) => h.id)).toContain("pm");
  });

  it("señala capacidades por etiqueta del nombre, y no trae las que no encajan", () => {
    const voz = habilidadesPara("voz", "cuenta", opciones).map((h) => h.id);
    expect(voz).toContain("voz");
    expect(voz).not.toContain("web-senses");
  });

  it("recorta a tarjeta (≤ 60 palabras) en la capa tarjeta", () => {
    const [capacidad] = habilidadesPara("escritor", "cuenta", { capacidades: [{ id: "largo", label: "Largo", systemPrompt: texto(100) }], desactivadas: [] }, "tarjeta");
    expect(capacidad.systemPrompt.endsWith("...")).toBe(true);
    expect(capacidad.systemPrompt.split(/\s+/).filter(Boolean).length).toBe(60);
  });

  it("recorta a resumen (≤ 250 palabras) en la capa resumen", () => {
    const [capacidad] = habilidadesPara("escritor", "cuenta", { capacidades: [{ id: "largo", label: "Largo", systemPrompt: texto(300) }], desactivadas: [] }, "resumen");
    expect(capacidad.systemPrompt.split(/\s+/).filter(Boolean).length).toBe(250);
  });

  it("conserva el texto intacto en la capa completa y en textos cortos", () => {
    const corto = "texto corto sin recorte";
    const [capacidad] = habilidadesPara("escritor", "cuenta", { capacidades: [{ id: "c", label: "C", systemPrompt: corto }], desactivadas: [] }, "completa");
    expect(capacidad.systemPrompt).toBe(corto);
  });
});
