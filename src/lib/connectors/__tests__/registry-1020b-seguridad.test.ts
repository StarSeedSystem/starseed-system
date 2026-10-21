import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

/* Conectores de seguridad y agentes de la 2.ª tanda (RLB1020G2 · Ola 1020S).
 * Cada ficha declara su salvaguarda: tirreno (consentimiento y aviso de
 * privacidad), Moli (sandbox), DBX (solo lectura) y OpenShell (telemetría). */
const SEGURIDAD = [
  {
    id: "tirreno-selfhost",
    category: "custom",
    authType: "apiKey",
    upstream: "tirrenotechnologies/tirreno",
    salvaguarda: "consentimiento",
  },
  {
    id: "moli-serve",
    category: "web",
    authType: "localEndpoint",
    upstream: "lexmount/moli",
    salvaguarda: "sandbox",
  },
  {
    id: "dbx-mcp",
    category: "dev",
    authType: "localEndpoint",
    upstream: "t8y2/dbx",
    salvaguarda: "solo lectura",
  },
  {
    id: "openshell-gateway",
    category: "dev",
    authType: "localEndpoint",
    upstream: "NVIDIA/OpenShell",
    salvaguarda: "telemetría",
  },
] as const;

describe("registry-1020b-seguridad · tirreno, Moli, DBX y OpenShell", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los 4 conectores presentes con el contrato de la tanda", () => {
    for (const item of SEGURIDAD) {
      const c = CONNECTORS_BY_ID[item.id];
      expect(c, `falta ${item.id}`).toBeDefined();
      expect(c.category, `categoría de ${item.id}`).toBe(item.category);
      expect(c.authType, `authType de ${item.id}`).toBe(item.authType);
      expect(c.kind).toBe("oss");
      expect(c.status).toBe("available");
      expect(c.free).toBe(true);
      expect(c.recommended).toBe(false);
      expect(c.repo, `repo de ${item.id}`).toContain(item.upstream);
      expect(c.configHint, `configHint de ${item.id}`).toBeTruthy();
    }
  });

  it("cada descripción menciona su salvaguarda", () => {
    for (const item of SEGURIDAD) {
      const desc = (CONNECTORS_BY_ID[item.id]?.description || "").toLowerCase();
      expect(desc, `salvaguarda de ${item.id}`).toContain(item.salvaguarda);
    }
  });

  it("honestidad radical: avisos específicos de cada ficha", () => {
    const tirreno = CONNECTORS_BY_ID["tirreno-selfhost"].description || "";
    expect(tirreno).toMatch(/\bIP\b/);
    expect(tirreno).toContain("correos");
    expect(tirreno).toContain("aviso de privacidad");

    const moli = CONNECTORS_BY_ID["moli-serve"].description || "";
    expect(moli).toContain("lista de dominios");

    const dbx = CONNECTORS_BY_ID["dbx-mcp"].description || "";
    expect(dbx).toMatch(/siempre en modo solo lectura/i);

    const openshell = CONNECTORS_BY_ID["openshell-gateway"].description || "";
    expect(openshell).toMatch(/alfa/i);
    expect(openshell).toContain("OPENSHELL_TELEMETRY_ENABLED=false");
  });
});
