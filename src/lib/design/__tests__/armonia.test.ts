import { describe, it, expect } from "vitest";
import { leerArchivo, contieneTokensArmonia, verificarEscalaPhi } from "../armonia";

/* DIS1005C — armonía: escala tipográfica φ y espaciado Fibonacci como tokens */

describe("tokens de armonía", () => {
  it("debe contener φ, fib-1..10, fs-phi--2..4 y no eliminar claves existentes", () => {
    const css = leerArchivo("src/app/globals.css");
    const config = leerArchivo("tailwind.config.ts");
    const r = contieneTokensArmonia(css, config);
    expect(r.tokensCss).toBe(true);
    expect(r.tokensConfig).toBe(true);
    expect(r.clavesConservadas).toBe(true);
  });

  it("debe tener --phi exactamente 1.618", () => {
    const css = leerArchivo("src/app/globals.css");
    expect(css).toContain("--phi: 1.618");
  });

  it("debe tener los 10 valores Fibonacci en CSS y config", () => {
    const css = leerArchivo("src/app/globals.css");
    const config = leerArchivo("tailwind.config.ts");
    for (let i = 1; i <= 10; i++) {
      expect(css).toContain(`--fib-${i}:`);
      expect(config).toContain(`fib-${i}`);
    }
  });

  /* DIS1005P — los clamp de --fs-phi-* deben tener mínimo ≤ máximo y razón φ */
  it("toda la escala --fs-phi-* tiene mínimo ≤ máximo y razón ≈ 1.618 entre máximos", () => {
    const css = leerArchivo("src/app/globals.css");
    const r = verificarEscalaPhi(css);
    expect(r.pasos.length).toBeGreaterThanOrEqual(6);
    expect(r.minimosCoherentes).toBe(true);
    expect(r.razonPhi).toBe(true);
  });
});
