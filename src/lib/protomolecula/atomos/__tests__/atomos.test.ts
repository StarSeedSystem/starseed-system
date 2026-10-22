/**
 * Protomolécula · PRUEBA GENERAL de los átomos propios (F1C, parte 3).
 * Recorre ATOMOS_PROPIOS: las tareas siguientes (F1E y demás) solo añaden entradas
 * a `atomos/index.ts` y esta prueba las valida sin tocar nada.
 * Contrato: architecture/protomolecula.md §11.1
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ATOMOS_PROPIOS, registrarAtomosPropios, VISTAS_COMPONENTE } from "../index";
import { limpiarRegistro, registrarAtomo, obtenerAtomo, listarAtomos, candidatosDe } from "../../registro-atomos";
import { entenderDictado } from "../../dictado";
import type { AtomoEnUso, Autor, Molecula } from "../../tipos";

const autorTest: Autor = { tipo: "persona", id: "test", nombre: "Test" };
const ctxDictado = { autor: autorTest, ahora: 1000, origen: "dictado" as const };

function atomoActivo(id: string, herramientaId: string, titulo?: string): AtomoEnUso {
  return { id, herramientaId, estado: "activo", titulo };
}

function moleculaCon(atomos: AtomoEnUso[]): Molecula {
  return {
    id: "m-test", titulo: "Prueba", ambito: "personal",
    capas: [], atomos, valores: {}, version: 1, creadaEn: 0, actualizadaEn: 0,
  };
}

describe("átomos propios (prueba general)", () => {
  beforeEach(() => limpiarRegistro());

  it("cada definición pasa registrarAtomo y queda en el registro tras registrarAtomosPropios", () => {
    expect(ATOMOS_PROPIOS.length).toBeGreaterThan(0);
    for (const def of ATOMOS_PROPIOS) {
      limpiarRegistro();
      expect(registrarAtomo(def)).toEqual({ ok: true });
    }
    limpiarRegistro();
    registrarAtomosPropios();
    for (const def of ATOMOS_PROPIOS) {
      expect(obtenerAtomo(def.herramientaId)?.herramientaId).toBe(def.herramientaId);
    }
    expect(listarAtomos().length).toBe(ATOMOS_PROPIOS.length);
  });

  it("registrarAtomosPropios es idempotente: dos llamadas no duplican nada", () => {
    registrarAtomosPropios();
    registrarAtomosPropios();
    expect(listarAtomos().length).toBe(ATOMOS_PROPIOS.length);
  });

  it("los ids de parámetros son únicos dentro de cada definición", () => {
    for (const def of ATOMOS_PROPIOS) {
      const ids = def.parametros.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("las vistas documento llevan el marcador y el CSP, sin red ni ejecución de código ajeno", () => {
    for (const def of ATOMOS_PROPIOS) {
      if (def.vista && def.vista.tipo === "documento") {
        const html = def.vista.documento();
        expect(html).toContain("__PM_CANAL__");
        expect(html).toContain("Content-Security-Policy");
        expect(html).not.toMatch(/src=["']http/);
        expect(html).not.toMatch(/href=["']http/);
        expect(html).not.toContain("eval(");
        expect(html).not.toContain("new Function");
        expect(html).not.toContain("fetch(");
        expect(html).not.toContain("XMLHttpRequest");
        expect(html).not.toContain("importScripts");
        expect(html).not.toContain("WebSocket");
      }
    }
  });

  it("VISTAS_COMPONENTE solo guarda cargadores de componente", () => {
    for (const carga of Object.values(VISTAS_COMPONENTE)) {
      expect(typeof carga).toBe("function");
    }
  });

  it("sintetizador: el dictado resuelve «sube la frecuencia 2 kHz» y «pon el volumen en menos 6 decibelios»", () => {
    registrarAtomosPropios();
    const sint = ATOMOS_PROPIOS[0];
    expect(sint.herramientaId).toBe("sintetizador-web-audio");
    const cands = candidatosDe(moleculaCon([atomoActivo("a-sint", sint.herramientaId, "Sintetizador")]));
    expect(cands.length).toBeGreaterThan(0);

    const sube = entenderDictado("sube la frecuencia 2 kHz", cands, ctxDictado);
    expect(sube.ok).toBe(true);
    if (sube.ok) {
      expect(sube.operacion.objetivo.parametroId).toBe("frecuencia");
      expect(sube.operacion.accion).toEqual({ tipo: "relativa", cantidad: 2000, modo: "delta" });
    }

    const baja = entenderDictado("pon el volumen en menos 6 decibelios", cands, ctxDictado);
    expect(baja.ok).toBe(true);
    if (baja.ok) {
      expect(baja.operacion.objetivo.parametroId).toBe("volumen");
      expect(baja.operacion.accion).toEqual({ tipo: "exacta", valor: -6 });
    }
  });
});
