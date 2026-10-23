import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

/** Conectores de la segunda tanda (1020b) que tocan datos sensibles o ejecutan código. */
const NUEVOS_SEGURIDAD = [
  "tirreno-selfhost",
  "moli-serve",
  "dbx-mcp",
  "openshell-gateway",
] as const;

describe("registry-1020b · conectores de seguridad y agentes", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it("los 4 conectores presentes con la ficha base correcta", () => {
    const esperado = {
      kind: "oss",
      status: "available",
      free: true,
      recommended: false,
    };
    const categorias: Record<string, string> = {
      "tirreno-selfhost": "custom",
      "moli-serve": "web",
      "dbx-mcp": "dev",
      "openshell-gateway": "dev",
    };
    const autenticaciones: Record<string, string> = {
      "tirreno-selfhost": "apiKey",
      "moli-serve": "localEndpoint",
      "dbx-mcp": "localEndpoint",
      "openshell-gateway": "localEndpoint",
    };
    for (const id of NUEVOS_SEGURIDAD) {
      const c = CONNECTORS_BY_ID[id];
      expect(c, `falta ${id}`).toBeDefined();
      expect(c.category, `categoría de ${id}`).toBe(categorias[id]);
      expect(c.authType, `authType de ${id}`).toBe(autenticaciones[id]);
      expect(c.kind, `kind de ${id}`).toBe(esperado.kind);
      expect(c.status, `status de ${id}`).toBe(esperado.status);
      expect(c.free, `free de ${id}`).toBe(esperado.free);
      expect(c.recommended, `recommended de ${id}`).toBe(esperado.recommended);
      expect(c.repo, `repo de ${id}`).toMatch(/github\.com/);
      expect(c.configHint, `configHint de ${id}`).toBeDefined();
      expect(c.configHint!.length).toBeGreaterThan(0);
    }
  });

  it("cada descripción menciona su salvaguarda", () => {
    const salvaguardas: Array<[string, RegExp]> = [
      ["tirreno-selfhost", /aviso de privacidad|consentimiento/i],
      ["moli-serve", /sandbox/i],
      ["dbx-mcp", /solo lectura/i],
      ["openshell-gateway", /telemetría/i],
    ];
    for (const [id, patron] of salvaguardas) {
      const c = CONNECTORS_BY_ID[id];
      expect(c.description, `${id} sin descripción`).toBeDefined();
      expect(c.description!, `salvaguarda de ${id}`).toMatch(patron);
    }
  });

  it("tirreno, moli, dbx y openshell declaran su aviso concreto", () => {
    const tirreno = CONNECTORS_BY_ID["tirreno-selfhost"];
    expect(tirreno.description).toMatch(/IP/);
    expect(tirreno.description).toMatch(/correos/i);
    expect(tirreno.configHint).toContain("http://<host>:8585");

    const moli = CONNECTORS_BY_ID["moli-serve"];
    expect(moli.description).toMatch(/lista de dominios/i);
    expect(moli.configHint).toContain("http://127.0.0.1:");
    expect(moli.configHint).toContain("moli serve");

    const dbx = CONNECTORS_BY_ID["dbx-mcp"];
    expect(dbx.description).toMatch(/solo lectura/i);
    expect(dbx.configHint).toContain("http://127.0.0.1:");
    expect(dbx.repo).toContain("t8y2/dbx");

    const openshell = CONNECTORS_BY_ID["openshell-gateway"];
    expect(openshell.description).toMatch(/alfa/i);
    expect(openshell.description).toContain("OPENSHELL_TELEMETRY_ENABLED=false");
    expect(openshell.configHint).toContain("http://127.0.0.1:");
  });
});
