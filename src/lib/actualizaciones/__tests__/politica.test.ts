import { describe, it, expect } from "vitest";
<<<<<<< HEAD
<<<<<<< HEAD
import { politicaPorDefecto, decidirPolitica, sanearPolitica, type CapaActualizacion } from "../politica";

describe("politicaPorDefecto", () => {
  it("perfil-privado: datos e interfaz automatica-todas, sw automatica-esta, resto manual", () => {
    const p = politicaPorDefecto("perfil-privado");
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect(p.sw.modo).toBe("automatica-esta");
    expect(p.servicios.modo).toBe("manual");
    expect(p.modelos.modo).toBe("manual");
    expect(p.nativa.modo).toBe("manual");
  });

  it("pagina-publica: sw automatica-todas, resto igual que perfil salvo sw", () => {
    const p = politicaPorDefecto("pagina-publica");
    expect(p.datos.modo).toBe("automatica-todas");
    expect(p.interfaz.modo).toBe("automatica-todas");
    expect(p.sw.modo).toBe("automatica-todas");
    expect(p.servicios.modo).toBe("manual");
    expect(p.modelos.modo).toBe("manual");
    expect(p.nativa.modo).toBe("manual");
  });

  it("grupo-jerarquico igual que perfil-privado", () => {
    expect(politicaPorDefecto("grupo-jerarquico")).toEqual(politicaPorDefecto("perfil-privado"));
  });

  it("grupo-democratico igual que perfil-privado", () => {
    expect(politicaPorDefecto("grupo-democratico")).toEqual(politicaPorDefecto("perfil-privado"));
  });
});

describe("decidirPolitica", () => {
  const base = { ahoraH: 10, esNeuronaElegida: true, aprobada: true, requiereAprobacion: false };

  it("automatica-todas → aplicar", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, base)).toBe("aplicar");
  });

  it("automatica-esta con neurona → aplicar", () => {
    expect(decidirPolitica({ modo: "automatica-esta" }, base)).toBe("aplicar");
  });

  it("automatica-esta sin neurona → avisar", () => {
    expect(decidirPolitica({ modo: "automatica-esta" }, { ...base, esNeuronaElegida: false })).toBe("avisar");
  });

  it("manual → avisar", () => {
    expect(decidirPolitica({ modo: "manual" }, base)).toBe("avisar");
  });

  it("programada dentro de ventana → aplicar", () => {
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 9, hastaH: 12 } }, base)).toBe("aplicar");
  });

  it("programada fuera de ventana → esperar", () => {
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 9, hastaH: 12 } }, { ...base, ahoraH: 13 })).toBe("esperar");
  });

  it("programada sin ventana → esperar", () => {
    expect(decidirPolitica({ modo: "programada" }, base)).toBe("esperar");
  });

  it("programada cruce medianoche después → aplicar", () => {
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 22, hastaH: 4 } }, { ...base, ahoraH: 23 })).toBe("aplicar");
  });

  it("programada cruce medianoche antes → aplicar", () => {
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 22, hastaH: 4 } }, { ...base, ahoraH: 2 })).toBe("aplicar");
  });

  it("programada cruce medianoche fuera → esperar", () => {
    expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 22, hastaH: 4 } }, { ...base, ahoraH: 10 })).toBe("esperar");
  });

  it("requiere aprobación sin aprobar → esperar", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, { ...base, requiereAprobacion: true, aprobada: false })).toBe("esperar");
  });

  it("requiere aprobación con aprobación → aplicar", () => {
    expect(decidirPolitica({ modo: "automatica-todas" }, { ...base, requiereAprobacion: true, aprobada: true })).toBe("aplicar");
  });
});

