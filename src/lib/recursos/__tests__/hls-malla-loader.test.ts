// Pruebas del cargador HLS por la malla (tarea T · Ola 1017A). Puras: sin red, sin disco,
// sin procesos; el vecino (rápido, lento, mentiroso) y el reloj llegan inyectados.

import { describe, expect, it } from "vitest";
import type { FragmentLoaderContext, HlsConfig, LoaderCallbacks, LoaderConfiguration } from "hls.js";
import {
  crearCargadorMalla,
  puedeSubirPrestado,
  pedirPorMalla,
  topeEsperaMs,
  type ConexiónCargadorMalla,
} from "../hls-malla-loader";
import { anuncio, fusionar } from "../disponibilidad";

const AHORA = 1_000_000;
const ELEMENTO = "t1";
const BUENOS = new Uint8Array([1, 2, 3, 4]);
const MENTIRA = new Uint8Array([9, 9, 9, 9]);

function registroCon(
  fuentes: Array<{ nodo: string; piezas: number[]; t: number }>,
  recibidoEn: number = AHORA,
) {
  const recibidos = fuentes.flatMap((f) =>
    anuncio(f.nodo, ELEMENTO, 10, f.piezas, f.t).map((piezas) => ({
      anuncio: piezas,
      recibidoEn,
    })),
  );
  return fusionar(recibidos);
}

function conexión(
  pedir: (nodo: string, indice: number) => Promise<Uint8Array | null>,
  verificar: (b: Uint8Array, i: number) => boolean,
  anunciar: (i: number, b: Uint8Array) => void,
  fuentes: Array<{ nodo: string; piezas: number[]; t: number }>,
  opciones: { caducidadMs?: number; recibidoEn?: number } = {},
): ConexiónCargadorMalla {
  return {
    elemento: ELEMENTO,
    registro: registroCon(fuentes, opciones.recibidoEn ?? AHORA),
    pedir,
    verificar,
    anunciar,
    ahora: () => AHORA,
    esperar: (ms) => new Promise((r) => { setTimeout(() => r(null), ms); }),
    ...(opciones.caducidadMs !== undefined ? { caducidadMs: opciones.caducidadMs } : {}),
  };
}

