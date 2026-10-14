import { describe, expect, it } from "vitest";
import { entenderDictado } from "../../dictado";
import type { ContextoDictado } from "../../dictado";
import { limpiarRegistro, listarAtomos, registrarAtomo } from "../../registro-atomos";
import { ATOMOS_PROPIOS, registrarAtomosPropios } from "..";
import { SINTETIZADOR } from "../sintetizador";
import type { CandidatoParametro } from "../../tipos";

describe("átomos propios: prueba general", () => {
  it("cada definición pasa por registrarAtomo", () => {
    limpiarRegistro();
    for (const def of ATOMOS_PROPIOS) {
      expect(registrarAtomo(def), def.herramientaId).toEqual({ ok: true });
    }
  });

  it("registrarAtomosPropios es idempotente y registra todos", () => {
    limpiarRegistro();
    registrarAtomosPropios();
    registrarAtomosPropios();
    expect(listarAtomos().map((d) => d.herramientaId).sort()).toEqual(
      ATOMOS_PROPIOS.map((d) => d.herramientaId).sort(),
    );
  });

  it("los ids de parámetros son únicos en cada definición", () => {
    for (const def of ATOMOS_PROPIOS) {
      const ids = def.parametros.map((p) => p.id);
      expect(new Set(ids).size, def.herramientaId).toBe(ids.length);
    }
  });

  describe("documentos de vista", () => {
    const PROHIBIDAS = ["eval(", "new Function", "fetch(", "XMLHttpRequest", "importScripts", "WebSocket"];
    for (const def of ATOMOS_PROPIOS) {
      if (!def.vista || def.vista.tipo !== "documento") continue;
      const html = def.vista.documento();
      it(`${def.herramientaId}: trae el marcador de canal y el CSP`, () => {
        expect(html).toContain("__PM_CANAL__");
        expect(html).toContain("Content-Security-Policy");
      });
      it(`${def.herramientaId}: no enlaza recursos http externos ni ejecuta código ajeno`, () => {
        expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:/i);
        for (const cadena of PROHIBIDAS) expect(html).not.toContain(cadena);
      });
    }
  });

  describe("dictado sobre el sintetizador", () => {
    const candidatos: CandidatoParametro[] = SINTETIZADOR.parametros.map((p) => ({
      ref: { atomoId: "s1", parametroId: p.id },
      parametro: p,
      atomo: "Sintetizador",
    }));
    const ctx: ContextoDictado = { autor: { tipo: "persona", id: "ana" }, ahora: 1000 };

    it("«sube la frecuencia 2 kHz» → relativa +2000 Hz", () => {
      const r = entenderDictado("sube la frecuencia 2 kHz", candidatos, ctx);
      if (!r.ok) throw new Error(r.razon);
      expect(r.operacion.objetivo.parametroId).toBe("frecuencia");
      expect(r.operacion.accion).toEqual({ tipo: "relativa", cantidad: 2000, modo: "delta" });
    });

    it("«pon el volumen en menos 6 decibelios» → exacta −6 dB", () => {
      const r = entenderDictado("pon el volumen en menos 6 decibelios", candidatos, ctx);
      if (!r.ok) throw new Error(r.razon);
      expect(r.operacion.objetivo.parametroId).toBe("volumen");
      expect(r.operacion.accion).toEqual({ tipo: "exacta", valor: -6 });
    });
  });
});