describe("sanearPolitica", () => {
  it("valor nulo → todo manual", () => {
    const r = sanearPolitica(null);
    for (const capa of ["datos", "interfaz", "sw", "servicios", "modelos", "nativa"] as CapaActualizacion[]) {
      expect(r[capa]).toEqual({ modo: "manual" });
    }
  });

  it("modo inválido → manual", () => {
    const r = sanearPolitica({ datos: { modo: "desconocido" as any } });
    expect(r.datos).toEqual({ modo: "manual" });
  });

  it("programada con ventana inválida → manual", () => {
    const r = sanearPolitica({ datos: { modo: "programada", ventana: { desdeH: 30, hastaH: -1 } } });
    expect(r.datos).toEqual({ modo: "manual" });
  });

  it("programada con ventana válida → conserva", () => {
    const r = sanearPolitica({ datos: { modo: "programada", ventana: { desdeH: 2, hastaH: 5 } } });
    expect(r.datos).toEqual({ modo: "programada", ventana: { desdeH: 2, hastaH: 5 } });
  });

  it("preserva modos no programados", () => {
    const r = sanearPolitica({ datos: { modo: "automatica-todas" }, interfaz: { modo: "automatica-esta" } });
    expect(r.datos).toEqual({ modo: "automatica-todas" });
    expect(r.interfaz).toEqual({ modo: "automatica-esta" });
  });

  it("ignora ventana en modo no programado", () => {
    const r = sanearPolitica({ datos: { modo: "automatica-todas", ventana: { desdeH: 0, hastaH: 23 } } });
    expect(r.datos).toEqual({ modo: "automatica-todas" });
  });
=======
=======
>>>>>>> 93bd64f5 (salvavidas · S1010-ACT2c: trabajo del agente antes de las puertas (tsc / vitest))
import { politicaPorDefecto, TipoEntidad, decidirPolitica, ContextoDecision, Decision, sanearPolitica, resumenPolitica, PoliticaSistema, PoliticaCapa, CapaActualizacion } from "../politica";

describe("politicaPorDefecto", () => {
  it("perfil-privado", () => { const p = politicaPorDefecto("perfil-privado"); expect(p.datos.modo).toBe("automatica-todas"); expect(p.interfaz.modo).toBe("automatica-todas"); expect(p.sw.modo).toBe("automatica-esta"); expect(p.servicios.modo).toBe("manual"); expect(p.modelos.modo).toBe("manual"); expect(p.nativa.modo).toBe("manual"); });
  it("pagina-publica", () => { const p = politicaPorDefecto("pagina-publica"); expect(p.datos.modo).toBe("automatica-todas"); expect(p.interfaz.modo).toBe("automatica-todas"); expect(p.sw.modo).toBe("automatica-todas"); expect(p.servicios.modo).toBe("manual"); expect(p.modelos.modo).toBe("manual"); expect(p.nativa.modo).toBe("manual"); });
  it("grupo-jerarquico = perfil", () => { expect(politicaPorDefecto("grupo-jerarquico")).toEqual(politicaPorDefecto("perfil-privado")); });
  it("grupo-democratico = perfil", () => { expect(politicaPorDefecto("grupo-democratico")).toEqual(politicaPorDefecto("perfil-privado")); });
  it("os", () => { const p = politicaPorDefecto("os"); expect(p.datos.modo).toBe("automatica-todas"); expect(p.interfaz.modo).toBe("automatica-todas"); expect(p.sw.modo).toBe("automatica-todas"); expect(p.servicios.modo).toBe("manual"); expect(p.modelos.modo).toBe("programada"); expect(p.modelos.ventana).toEqual({ desdeH: 3, hastaH: 6 }); expect(p.nativa.modo).toBe("manual"); });
});

describe("decidirPolitica", () => {
  const baseCtx: ContextoDecision = { ahoraH: 10, esNeuronaElegida: true, aprobada: true, requiereAprobacion: false };
  it("esperar: aprobación requerida sin conceder", () => { const ctx = { ...baseCtx, requiereAprobacion: true, aprobada: false }; expect(decidirPolitica({ modo: "automatica-todas" }, ctx)).toBe("esperar"); });
  it("aplicar: automatica-todas", () => { expect(decidirPolitica({ modo: "automatica-todas" }, baseCtx)).toBe("aplicar"); });
  it("aplicar: automatica-esta con neurona", () => { expect(decidirPolitica({ modo: "automatica-esta" }, baseCtx)).toBe("aplicar"); });
  it("avisar: automatica-esta sin neurona", () => { expect(decidirPolitica({ modo: "automatica-esta" }, { ...baseCtx, esNeuronaElegida: false })).toBe("avisar"); });
  it("aplicar: programada dentro", () => { expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 9, hastaH: 11 } }, { ...baseCtx, ahoraH: 10 })).toBe("aplicar"); });
  it("esperar: programada fuera", () => { expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 9, hastaH: 11 } }, { ...baseCtx, ahoraH: 12 })).toBe("esperar"); });
  it("aplicar: cruce medianoche después", () => { expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 20, hastaH: 6 } }, { ...baseCtx, ahoraH: 22 })).toBe("aplicar"); });
  it("aplicar: cruce medianoche antes", () => { expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 20, hastaH: 6 } }, { ...baseCtx, ahoraH: 4 })).toBe("aplicar"); });
  it("esperar: cruce medianoche fuera", () => { expect(decidirPolitica({ modo: "programada", ventana: { desdeH: 20, hastaH: 6 } }, { ...baseCtx, ahoraH: 19 })).toBe("esperar"); });
  it("avisar: manual", () => { expect(decidirPolitica({ modo: "manual" }, baseCtx)).toBe("avisar"); });
  it("esperar: programada sin ventana", () => { expect(decidirPolitica({ modo: "programada" }, baseCtx)).toBe("esperar"); });
  it("esperar: democrático sin aprobación", () => { expect(decidirPolitica({ modo: "automatica-todas" }, { ...baseCtx, requiereAprobacion: true, aprobada: false })).toBe("esperar"); });
  it("aplicar: democrático con aprobación", () => { expect(decidirPolitica({ modo: "automatica-todas" }, { ...baseCtx, requiereAprobacion: true, aprobada: true })).toBe("aplicar"); });
});

