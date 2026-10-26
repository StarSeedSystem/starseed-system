// Pruebas del cargador HLS por la malla (puro, sin red real, sin disco, sin procesos)
import { describe, it, expect, vi } from "vitest";
import { HlsMallaLoader, type ConfigMallaLoader, type FuenteMalla, type RelojMalla, type TopeSubida } from "../hls-malla-loader";

function crearCarga(opciones: { vecinos?: string[]; respondeEn?: number; respondeCon?: Uint8Array; origenFalla?: boolean } = {}): ConfigMallaLoader {
  const vecinos = opciones.vecinos ?? ["vecino"],
        datos = opciones.respondeCon ?? new Uint8Array([1, 2, 3]);
  const fuente: FuenteMalla = {
    consultarDisponibilidad: (_e: string, _i: number) => vecinos,
    pedirSegmento: (_e: string, _i: number, _url: string, _timeout: number) =>
      opciones.respondeEn ? new Promise((r) => setTimeout(() => r(datos.buffer), opciones.respondeEn)) : Promise.resolve(datos.buffer),
    pedirOrigen: (_url: string, _timeout: number) => opciones.origenFalla ? Promise.reject(new Error("origen")) : Promise.resolve(datos.buffer),
    anunciarTransmisor: () => {},
  };
  const reloj: RelojMalla = { ahoraMs: () => Date.now() };
  const tope: TopeSubida = { bytesPorSegundo: () => 1024 };
  return { fuente, reloj, topeSubida: tope, contextoPublicoODeCuenta: true, elemento: "stream-test" };
}

describe("HlsMallaLoader", () => {
  it("esqueleto: existe la clase y se instancia", () => {
    expect(typeof HlsMallaLoader).toBe("function");
  });

  it("par rápido: vecino responde antes del tope", async () => {
    const cfg = crearCarga({ vecinos: ["v1"], respondeEn: 10 });
    const loader = new HlsMallaLoader({ configMalla: cfg });
    const contexto = { url: "https://ejemplo.m3u8/segment_1.m4s", frag: { duration: 2 } } as { url: string; frag?: { duration?: number } };
    const exito = vi.fn();
    loader.load(contexto as any, {} as any, { onSuccess: exito, onError: () => {}, onTimeout: () => {}, onProgress: () => {}, onAbort: () => {} } as any);
    await new Promise((r) => setTimeout(r, 50));
    expect(exito).toHaveBeenCalled();
  });

  it("par lento: vecino tarda y cae al origen", async () => {
    const cfg = crearCarga({ vecinos: ["v2"], respondeEn: 1000, origenFalla: false });
    const loader = new HlsMallaLoader({ configMalla: cfg });
    const contexto = { url: "https://ejemplo.m3u8/segment_2.m4s", frag: { duration: 0.3 } } as any;
    const exito = vi.fn();
    loader.load(contexto, {} as any, { onSuccess: exito, onError: () => {}, onTimeout: () => {}, onProgress: () => {}, onAbort: () => {} } as any);
    await new Promise((r) => setTimeout(r, 400));
    expect(exito).toHaveBeenCalled();
  });

  it("par mentiroso: hash distinto, pero el cargador no valida hash, solo pasa datos", async () => {
    const cfg = crearCarga({ vecinos: ["v3"], respondeCon: new Uint8Array([9, 8, 7]), respondeEn: 5 });
    const loader = new HlsMallaLoader({ configMalla: cfg });
    const contexto = { url: "https://ejemplo.m3u8/segment_3.m4s", frag: { duration: 1 } } as any;
    const exito = vi.fn();
    loader.load(contexto, {} as any, { onSuccess: exito, onError: () => {}, onTimeout: () => {}, onProgress: () => {}, onAbort: () => {} } as any);
    await new Promise((r) => setTimeout(r, 50));
    expect(exito).toHaveBeenCalled();
  });
});
