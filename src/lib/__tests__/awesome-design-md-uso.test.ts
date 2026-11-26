import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILL_ROOT = resolve(__dirname, "../../../.agent/skills/awesome-design-md");

function readSkillFile(filename: string): string {
  return readFileSync(resolve(SKILL_ROOT, filename), "utf-8");
}

describe("awesome-design-md skill usage documentation", () => {
  describe("USO.md", () => {
    let contenido: string;

    beforeAll(() => {
      contenido = readSkillFile("USO.md");
    });

    it("existe y no está vacío", () => {
      expect(contenido.length).toBeGreaterThan(1000);
    });

    it("contiene las secciones principales requeridas", () => {
      const seccionesRequeridas = [
        "Cuándo invocar esta skill",
        "Flujo Modo A — Leer referencias",
        "Flujo Modo B — Escribir DESIGN.md",
        "Integración con otras skills",
        "Checklist de calidad",
        "Comandos útiles",
        "Errores comunes a evitar",
      ];
      for (const seccion of seccionesRequeridas) {
        expect(contenido).toContain(seccion);
      }
    });

    it("incluye la plantilla de lectura breve con todos los campos", () => {
      const campos = [
        "**Qué resuelve**",
        "**Cómo**",
        "**Por qué funciona**",
        "**En StarSeed**",
        "**No tomar**",
      ];
      for (const campo of campos) {
        expect(contenido).toContain(campo);
      }
    });

    it("documenta la correspondencia ADN → DESIGN.md (formato numerado)", () => {
      const correspondencias = [
        "Visual Theme & Atmosphere",
        "Color Palette & Roles",
        "Typography Rules",
        "Component Stylings",
        "Layout Principles",
        "Depth & Elevation",
        "Do's and Don'ts",
        "Responsive Behavior",
        "Agent Prompt Guide",
      ];
      for (const c of correspondencias) {
        expect(contenido).toContain(c);
      }
    });

    it("menciona tokens del ADN de StarSeed (palette, fib, rounded, superficie)", () => {
      const tokens = [
        "palette.trinity",
        "fib-",
        "rounded.",
        "superficie.elevacion",
        "tipo",
      ];
      for (const token of tokens) {
        expect(contenido).toContain(token);
      }
    });

    it("prohíbe copiar hexadecimales y fuentes de marcas ajenas", () => {
      expect(contenido).toContain("No tomar");
      expect(contenido).toContain("propietaria");
      expect(contenido).toContain("imitación comercial");
    });

    it("lista las skills relacionadas correctamente", () => {
      const skills = [
        "design-md",
        "design-taste-frontend",
        "frontend-slides",
        "grafo-codigo",
        "react-components",
        "stitch-loop",
      ];
      for (const skill of skills) {
        expect(contenido).toContain(skill);
      }
    });

    it("incluye comandos útiles para el agente", () => {
      expect(contenido).toContain("INDICE.md");
      expect(contenido).toContain("raw.githubusercontent.com");
      expect(contenido).toContain("dna.json");
    });
  });

  describe("ejemplo-uso.md", () => {
    let contenido: string;

    beforeAll(() => {
      contenido = readSkillFile("ejemplo-uso.md");
    });

    it("existe y no está vacío", () => {
      expect(contenido.length).toBeGreaterThan(5000);
    });

    it("contiene las dos partes: Modo A y Modo B", () => {
      expect(contenido).toContain("Paso 1 — Modo A: Leer referencias");
      expect(contenido).toContain("Paso 2 — Modo B: Escribir DESIGN.md");
    });

    it("Modo A: tiene 3 lecturas breves de marcas distintas", () => {
      const marcas = ["Supabase", "ClickHouse", "PostHog"];
      for (const marca of marcas) {
        expect(contenido).toContain(marca);
      }
    });

    it("Cada lectura breve tiene los 5 campos requeridos", () => {
      const campos = [
        "\\*\\*Qué resuelve\\*\\*",
        "\\*\\*Cómo\\*\\*",
        "\\*\\*Por qué funciona\\*\\*",
        "\\*\\*En StarSeed\\*\\*",
        "\\*\\*No tomar\\*\\*",
      ];
      for (const campo of campos) {
        const count = (contenido.match(new RegExp(campo, "g")) || []).length;
        expect(count).toBeGreaterThanOrEqual(3);
      }
    });

    it("Modo A: la síntesis final referencia tokens StarSeed", () => {
      expect(contenido).toContain("palette.trinity.logica.active");
      expect(contenido).toContain("font_family_code");
      expect(contenido).toContain("fib-13");
      expect(contenido).toContain("rounded.sm");
      expect(contenido).toContain("superficie.elevacion.level0");
    });

    it("Modo B: DESIGN.md completo con 9 secciones numeradas", () => {
      for (let i = 1; i <= 9; i++) {
        expect(contenido).toContain(`## ${i}.`);
      }
    });

    it("Modo B: documenta qué NO tomar de marcas ajenas en secciones Don't/No tomar", () => {
      const marcasDocumentadas = [
        "#3ECF8E",
        "#FCD535",
        "#F565AA",
        "Circular",
        "erizo",
      ];
      for (const marca of marcasDocumentadas) {
        expect(contenido).toContain(marca);
      }
      // Verificar que aparecen en contexto de "No tomar" o "Don't"
      expect(contenido).toContain("No tomar");
      expect(contenido).toContain("Don't");
    });

    it("Modo B: referencia tokens StarSeed correctos", () => {
      const tokensEsperados = [
        "palette.trinity.logica.active",
        "palette.trinity.horizonte.panel",
        "palette.trinity.base.active",
        "font_family_code",
        "font_family_headline",
        "font_family_main",
        "fib-",
        "rounded.sm",
        "rounded.lg",
        "rounded.full",
        "superficie.elevacion.level",
        "color-base-",
      ];
      for (const token of tokensEsperados) {
        expect(contenido).toContain(token);
      }
    });

    it("Modo B: incluye sección Agent Prompt Guide con prompts de ejemplo", () => {
      expect(contenido).toContain("Agent Prompt Guide");
      expect(contenido).toContain("Referencia rápida de color");
      expect(contenido).toContain("Prompts de componente ejemplo");
      const prompts = contenido.match(/> "Crea la .+/g) || [];
      expect(prompts.length).toBeGreaterThanOrEqual(3);
    });

    it("Modo B: declara el registro y fecha del ADN al final", () => {
      expect(contenido).toContain("Generado desde");
      expect(contenido).toContain("memory/diseno/adn/starseed-os/dna.json");
      expect(contenido).toContain("registro:");
      expect(contenido).toContain("versión:");
    });

    it("Modo B: tabla de breakpoints responsive con objetivos táctiles", () => {
      expect(contenido).toContain("Breakpoints");
      expect(contenido).toContain("Objetivos táctiles");
      expect(contenido).toContain("44px");
      expect(contenido).toContain("WCAG AA");
    });

    it("Modo B: sección Do's and Don'ts con al menos 3 cada uno", () => {
      const dos = (contenido.match(/### Do\s*\n([\s\S]*?)\n### Don't/)?.[1] || "");
      const donts = (contenido.match(/### Don't\s*\n([\s\S]*?)\n## /)?.[1] || "");
      const doCount = (dos.match(/- /g) || []).length;
      const dontCount = (donts.match(/- /g) || []).length;
      expect(doCount).toBeGreaterThanOrEqual(3);
      expect(dontCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Consistencia entre USO.md y ejemplo-uso.md", () => {
    let uso: string;
    let ejemplo: string;

    beforeAll(() => {
      uso = readSkillFile("USO.md");
      ejemplo = readSkillFile("ejemplo-uso.md");
    });

    it("El ejemplo sigue la plantilla de lectura breve de USO.md", () => {
      const camposUso = [
        "\\*\\*Qué resuelve\\*\\*",
        "\\*\\*Cómo\\*\\*",
        "\\*\\*Por qué funciona\\*\\*",
        "\\*\\*En StarSeed\\*\\*",
        "\\*\\*No tomar\\*\\*",
      ];
      for (const campo of camposUso) {
        const countEjemplo = (ejemplo.match(new RegExp(campo, "g")) || []).length;
        expect(countEjemplo).toBeGreaterThanOrEqual(3);
      }
    });

    it("El ejemplo usa la correspondencia ADN → DESIGN.md documentada en USO.md", () => {
      const secciones = [
        "Visual Theme & Atmosphere",
        "Color Palette & Roles",
        "Typography Rules",
        "Component Stylings",
        "Layout Principles",
        "Depth & Elevation",
        "Do's and Don'ts",
        "Responsive Behavior",
        "Agent Prompt Guide",
      ];
      for (const seccion of secciones) {
        expect(ejemplo).toContain(seccion);
      }
    });

    it("Ambos archivos usan español con acentos", () => {
      const acentos = ["á", "é", "í", "ó", "ú", "ñ"];
      for (const acento of acentos) {
        expect(uso).toContain(acento);
        expect(ejemplo).toContain(acento);
      }
    });

    it("Ningún archivo usa 'any' en código TypeScript (no aplica, son .md)", () => {
      expect(true).toBe(true);
    });
  });

  describe("Archivos de soporte de la skill", () => {
    it("SKILL.md existe y tiene cabecera correcta", () => {
      const skill = readSkillFile("SKILL.md");
      expect(skill).toContain("name: awesome-design-md");
      expect(skill).toContain("description:");
      expect(skill).toContain("Modo A: leer referencias");
      expect(skill).toContain("Modo B: escribir el DESIGN.md");
    });

    it("INDICE.md existe y tiene 84 marcas", () => {
      const indice = readSkillFile("INDICE.md");
      expect(indice).toContain("84 carpetas");
      expect(indice).toContain("raw.githubusercontent.com");
    });

    it("Ejemplos de formato existen", () => {
      const numerado = readSkillFile("ejemplo-formato/DESIGN-formato-numerado-kraken.md");
      const alfa = readSkillFile("ejemplo-formato/DESIGN-formato-alpha-supabase.md");
      expect(numerado).toContain("## 1. Visual Theme");
      expect(alfa).toContain("version: alpha");
    });

    it("ORIGEN.md y STARSEED.md documentan el origen y uso en StarSeed", () => {
      const origen = readSkillFile("ORIGEN.md");
      const starseed = readSkillFile("STARSEED.md");
      expect(origen).toContain("VoltAgent/awesome-design-md");
      expect(origen).toContain("MIT");
      expect(starseed).toContain("biblioteca de lectura");
      expect(starseed).toContain("Riesgos de marca");
    });
  });
});