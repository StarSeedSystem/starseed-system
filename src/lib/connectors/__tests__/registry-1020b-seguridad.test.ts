import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

const NUEVOS: Record<
  string,
  { repo: string; category: string; authType: string; salvaguarda: RegExp }
> = {
  "tirreno-selfhost": {
    repo: "tirrenotechnologies/tirreno",
    category: "custom",
    authType: "apiKey",
    salvaguarda: /aviso de privacidad/i,
  },
  "moli-serve": {
    repo: "lexmount/moli",
    category: "web",
    authType: "localEndpoint",
    salvaguarda: /sandbox.*dominios/i,
  },
  "dbx-mcp": {
    repo: "t8y2/dbx",
    category: "dev",
    authType: "localEndpoint",
    salvaguarda: /solo lectura/i,
  },
  "openshell-gateway": {
    repo: "NVIDIA/OpenShell",
    category: "dev",
    authType: "localEndpoint",
    salvaguarda: /OPENSHELL_TELEMETRY_ENABLED=false/,
  },
};

describe("registry-1020b-seguridad · tirreno, Moli, DBX y OpenShell", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los 4 conectores existen con el patrón común", () => {
    for (const [id, esperado] of Object.entries(NUEVOS)) {
      const c = CONNECTORS_BY_ID[id];
      expect(c, `falta ${id}`).toBeDefined();
      expect(c.repo).toContain(esperado.repo);
      expect(c.category).toBe(esperado.category);
      expect(c.authType).toBe(esperado.authType);
      expect(c.kind).toBe("oss");
      expect(c.status).toBe("available");
      expect(c.free).toBe(true);
      expect(c.recommended).toBe(false);
      expect(c.configHint).toMatch(/http:\/\//);
    }
  });

  it("cada descripción menciona su salvaguarda", () => {
    for (const [id, esperado] of Object.entries(NUEVOS)) {
      expect(CONNECTORS_BY_ID[id].description ?? "", id).toMatch(esperado.salvaguarda);
    }
  });

  it("las descripciones de privacidad y alfa son honestas", () => {
    expect(CONNECTORS_BY_ID["tirreno-selfhost"].description).toMatch(/IP y correos/);
    expect(CONNECTORS_BY_ID["openshell-gateway"].description).toMatch(/alfa/i);
  });
});
