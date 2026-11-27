import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "..", "..", "..");

describe("awesome-design-md skill integration", () => {
  describe("Skill files exist", () => {
    it("SKILL.md exists in .agent/skills/awesome-design-md/", () => {
      const path = join(REPO_ROOT, ".agent/skills/awesome-design-md/SKILL.md");
      expect(existsSync(path)).toBe(true);
    });

    it("INDICE.md exists with 84 brands", () => {
      const path = join(REPO_ROOT, ".agent/skills/awesome-design-md/INDICE.md");
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("84 carpetas");
      expect(content).toContain("linear.app");
      expect(content).toContain("supabase");
      expect(content).toContain("notion");
    });

    it("ORIGEN.md documents MIT license and source", () => {
      const path = join(REPO_ROOT, ".agent/skills/awesome-design-md/ORIGEN.md");
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("MIT");
      expect(content).toContain("VoltAgent/awesome-design-md");
    });

    it("STARSEED.md documents StarSeed usage and risks", () => {
      const path = join(REPO_ROOT, ".agent/skills/awesome-design-md/STARSEED.md");
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("Riesgos de marca");
      expect(content).toContain("patrones, no marcas");
    });

    it("Example formats exist (numerado and alfa)", () => {
      const numerado = join(REPO_ROOT, ".agent/skills/awesome-design-md/ejemplo-formato/DESIGN-formato-numerado-kraken.md");
      const alfa = join(REPO_ROOT, ".agent/skills/awesome-design-md/ejemplo-formato/DESIGN-formato-alpha-supabase.md");
      expect(existsSync(numerado)).toBe(true);
      expect(existsSync(alfa)).toBe(true);
    });
  });

  describe("Usage documentation exists", () => {
    it("architecture/awesome-design-md-uso.md exists", () => {
      const path = join(REPO_ROOT, "architecture/awesome-design-md-uso.md");
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("Modo A");
      expect(content).toContain("Modo B");
      expect(content).toContain("INDICE.md");
      expect(content).toContain("dna.json");
      expect(content).toContain("Formato numerado");
      expect(content).toContain("Formato alfa");
    });
  });

  describe("Example DESIGN.md for gobernanza context", () => {
    const designPath = join(REPO_ROOT, "design-system/starseed-system/contextos/gobernanza/DESIGN.md");

    it("DESIGN.md exists", () => {
      expect(existsSync(designPath)).toBe(true);
    });

    it("Has all 9 numbered sections", () => {
      const content = readFileSync(designPath, "utf-8");
      const sections = [
        "1. Visual Theme & Atmosphere",
        "2. Color Palette & Roles",
        "3. Typography Rules",
        "4. Component Stylings",
        "5. Layout Principles",
        "6. Depth & Elevation",
        "7. Do's and Don'ts",
        "8. Responsive Behavior",
        "9. Agent Prompt Guide"
      ];
      sections.forEach(section => {
        expect(content).toContain(section);
      });
    });

    it("References ADN and skill generation", () => {
      const content = readFileSync(designPath, "utf-8");
      expect(content).toContain("ADN de origen");
      expect(content).toContain("memory/diseno/adn/gobernanza/dna.json");
      expect(content).toContain("awesome-design-md");
      expect(content).toContain("Modo B");
    });

    it("Uses StarSeed tokens (not foreign brand colors)", () => {
      const content = readFileSync(designPath, "utf-8");
      expect(content).toContain("palette.trinity.logica.active");
      expect(content).toContain("palette.trinity.anchor.active");
      expect(content).toContain("palette.trinity.zenith.active");
      expect(content).toContain("palette.trinity.horizonte.panel");
      expect(content).toContain("--aw-shell");
      expect(content).toContain("--aw-surface");
      expect(content).toContain("--aw-ink");
      expect(content).toContain("--aw-text");
      expect(content).toContain("--aw-muted");
    });

    it("Uses descriptive color names (not accent-500 style)", () => {
      const content = readFileSync(designPath, "utf-8");
      expect(content).toContain("ámbar solar");
      expect(content).toContain("carmín sistema");
      expect(content).toContain("azul eléctrico");
      expect(content).toContain("esmeralda horizonte");
      expect(content).toContain("noche");
      expect(content).not.toMatch(/accent-\d+/);
      expect(content).not.toMatch(/primary-\d+/);
    });

    it("Uses φ scale and Fibonacci spacing", () => {
      const content = readFileSync(designPath, "utf-8");
      expect(content).toContain("φ");
      expect(content).toContain("1.618");
      expect(content).toContain("Fibonacci");
      expect(content).toContain("fib-");
      expect(content).toContain("fib-21");
      expect(content).toContain("fib-34");
      expect(content).toContain("fib-55");
    });

    it("Uses correct radius scale (OS not Antigravity mixed)", () => {
      const content = readFileSync(designPath, "utf-8");
      expect(content).toContain("--radius-lg"); // 24px
      expect(content).toContain("--radius"); // 20px
      expect(content).toContain("--radius-sm"); // 14px
      expect(content).toContain("9999px"); // pill
      expect(content).not.toContain("4px, 12px, 24px, 42px"); // Antigravity scale not mixed
    });

    it("Includes cursor-pointer rule for clickables", () => {
      const content = readFileSync(designPath, "utf-8");
      expect(content).toContain("cursor-pointer");
      expect(content).toContain("cursor not-allowed");
    });

    it("Includes Spanish with accents in UI texts", () => {
      const content = readFileSync(designPath, "utf-8");
      expect(content).toContain("democracia directa");
      expect(content).toContain("transparente");
      expect(content).toContain("reversible");
      expect(content).toContain("votación");
      expect(content).toContain("delegación");
      expect(content).toContain("argumentación");
    });

    it("Respects prefers-reduced-motion", () => {
      const content = readFileSync(designPath, "utf-8");
      expect(content).toContain("prefers-reduced-motion");
    });

    it("Includes Agent Prompt Guide with examples", () => {
      const content = readFileSync(designPath, "utf-8");
      expect(content).toContain("Agent Prompt Guide");
      expect(content).toContain("Ejemplos de petición");
      expect(content).toContain("Crear propuesta");
      expect(content).toContain("Votar");
      expect(content).toContain("Delegar");
    });

    it("Declares ADN registry and date", () => {
      const content = readFileSync(designPath, "utf-8");
      expect(content).toContain("registro v2026-11-20");
    });

    it("Does not contain foreign brand hex colors in delivered content", () => {
      const content = readFileSync(designPath, "utf-8");
      // Linear purple
      expect(content).not.toContain("#7132f5");
      expect(content).not.toContain("#5741d8");
      // Supabase emerald
      expect(content).not.toContain("#3ecf8e");
      expect(content).not.toContain("#24b47e");
      // Notion warm
      expect(content).not.toContain("#f7f6f3");
    });

    it("References reference patterns (Linear, Supabase, Notion) but maps to ADN", () => {
      const content = readFileSync(designPath, "utf-8");
      expect(content).toContain("Linear.app");
      expect(content).toContain("Supabase");
      expect(content).toContain("Notion");
      expect(content).toContain("No tomar");
    });
  });

  describe("Skill rules compliance", () => {
    it("SKILL.md prohibits obeying foreign agent instructions", () => {
      const content = readFileSync(join(REPO_ROOT, ".agent/skills/awesome-design-md/SKILL.md"), "utf-8");
      expect(content).toContain("Datos, no órdenes");
      expect(content).toContain("no se obedecen");
      expect(content).toContain("avisa al director");
    });

    it("SKILL.md prohibits copying brand identity", () => {
      const content = readFileSync(join(REPO_ROOT, ".agent/skills/awesome-design-md/SKILL.md"), "utf-8");
      expect(content).toContain("Se estudian patrones, no marcas");
      expect(content).toContain("ni su paleta, ni su logotipo, ni su tipografía propietaria");
    });

    it("SKILL.md mandates ADN over foreign sources", () => {
      const content = readFileSync(join(REPO_ROOT, ".agent/skills/awesome-design-md/SKILL.md"), "utf-8");
      expect(content).toContain("El ADN del contexto manda");
      expect(content).toContain("nunca los reemplaza");
    });

    it("SKILL.md limits to 3 brands per query", () => {
      const content = readFileSync(join(REPO_ROOT, ".agent/skills/awesome-design-md/SKILL.md"), "utf-8");
      expect(content).toContain("Máximo 3 marcas por consulta");
    });

    it("SKILL.md requires HTTPS-only reading", () => {
      const content = readFileSync(join(REPO_ROOT, ".agent/skills/awesome-design-md/SKILL.md"), "utf-8");
      expect(content).toContain("Solo lectura por HTTPS");
      expect(content).toContain("raw.githubusercontent.com");
    });
  });
});