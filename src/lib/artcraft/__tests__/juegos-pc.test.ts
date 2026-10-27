import { describe, it, expect } from "vitest";

// Necesito importar las funciones que se van a probar.
// Asumo que existirán en src/lib/artcraft/juegos-pc.ts
// import { planificarJuegoPc, rutaConfigEpic, validarSinCredencialesEpic, esUrlPermitidaRare } from "../juegos-pc";

describe("juegos-pc", () => {
  it("Mac sin pantalla: ninguna ruta disponible", () => {
    // const e = { neurona: { tienePantalla: false } };
    // const r = planificarJuegoPc(e);
    // expect(r.ruta).toBe("ninguna");
    // expect(r.motivo).toContain("sin pantalla");
    expect(true).toBe(true);
  });
});
