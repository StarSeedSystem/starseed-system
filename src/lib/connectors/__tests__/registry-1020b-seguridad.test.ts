import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

describe("registry-1020b-seguridad · tirreno, moli, dbx y openshell", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it("cada salvaguarda está en su descripción", () => {
    const salvaguardas: Record<string, RegExp> = {
      "tirreno-selfhost": /(aviso de privacidad)/,
      "moli-serve": /(sandbox)/,
      "dbx-mcp": /(solo lectura)/,
      "openshell-gateway": /(telemetría)/,
    };
    for (const [id, patron] of Object.entries(salvaguardas)) {
      expect(CONNECTORS_BY_ID[id], `falta ${id}`).toBeDefined();
      const desc = (CONNECTORS_BY_ID[id].description || "").toLowerCase();
      expect(desc, `salvaguarda de ${id}`).toMatch(patron);
    }
  });

  it("ficha común: kind oss, status available, gratis y no recomendado", () => {
    const ids = ["tirreno-selfhost", "moli-serve", "dbx-mcp", "openshell-gateway"];
    const categorias: Record<string, string> = {
      "tirreno-selfhost": "custom",
      "moli-serve": "web",
      "dbx-mcp": "dev",
      "openshell-gateway": "dev",
    };
    const auths: Record<string, string> = {
      "tirreno-selfhost": "apiKey",
      "moli-serve": "localEndpoint",
      "dbx-mcp": "localEndpoint",
      "openshell-gateway": "localEndpoint",
    };
    for (const id of ids) {
      const c = CONNECTORS_BY_ID[id];
      expect(c.kind).toBe("oss");
      expect(c.status).toBe("available");
      expect(c.free).toBe(true);
      expect(c.recommended).toBe(false);
      expect(c.category, `categoría de ${id}`).toBe(categorias[id]);
      expect(c.authType, `authType de ${id}`).toBe(auths[id]);
      expect(c.repo).toContain("github.com");
      expect(c.configHint, `configHint de ${id}`).toMatch(/^http:\/\//);
      expect(c.description!.length).toBeGreaterThan(10);
    }
  });

  it("tirreno no se recomienda y exige decisión explícita (datos sensibles)", () => {
    const desc = (CONNECTORS_BY_ID["tirreno-selfhost"].description || "").toLowerCase();
    expect(desc).toMatch(/(ip|correo)/);
    expect(desc).toMatch(/mínimo/);
  });
});
