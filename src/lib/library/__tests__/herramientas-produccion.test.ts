import { describe, it, expect } from "vitest";
import {
  STARSEED_CORE_REPO,
  STARSEED_LABS_REPO,
  STARSEED_IA_TOOLS_REPO,
  STARSEED_AGENTS_REPO,
  STARSEED_THEMES_REPO,
  STARSEED_DESIGN_ELEMENTS_REPO,
} from "../packages";
import { REPO_DECISIONES } from "../fuentes-decision";

/** Catálogo builtin completo (sin repos externos del usuario). */
const CATALOGO = [
  STARSEED_CORE_REPO,
  STARSEED_LABS_REPO,
  STARSEED_IA_TOOLS_REPO,
  STARSEED_AGENTS_REPO,
  STARSEED_THEMES_REPO,
  STARSEED_DESIGN_ELEMENTS_REPO,
  REPO_DECISIONES,
];

const TODOS = CATALOGO.flatMap((r) => r.packages);

/** Los 9 repos de la tabla §9 de architecture/director-produccion.md. */
const HERRAMIENTAS: Array<{ id: string; url: string; licencia: string }> = [
  { id: "iatool-temporal", url: "https://github.com/temporalio/temporal", licencia: "MIT" },
  { id: "iatool-mcp-servers", url: "https://github.com/modelcontextprotocol/servers", licencia: "MIT" },
  { id: "iatool-llamaindex", url: "https://github.com/run-llama/llama_index", licencia: "MIT" },
  { id: "iatool-crewai", url: "https://github.com/crewAIInc/crewAI", licencia: "MIT" },
  { id: "iatool-genkit", url: "https://github.com/genkit-ai/genkit", licencia: "Apache-2.0" },
  { id: "iatool-n8n", url: "https://github.com/n8n-io/n8n", licencia: "Licencia de uso sostenible" },
  { id: "iatool-dify", url: "https://github.com/langgenius/dify", licencia: "Licencia propia basada en Apache con condiciones" },
  { id: "iatool-flowise", url: "https://github.com/FlowiseAI/Flowise", licencia: "Apache-2.0 (core)" },
  { id: "iatool-langserve", url: "https://github.com/langchain-ai/langserve", licencia: "MIT" },
];

describe("Herramientas de producción (director-produccion.md §9)", () => {
  it("los 9 repos de la tabla §9 están en el catálogo con su URL, licencia y estado", () => {
    for (const h of HERRAMIENTAS) {
      const p = TODOS.find((pkg) => pkg.id === h.id);
      expect(p, `falta el paquete ${h.id}`).toBeDefined();
      expect(p?.payload.externalUrl, `URL de ${h.id}`).toBe(h.url);
      expect(p?.payload.categoria, `categoria de ${h.id}`).toBe("produccion");
      expect(p?.payload.licencia, `licencia de ${h.id}`).toBe(h.licencia);
      expect(typeof p?.payload.estado, `estado de ${h.id}`).toBe("string");
    }
  });

  it("Flowise y LangServe están marcados como «archivado · solo referencia»", () => {
    for (const id of ["iatool-flowise", "iatool-langserve"]) {
      const p = TODOS.find((pkg) => pkg.id === id);
      expect(p?.payload.estado, `estado de ${id}`).toBe("archivado · solo referencia");
    }
  });

  it("los 7 activos declaran cómo los usa el director en su nota", () => {
    const activos = HERRAMIENTAS.filter((h) => h.id !== "iatool-flowise" && h.id !== "iatool-langserve");
    for (const h of activos) {
      const p = TODOS.find((pkg) => pkg.id === h.id);
      expect(p?.payload.estado, `estado de ${h.id}`).toBe("activo");
      expect(String(p?.payload.note), `nota de ${h.id}`).toMatch(/§9|director/i);
    }
  });

  it("cada uno aparece una sola vez en todo el catálogo (sin duplicados)", () => {
    for (const h of HERRAMIENTAS) {
      const coincidencias = TODOS.filter((p) => p.id === h.id);
      expect(coincidencias.length, `id duplicado: ${h.id}`).toBe(1);
    }
    const ids = TODOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
