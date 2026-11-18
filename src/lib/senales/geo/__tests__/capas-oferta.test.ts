import { describe, expect, it } from "vitest";
import { CAPA_POR_ID, CAPAS_SENALES } from "../capas";
import type { MarcaGeo } from "../marcas";

function marcaBase(overrides: Partial<MarcaGeo> = {}): MarcaGeo {
  return {
    id: "neurona:test",
    neuronaId: "test",
    nombre: "Test",
    esYo: false,
    forma: "punto",
    estado: "activa",
    posicion: { tipo: "exacta", lat: 0, lon: 0, precisionM: 10, t: Date.now() },
    calidad: { valor: 0.5, t: Date.now(), fuente: "test", nota: "" },
    enlace: { estado: "conectado", latenciaMs: 50, t: Date.now() },
    antenas: [],
    capas: { lista: null, t: null, fuente: "" },
    hardware: { ramClase: null, backendLocal: null, sirveAstraura: null, fuentesServibles: null, t: null, fuente: "" },
    aparato: null,
    oferta: undefined,
    ...overrides,
  };
}

describe("capas: oferta-* — anuncio de recursos", () => {
  const idsOferta = ["oferta-computo", "oferta-almacenamiento", "oferta-internet"] as const;

  it("las tres capas de oferta existen en CAPAS_SENALES", () => {
    for (const id of idsOferta) {
      const capa = CAPA_POR_ID[id];
      expect(capa).toBeDefined();
      expect(capa?.grupo).toBe("oferta");
    }
  });

  it("cada capa de oferta tiene estado 'parcial' y fuente declarada", () => {
    for (const id of idsOferta) {
      const capa = CAPA_POR_ID[id];
      expect(capa?.estado).toBe("parcial");
      expect(capa?.fuente.length).toBeGreaterThan(10);
    }
  });

  it("cada capa de oferta tiene tramos: sí (relleno), no (anillo), desconocido (hueco)", () => {
    for (const id of idsOferta) {
      const capa = CAPA_POR_ID[id];
      const tramas = capa?.tramos.map((t) => t.id) ?? [];
      expect(tramas).toContain("si");
      expect(tramas).toContain("no");
      expect(tramas).toContain("desconocido");
      const si = capa?.tramos.find((t) => t.id === "si");
      const no = capa?.tramos.find((t) => t.id === "no");
      const desc = capa?.tramos.find((t) => t.id === "desconocido");
      expect(si?.estilo).toBe("relleno");
      expect(no?.estilo).toBe("anillo");
      expect(desc?.estilo).toBe("hueco");
    }
  });

  describe("cuando la neurona ANUNCIA la oferta (m.oferta presente)", () => {
    it("oferta-computo: true → tramo 'si', false → tramo 'no'", () => {
      const marcaSi = marcaBase({ oferta: { computo: true, almacenamiento: false, internet: false } });
      const marcaNo = marcaBase({ oferta: { computo: false, almacenamiento: false, internet: false } });
      const capa = CAPA_POR_ID["oferta-computo"]!;
      const vSi = capa.valor(marcaSi);
      const vNo = capa.valor(marcaNo);
      expect(vSi.tramo).toBe("si");
      expect(vSi.texto).toBe("ofrece cómputo");
      expect(vSi.medida).toBe(true);
      expect(vNo.tramo).toBe("no");
      expect(vNo.texto).toBe("no ofrece cómputo");
      expect(vNo.medida).toBe(true);
    });

    it("oferta-almacenamiento: true → tramo 'si', false → tramo 'no'", () => {
      const marcaSi = marcaBase({ oferta: { computo: false, almacenamiento: true, internet: false } });
      const marcaNo = marcaBase({ oferta: { computo: false, almacenamiento: false, internet: false } });
      const capa = CAPA_POR_ID["oferta-almacenamiento"]!;
      const vSi = capa.valor(marcaSi);
      const vNo = capa.valor(marcaNo);
      expect(vSi.tramo).toBe("si");
      expect(vSi.texto).toBe("ofrece almacenamiento");
      expect(vSi.medida).toBe(true);
      expect(vNo.tramo).toBe("no");
      expect(vNo.texto).toBe("no ofrece almacenamiento");
      expect(vNo.medida).toBe(true);
    });

    it("oferta-internet: true → tramo 'si', false → tramo 'no'", () => {
      const marcaSi = marcaBase({ oferta: { computo: false, almacenamiento: false, internet: true } });
      const marcaNo = marcaBase({ oferta: { computo: false, almacenamiento: false, internet: false } });
      const capa = CAPA_POR_ID["oferta-internet"]!;
      const vSi = capa.valor(marcaSi);
      const vNo = capa.valor(marcaNo);
      expect(vSi.tramo).toBe("si");
      expect(vSi.texto).toBe("comparte internet");
      expect(vSi.medida).toBe(true);
      expect(vNo.tramo).toBe("no");
      expect(vNo.texto).toBe("no comparte internet");
      expect(vNo.medida).toBe(true);
    });

    it("oferta parcial: cada recurso se evalúa independientemente", () => {
      const marca = marcaBase({ oferta: { computo: true, almacenamiento: false, internet: true } });
      expect(CAPA_POR_ID["oferta-computo"]!.valor(marca).tramo).toBe("si");
      expect(CAPA_POR_ID["oferta-almacenamiento"]!.valor(marca).tramo).toBe("no");
      expect(CAPA_POR_ID["oferta-internet"]!.valor(marca).tramo).toBe("si");
    });
  });

  describe("cuando la neurona NO ANUNCIA la oferta (m.oferta ausente o null)", () => {
    it("devuelve 'desconocido' con medida=false", () => {
      const marcaSinOferta = marcaBase({ oferta: undefined });
      const marcaNullOferta = marcaBase({ oferta: null });
      for (const id of idsOferta) {
        const capa = CAPA_POR_ID[id]!;
        const v1 = capa.valor(marcaSinOferta);
        const v2 = capa.valor(marcaNullOferta);
        expect(v1.tramo).toBe("desconocido");
        expect(v1.medida).toBe(false);
        expect(v1.texto).toMatch(/desconocido/);
        expect(v2.tramo).toBe("desconocido");
        expect(v2.medida).toBe(false);
      }
    });

    it("el texto dice 'desconocido' (no inventa un valor)", () => {
      const marca = marcaBase({ oferta: undefined });
      for (const id of idsOferta) {
        const valor = CAPA_POR_ID[id]!.valor(marca);
        expect(valor.texto).toBe("desconocido");
      }
    });
  });

  it("las capas de oferta ya NO están en estado 'sin-fuente'", () => {
    for (const id of idsOferta) {
      const capa = CAPA_POR_ID[id];
      expect(capa?.estado).not.toBe("sin-fuente");
    }
    const sinFuenteIds = CAPAS_SENALES.filter((c) => c.estado === "sin-fuente").map((c) => c.id);
    for (const id of idsOferta) {
      expect(sinFuenteIds).not.toContain(id);
    }
  });

  it("la leyenda de cada capa de oferta incluye los tres tramos", () => {
    const esperados: Record<string, string[]> = {
      "oferta-computo": ["Ofrece cómputo", "No ofrece", "Sin medir"],
      "oferta-almacenamiento": ["Ofrece almacenamiento", "No ofrece", "Sin medir"],
      "oferta-internet": ["Comparte internet", "No comparte", "Sin medir"],
    };
    for (const id of idsOferta) {
      const capa = CAPA_POR_ID[id]!;
      const etiquetas = capa.tramos.map((t) => t.etiqueta);
      for (const e of esperados[id]) {
        expect(etiquetas).toContain(e);
      }
    }
  });
});