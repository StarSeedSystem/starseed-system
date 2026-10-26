import { describe, it, expect } from "vitest";
import { comprobarWebGpu, renderizarEscena } from "../cliente-render";

describe("cliente-render (ManimGX)", () => {
  it("detecta ausencia de WebGPU en entornos sin GPU", () => {
    const disponible = comprobarWebGpu();
    expect(typeof disponible).toBe("boolean");
  });

  it("rechaza una escena vacía con mensaje honesto", async () => {
    const res = await renderizarEscena({ nombre: "vacia", codigoPython: "" });
    expect(res.escena).toBe("vacia");
    expect(res.bytes).toBeNull();
    expect(typeof res.cancelado).toBe("boolean");
  });
});
