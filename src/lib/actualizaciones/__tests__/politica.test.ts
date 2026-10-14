import { describe, it, expect } from "vitest";
import {
  politicaPorDefecto,
  TipoEntidad,
  decidirPolitica,
  ContextoDecision,
  Decision,
  sanearPolitica,
  resumenPolitica,
  PoliticaSistema,
  PoliticaCapa,
  CapaActualizacion,
} from "../politica";

describe("politicaPorDefecto", () => {
  it("returns correct policy for perfil-privado", () => {
    const policy = politicaPorDefecto("perfil-privado");
    expect(policy.datos.modo).toBe("automatica-todas");
    expect(policy.interfaz.modo).toBe("automatica-todas");
    expect(policy.sw.modo).toBe("automatica-esta");
    expect(policy.servicios.modo).toBe("manual");
    expect(policy.modelos.modo).toBe("manual");
    expect(policy.nativa.modo).toBe("manual");
  });

  it("returns correct policy for pagina-publica", () => {
    const policy = politicaPorDefecto("pagina-publica");
    expect(policy.datos.modo).toBe("automatica-todas");
    expect(policy.interfaz.modo).toBe("automatica-todas");
    expect(policy.sw.modo).toBe("automatica-todas");
    expect(policy.servicios.modo).toBe("manual");
    expect(policy.modelos.modo).toBe("manual");
    expect(policy.nativa.modo).toBe("manual");
  });

  it("returns correct policy for grupo-jerarquico", () => {
    const policy = politicaPorDefecto("grupo-jerarquico");
    expect(policy).toEqual(politicaPorDefecto("perfil-privado"));
  });

  it("returns correct policy for grupo-democratico", () => {
    const policy = politicaPorDefecto("grupo-democratico");
    expect(policy).toEqual(politicaPorDefecto("perfil-privado"));
  });

  it("returns correct policy for os", () => {
    const policy = politicaPorDefecto("os");
    expect(policy.datos.modo).toBe("automatica-todas");
    expect(policy.interfaz.modo).toBe("automatica-todas");
    expect(policy.sw.modo).toBe("automatica-todas");
    expect(policy.servicios.modo).toBe("manual");
    expect(policy.modelos.modo).toBe("programada");
    expect(policy.modelos.ventana).toEqual({ desdeH: 22, hastaH: 6 });
    expect(policy.nativa.modo).toBe("manual");
  });
});

describe("decidirPolitica", () => {
  const baseCtx: ContextoDecision = {
    ahoraH: 10,
    esNeuronaElegida: true,
    aprobada: true,
    requiereAprobacion: false,
  };

  it("returns esperar when approval required and not granted", () => {
    const ctx: ContextoDecision = { ...baseCtx, requiereAprobacion: true, aprobada: false };
    const p: PoliticaCapa = { modo: "automatica-todas" };
    expect(decidirPolitica(p, ctx)).toBe("esperar");
  });

  it("returns aplicar for automatica-todas", () => {
    const p: PoliticaCapa = { modo: "automatica-todas" };
    expect(decidirPolitica(p, baseCtx)).toBe("aplicar");
  });

  it("returns aplicar for automatica-esta when neuron is elected", () => {
    const p: PoliticaCapa = { modo: "automatica-esta" };
    expect(decidirPolitica(p, baseCtx)).toBe("aplicar");
  });

  it("returns avisar for automatica-esta when neuron not elected", () => {
    const ctx: ContextoDecision = { ...baseCtx, esNeuronaElegida: false };
    const p: PoliticaCapa = { modo: "automatica-esta" };
    expect(decidirPolitica(p, ctx)).toBe("avisar");
  });

  it("returns aplicar for programada within window", () => {
    const ctx: ContextoDecision = { ...baseCtx, ahoraH: 10 };
    const p: PoliticaCapa = { modo: "programada", ventana: { desdeH: 9, hastaH: 11 } };
    expect(decidirPolitica(p, ctx)).toBe("aplicar");
  });

  it("returns esperar for programada outside window", () => {
    const ctx: ContextoDecision = { ...baseCtx, ahoraH: 12 };
    const p: PoliticaCapa = { modo: "programada", ventana: { desdeH: 9, hastaH: 11 } };
    expect(decidirPolitica(p, ctx)).toBe("esperar");
  });

  it("returns aplicar for programada window crossing midnight (after start)", () => {
    const ctx: ContextoDecision = { ...baseCtx, ahoraH: 22 };
    const p: PoliticaCapa = { modo: "programada", ventana: { desdeH: 20, hastaH: 6 } };
    expect(decidirPolitica(p, ctx)).toBe("aplicar");
  });

  it("returns aplicar for programada window crossing midnight (before end)", () => {
    const ctx: ContextoDecision = { ...baseCtx, ahoraH: 4 };
    const p: PoliticaCapa = { modo: "programada", ventana: { desdeH: 20, hastaH: 6 } };
    expect(decidirPolitica(p, ctx)).toBe("aplicar");
  });

  it("returns esperar for programada window crossing midnight (outside)", () => {
    const ctx: ContextoDecision = { ...baseCtx, ahoraH: 19 };
    const p: PoliticaCapa = { modo: "programada", ventana: { desdeH: 20, hastaH: 6 } };
    expect(decidirPolitica(p, ctx)).toBe("esperar");
  });

  it("returns avisar for manual", () => {
    const p: PoliticaCapa = { modo: "manual" };
    expect(decidirPolitica(p, baseCtx)).toBe("avisar");
  });

  it("returns esperar for programada without window", () => {
    const p: PoliticaCapa = { modo: "programada" }; // ventana is undefined
    expect(decidirPolitica(p, baseCtx)).toBe("esperar");
  });

  it("returns esperar for grupo-democratico when approval required and not granted", () => {
    const ctx: ContextoDecision = { ...baseCtx, requiereAprobacion: true, aprobada: false };
    const p: PoliticaCapa = { modo: "automatica-todas" };
    expect(decidirPolitica(p, ctx)).toBe("esperar");
  });

  it("returns aplicar for grupo-democratico when approval granted", () => {
    const ctx: ContextoDecision = { ...baseCtx, requiereAprobacion: true, aprobada: true };
    const p: PoliticaCapa = { modo: "automatica-todas" };
    expect(decidirPolitica(p, ctx)).toBe("aplicar");
  });
});

