import { describe, it, expect } from "vitest";
import {
  AJUSTES_VACIOS,
  CAPAS_ENTIDAD_DEFECTO,
  CAMPOS_CAPA,
  ETIQUETA_CAMPO,
  aPreferenciaCapas,
  capasDeCuenta,
  fijarCapa,
  leerAjustesCapasEntidad,
  resolverCapasEntidad,
  type AjustesCapasEntidad,
} from "@/lib/astraura/capas-entidad";
import { PREFERENCIA_CAPAS_DEFECTO } from "@/lib/astraura/capas-conciencia";

describe("capas-entidad", () => {
  it("por defecto todo encendido y los seis campos en orden", () => {
    for (const campo of CAMPOS_CAPA) expect(CAPAS_ENTIDAD_DEFECTO[campo]).toBe(true);
    expect(ETIQUETA_CAMPO.contextoPersonal.nombre).toBe("Contexto personal");
    expect(ETIQUETA_CAMPO.colectiva.nombre).toBe("Conciencia colectiva");
  });

  it("capasDeCuenta traslada la preferencia de la cuenta", () => {
    const cuenta = capasDeCuenta(PREFERENCIA_CAPAS_DEFECTO, false);
    expect(cuenta).toEqual({ ...CAPAS_ENTIDAD_DEFECTO, contextoPersonal: false });
  });

  it("sin ajustes todo hereda de la cuenta", () => {
    const cuenta = capasDeCuenta(PREFERENCIA_CAPAS_DEFECTO, true);
    const { efectivas, procedencia } = resolverCapasEntidad(cuenta, AJUSTES_VACIOS, {
      personalidadId: "p1",
      agenteId: "a1",
    });
    expect(efectivas).toEqual(cuenta);
    for (const campo of CAMPOS_CAPA) expect(procedencia[campo]).toBe("cuenta");
  });

  it("precedencia: agente gana a personalidad y esta a la cuenta, campo a campo", () => {
    const cuenta = capasDeCuenta(PREFERENCIA_CAPAS_DEFECTO, true);
    let ajustes: AjustesCapasEntidad = fijarCapa(AJUSTES_VACIOS, "personalidad", "p1", "mesh", false);
    ajustes = fijarCapa(ajustes, "agente", "a1", "mesh", true);
    ajustes = fijarCapa(ajustes, "agente", "a1", "nube", false);
    const { efectivas, procedencia } = resolverCapasEntidad(cuenta, ajustes, {
      personalidadId: "p1",
      agenteId: "a1",
    });
    expect(efectivas.mesh).toBe(true);
    expect(procedencia.mesh).toBe("agente");
    expect(efectivas.nube).toBe(false);
    expect(procedencia.nube).toBe("agente");
    expect(efectivas.local).toBe(cuenta.local);
    expect(procedencia.local).toBe("cuenta");
  });

  it("la personalidad manda cuando el agente no fija el campo", () => {
    const cuenta = capasDeCuenta(PREFERENCIA_CAPAS_DEFECTO, true);
    const ajustes = fijarCapa(AJUSTES_VACIOS, "personalidad", "p1", "colectiva", false);
    const { efectivas, procedencia } = resolverCapasEntidad(cuenta, ajustes, {
      personalidadId: "p1",
    });
    expect(efectivas.colectiva).toBe(false);
    expect(procedencia.colectiva).toBe("personalidad");
  });

  it("fijarCapa es pura y con null limpia el override y la entrada vacía", () => {
    const base = fijarCapa(AJUSTES_VACIOS, "agente", "a1", "local", false);
    expect(base.agentes.a1?.local).toBe(false);
    const limpio = fijarCapa(base, "agente", "a1", "local", null);
    expect(limpio.agentes.a1).toBeUndefined();
    expect(base.agentes.a1?.local).toBe(false);
  });

  it("leerAjustesCapasEntidad con basura no lanza", () => {
    for (const raw of [{}, null, 42, "texto", [], { personalidades: 7, agentes: null }]) {
      expect(() => leerAjustesCapasEntidad(raw)).not.toThrow();
      expect(leerAjustesCapasEntidad(raw)).toEqual(AJUSTES_VACIOS);
    }
    const raro = leerAjustesCapasEntidad({
      personalidades: { "": { local: false }, p1: { local: false, inexistente: true, mesh: "no" } },
      agentes: { a1: { nube: true } },
    });
    expect(raro.personalidades["p1"]).toEqual({ local: false });
    expect(raro.agentes.a1).toEqual({ nube: true });
  });

  it("aPreferenciaCapas conserva nivelador y específico de la base", () => {
    const base = { ...PREFERENCIA_CAPAS_DEFECTO, nivelador: 33, especifico: { fuente: "gemini" } };
    const pref = aPreferenciaCapas(base, { ...CAPAS_ENTIDAD_DEFECTO, nube: false });
    expect(pref.capas.nube).toBe(false);
    expect(pref.nivelador).toBe(33);
    expect(pref.especifico).toEqual({ fuente: "gemini" });
  });
});
