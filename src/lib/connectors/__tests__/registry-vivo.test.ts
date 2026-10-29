import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

const PATRONES_DE_CLAVE = [
  /sk-[A-Za-z0-9]{8,}/,
  /gh[pousr]_[A-Za-z0-9]{8,}/,
  /Bearer\s+[A-Za-z0-9._-]{12,}/,
  /\b[a-f0-9]{32,}\b/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

describe("registry-vivo · conectores vivos", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Spline existe, va por MCP HTTP con cuenta y avisa del plan Pro", () => {
    const spline = CONNECTORS_BY_ID["spline"];
    expect(spline, "falta spline").toBeDefined();
    expect(spline.authType).toBe("oauth");
    expect(spline.status).toBe("needs-auth");
    expect(spline.free).toBe(true);
    expect(spline.configHint).toContain("https://mcp.spline.design/mcp");
    expect(spline.description).toMatch(/200 llamadas al día/i);
    expect(spline.description).toMatch(/00:00 UTC/);
  });

  it("Higgsfield existe, pide clave y la manda a la bóveda", () => {
    const higgs = CONNECTORS_BY_ID["higgsfield"];
    expect(higgs, "falta higgsfield").toBeDefined();
    expect(higgs.authType).toBe("apiKey");
    expect(higgs.status).toBe("needs-auth");
    expect(higgs.kind).toBe("paid");
    expect(higgs.free).toBe(false);
    expect(higgs.description).toMatch(/bóveda/i);
    expect(higgs.description).toMatch(/nunca al código/i);
  });

  it("ninguna de las dos fichas lleva un valor de clave", () => {
    for (const id of ["spline", "higgsfield"]) {
      const texto = JSON.stringify(CONNECTORS_BY_ID[id]);
      for (const patron of PATRONES_DE_CLAVE) {
        expect(texto, `${id} parece llevar una clave`).not.toMatch(patron);
      }
    }
  });
});