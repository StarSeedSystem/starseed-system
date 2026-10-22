import { describe, it, expect, beforeEach } from "vitest";
import { ATOMOS_PROPIOS, registrarAtomosPropios } from "../index";
import { registrarAtomo, limpiarRegistro, candidatosDe, obtenerAtomo } from "../../registro-atomos";
import { entenderDictado } from "../../dictado";
import type { AtomoEnUso, Autor, Molecula } from "../../tipos";

const autorTest: Autor = { tipo: "persona", id: "test", nombre: "Test" };
const ctxDictado = { autor: autorTest, ahora: 1000, origen: "dictado" as const };

function atomoActivo(id: string, herramientaId: string, titulo?: string): AtomoEnUso {
  return { id, herramientaId, estado: "activo", titulo };
}

function moleculaEjemplo(atomos: AtomoEnUso[]): Molecula {
  return {
    id: "mol-prueba",
    titulo: "Prueba",
    ambito: "personal",
    capas: [],
    atomos,
    valores: {},
    version: 1,
    creadaEn: 0,
    actualizadaEn: 0,
  };
}

/** Candidatos del dictado para UN átomo propio activo en una molécula de prueba. */
function candidatosDePrueba(herramientaId: string, titulo: string) {
  registrarAtomosPropios();
  return candidatosDe(moleculaEjemplo([atomoActivo("a-" + herramientaId, herramientaId, titulo)]));
}

describe("átomos propios (prueba general: recorre ATOMOS_PROPIOS)", () => {
  beforeEach(() => limpiarRegistro());

  it("no hay ids de herramienta repetidos entre los átomos propios", () => {
    const ids = ATOMOS_PROPIOS.map((d) => d.herramientaId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada definición pasa registrarAtomo y sus ids de parámetro únicos", () => {
    for (const def of ATOMOS_PROPIOS) {
      limpiarRegistro();
      expect(registrarAtomo(def)).toEqual({ ok: true });
      const ids = def.parametros.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("vistas documento: marcador, CSP y cadenas prohibidas fuera", () => {
    for (const def of ATOMOS_PROPIOS) {
      if (!def.vista || def.vista.tipo !== "documento") continue;
      const html = def.vista.documento();
      expect(html).toContain("__PM_CANAL__");
      expect(html).toContain("Content-Security-Policy");
      expect(html).not.toMatch(/src=["']?http/i);
      expect(html).not.toMatch(/href=["']?http/i);
      expect(html).not.toContain("eval(");
      expect(html).not.toContain("new Function");
      expect(html).not.toContain("fetch(");
      expect(html).not.toContain("XMLHttpRequest");
      expect(html).not.toContain("importScripts");
      expect(html).not.toContain("WebSocket");
    }
  });

  it("registrarAtomosPropios es idempotente y deja cada átomo obtenible", () => {
    registrarAtomosPropios();
    registrarAtomosPropios();
    for (const def of ATOMOS_PROPIOS) {
      expect(obtenerAtomo(def.herramientaId)).toBeDefined();
    }
  });
});

describe("sintetizador (átomo propio 1)", () => {
  beforeEach(() => limpiarRegistro());

  it("entenderDictado «sube la frecuencia 2 kHz» → relativa de +2000 Hz", () => {
    const cands = candidatosDePrueba("sintetizador-web-audio", "Sintetizador");
    expect(cands.length).toBeGreaterThan(0);
    const r = entenderDictado("sube la frecuencia 2 kHz", cands, ctxDictado);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.operacion.objetivo.parametroId).toBe("frecuencia");
      expect(r.operacion.accion.tipo).toBe("relativa");
      if (r.operacion.accion.tipo === "relativa") {
        expect(r.operacion.accion.cantidad).toBe(2000);
        expect(r.operacion.accion.modo).toBe("delta");
      }
    }
  });

  it("entenderDictado «pon el volumen en menos 6 decibelios» → exacta −6 dB", () => {
    const cands = candidatosDePrueba("sintetizador-web-audio", "Sintetizador");
    const r = entenderDictado("pon el volumen en menos 6 decibelios", cands, ctxDictado);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.operacion.objetivo.parametroId).toBe("volumen");
      expect(r.operacion.accion.tipo).toBe("exacta");
      if (r.operacion.accion.tipo === "exacta") {
        expect(r.operacion.accion.valor).toBe(-6);
      }
    }
  });
});
