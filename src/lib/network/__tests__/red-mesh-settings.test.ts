import { describe, it, expect } from "vitest";
import {
  normalizarInferenciaLocal,
  evaluarNivelVozBorde,
  obtenerListaTransportes,
  obtenerListaIdiomasVoz,
  CLAVE_TRANSPORTE_PREFERIDO,
  CLAVE_VOZ_SUPERTONIC,
  CLAVE_VOZ_IDIOMA,
} from "../red-mesh-settings";

describe("red-mesh-settings", () => {
  it("exporta las claves de almacenamiento correctas", () => {
    expect(CLAVE_TRANSPORTE_PREFERIDO).toBe("starseed.mesh.transporte-preferido.v1");
    expect(CLAVE_VOZ_SUPERTONIC).toBe("starseed.mesh.voz.supertonic.v1");
    expect(CLAVE_VOZ_IDIOMA).toBe("starseed.mesh.voz.idioma.v1");
  });

  describe("normalizarInferenciaLocal", () => {
    it("devuelve true por defecto si es null o vacío", () => {
      expect(normalizarInferenciaLocal(null)).toBe(true);
      expect(normalizarInferenciaLocal("")).toBe(true);
    });

    it("interpreta booleanos y cadenas simples", () => {
      expect(normalizarInferenciaLocal("true")).toBe(true);
      expect(normalizarInferenciaLocal("1")).toBe(true);
      expect(normalizarInferenciaLocal("false")).toBe(false);
      expect(normalizarInferenciaLocal("0")).toBe(false);
    });

    it("extrae la propiedad servirFlota o enabled de un objeto JSON", () => {
      expect(normalizarInferenciaLocal(JSON.stringify({ servirFlota: false }))).toBe(false);
      expect(normalizarInferenciaLocal(JSON.stringify({ servirFlota: true }))).toBe(true);
      expect(normalizarInferenciaLocal(JSON.stringify({ enabled: false }))).toBe(false);
    });
  });

  describe("evaluarNivelVozBorde", () => {
    it("devuelve suptonica cuando supertonic está activo", () => {
      expect(evaluarNivelVozBorde(true)).toBe("suptonica");
    });

    it("evalúa fallback sin supertonic", () => {
      expect(evaluarNivelVozBorde(false, "tronal")).toBe("tronal");
      expect(evaluarNivelVozBorde(false, "web")).toBe("nube");
    });
  });

  describe("obtenerListaTransportes", () => {
    it("retorna lista de transportes BWP estructurada", () => {
      const lista = obtenerListaTransportes();
      expect(lista.length).toBeGreaterThan(0);
      const wifiHalo = lista.find((t) => t.key === "wifi-halo");
      expect(wifiHalo).toBeDefined();
      expect(wifiHalo?.etiqueta).toBe("Wi-Fi HaLow");
    });
  });

  describe("obtenerListaIdiomasVoz", () => {
    it("retorna lista de idiomas con etiqueta para supertonic", () => {
      const idiomas = obtenerListaIdiomasVoz();
      expect(idiomas.length).toBeGreaterThan(0);
      const es = idiomas.find((i) => i.code === "es");
      expect(es?.label).toContain("Español");
    });
  });
});
