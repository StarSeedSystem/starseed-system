import { describe, expect, it } from "vitest";

import {
  AJUSTES_VACIOS,
  CAMPOS_CAPA,
  CAPAS_ENTIDAD_DEFECTO,
  CLAVE_CAPAS_ENTIDAD,
  EVENTO_CAPAS_ENTIDAD,
  ETIQUETA_CAMPO,
  leerAjustesCapasEntidad,
  fijarCapa,
  resolverCapasEntidad,
  capasDeCuenta,
  aPreferenciaCapas,
} from "../capas-entidad";

import type { CapasAjustables, AjustesCapasEntidad, CampoCapa } from "../capas-entidad";

describe("CAPAS_ENTIDAD_DEFECTO", () => {
  it("todo encendido", () => {
    for (const c of CAMPOS_CAPA) {
      expect(CAPAS_ENTIDAD_DEFECTO[c]).toBe(true);
    }
  });
});

describe("ETIQUETA_CAMPO", () => {
  it("tiene nombre y descripcion en español para cada campo", () => {
    for (const c of CAMPOS_CAPA) {
      const e = ETIQUETA_CAMPO[c];
      expect(typeof e.nombre).toBe("string");
      expect(e.nombre.length).toBeGreaterThan(0);
      expect(typeof e.descripcion).toBe("string");
      expect(e.descripcion.length).toBeGreaterThan(0);
    }
  });
  it("contextoPersonal tiene la descripcion esperada", () => {
    expect(ETIQUETA_CAMPO.contextoPersonal.nombre).toBe("Contexto personal");
    expect(ETIQUETA_CAMPO.contextoPersonal.descripcion).toBe(
      "Sabe quién eres: cómo llamarte, intereses, tono e idioma",
    );
  });
});

describe("constantes", () => {
  it("CLAVE_CAPAS_ENTIDAD y EVENTO_CAPAS_ENTIDAD", () => {
    expect(CLAVE_CAPAS_ENTIDAD).toBe("starseed.astraura.capas-entidad.v1");
    expect(EVENTO_CAPAS_ENTIDAD).toBe("starseed:astraura-capas-entidad");
  });
  it("CAMPOS_CAPA en el orden exacto", () => {
    expect(CAMPOS_CAPA).toEqual([
      "activo",
      "local",
      "mesh",
      "nube",
      "colectiva",
      "contextoPersonal",
    ]);
  });
});

describe("leerAjustesCapasEntidad", () => {
  it("vacio/devuelve vacio", () => {
    expect(leerAjustesCapasEntidad(undefined)).toEqual(AJUSTES_VACIOS);
    expect(leerAjustesCapasEntidad(null)).toEqual(AJUSTES_VACIOS);
    expect(leerAjustesCapasEntidad({})).toEqual(AJUSTES_VACIOS);
  });
  it("ignora ids vacios y campos desconocidos", () => {
    const raw = {
      personalidades: {
        "": { activo: true },
        "p1": { activo: true, raro: 99 },
      },
      agentes: {
        "a1": { mesh: "no-boolean", nube: true, campoRaro: false },
      },
    };
    const a = leerAjustesCapasEntidad(raw);
    expect(a.personalidades[""]).toBeUndefined();
    expect(a.personalidades["p1"]).toEqual({ activo: true });
    expect(a.agentes["a1"]).toEqual({ nube: true });
  });
  it("no lanza nunca con basura total", () => {
    expect(() => leerAjustesCapasEntidad("texto")).not.toThrow();
    expect(() => leerAjustesCapasEntidad(42)).not.toThrow();
    expect(() => leerAjustesCapasEntidad([])).not.toThrow();
    expect(() => leerAjustesCapasEntidad({ personalidades: null })).not.toThrow();
    expect(() => leerAjustesCapasEntidad({ personalidades: { p1: null } })).not.toThrow();
  });
});