describe("hls-malla-loader.ts", () => {
  /** Respaldo falso: cuenta los cargados y guarda los contextos, sin red. */
  class RespaldoFalso {
    static cargas = 0;
    static altas: FragmentLoaderContext[] = [];
    load(c: FragmentLoaderContext): void {
      RespaldoFalso.cargas += 1;
      RespaldoFalso.altas.push(c);
    }
    abort(): void {
      /* nada */
    }
    destroy(): void {
      /* nada */
    }
  }
  const Respaldo = RespaldoFalso as unknown as Parameters<typeof crearCargadorMalla>[1];
  const CONFG = {} as HlsConfig;
  const CONF_CARGA: LoaderConfiguration = {
    loadPolicy: { maxTimeToFirstByteMs: 10_000, maxLoadTimeMs: 20_000, timeoutRetry: null, errorRetry: null },
    maxRetry: 0,
    timeout: 0,
    retryDelay: 0,
    maxRetryDelay: 0,
  };

  function contextoCarga(sn: number, duracion = 0.2): FragmentLoaderContext {
    return {
      url: "https://tv.ejemplo.org/directo.m3u8",
      responseType: "arraybuffer",
      frag: { sn, duration: duracion },
    } as unknown as FragmentLoaderContext;
  }

  let exito: (Uint8Array | null)[] = [];
  let errores = 0;
  const CB: LoaderCallbacks<FragmentLoaderContext> = {
    onSuccess: (r) => { exito.push(r.data as Uint8Array | null); },
    onError: () => { errores += 1; },
    onTimeout: () => { /* no se usa */ },
  };

  it("tope de espera: 300 ms o la mitad del segmento, lo menor", () => {
    expect(topeEsperaMs()).toBe(300);
    expect(topeEsperaMs(10)).toBe(300);
    expect(topeEsperaMs(0.4)).toBe(200);
    expect(topeEsperaMs(0.02)).toBe(10);
    expect(topeEsperaMs(0)).toBe(300);
  });

  it("tope de subida prestado: sin tope medido no se sube nada", () => {
    expect(puedeSubirPrestado(undefined, 0, 60_000, 100)).toBe(false);
    expect(puedeSubirPrestado(64, 0, 60_000, 480_000)).toBe(true);
    expect(puedeSubirPrestado(64, 0, 60_000, 480_001)).toBe(false);
    expect(puedeSubirPrestado(64, 479_999, 60_000, 1)).toBe(true);
    expect(puedeSubirPrestado(64, 0, 60_000, -1)).toBe(false);
  });

  it("par rápido: el segmento llega por la malla y se anuncia", async () => {
    let pedidos = 0;
    let anunciado = -1;
    const con = conexión(
      async () => { pedidos += 1; return BUENOS; },
      (b) => b === BUENOS,
      (i) => { anunciado = i; },
      [{ nodo: "vecino-rapido", piezas: [4], t: 10 }],
    );
    const bytes = await pedirPorMalla(con, 4, 200);
    expect(bytes).toBe(BUENOS);
    expect(pedidos).toBe(1);
    expect(anunciado).toBe(4);
  });

  it("par lento: se vence el tope y la malla no responde nada", async () => {
    const con = conexión(
      async () => { await new Promise((r) => { setTimeout(r, 400); }); return BUENOS; },
      () => true,
      () => undefined,
      [{ nodo: "vecino-lento", piezas: [4], t: 10 }],
    );
    const bytes = await pedirPorMalla(con, 4, 50);
    expect(bytes).toBeNull();
  });

  it("par mentiroso (hash distinto): se descarta y se prueba el siguiente vecino", async () => {
    let anunciado = -1;
    const con = conexión(
      async (nodo) => (nodo === "mentiroso" ? MENTIRA : BUENOS),
      (b) => b === BUENOS,
      (i) => { anunciado = i; },
      [
        { nodo: "mentiroso", piezas: [4], t: 20 },
        { nodo: "honesto", piezas: [4], t: 10 },
      ],
    );
    const bytes = await pedirPorMalla(con, 4, 200);
    expect(bytes).toBe(BUENOS);
    expect(anunciado).toBe(4);
  });

  it("cargador: contexto sin número de segmento va directo al respaldo", () => {
    RespaldoFalso.cargas = 0;
    const Clase = crearCargadorMalla(
      conexión(async () => BUENOS, () => true, () => undefined, []),
      Respaldo,
    );
    const c = new Clase(CONFG);
    c.load(contextoCarga(-2), CONF_CARGA, CB);
    expect(RespaldoFalso.cargas).toBe(1);
  });

  it("cargador: par rápido no consulta al respaldo", async () => {
    RespaldoFalso.cargas = 0;
    exito = [];
    const con = conexión(
      async () => { await new Promise((r) => { setTimeout(r, 10); }); return BUENOS; },
      (b) => b === BUENOS,
      () => undefined,
      [{ nodo: "vecino-rapido", piezas: [4], t: 10 }],
    );
    const Clase = crearCargadorMalla(con, Respaldo);
    const c = new Clase(CONFG);
    c.load(contextoCarga(4), CONF_CARGA, CB);
    await new Promise((r) => { setTimeout(r, 30); });
    expect(exito.at(-1)).toBe(BUENOS);
    expect(RespaldoFalso.cargas).toBe(0);
  });

  it("cargador: par lento se vence y baja del origen", async () => {
    RespaldoFalso.cargas = 0;
    exito = [];
    const con = conexión(
      async () => { await new Promise((r) => { setTimeout(r, 400); }); return BUENOS; },
      () => true,
      () => undefined,
      [{ nodo: "vecino-lento", piezas: [4], t: 10 }],
    );
    const Clase = crearCargadorMalla(con, Respaldo);
    const c = new Clase(CONFG);
    c.load(contextoCarga(4, 0.1), CONF_CARGA, CB);
    await new Promise((r) => { setTimeout(r, 90); });
    expect(RespaldoFalso.cargas).toBe(1);
    expect(exito.at(-1)).toBeUndefined();
  });

  it("cargador: par mentiroso se vence y baja del origen sin anunciar", async () => {
    RespaldoFalso.cargas = 0;
    let anunciado = -1;
    const con = conexión(
      async () => MENTIRA,
      (b) => b === BUENOS,
      (i) => { anunciado = i; },
      [{ nodo: "mentiroso", piezas: [4], t: 10 }],
    );
    const Clase = crearCargadorMalla(con, Respaldo);
    const c = new Clase(CONFG);
    c.load(contextoCarga(4), CONF_CARGA, CB);
    await new Promise((r) => { setTimeout(r, 40); });
    expect(RespaldoFalso.cargas).toBe(1);
    expect(anunciado).toBe(-1);
  });

  it("vecino caducado no se consulta", async () => {
    let consultado = 0;
    const con = conexión(
      async () => { consultado += 1; return BUENOS; },
      () => true,
      () => undefined,
      [{ nodo: "remoto", piezas: [4], t: 10 }],
      { recibidoEn: AHORA - 40_000 },
    );
    const bytes = await pedirPorMalla(con, 4, 50);
    expect(bytes).toBeNull();
    expect(consultado).toBe(0);
  });
});