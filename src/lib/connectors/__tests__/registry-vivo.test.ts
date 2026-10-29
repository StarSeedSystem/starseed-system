import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

/**
 * Conectores del contenido vivo (CVV1028J): Spline y Higgsfield.
 * Contrato: architecture/contenido-vivo.md (tarea J).
 */

/** Nada de claves reales en ninguna ficha: solo nombres y pistas. */
const PATRON_CLAVE =
  /(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|ghs_[A-Za-z0-9]{8,}|figd_[A-Za-z0-9]{8,}|secret_[A-Za-z0-9]{8,}|AKIA[A-Z0-9]{12,}|xoxb-[A-Za-z0-9-]{10,}|AIza[A-Za-z0-9_-]{10,})/;

describe("registry-vivo · conectores de contenido vivo", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Spline: cuenta propia, MCP HTTP y cupo del plan Pro en la ficha", () => {
    const s = CONNECTORS_BY_ID["spline"];
    expect(s, "falta spline").toBeDefined();
    expect(s.authType).toBe("oauth");
    expect(s.status).toBe("needs-auth");
    expect(s.docsUrl).toBe("https://mcp.spline.design/mcp");
    expect(s.description).toContain("200 llamadas al día");
    expect(s.description).toMatch(/tu cuenta de Spline/);
    expect(s.description).toMatch(/tres|variantes locales|Three\.js/);
    expect(s.configHint).toContain("https://mcp.spline.design/mcp");
  });

  it("Higgsfield: de pago, clave en la bóveda, sin duplicar adaptadores", () => {
    const h = CONNECTORS_BY_ID["higgsfield"];
    expect(h, "falta higgsfield").toBeDefined();
    expect(h.authType).toBe("apiKey");
    expect(h.kind).toBe("paid");
    expect(h.free).toBe(false);
    expect(h.status).toBe("needs-auth");
    expect(h.description).toMatch(/bóveda/);
    expect(h.description).toMatch(/nunca al código/i);
    expect(h.description).toMatch(/adaptador del subsistema de cerebros/);
    expect(h.configHint).toMatch(/bóveda/);
    expect(h.configHint).not.toMatch(/https?:\/\//);
  });

  it("ninguna entrada del registro contiene un valor de clave", () => {
    for (const c of BUILTIN_CONNECTORS) {
      const texto = JSON.stringify(c);
      expect(texto, `la ficha ${c.id} parece llevar una clave`).not.toMatch(PATRON_CLAVE);
    }
  });
});