describe("sanearPolitica", () => {
  it("basura → manual", () => { const r = sanearPolitica(null); expect(r.datos).toEqual({ modo: "manual" }); for (const capa of ["datos","interfaz","sw","servicios","modelos","nativa"] as CapaActualizacion[]) expect(r[capa]).toEqual({ modo: "manual" }); });
  it("modo inválido → manual", () => { const r = sanearPolitica({ datos: { modo: "invalid" as any } }); expect(r.datos).toEqual({ modo: "manual" }); expect(r.interfaz).toEqual({ modo: "manual" }); });
  it("programada sin ventana válida → nocturna", () => { const r = sanearPolitica({ datos: { modo: "programada", ventana: { desdeH: 25, hastaH: 30 } } }); expect(r.datos).toEqual({ modo: "programada", ventana: { desdeH: 3, hastaH: 6 } }); });
  it("programada válida", () => { const r = sanearPolitica({ datos: { modo: "programada", ventana: { desdeH: 2, hastaH: 5 } } }); expect(r.datos).toEqual({ modo: "programada", ventana: { desdeH: 2, hastaH: 5 } }); });
  it("preserva modos no programados", () => { const r = sanearPolitica({ datos: { modo: "automatica-todas" }, interfaz: { modo: "automatica-esta" }, sw: { modo: "manual" } }); expect(r.datos).toEqual({ modo: "automatica-todas" }); expect(r.interfaz).toEqual({ modo: "automatica-esta" }); expect(r.sw).toEqual({ modo: "manual" }); expect(r.servicios).toEqual({ modo: "manual" }); });
  it("ignora ventana en no programado", () => { const r = sanearPolitica({ datos: { modo: "automatica-todas", ventana: { desdeH: 0, hastaH: 23 } } }); expect(r.datos).toEqual({ modo: "automatica-todas" }); });
  it("resumen", () => { expect(resumenPolitica(politicaPorDefecto("perfil-privado"))).toBe("3 capas automáticas · 3 con aviso"); expect(resumenPolitica(politicaPorDefecto("os"))).toBe("3 capas automáticas · 1 programada · 2 con aviso"); });
<<<<<<< HEAD
>>>>>>> 93bd64f5 (salvavidas · S1010-ACT2c: trabajo del agente antes de las puertas (tsc / vitest))
=======
>>>>>>> 93bd64f5 (salvavidas · S1010-ACT2c: trabajo del agente antes de las puertas (tsc / vitest))
});
