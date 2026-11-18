/**
 * F8 · las capas de hardware leen GPU, almacenamiento libre y tipo de chip de la
 * ficha de capacidades. Sin dato = hueco (gris, «desconocido»), nunca un cero
 * inventado. Puro: sin red, sin disco ni relojes reales.
 */
import { describe, expect, it } from "vitest";
import { CAPA_POR_ID, claseAlmacenamiento } from "../capas";
import { construirMarcas, type MarcaGeo } from "../marcas";
import type { FichaDispositivo } from "@/lib/network/malla-neuronas";

const AHORA = 1_700_000_000_000;

/** Marca mínima para probar una capa de hardware sin montar toda la malla. */
function marca(hardware: Partial<MarcaGeo["hardware"]> = {}): MarcaGeo {
  return {
    id: "neurona:prueba",
    neuronaId: "prueba",
    nombre: "Aparato de prueba",
    esYo: false,
    forma: "punto",
    estado: "activa",
    posicion: { tipo: "desconocida", motivo: "sin datos" },
    calidad: { valor: null, t: null, fuente: "" },
    enlace: { estado: "sin-vinculo", latenciaMs: null, t: null },
    antenas: [],
    capas: { lista: null, t: null, fuente: "" },
    hardware: {
      ramClase: null,
      backendLocal: null,
      sirveAstraura: null,
      fuentesServibles: null,
      t: null,
      fuente: "",
      ...hardware,
    },
    aparato: null,
  };
}

describe("capa GPU (hw-gpu)", () => {
  it("con dato: pinta el modelo medido y su hora", () => {
    const capa = CAPA_POR_ID["hw-gpu"];
    const valor = capa.valor(marca({ gpu: "apple m1", t: AHORA }));
    expect(valor.tramo).toBe("medido");
    expect(valor.texto).toBe("apple m1");
    expect(valor.medida).toBe(true);
    expect(valor.t).toBe(AHORA);
  });

  it("sin dato: hueco «desconocido», nunca un modelo inventado", () => {
    const capa = CAPA_POR_ID["hw-gpu"];
    for (const gpu of [null, undefined, "", "   "]) {
      const valor = capa.valor(marca({ gpu }));
      expect(valor.tramo).toBe("desconocido");
      expect(valor.texto).toBe("desconocido");
      expect(valor.medida).toBe(false);
    }
  });
});

describe("capa almacenamiento libre (hw-almacenamiento)", () => {
  it("clasifica el espacio libre en bandas legibles", () => {
    expect(claseAlmacenamiento(0)).toBe("≤1 GB");
    expect(claseAlmacenamiento(1)).toBe("≤1 GB");
    expect(claseAlmacenamiento(1.1)).toBe("≤10 GB");
    expect(claseAlmacenamiento(10)).toBe("≤10 GB");
    expect(claseAlmacenamiento(10.1)).toBe("≤50 GB");
    expect(claseAlmacenamiento(50)).toBe("≤50 GB");
    expect(claseAlmacenamiento(50.1)).toBe(">50 GB");
  });

  it("con dato: pinta los GB libres y su banda", () => {
    const capa = CAPA_POR_ID["hw-almacenamiento"];
    const valor = capa.valor(marca({ almacenamientoLibreGb: 120.5, t: AHORA }));
    expect(valor.tramo).toBe(">50 GB");
    expect(valor.texto).toBe("120.5 GB libres");
    expect(valor.medida).toBe(true);
    expect(valor.t).toBe(AHORA);
  });

  it("un cero MEDIDO es un cero (disco lleno), no un hueco", () => {
    const capa = CAPA_POR_ID["hw-almacenamiento"];
    const valor = capa.valor(marca({ almacenamientoLibreGb: 0 }));
    expect(valor.tramo).toBe("≤1 GB");
    expect(valor.texto).toMatch(/^0 GB libres/);
    expect(valor.medida).toBe(true);
  });

  it("sin dato: hueco «desconocido», nunca «0 GB»", () => {
    const capa = CAPA_POR_ID["hw-almacenamiento"];
    for (const gb of [null, undefined, Number.NaN, -1]) {
      const valor = capa.valor(marca({ almacenamientoLibreGb: gb }));
      expect(valor.tramo).toBe("desconocido");
      expect(valor.texto).toBe("desconocido");
      expect(valor.medida).toBe(false);
      expect(valor.texto).not.toContain("0 GB");
    }
  });
});

describe("capa tipo de chip (hw-chip)", () => {
  it("con dato: pinta la familia de chip y su hora", () => {
    const capa = CAPA_POR_ID["hw-chip"];
    const valor = capa.valor(marca({ chip: "apple-silicon", t: AHORA }));
    expect(valor.tramo).toBe("apple-silicon");
    expect(valor.texto).toBe("Apple Silicon");
    expect(valor.medida).toBe(true);
    expect(valor.t).toBe(AHORA);
  });

  it("sin dato: hueco «desconocido», nunca una familia inventada", () => {
    const capa = CAPA_POR_ID["hw-chip"];
    for (const chip of [null, undefined, "", "desconocido"]) {
      const valor = capa.valor(marca({ chip: chip as MarcaGeo["hardware"]["chip"] }));
      expect(valor.tramo).toBe("desconocido");
      expect(valor.texto).toBe("desconocido");
      expect(valor.medida).toBe(false);
    }
  });
});

describe("de la ficha de capacidades a la capa", () => {
  it("la ficha de una neurona alimenta las tres capas nuevas", () => {
    const ficha: FichaDispositivo = {
      v: 1,
      syncDeviceId: "sync-prueba",
      neuronDeviceId: "neurona-prueba",
      nombre: "MaggaBook",
      tipo: "laptop",
      plataforma: "macOS",
      versionOS: "0.3.0",
      ramClase: "16 GB",
      backendLocal: false,
      capas: { local: true, mesh: true, nube: true, colectiva: true },
      at: AHORA,
      gpu: "apple m1",
      almacenamientoLibreGb: 42,
      chip: "apple-silicon",
    };
    const [m] = construirMarcas({
      filas: [], medios: [], ahora: AHORA,
      yo: { neuronaId: "yo", nombre: "MaggaBook", plataforma: "macOS", capas: null, posicion: null, senales: null, ficha },
    });
    expect(CAPA_POR_ID["hw-gpu"].valor(m)).toMatchObject({ tramo: "medido", texto: "apple m1", medida: true, t: AHORA });
    expect(CAPA_POR_ID["hw-almacenamiento"].valor(m)).toMatchObject({ tramo: "≤50 GB", texto: "42 GB libres", medida: true, t: AHORA });
    expect(CAPA_POR_ID["hw-chip"].valor(m)).toMatchObject({ tramo: "apple-silicon", texto: "Apple Silicon", medida: true, t: AHORA });
  });
});
