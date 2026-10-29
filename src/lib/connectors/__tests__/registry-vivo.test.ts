import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID, RECOMMENDED_CONNECTOR_IDS } from "../registry";

/* Ola CVV1028 · tarea J · conectores Spline y Higgsfield (contenido vivo).
   Comprobaciones: ids únicos en todo el registro y ninguna entrada con un
   valor de clave (las claves van a la bóveda local, nunca al código). */

const CLAVE_PATRONES = [
  /sk-[A-Za-z0-9]{8,}/,
  /gh[pousr]_[A-Za-z0-9]{8,}/,
  /Bearer\s+[A-Za-z0-9._-]{12,}/,
  /\b[a-f0-9]{32,}\b/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const SPLINE = "spline" as const;
const HIGGSFIELD = "higgsfield" as const;

describe("registry-vivo · Spline y Higgsfield (contenido vivo)", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ninguna entrada del registro lleva un valor de clave", () => {
    for (const c of BUILTIN_CONNECTORS) {
      const texto = JSON.stringify(c);
      for (const patron of CLAVE_PATRONES) {
        expect(texto, `${c.id} parece llevar una clave`).not.toMatch(patron);
      }
    }
  });

  it("los dos conectores existen y no vacían el registro previo", () => {
    expect(CONNECTORS_BY_ID[SPLINE]).toBeDefined();
    expect(CONNECTORS_BY_ID[HIGGSFIELD]).toBeDefined();
    expect(BUILTIN_CONNECTORS.length).toBeGreaterThanOrEqual(30);
  });

  it("Spline queda honesto: cuenta por OAuth, gratis con plan, y no recomendado", () => {
    const c = CONNECTORS_BY_ID[SPLINE];
    expect(c.authType).toBe("oauth");
    expect(c.status).toBe("needs-auth");
    expect(c.kind).toBe("free");
    expect(c.free).toBe(true);
    expect(c.recommended).toBe(false);
    expect(c.configHint).toContain("https://mcp.spline.design/mcp");
    expect(c.description).toContain("200 llamadas al día");
    expect(c.description).toMatch(/cuenta/i);
    expect(c.description).toMatch(/escena/i);
  });

  it("spline respeta lo propio: no hay clave y nombra la vía local", () => {
    const c = CONNECTORS_BY_ID[SPLINE];
    expect(c.description).toContain("Three.js");
    expect(c.description).toMatch(/embeben|remezclan/);
    expect(c.description).toMatch(/crédito al autor/);
    for (const patron of CLAVE_PATRONES) {
      expect(JSON.stringify(c)).not.toMatch(patron);
    }
  });

  it("Higgsfield va con clave a la bóveda, de pago y sin recomendación", () => {
    const c = CONNECTORS_BY_ID[HIGGSFIELD];
    expect(c.authType).toBe("apiKey");
    expect(c.status).toBe("needs-auth");
    expect(c.kind).toBe("paid");
    expect(c.free).toBe(false);
    expect(c.recommended).toBe(false);
    expect(c.configHint).toContain("bóveda");
    expect(c.description).toMatch(/bóveda/);
    expect(c.description).toMatch(/nunca al código/);
  });

  it("higgsfield cubre imagen y vídeo y no duplica el adaptador de cerebros", () => {
    const c = CONNECTORS_BY_ID[HIGGSFIELD];
    expect(c.description).toMatch(/imagen/i);
    expect(c.description).toMatch(/vídeo/i);
    expect(c.description).toMatch(/Nano Banana 2/);
    expect(c.description).toMatch(/Seedance 2\.0/);
    expect(c.description).toMatch(/no se duplica nada/);
    expect(c.configHint).not.toContain("hf_");
  });

  it("ninguno entra en el conjunto recomendado por defecto", () => {
    expect(RECOMMENDED_CONNECTOR_IDS).not.toContain(SPLINE);
    expect(RECOMMENDED_CONNECTOR_IDS).not.toContain(HIGGSFIELD);
  });
});
