import { describe, it, expect, beforeEach } from "vitest";
import { registrarAtomo, obtenerAtomo, candidatosDe } from "../../registro-atomos";
import { ATOMOS_PROPIOS } from "../index";
import { entenderDictado } from "../../dictado";
import type { CandidatoParametro } from "../../tipos";

const crearMoleculaConAtom = (herramientaId: string) => ({
  id: "test",
  titulo: "Test",
  ambito: "personal",
  capas: [],
  atomos: [{
    id: "atom1",
    herramientaId,
    capaId: undefined,
    titulo: undefined,
    ejecutaEn: undefined,
    estado: "activo",
  }],
  valores: {},
  version: 0,
  creadaEn: Date.now(),
  actualizadaEn: Date.now(),
});

const ctx = {
  autor: { tipo: "persona", id: "test-person", nombre: "Test" },
  ahora: Date.now(),
  origen: "dictado",
  id: () => `dic-${Date.now()}`,
};

describe("Átomos propios", () => {
  it("cada definición pasa registrarAtomo", () => {
    for (const atomo of ATOMOS_PROPIOS) {
      const res = registrarAtomo(atomo);
      expect(res.ok || res.motivo === "Herramienta ya registrada").toBe(true);
    }
  });

  it("ids de parámetros únicos dentro de cada átomo", () => {
    for (const atomo of ATOMOS_PROPIOS) {
      const ids = new Set<string>();
      for (const p of atomo.parametros) {
        expect(ids.has(p.id)).toBe(false);
        ids.add(p.id);
      }
    }
  });

  it("vista documento contiene marcador y CSP, y no tiene recursos externos ni código peligroso", () => {
    for (const atomo of ATOMOS_PROPIOS) {
      if (atomo.vista?.tipo === "documento") {
        const html = atomo.vista.documento();
        expect(html).toContain("__PM_CANAL__");
        expect(html).toMatch(/Content-Security-Policy/);
        expect(html).not.toMatch(/src\s*=\s*["']https?:/);
        expect(html).not.toMatch(/href\s*=\s*["']https?:/);
        expect(html).not.toContain("eval(");
        expect(html).not.toContain("new Function");
        expect(html).not.toContain("fetch(");
        expect(html).not.toContain("XMLHttpRequest");
        expect(html).not.toContain("importScripts");
        expect(html).not.toContain("WebSocket");
      }
    }
  });
});

describe("Sintetizador - comprensión de dictado", () => {
  const atomId = "sintetizador-web-audio";

  it("resuelve 'sube la frecuencia 2 kHz'", () => {
    const atomo = obtenerAtomo(atomId);
    expect(atomo).toBeDefined();
    if (!atomo) return;

    const molecula = crearMoleculaConAtom(atomId);
    const candidatos: CandidatoParametro[] = candidatosDe(molecula);
    const candFreq = candidatos.find(c => c.parametro.id === "frecuencia");
    expect(candFreq).toBeDefined();
    if (!candFreq) return;

    const res = entenderDictado("sube la frecuencia 2 kHz", [candFreq], ctx);
    expect(res.ok).toBe(true);
    const op = (res as { ok: true; operacion: any }).operacion.accion;
    expect(op).toEqual({
      tipo: "relativa",
      cantidad: 2000,
      modo: "delta",
    });
  });

  it("resuelve 'pon el volumen en menos 6 decibelios'", () => {
    const atomo = obtenerAtomo(atomId);
    expect(atomo).toBeDefined();
    if (!atomo) return;

    const molecula = crearMoleculaConAtom(atomId);
    const candidatos: CandidatoParametro[] = candidatosDe(molecula);
    const candVol = candidatos.find(c => c.parametro.id === "volumen");
    expect(candVol).toBeDefined();
    if (!candVol) return;

    const res = entenderDictado("pon el volumen en menos 6 decibelios", [candVol], ctx);
    expect(res.ok).toBe(true);
    const op = (res as { ok: true; operacion: any }).operacion.accion;
    expect(op).toEqual({
      tipo: "exacta",
      valor: -6,
    });
  });
});