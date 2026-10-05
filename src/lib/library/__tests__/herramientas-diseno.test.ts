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

/** Los 9 repos de la tabla §7 de architecture/director-diseno.md. */
const HERRAMIENTAS: Array<{ id: string; url: string }> = [
  { id: "iatool-assistant-ui", url: "https://github.com/assistant-ui/assistant-ui" },
  { id: "iatool-tambo", url: "https://github.com/tambo-ai/tambo" },
  { id: "iatool-copilotkit", url: "https://github.com/copilotkit/copilotkit" },
  { id: "iatool-vercel-ai-sdk", url: "https://github.com/vercel/ai" },
  { id: "iatool-mastra", url: "https://github.com/mastra-ai/mastra" },
  { id: "iatool-langgraphjs", url: "https://github.com/langchain-ai/langgraphjs" },
  { id: "iatool-opendesign", url: "https://github.com/nexu-io/open-design" },
  { id: "iatool-taste-skill", url: "https://github.com/Leonxlnx/taste-skill" },
  { id: "iatool-ui-tars", url: "https://github.com/bytedance/UI-TARS" },
];

describe("Herramientas de diseño (director-diseno.md §7)", () => {
  it("los 9 repos de la tabla §7 están en el catálogo con su URL de GitHub", () => {
    for (const h of HERRAMIENTAS) {
      const p = TODOS.find((pkg) => pkg.id === h.id);
      expect(p, `falta el paquete ${h.id}`).toBeDefined();
      expect(p?.payload.externalUrl, `URL de ${h.id}`).toBe(h.url);
      expect(p?.payload.categoria, `categoria de ${h.id}`).toBe("diseno");
    }
  });

  it("OpenDesign tiene su URL variante y UI-TARS su URL de escritorio", () => {
    const od = TODOS.find((p) => p.id === "iatool-opendesign");
    expect(od?.payload.variantUrl).toBe("https://github.com/manalkaff/opendesign");
    const tars = TODOS.find((p) => p.id === "iatool-ui-tars");
    expect(tars?.payload.desktopUrl).toBe("https://github.com/bytedance/UI-TARS-desktop");
  });

  it("taste-skill aparece una sola vez en todo el catálogo", () => {
    const coincidencias = TODOS.filter((p) => p.id === "iatool-taste-skill");
    expect(coincidencias.length).toBe(1);
  });

  it("no hay ids duplicados en todo el catálogo", () => {
    const ids = TODOS.map((p) => p.id);
    const unicos = new Set(ids);
    expect(unicos.size).toBe(ids.length);
  });
});
