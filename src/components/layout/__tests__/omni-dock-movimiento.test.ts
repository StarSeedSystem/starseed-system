import { describe, it, expect } from "vitest";
import { estiloIcono } from "../omni-dock-movimiento";

const registroBase = { reducido: false, registro: "sobrio" as const, seccion: "trinity" as const };
const registroReducido = { reducido: true, registro: "sobrio" as const, seccion: "trinity" as const };

describe("omni-dock-movimiento", () => {
  it("reposo devuelve transform neutro y transición", () => {
    const s = estiloIcono("reposo", registroBase);
    expect(s.transform).toBe("translateY(0) scale(1)");
    expect(s.transition).toContain("ms");
  });

  it("hover sube 4px y escala 1.08", () => {
    const s = estiloIcono("hover", registroBase);
    expect(s.transform).toBe("translateY(-4px) scale(1.08)");
    expect(s.transition).toBeTruthy();
  });

  it("pulsado escala 0.96", () => {
    const s = estiloIcono("pulsado", registroBase);
    expect(s.transform).toBe("scale(0.96)");
  });

  it("lanzando usa movimiento de registro", () => {
    const s = estiloIcono("lanzando", registroBase);
    expect(s.transform).toBe("translateY(-2px) scale(1.04)");
    expect(s.transition).toContain("ms");
  });

  it("con movimiento reducido no hay transform", () => {
    const s = estiloIcono("hover", registroReducido);
    expect(s.transform).toBe("");
    const s2 = estiloIcono("pulsado", registroReducido);
    expect(s2.transform).toBe("");
  });
});
