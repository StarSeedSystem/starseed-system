import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

const NUEVOS: Record<string, { category: string; authType: string; salvaguarda: RegExp }> = {
  "tirreno-selfhost": { category: "custom", authType: "apiKey", salvaguarda: /aviso de privacidad/i },
  "moli-serve": { category: "web", authType: "localEndpoint", salvaguarda: /sandbox/i },
  "dbx-mcp": { category: "dev", authType: "localEndpoint", salvaguarda: /solo lectura/i },
  "openshell-gateway": { category: "dev", authType: "localEndpoint", salvaguarda: /OPENSHELL_TELEMETRY_ENABLED=false/ },
};

describe("registry-1020b · seguridad y agentes", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los 4 conectores existen con el patrón oss/available/gratis", () => {
    for (const [id, esperado] of Object.entries(NUEVOS)) {
      const c = CONNECTORS_BY_ID[id];
      expect(c, `falta ${id}`).toBeDefined();
      expect(c.category).toBe(esperado.category);
      expect(c.authType).toBe(esperado.authType);
      expect(c.kind).toBe("oss");
      expect(c.status).toBe("available");
      expect(c.free).toBe(true);
      expect(c.recommended).toBe(false);
      expect(c.configHint).toBeTruthy();
    }
  });

  it("cada descripción menciona su salvaguarda", () => {
    for (const [id, esperado] of Object.entries(NUEVOS)) {
      expect(CONNECTORS_BY_ID[id].description ?? "").toMatch(esperado.salvaguarda);
    }
    expect(CONNECTORS_BY_ID["moli-serve"].description).toMatch(/dominios/i);
    expect(CONNECTORS_BY_ID["openshell-gateway"].description).toMatch(/alfa/i);
    expect(CONNECTORS_BY_ID["tirreno-selfhost"].description).toMatch(/IP y correos/i);
  });
});
