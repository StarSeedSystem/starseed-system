import { describe, expect, it } from "vitest";
import { construirMarcas, type MarcaGeo } from "../marcas";
import type { PresenciaMedio } from "@/lib/neurons/presencia";
import type { DispositivoMallaRow } from "@/lib/network/malla-neuronas";
import type { MeshLinkStatus } from "@/ai/astraura/mesh/types";

const AHORA = 1_700_000_000_000;

function medioBase(overrides: Partial<PresenciaMedio> = {}): PresenciaMedio {
  return {
    n: "neurona-1",
    m: "medio-1",
    tipo: "navegador",
    etiqueta: "Chrome",
    visible: true,
    desde: "2026-01-01T00:00:00.000Z",
    t: AHORA,
    s: {
      internet: { enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 10 },
      malla: { pares: 0, otrasCuentas: 0 },
      lora: { estado: "sin-radio" as MeshLinkStatus | "sin-radio", nodos: 0 },
      bluetooth: { disponible: true },
      serie: { disponible: false, puertos: 0 },
      reticulum: { disponible: false, motivo: "x" },
    },
    ...overrides,
  };
}

function filaBase(overrides: Partial<DispositivoMallaRow> = {}): DispositivoMallaRow {
  return {
    neuronId: "neurona-1",
    nombre: "Test Neurona",
    tipo: "desktop",
    plataforma: "macOS",
    online: true,
    enlace: { estado: "conectado", latenciaMs: 50 },
    esEsteDispositivo: false,
    ficha: undefined,
    ...overrides,
  };
}

function yoBase(overrides: { neuronaId?: string; capas?: readonly string[] | null } = {}): any {
  return {
    neuronaId: overrides.neuronaId ?? "yo",
    nombre: "Yo",
    plataforma: "macOS",
    capas: overrides.capas ?? null,
    ficha: undefined,
    posicion: { lat: 0, lon: 0, precisionM: 10, t: AHORA },
    senales: {
      internet: { enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 10 },
      malla: { pares: 0, otrasCuentas: 0 },
      lora: { estado: "sin-radio" as MeshLinkStatus | "sin-radio", nodos: 0 },
      bluetooth: { disponible: true },
      serie: { disponible: false, puertos: 0 },
      reticulum: { disponible: false, motivo: "x" },
    },
  };
}

function getMarca(marcas: MarcaGeo[], neuronaId: string): MarcaGeo | undefined {
  return marcas.find((m) => m.neuronaId === neuronaId);
}

describe("marcas: oferta viaja desde PresenciaMedio a MarcaGeo", () => {
  it("extrae la oferta del medio más reciente de la neurona", () => {
    const medios = [
      medioBase({ t: AHORA - 1000, o: { computo: false, almacenamiento: false, internet: false } }),
      medioBase({ t: AHORA, o: { computo: true, almacenamiento: true, internet: true } }),
    ];
    const marcas = construirMarcas({ filas: [filaBase({ esEsteDispositivo: true })], medios, ahora: AHORA, yo: yoBase({ neuronaId: "neurona-1" }) });
    const m = getMarca(marcas, "neurona-1");
    expect(m).toBeDefined();
    expect(m?.oferta).toEqual({ computo: true, almacenamiento: true, internet: true });
  });

  it("si la neurona no tiene oferta en su anuncio, marca.oferta es null", () => {
    const medios = [medioBase({ t: AHORA })]; // sin campo o
    const marcas = construirMarcas({ filas: [filaBase({ esEsteDispositivo: true })], medios, ahora: AHORA, yo: yoBase({ neuronaId: "neurona-1" }) });
    const m = getMarca(marcas, "neurona-1");
    expect(m).toBeDefined();
    expect(m?.oferta).toBeNull();
  });

  it("para 'esYo' (este aparato), la oferta viene del medio de yo", () => {
    const medios = [medioBase({ t: AHORA, n: "yo", o: { computo: true, almacenamiento: false, internet: false } })];
    const marcas = construirMarcas({ filas: [filaBase({ neuronId: "yo", esEsteDispositivo: true })], medios, ahora: AHORA, yo: yoBase({ neuronaId: "yo" }) });
    const m = getMarca(marcas, "yo");
    expect(m).toBeDefined();
    expect(m?.esYo).toBe(true);
    expect(m?.oferta).toEqual({ computo: true, almacenamiento: false, internet: false });
  });

  it("oferta parcial se preserva correctamente", () => {
    const medios = [medioBase({ t: AHORA, o: { computo: true, almacenamiento: false, internet: true } })];
    const marcas = construirMarcas({ filas: [filaBase({ esEsteDispositivo: true })], medios, ahora: AHORA, yo: yoBase({ neuronaId: "neurona-1" }) });
    const m = getMarca(marcas, "neurona-1");
    expect(m).toBeDefined();
    expect(m?.oferta).toEqual({ computo: true, almacenamiento: false, internet: true });
  });

  it("múltiples neuronas: cada una tiene su oferta independiente", () => {
    const medios = [
      medioBase({ n: "neurona-1", t: AHORA, o: { computo: true, almacenamiento: false, internet: false } }),
      medioBase({ n: "neurona-2", t: AHORA, o: { computo: false, almacenamiento: true, internet: true } }),
    ];
    const filas = [
      filaBase({ neuronId: "neurona-1", esEsteDispositivo: true }),
      filaBase({ neuronId: "neurona-2", nombre: "Otra", esEsteDispositivo: false }),
    ];
    const marcas = construirMarcas({ filas, medios, ahora: AHORA, yo: yoBase({ neuronaId: "neurona-1" }) });
    const m1 = getMarca(marcas, "neurona-1");
    const m2 = getMarca(marcas, "neurona-2");
    expect(m1).toBeDefined();
    expect(m2).toBeDefined();
    expect(m1?.oferta).toEqual({ computo: true, almacenamiento: false, internet: false });
    expect(m2?.oferta).toEqual({ computo: false, almacenamiento: true, internet: true });
  });
});