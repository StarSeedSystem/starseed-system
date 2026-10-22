import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

const NUEVOS = [
  {
    id: "tirreno-selfhost",
    salvaguarda: /consentimiento/,
    repo: "tirrenotechnologies/tirreno",
    category: "custom",
    authType: "apiKey",
  },
  {
    id: "moli-serve",
    salvaguarda: /sandbox/,
    repo: "lexmount/moli",
    category: "web",
    authType: "localEndpoint",
  },
  {
    id: "dbx-mcp",
    salvaguarda: /solo lectura/,
    repo: "t8y2/dbx",
    category: "dev",
    authType: "localEndpoint",
  },
  {
    id: "openshell-gateway",
    salvaguarda: /telemetr[ií]a/,
    repo: "NVIDIA/OpenShell",
    category: "dev",
    authType: "localEndpoint",
  },
] as const;

describe("registry-1020b-seguridad · conectores de seguridad y agentes", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("registry-1020b-seguridad · fichas honestas", () => {
  it("los 4 conectores existen y declaran su upstream verificado", () => {
    for (const esperado of NUEVOS) {
      const c = CONNECTORS_BY_ID[esperado.id];
      expect(c, `falta ${esperado.id}`).toBeDefined();
      expect(c.repo).toContain(esperado.repo);
      expect(c.kind).toBe("oss");
      expect(c.status).toBe("available");
      expect(c.free).toBe(true);
      expect(c.recommended).toBe(false);
    }
  });
});

describe("registry-1020b-seguridad · salvaguardas a la vista", () => {
  it("cada descripción menciona su límite real", () => {
    for (const esperado of NUEVOS) {
      const c = CONNECTORS_BY_ID[esperado.id];
      expect(c.category).toBe(esperado.category);
      expect(c.authType).toBe(esperado.authType);
      expect(c.configHint!.length).toBeGreaterThan(0);
      expect(c.description || "").toMatch(esperado.salvaguarda);
    }
  });
});