describe("sanearPolitica", () => {
  it("returns manual policy for non-object input", () => {
    const result = sanearPolitica(null);
    expect(result.datos).toEqual({ modo: "manual" });
    expect(result.interfaz).toEqual({ modo: "manual" });
    // Check all layers
    for (const capa of ["datos", "interfaz", "sw", "servicios", "modelos", "nativa"] as CapaActualizacion[]) {
      expect(result[capa]).toEqual({ modo: "manual" });
    }
  });

  it("returns manual policy for invalid mode", () => {
    const input = {
      datos: { modo: "invalid" as any },
    };
    const result = sanearPolitica(input);
    expect(result.datos).toEqual({ modo: "manual" });
    // Other layers should be manual because missing
    expect(result.interfaz).toEqual({ modo: "manual" });
  });

  it("returns manual policy for programada with invalid window", () => {
    const input = {
      datos: { modo: "programada", ventana: { desdeH: 25, hastaH: 30 } },
    };
    const result = sanearPolitica(input);
    expect(result.datos).toEqual({ modo: "manual" });
  });

  it("correctly sanitizes valid programmatic window", () => {
    const input = {
      datos: { modo: "programada", ventana: { desdeH: 2, hastaH: 5 } },
    };
    const result = sanearPolitica(input);
    expect(result.datos).toEqual({ modo: "programada", ventana: { desdeH: 2, hastaH: 5 } });
  });

  it("preserves valid non-programmatic modes", () => {
    const input = {
      datos: { modo: "automatica-todas" },
      interfaz: { modo: "automatica-esta" },
      sw: { modo: "manual" },
    };
    const result = sanearPolitica(input);
    expect(result.datos).toEqual({ modo: "automatica-todas" });
    expect(result.interfaz).toEqual({ modo: "automatica-esta" });
    expect(result.sw).toEqual({ modo: "manual" });
    // Missing layers become manual
    expect(result.servicios).toEqual({ modo: "manual" });
  });

  it("ignores window for non-programmatic modes", () => {
    const input = {
      datos: { modo: "automatica-todas", ventana: { desdeH: 0, hastaH: 23 } },
    };
    const result = sanearPolitica(input);
    expect(result.datos).toEqual({ modo: "automatica-todas" }); // ventana ignored
  });

  it("resumenPolitica: perfil y os", () => {
    expect(resumenPolitica(politicaPorDefecto("perfil-privado"))).toBe("3 capas automáticas · 3 con aviso");
    expect(resumenPolitica(politicaPorDefecto("os"))).toBe("3 capas automáticas · 1 programada · 2 con aviso");
  });
});