import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

const NUEVOS = [
  { id: "tirreno-selfhost", category: "custom", authType: "apiKey", salvaguarda: /consentimiento/i },
  { id: "moli-serve", category: "web", authType: "localEndpoint", salvaguarda: /sandbox/i },
  { id: "dbx-mcp", category: "dev", authType: "localEndpoint", salvaguarda: /solo lectura/i },
  { id: "openshell-gateway", category: "dev", authType: "localEndpoint", salvaguarda: /OPENSHELL_TELEMETRY_ENABLED=false/ },
] as const;

describe("registry-1020b-seguridad · conectores de seguridad y agentes", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los 4 conectores existen con la forma pedida", () => {
    for (const n of NUEVOS) {
      const c = CONNECTORS_BY_ID[n.id];
      expect(c, `falta ${n.id}`).toBeDefined();
      expect(c.category).toBe(n.category);
      expect(c.authType).toBe(n.authType);
      expect(c.kind).toBe("oss");
      expect(c.status).toBe("available");
      expect(c.free).toBe(true);
      expect(c.recommended).toBe(false);
      expect(c.configHint).toBeTruthy();
    }
  });

  it("cada descripción menciona su salvaguarda", () => {
    for (const n of NUEVOS) {
      expect(CONNECTORS_BY_ID[n.id].description ?? "", n.id).toMatch(n.salvaguarda);
    }
  });

  it("tirreno avisa de que recibe IP y correos y exige aviso de privacidad", () => {
    const d = CONNECTORS_BY_ID["tirreno-selfhost"].description ?? "";
    expect(d).toMatch(/IP/);
    expect(d).toMatch(/correos/);
    expect(d).toMatch(/aviso de privacidad/);
  });

  it("moli exige lista de dominios y openshell se declara alfa", () => {
    expect(CONNECTORS_BY_ID["moli-serve"].description).toMatch(/lista de dominios/);
    expect(CONNECTORS_BY_ID["openshell-gateway"].description).toMatch(/alfa/);
  });
});
