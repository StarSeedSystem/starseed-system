import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

describe("registry-1020b · conectores autoalojables", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it("los 4 nuevos conectores presentes con repo de GitHub", () => {
    const nuevos = [
      { id: "vikunja-selfhost", repoEsperado: "go-vikunja/vikunja" },
      { id: "trilium-etapi", repoEsperado: "TriliumNext/Trilium" },
      { id: "metabase-selfhost", repoEsperado: "metabase/metabase" },
      { id: "windmill-selfhost", repoEsperado: "windmill-labs/windmill" },
    ];
    for (const item of nuevos) {
      expect(CONNECTORS_BY_ID[item.id], `falta ${item.id}`).toBeDefined();
      const c = CONNECTORS_BY_ID[item.id];
      expect(c.repo, `repo de ${item.id}`).toMatch(/github\.com/);
      expect(c.repo, `repo contiene upstream de ${item.id}`).toContain(item.repoEsperado);
      expect(c.kind).toBe("oss");
      expect(c.status).toBe("available");
      expect(c.free).toBe(true);
      expect(c.recommended).toBe(false);
      expect(c.authType).toBe("apiKey");
      expect(c.description).toBeDefined();
      expect(c.description!.length).toBeGreaterThan(10);
    }
  });

  it("descripción honesta: menciona licencia AGPL y auto-hospedado", () => {
    const ids = ["vikunja-selfhost", "trilium-etapi", "metabase-selfhost", "windmill-selfhost"];
    for (const id of ids) {
      const c = CONNECTORS_BY_ID[id];
      const desc = (c.description || "").toLowerCase();
      expect(desc, `descripción de ${id} menciona licencia o alojamiento`).toMatch(
        /(agpl|auto[- ]hospedado|se aloja|licencia)/,
      );
    }
  });

  it("categorías, iconos lucide y configHint adecuados", () => {
    const mapa: Record<string, { category: string; icon: string }> = {
      "vikunja-selfhost": { category: "custom", icon: "ListChecks" },
      "trilium-etapi": { category: "memory", icon: "NotebookText" },
      "metabase-selfhost": { category: "custom", icon: "BarChart3" },
      "windmill-selfhost": { category: "dev", icon: "Zap" },
    };
    for (const [id, esperado] of Object.entries(mapa)) {
      const c = CONNECTORS_BY_ID[id];
      expect(c.category).toBe(esperado.category);
      expect(c.icon).toBe(esperado.icon);
      expect(c.configHint).toBeDefined();
      expect(c.configHint!.length).toBeGreaterThan(0);
    }
  });
});
