/**
 * Prueba GENERAL de los átomos propios (F1C). Recorre `ATOMOS_PROPIOS`, así que las
 * tareas siguientes solo tienen que añadir su entrada al índice: estas comprobaciones
 * valen para todos sin tocar este archivo.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ATOMOS_PROPIOS, VISTAS_COMPONENTE, registrarAtomosPropios } from "../index";
import { candidatosDe, limpiarRegistro, listarAtomos, registrarAtomo } from "../../registro-atomos";
import { entenderDictado } from "../../dictado";
import type { AtomoEnUso, Autor, Molecula } from "../../tipos";

const autor: Autor = { tipo: "persona", id: "prueba-atomos", nombre: "Prueba" };
const contexto = { autor, ahora: 1000, origen: "dictado" as const };

function moleculaCon(atomos: AtomoEnUso[]): Molecula {
  return {
    id: "m-prueba",
    titulo: "Molécula de prueba",
    ambito: "personal",
    capas: [],
    atomos,
    valores: {},
    version: 1,
    creadaEn: 0,
    actualizadaEn: 0,
  };
}

describe("átomos propios", () => {
  beforeEach(() => limpiarRegistro());

  it("el índice trae átomos y un registro de vistas de componente", () => {
    expect(ATOMOS_PROPIOS.length).toBeGreaterThan(0);
    expect(VISTAS_COMPONENTE).toBeTypeOf("object");
  });

  it("cada definición pasa registrarAtomo", () => {
    for (const def of ATOMOS_PROPIOS) {
      limpiarRegistro();
      expect(registrarAtomo(def)).toEqual({ ok: true });
    }
  });

  it("registrarAtomosPropios es idempotente", () => {
    registrarAtomosPropios();
    const primera = listarAtomos().length;
    registrarAtomosPropios();
    expect(listarAtomos().length).toBe(primera);
    expect(primera).toBe(ATOMOS_PROPIOS.length);
  });

  it("los ids de parámetros son únicos dentro de cada definición", () => {
    for (const def of ATOMOS_PROPIOS) {
      const ids = def.parametros.map((p) => p.id);
      expect(new Set(ids).size, def.herramientaId).toBe(ids.length);
    }
  });

  it("las vistas documento llevan marcador y CSP, y no cargan nada ni evalúan código", () => {
    for (const def of ATOMOS_PROPIOS) {
      if (!def.vista || def.vista.tipo !== "documento") continue;
      const html = def.vista.documento();
      expect(html, def.herramientaId).toMatch(/^<!DOCTYPE html>/i);
      expect(html).toContain("__PM_CANAL__");
      expect(html).toContain("Content-Security-Policy");
      expect(html).toMatch(/default-src 'none'/);
      expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:/i);
      for (const prohibida of ["eval(", "new Function", "fetch(", "XMLHttpRequest", "importScripts", "WebSocket"]) {
        expect(html, `${def.herramientaId} no debe contener ${prohibida}`).not.toContain(prohibida);
      }
    }
  });

  it("el sintetizador declara el contrato del átomo", () => {
    const def = ATOMOS_PROPIOS.find((a) => a.herramientaId === "sintetizador-web-audio");
    expect(def).toBeDefined();
    expect(def?.categoria).toBe("audio");
    expect(def?.integracion).toBe("iframe-aislado");
    expect(def?.control).toBe("total");
    expect(def?.salidas).toEqual(["wav"]);
    expect(def?.entradas).toEqual([]);
    expect(def?.ficha?.web).toContain("Web_Audio_API");
    expect(def?.parametros.map((p) => p.id)).toEqual([
      "onda", "frecuencia", "volumen", "filtro", "corte", "resonancia", "ataque", "liberacion", "eco", "sonando", "nota",
    ]);
  });

  it("el dictado resuelve subir la frecuencia 2 kHz y fijar el volumen en −6 dB", () => {
    registrarAtomosPropios();
    const cands = candidatosDe(moleculaCon([{ id: "a-sint", herramientaId: "sintetizador-web-audio", estado: "activo" }]));
    expect(cands.length).toBeGreaterThan(0);

    const sube = entenderDictado("sube la frecuencia 2 kHz", cands, contexto);
    expect(sube.ok).toBe(true);
    if (sube.ok) {
      expect(sube.operacion.objetivo.parametroId).toBe("frecuencia");
      expect(sube.operacion.accion).toEqual({ tipo: "relativa", cantidad: 2000, modo: "delta" });
    }

    const pone = entenderDictado("pon el volumen en menos 6 decibelios", cands, contexto);
    expect(pone.ok).toBe(true);
    if (pone.ok) {
      expect(pone.operacion.objetivo.parametroId).toBe("volumen");
      expect(pone.operacion.accion).toEqual({ tipo: "exacta", valor: -6 });
    }
  });

  it("texturas-webgl: el dictado resuelve 'pon la escala en 12'", () => {
    registrarAtomosPropios();
    const cands = candidatosDe(moleculaCon([{ id: "a-text", herramientaId: "texturas-webgl", estado: "activo" }]));
    const res = entenderDictado("pon la escala en 12", cands, contexto);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.operacion.objetivo.parametroId).toBe("escala");
      expect(res.operacion.accion).toEqual({ tipo: "exacta", valor: 12 });
    }
  });
});
