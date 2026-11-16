/**
 * Tests de estructura de salida del adaptador Wi-Fi (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import { adaptadorWifi, type EntradaAdaptadorWifi } from "../wifi";
import type { SenalEspectro, SinFuente } from "../../modelo";

describe("adaptadorWifi · estructura de salida", () => {
  const ahora = Date.now();
  const zona = "casa";
  const capa = "propia" as const;

  const entradaBase: EntradaAdaptadorWifi = {
    senalesMedio: {
      internet: { enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 50 },
    },
    enlacesMedidos: [],
    escaneoNativo: undefined,
    zona,
    capa,
  };

  it("cada señal tiene id, medio, banda, origen, fuente, medidoEn, zona, capa, compatibles", () => {
    const { senales } = adaptadorWifi(entradaBase);
    for (const s of senales) {
      expect(typeof s.id).toBe("string");
      expect(s.id.length).toBeGreaterThan(0);
      expect(["wifi", "internet", "bluetooth", "lora", "celular", "malla", "estacion", "sdr"]).toContain(s.medio);
      expect(typeof s.banda).toBe("string");
      expect(["medida", "declarada", "estimada"]).toContain(s.origen);
      expect(typeof s.fuente).toBe("string");
      expect(typeof s.medidoEn).toBe("number");
      expect(s.zona === null || typeof s.zona === "string").toBe(true);
      expect(["propia", "publica", "comunidad", "privada", "externa"]).toContain(s.capa);
      expect(Array.isArray(s.compatibles)).toBe(true);
    }
  });

  it("cada sinFuente tiene medio y motivo", () => {
    const { sinFuente } = adaptadorWifi(entradaBase);
    for (const sf of sinFuente) {
      expect(["wifi", "internet", "bluetooth", "lora", "celular", "malla", "estacion", "sdr"]).toContain(sf.medio);
      expect(typeof sf.motivo).toBe("string");
      expect(sf.motivo.length).toBeGreaterThan(0);
    }
  });
});