describe("resolverCapasEntidad - precedencia", () => {
  const cuenta: CapasAjustables = {
    ...CAPAS_ENTIDAD_DEFECTO,
    local: false,
    colectiva: false,
  };
  const ajustes: AjustesCapasEntidad = {
    personalidades: {
      p1: { local: true, mesh: false },
    },
    agentes: {
      a1: { nube: false, contextoPersonal: false },
    },
  };

  it("agente gana a personalidad y a cuenta, campo a campo", () => {
    const { efectivas, procedencia } = resolverCapasEntidad(
      cuenta,
      ajustes,
      { personalidadId: "p1", agenteId: "a1" },
    );
    // agente a1: nube=false, contextoPersonal=false → gana
    expect(efectivas.nube).toBe(false);
    expect(procedencia.nube).toBe("agente");
    expect(efectivas.contextoPersonal).toBe(false);
    expect(procedencia.contextoPersonal).toBe("agente");
    // personalidad p1: mesh=false → gana sobre cuenta (mesh=true en cuenta? no, cuenta tiene mesh=true por defecto)
    expect(efectivas.mesh).toBe(false);
    expect(procedencia.mesh).toBe("personalidad");
    // cuenta: local=false → personalidad p1 lo sobreescribe a true
    expect(efectivas.local).toBe(true);
    expect(procedencia.local).toBe("personalidad");
    expect(efectivas.colectiva).toBe(false);
    expect(procedencia.colectiva).toBe("cuenta");
    // activo → cuenta (no hay override)
    expect(efectivas.activo).toBe(true);
    expect(procedencia.activo).toBe("cuenta");
  });

  it("personalidad gana a cuenta cuando no hay agente", () => {
    const { efectivas, procedencia } = resolverCapasEntidad(
      cuenta,
      ajustes,
      { personalidadId: "p1" },
    );
    expect(efectivas.mesh).toBe(false);
    expect(procedencia.mesh).toBe("personalidad");
    expect(efectivas.local).toBe(true);
    expect(procedencia.local).toBe("personalidad");
  });

  it("sin who queda en cuenta", () => {
    const { efectivas, procedencia } = resolverCapasEntidad(
      cuenta,
      ajustes,
      {},
    );
    for (const c of CAMPOS_CAPA) {
      expect(procedencia[c]).toBe("cuenta");
    }
    expect(efectivas.local).toBe(false);
    expect(efectivas.colectiva).toBe(false);
  });
});

describe("fijarCapa", () => {
  const base: AjustesCapasEntidad = {
    personalidades: {
      p1: { activo: true, local: false },
    },
    agentes: {},
  };

  it("establece un campo", () => {
    const r = fijarCapa(base, "personalidad", "p1", "mesh", true);
    expect(r.personalidades["p1"]?.mesh).toBe(true);
    expect(r.personalidades["p1"]?.local).toBe(false);
  });

  it("null borra el override y limpia entrada vacia", () => {
    const r = fijarCapa(base, "personalidad", "p1", "local", null);
    expect(r.personalidades["p1"]?.local).toBeUndefined();
    expect(r.personalidades["p1"]?.activo).toBe(true);
  });

  it("null con entrada vacia la elimina", () => {
    const r = fijarCapa(base, "personalidad", "p1", "activo", null);
    expect(r.personalidades["p1"]).toEqual({ local: false });
  });

  it("no muta el original", () => {
    fijarCapa(base, "personalidad", "p1", "mesh", true);
    expect(base.personalidades["p1"]?.mesh).toBeUndefined();
  });
});

describe("capasDeCuenta", () => {
  it("mapea preferencia + contextoPersonal", () => {
    const pref = { activo: false, capas: { local: true, mesh: false, nube: true, colectiva: false }, nivelador: 50, especifico: null };
    const r = capasDeCuenta(pref, true);
    expect(r.activo).toBe(false);
    expect(r.local).toBe(true);
    expect(r.mesh).toBe(false);
    expect(r.nube).toBe(true);
    expect(r.colectiva).toBe(false);
    expect(r.contextoPersonal).toBe(true);
  });
});

describe("aPreferenciaCapas", () => {
  it("conserva nivelador y especifico", () => {
    const base = {
      activo: true,
      capas: { local: true, mesh: true, nube: true, colectiva: true },
      nivelador: 42,
      especifico: { fuente: "groq", modelo: "x" },
    };
    const efectivas: CapasAjustables = {
      activo: false, local: false, mesh: true, nube: false, colectiva: true, contextoPersonal: true,
    };
    const r = aPreferenciaCapas(base, efectivas);
    expect(r.activo).toBe(false);
    expect(r.capas.local).toBe(false);
    expect(r.capas.mesh).toBe(true);
    expect(r.capas.nube).toBe(false);
    expect(r.capas.colectiva).toBe(true);
    expect(r.nivelador).toBe(42);
    expect(r.especifico).toEqual({ fuente: "groq", modelo: "x" });
  });
});