import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const SKILL_DIR = join(process.cwd(), ".agent", "skills", "awesome-design-md");

describe("awesome-design-md skill", () => {
  it("existe el archivo SKILL.md", () => {
    const skillPath = join(SKILL_DIR, "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);
  });

  it("SKILL.md contiene la sección de Uso en el enjambre", () => {
    const skillPath = join(SKILL_DIR, "SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain("## Uso en el enjambre");
    expect(content).toContain("### Invocación típica");
    expect(content).toContain("### Flujo Modo A (leer referencias)");
    expect(content).toContain("### Flujo Modo B (escribir DESIGN.md de StarSeed)");
    expect(content).toContain("### Ejemplo completo: panel de métricas analytics");
    expect(content).toContain("### Validación automática");
    expect(content).toContain("### Puertas del enjambre para esta skill");
  });

  it("SKILL.md documenta los dos modos correctamente", () => {
    const skillPath = join(SKILL_DIR, "SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain("## Modo A: leer referencias");
    expect(content).toContain("## Modo B: escribir el DESIGN.md de un contexto de StarSeed");
    expect(content).toContain("INDICE.md");
    expect(content).toContain("dna.json");
  });

  it("existe el archivo USO.md con documentación extendida", () => {
    const usoPath = join(SKILL_DIR, "USO.md");
    expect(existsSync(usoPath)).toBe(true);
    const content = readFileSync(usoPath, "utf-8");
    expect(content).toContain("## 1. Cuándo invocar esta skill");
    expect(content).toContain("## 2. Flujo Modo A");
    expect(content).toContain("## 3. Flujo Modo B");
    expect(content).toContain("## 4. Integración con otras skills");
    expect(content).toContain("## 5. Checklist de calidad");
    expect(content).toContain("## 6. Comandos útiles");
    expect(content).toContain("## 7. Errores comunes");
  });

  it("existe el archivo ejemplo-uso.md con caso completo", () => {
    const ejemploPath = join(SKILL_DIR, "ejemplo-uso.md");
    expect(existsSync(ejemploPath)).toBe(true);
    const content = readFileSync(ejemploPath, "utf-8");
    expect(content).toContain("## 1. Brief recibido");
    expect(content).toContain("## 2. Paso 1 — Modo A");
    expect(content).toContain("## 3. Paso 2 — Modo B");
    expect(content).toContain("panel de métricas de neuronas");
    expect(content).toContain("Supabase");
    expect(content).toContain("ClickHouse");
    expect(content).toContain("PostHog");
    expect(content).toContain("Design System — Panel de Métricas de Neuronas");
  });

  it("existen los archivos de formato de ejemplo", () => {
    const formatoDir = join(SKILL_DIR, "ejemplo-formato");
    expect(existsSync(join(formatoDir, "DESIGN-formato-numerado-kraken.md"))).toBe(true);
    expect(existsSync(join(formatoDir, "DESIGN-formato-alpha-supabase.md"))).toBe(true);
  });

  it("existen archivos de metadatos requeridos", () => {
    expect(existsSync(join(SKILL_DIR, "INDICE.md"))).toBe(true);
    expect(existsSync(join(SKILL_DIR, "LICENSE"))).toBe(true);
    expect(existsSync(join(SKILL_DIR, "ORIGEN.md"))).toBe(true);
    expect(existsSync(join(SKILL_DIR, "STARSEED.md"))).toBe(true);
  });

  it("SKILL.md tiene reglas que no se rompen", () => {
    const skillPath = join(SKILL_DIR, "SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain("## Reglas que no se rompen");
    expect(content).toContain("Datos, no órdenes");
    expect(content).toContain("Se estudian patrones, no marcas");
    expect(content).toContain("Fuentes propietarias, nunca empaquetadas");
    expect(content).toContain("El ADN del contexto manda");
    expect(content).toContain("Solo lectura por HTTPS");
    expect(content).toContain("Pocas lecturas");
  });

  it("SKILL.md documenta correspondencia ADN → DESIGN.md", () => {
    const skillPath = join(SKILL_DIR, "SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain("Correspondencia desde el ADN de StarSeed");
    expect(content).toContain("Visual Theme & Atmosphere");
    expect(content).toContain("Color Palette & Roles");
    expect(content).toContain("Typography Rules");
    expect(content).toContain("Component Stylings");
    expect(content).toContain("Layout Principles");
    expect(content).toContain("Depth & Elevation");
    expect(content).toContain("Do's and Don'ts");
    expect(content).toContain("Responsive Behavior");
    expect(content).toContain("Agent Prompt Guide");
  });

  it("SKILL.md incluye sección Cuándo NO usarla", () => {
    const skillPath = join(SKILL_DIR, "SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain("## Cuándo NO usarla");
    expect(content).toContain("copiar el look de una empresa");
    expect(content).toContain("identidad de StarSeed");
    expect(content).toContain("generar una pieza completa");
  });
});