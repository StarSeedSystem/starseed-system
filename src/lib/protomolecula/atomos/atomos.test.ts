import { describe, it, expect, beforeEach } from "vitest";
import { ATOMOS_PROPIOS, registrarAtomosPropios } from "./index";
import { registrarAtomo, limpiarRegistro, candidatosDe } from "../registro-atomos";
import { entenderDictado } from "../dictado";
import type { AtomoEnUso, Autor } from "../tipos";

const autorTest: Autor = { tipo: "persona", id: "test", nombre: "Test" };
const ctxDictado = { autor: autorTest, ahora: 1000, origen: "dictado" as const };

function atomoActivo(id: string, herramientaId: string, titulo?: string): AtomoEnUso {
  return { id, herramientaId, estado: "activo", titulo };
}

function moleculaEjemplo(atomos: AtomoEnUso[]) {
  return {
    id: "m-test",
    titulo: "Test",
    ambito: "personal" as const,
    capas: [],
    atomos,
    valores: {},
    version: 1,
    creadaEn: 0,
    actualizadaEn: 0,
  };
}

describe("atomos propios", () => {
  beforeEach(() => limpiarRegistro());

  it("ATOMOS_PROPIOS no está vacío", () => {
    expect(ATOMOS_PROPIOS.length).toBeGreaterThan(0);
  });

  it("cada definición pasa registrarAtomo", () => {
    for (const def of ATOMOS_PROPIOS) {
      limpiarRegistro();
      const r = registrarAtomo(def);
      expect(r).toEqual({ ok: true });
    }
  });

  it("ids de parámetros son únicos dentro de cada definición", () => {
    for (const def of ATOMOS_PROPIOS) {
      const ids = def.parametros.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("las vistas documento contienen el marcador, CSP y no contienen cadenas peligrosas", () => {
    for (const def of ATOMOS_PROPIOS) {
      if (def.vista && def.vista.tipo === "documento") {
        const html = def.vista.documento();
        expect(html).toContain("__PM_CANAL__");
        expect(html).toContain('Content-Security-Policy');
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

  it("registrarAtomosPropios es idempotente", () => {
    registrarAtomosPropios();
    registrarAtomosPropios();
    expect(ATOMOS_PROPIOS.length).toBeGreaterThan(0);
  });

  it("sintetizador: entenderDictado resuelve 'sube la frecuencia 2 kHz' y 'pon el volumen en menos 6 decibelios'", () => {
    registrarAtomosPropios();
    const m = moleculaEjemplo([atomoActivo("a-sint", "sintetizador-web-audio", "Sintetizador")]);
    const cands = candidatosDe(m);
    expect(cands.length).toBeGreaterThan(0);

    const res1 = entenderDictado("sube la frecuencia 2 kHz", cands, ctxDictado);
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect(res1.operacion.objetivo.parametroId).toBe("frecuencia");
      expect(res1.operacion.accion.tipo).toBe("relativa");
    }

    const res2 = entenderDictado("pon el volumen en menos 6 decibelios", cands, ctxDictado);
    expect(res2.ok).toBe(true);
    if (res2.ok) {
      expect(res2.operacion.objetivo.parametroId).toBe("volumen");
      expect(res2.operacion.accion.tipo).toBe("exacta");
    }
  });
});
