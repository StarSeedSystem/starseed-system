import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

const ESPERADOS = [
  { id: "tirreno-selfhost", category: "custom", authType: "apiKey", salvaguarda: /consentimiento/i, hint: "http://<host>:8585" },
  { id: "moli-serve", category: "web", authType: "localEndpoint", salvaguarda: /sandbox/i, hint: "http://127.0.0.1:" },
  { id: "dbx-mcp", category: "dev", authType: "localEndpoint", salvaguarda: /solo lectura/i, hint: "http://127.0.0.1:" },
  { id: "openshell-gateway", category: "dev", authType: "localEndpoint", salvaguarda: /OPENSHELL_TELEMETRY_ENABLED=false/, hint: "http://127.0.0.1:" },
] as const;

describe("registry-1020b-seguridad · conectores de seguridad y agentes", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los 4 conectores existen con la forma pedida", () => {
    for (const e of ESPERADOS) {
      const c = CONNECTORS_BY_ID[e.id];
      expect(c, `falta ${e.id}`).toBeDefined();
      expect(c.category).toBe(e.category);
      expect(c.authType).toBe(e.authType);
      expect(c.kind).toBe("oss");
      expect(c.status).toBe("available");
      expect(c.free).toBe(true);
      expect(c.recommended).toBe(false);
      expect(c.repo).toMatch(/^https:\/\/github\.com\//);
      expect(c.configHint).toContain(e.hint);
    }
  });

  it("cada descripción menciona su salvaguarda", () => {
    for (const e of ESPERADOS) {
      expect(CONNECTORS_BY_ID[e.id].description ?? "", e.id).toMatch(e.salvaguarda);
    }
  });

  it("tirreno avisa de IP, correos y aviso de privacidad; OpenShell de alfa; Moli de dominios", () => {
    expect(CONNECTORS_BY_ID["tirreno-selfhost"].description).toMatch(/aviso de privacidad/i);
    expect(CONNECTORS_BY_ID["tirreno-selfhost"].description).toMatch(/IP/);
    expect(CONNECTORS_BY_ID["openshell-gateway"].description).toMatch(/alfa/i);
    expect(CONNECTORS_BY_ID["moli-serve"].description).toMatch(/dominios/i);
  });
});
