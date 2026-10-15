import { describe, it, expect, beforeEach } from "vitest";
import { registrarAtomo, obtenerAtomo, limpiarRegistro } from "@/lib/protomolecula/registro-atomos";
import { ATOMOS_PROPIOS } from "@/lib/protomolecula/atomos/index";
import type { DefinicionAtomo, VistaAtomo } from "@/lib/protomolecula/registro-atomos";
import { entenderDictado } from "@/lib/protomolecula/dictado";
import type { Autor, Parametro } from "@/lib/protomolecula/tipos";

describe("átomos propios de la Protomolécula", () => {
  beforeEach(() => {
    limpiarRegistro();
  });

  it("cada definición se puede registrar", () => {
    for (const atomo of ATOMOS_PROPIOS) {
      const resultado = registrarAtomo(atomo);
      expect(resultado.ok).toBe(true);
      const obtenido = obtenerAtomo(atomo.herramientaId);
      expect(obtenido).toBeDefined();
      expect(obtenido?.herramientaId).toBe(atomo.herramientaId);
    }
  });

  it("los ids de parámetros son únicos dentro de cada átomo", () => {
    for (const atomo of ATOMOS_PROPIOS) {
      const ids = new Set<string>();
      for (const param of atomo.parametros) {
        expect(ids.has(param.id)).toBe(false);
        ids.add(param.id);
      }
    }
  });

  it("las vistas de tipo documento cumplen con los requisitos de seguridad", () => {
    for (const atomo of ATOMOS_PROPIOS) {
      if (atomo.vista?.tipo === "documento") {
        const html = atomo.vista.documento();
        // Contiene el marcador __PM_CANAL__
        expect(html).toContain("__PM_CANAL__");
        // Contiene la CSP esperada
        expect(html).toContain("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:");
        // No contiene src= o href= que apunten a http
        expect(html).not.toMatch(/src\s*=\s*["']https?:\/\//i);
        expect(html).not.toMatch(/href\s*=\s*["']https?:\/\//i);
        // No contiene las cadenas peligrosas
        expect(html).not.toContain("eval(");
        expect(html).not.toContain("new Function");
        expect(html).not.toContain("fetch(");
        expect(html).not.toContain("XMLHttpRequest");
        expect(html).not.toContain("importScripts");
        expect(html).not.toContain("WebSocket");
      }
    }
  });

  it("el sintetizador responde al dictado", () => {
    // Primero registramos el sintetizador para que esté en el registro
    registrarAtomo(ATOMOS_PROPIOS[0]);

    // Obtenemos los candidatos de parámetros para una molécula vacía (no importa)
    const molecula = { atomos: [] };
    // Necesitamos una molécula con un átomo activo para que candidatosDe devuelva algo
    // Pero para probar el dictado, podemos pasar directamente los parámetros
    // Sin embargo, entenderDictado espera un array de CandidatoParametro[]
    // Vamos a crear uno manualmente a partir del sintetizador
    const sintetizador = ATOMOS_PROPIOS[0];
    const candidatos: { ref: { atomoId: string; parametroId: string }; parametro: Parametro; atomo?: string }[] = sintetizador.parametros.map(p => ({
      ref: { atomoId: "test-atomo", parametroId: p.id },
      parametro: p,
      atomo: sintetizador.nombre
    }));

    const autor: Autor = { tipo: "persona", id: "test-autor", nombre: "Test Autor" };
    const ahora = Date.now();

    // Probar: "sube la frecuencia 2 kHz"
    let resultado = entenderDictado("sube la frecuencia 2 kHz", candidatos, { autor, ahora });
    expect(resultado.ok).toBe(true);
    expect(resultado.operacion.objetivo.parametroId).toBe("frecuencia");
    expect(resultado.operacion.accion.tipo).toBe("relativa");
    expect(resultado.operacion.accion.modo).toBe("delta");
    // 2 kHz = 2000 Hz
    expect(resultado.operacion.accion.cantidad).toBeCloseTo(2000);

    // Probar: "pon el volumen en menos 6 decibelios"
    resultado = entenderDictado("pon el volumen en menos 6 decibelios", candidatos, { autor, ahora });
    expect(resultado.ok).toBe(true);
    expect(resultado.operacion.objetivo.parametroId).toBe("volumen");
    expect(resultado.operacion.accion.tipo).toBe("exacta");
    // menos 6 dB
    expect(resultado.operacion.accion.valor).toBe(-6);
  });
});