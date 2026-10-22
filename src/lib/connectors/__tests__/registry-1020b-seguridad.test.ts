import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

const IDS = ["tirreno-selfhost", "moli-serve", "dbx-mcp", "openshell-gateway"];

describe("registry-1020b · seguridad y agentes", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los 4 conectores existen con los campos base del contrato", () => {
    for (const id of IDS) {
      const c = CONNECTORS_BY_ID[id];
      expect(c, `falta ${id}`).toBeDefined();
      expect(c.kind).toBe("oss");
      expect(c.status).toBe("available");
      expect(c.free).toBe(true);
      expect(c.recommended).toBe(false);
    }
  });

  it("categorías, autenticación y pistas de configuración", () => {
    const esperado: Record<
      string,
      { category: string; authType: string; configHint: string }
    > = {
      "tirreno-selfhost": {
        category: "custom",
        authType: "apiKey",
        configHint: "http://<host>:8585",
      },
      "moli-serve": {
        category: "web",
        authType: "localEndpoint",
        configHint: "http://127.0.0.1:<puerto de moli serve>",
      },
      "dbx-mcp": {
        category: "dev",
        authType: "localEndpoint",
        configHint: "stdio (MCP) · o http://127.0.0.1:<puerto>",
      },
      "openshell-gateway": {
        category: "dev",
        authType: "localEndpoint",
        configHint: "http://127.0.0.1:<puerto de OpenShell>",
      },
    };
    for (const [id, e] of Object.entries(esperado)) {
      const c = CONNECTORS_BY_ID[id];
      expect(c.category).toBe(e.category);
      expect(c.authType).toBe(e.authType);
      expect(c.configHint).toBe(e.configHint);
      expect(c.repo).toMatch(/^https:\/\/github\.com\//);
      expect(c.description!.length).toBeGreaterThan(10);
    }
  });

  it("cada descripción nombra su salvaguarda", () => {
    const salvaguardas: Record<string, RegExp> = {
      "tirreno-selfhost": /consentimiento/i,
      "moli-serve": /sandbox/i,
      "dbx-mcp": /solo lectura/i,
      "openshell-gateway": /telemetr[ií]a/i,
    };
    for (const [id, patron] of Object.entries(salvaguardas)) {
      const desc = CONNECTORS_BY_ID[id].description || "";
      expect(desc, `salvaguarda ausente en ${id}`).toMatch(patron);
    }
  });
});
