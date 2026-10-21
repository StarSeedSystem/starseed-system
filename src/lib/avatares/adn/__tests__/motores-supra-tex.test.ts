import { describe, it, expect } from "vitest";
import { MOTORES_3D } from "../motores";
import { planificar } from "../canalizacion";

describe("SUPRA-Tex (RLB1020O)", () => {
  it("ambos motores existen en MOTORES_3D con los datos del contrato", () => {
    const local = MOTORES_3D.find((m) => m.id === "supra-tex");
    const espacio = MOTORES_3D.find((m) => m.id === "supra-tex-espacio");
    expect(local).toBeDefined();
    expect(espacio).toBeDefined();
  });

  it("supra-tex local tiene pesos-sin-codigo y uso no-comercial", () => {
    const m = MOTORES_3D.find((m) => m.id === "supra-tex")!;
    expect(m.estado).toBe("pesos-sin-codigo");
    expect(m.uso).toBe("no-comercial");
    expect(m.necesita).toContain("cuda-16gb");
    expect(m.etapa).toBe("generar");
    expect(m.licencia).toMatch(/MIT \(completado\)/);
  });

  it("planificar no elige supra-tex local mientras sea pesos-sin-codigo", () => {
    const p = planificar({
      partida: "imagen", esqueleto: "vrm-humanoide",
      capacidades: ["cuda-16gb"], region: "MX",
      comercial: false, permitirDePago: false, prioridad: "calidad",
    });
    const pasoGenerar = p.pasos.find((s) => s.etapa === "generar")!;
    expect(pasoGenerar.descartes.some((d) => d.includes("código de inferencia aún no está publicado"))).toBe(true);
    expect(pasoGenerar.motor?.id).not.toBe("supra-tex");
  });

  it("en uso comercial ninguna SUPRA-Tex se elige (uso no-comercial)", () => {
    const p = planificar({
      partida: "imagen", esqueleto: "vrm-humanoide",
      capacidades: ["espacio-hf", "cpu"], region: "MX",
      comercial: true, permitirDePago: false, prioridad: "calidad",
    });
    const pasoGenerar = p.pasos.find((s) => s.etapa === "generar")!;
    // Ambas SUPRA-Tex deben aparecer descartadas por no-comercial.
    const descartesSupra = pasoGenerar.descartes.filter((d) => /supra[- ]?tex/i.test(d));
    expect(descartesSupra.some((d) => d.includes("no permite uso comercial"))).toBe(true);
    expect(pasoGenerar.motor?.id).not.toBe("supra-tex");
    expect(pasoGenerar.motor?.id).not.toBe("supra-tex-espacio");
  });

  it("supra-tex-espacio se descarta correctamente por uso no-comercial en comercial", () => {
    const p = planificar({
      partida: "imagen", esqueleto: "vrm-humanoide",
      capacidades: ["espacio-hf"], region: "MX",
      comercial: true, permitirDePago: false,
    });
    const pasoGenerar = p.pasos.find((s) => s.etapa === "generar")!;
    expect(pasoGenerar.descartes.some((d) => /supra[- ]?tex/i.test(d) && d.toLowerCase().includes("space") && d.includes("no permite uso comercial"))).toBe(true);
  });
});
