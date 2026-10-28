import { describe, it, expect } from "vitest";
import { BUILTIN_CONNECTORS, CONNECTORS_BY_ID } from "../registry";

/**
 * Pruebas de la adenda CVV1028-J: conectores de contenido vivo (Spline y
 * Higgsfield). Solo funciones puras de catálogo: nada de red, disco ni procesos.
 */

describe("registry-vivo · conectores de contenido vivo", () => {
  it("ids únicos en todo el registro", () => {
    const ids = BUILTIN_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("spline existe, con el MCP de Spline y honesto (requiere cuenta)", () => {
    const c = CONNECTORS_BY_ID["spline"];
    expect(c, "falta spline").toBeDefined();
    expect(c.authType).toBe("oauth");
    expect(c.status).toBe("needs-auth");
    expect(c.kind).toBe("free");
    expect(c.free).toBe(true);
    expect(c.docsUrl).toBe("https://mcp.spline.design/mcp");
    expect(c.description).toMatch(/200 llamadas al día/);
    expect(c.configHint).toBeTruthy();
  });

  it("higgsfield existe, es de pago por créditos y su clave va a la bóveda", () => {
    const c = CONNECTORS_BY_ID["higgsfield"];
    expect(c, "falta higgsfield").toBeDefined();
    expect(c.authType).toBe("apiKey");
    expect(c.status).toBe("needs-auth");
    expect(c.kind).toBe("paid");
    expect(c.free).toBe(false);
    expect(c.docsUrl).toBe("https://cloud.higgsfield.ai");
    expect(c.description).toMatch(/bóveda/i);
    expect(c.configHint).toMatch(/bóveda/i);
  });

  it("higgsfield no duplica el adaptador de cerebros: reutiliza su preset", () => {
    const c = CONNECTORS_BY_ID["higgsfield"];
    expect(c.description).toMatch(/adaptador higgsfield/);
  });

  it("ninguna entrada del registro guarda una clave (ni parece contenerla)", () => {
    for (const c of BUILTIN_CONNECTORS) {
      const campo = c as unknown as Record<string, unknown>;
      expect("apiKey" in campo ? campo.apiKey : undefined, `${c.id} con apiKey`).toBeUndefined();
      expect("token" in campo ? campo.token : undefined, `${c.id} con token`).toBeUndefined();
      expect(c.description ?? "").not.toMatch(
        /(clave|key|token|secret)\s*[:=]\s*["'a-z0-9_-]{8,}/i,
      );
      expect(c.configHint ?? "").not.toMatch(
        /(clave|key|token|secret)\s*[:=]\s*["'a-z0-9_-]{8,}/i,
      );
    }
  });
});
