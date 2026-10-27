// Pruebas del cargador HLS por la malla (tarea T · Ola 1017A). Puras: sin red, sin disco,
// sin procesos; el vecino (rápido, lento, mentiroso) y el reloj llegan inyectados.
import { describe, expect, it } from "vitest";
import type { FragmentLoaderContext, HlsConfig, LoaderCallbacks, LoaderConfiguration } from "hls.js";
import {
  contextoMalla, crearCargadorMalla, pedirPorMalla, puedeSubirPrestado, topeEsperaMs,
  type ConexiónCargadorMalla,
} from "../hls-malla-loader";
import { anuncio, fusionar } from "../disponibilidad";
import { armarArbol } from "../arbol-relevo";
const AHORA = 1_000_000, ELEMENTO = "t1", BUENOS = new Uint8Array([1, 2, 3, 4]), MENTIRA = new Uint8Array([9, 9, 9, 9]);
function registroCon(fuentes: Array<{ nodo: string; piezas: number[]; t: number }>, recibidoEn = AHORA) {
  return fusionar(fuentes.flatMap((f) =>
    anuncio(f.nodo, ELEMENTO, 10, f.piezas, f.t).map((piezas) => ({ anuncio: piezas, recibidoEn }))));
}
function conexión(
  pedir: (nodo: string, indice: number) => Promise<Uint8Array | null>,
  verificar: (b: Uint8Array, i: number) => boolean,
  anunciar: (i: number, b: Uint8Array) => void,
  fuentes: Array<{ nodo: string; piezas: number[]; t: number }>,
  opciones: { caducidadMs?: number; recibidoEn?: number } = {},
): ConexiónCargadorMalla {
  return {
    elemento: ELEMENTO, registro: registroCon(fuentes, opciones.recibidoEn ?? AHORA), pedir, verificar, anunciar,
    ahora: () => AHORA, esperar: (ms) => new Promise((r) => { setTimeout(() => r(null), ms); }),
    ...(opciones.caducidadMs !== undefined ? { caducidadMs: opciones.caducidadMs } : {}),
  };
}
class RespaldoFalso { static cargas = 0; load(): void { RespaldoFalso.cargas += 1; } abort(): void { /* nada */ } destroy(): void { /* nada */ } }
const Respaldo = RespaldoFalso as unknown as Parameters<typeof crearCargadorMalla>[1];
const CONFG = {} as HlsConfig;
const CONF_CARGA: LoaderConfiguration = {
  loadPolicy: { maxTimeToFirstByteMs: 10_000, maxLoadTimeMs: 20_000, timeoutRetry: null, errorRetry: null },
  maxRetry: 0, timeout: 0, retryDelay: 0, maxRetryDelay: 0,
};
const contextoCarga = (sn: number, duracion = 0.2) => ({ url: "https://tv.ejemplo.org/directo.m3u8", responseType: "arraybuffer", frag: { sn, duration: duracion } } as unknown as FragmentLoaderContext);
const CB: LoaderCallbacks<FragmentLoaderContext> = { onSuccess: () => undefined, onError: () => undefined, onTimeout: () => undefined };
describe("hls-malla-loader.ts", () => {
  it("tope de espera: 300 ms o la mitad del segmento, lo menor", () => {
    expect(topeEsperaMs()).toBe(300); expect(topeEsperaMs(10)).toBe(300);
    expect(topeEsperaMs(0.4)).toBe(200); expect(topeEsperaMs(0.02)).toBe(10); expect(topeEsperaMs(0)).toBe(300);
  });
  it("tope de subida prestado: sin tope medido no se sube nada", () => {
    expect(puedeSubirPrestado(undefined, 0, 60_000, 100)).toBe(false);
    expect(puedeSubirPrestado(64, 0, 60_000, 480_000)).toBe(true);
    expect(puedeSubirPrestado(64, 0, 60_000, 480_001)).toBe(false);
    expect(puedeSubirPrestado(64, 479_999, 60_000, 1)).toBe(true);
    expect(puedeSubirPrestado(64, 0, 60_000, -1)).toBe(false);
  });
  it("contexto: solo estaciones en malla y públicas o de la cuenta", () => {
    expect(contextoMalla({ enMalla: false, visibilidad: "publica" }, "yo")).toBeNull();
    expect(contextoMalla({ enMalla: true, visibilidad: "publica" }, "yo")).toBe("publico");
    expect(contextoMalla({ enMalla: true, visibilidad: "grupo", ownerId: "yo" }, "yo")).toBe("cuenta");
    expect(contextoMalla({ enMalla: true, visibilidad: "grupo", ownerId: "otro" }, "yo")).toBeNull();
    expect(contextoMalla({ enMalla: true, visibilidad: "grupo", ownerId: null }, "yo")).toBeNull();
  });
  it("par rápido: el segmento llega por la malla y se anuncia", async () => {
    let pedidos = 0, anunciado = -1;
    const con = conexión(async () => { pedidos += 1; return BUENOS; }, (b) => b === BUENOS,
      (i) => { anunciado = i; }, [{ nodo: "vecino-rapido", piezas: [4], t: 10 }]);
    expect(await pedirPorMalla(con, 4, 200)).toBe(BUENOS);
    expect(pedidos).toBe(1); expect(anunciado).toBe(4);
  });
  it("par lento: se vence el tope y la malla no responde nada", async () => {
    const con = conexión(async () => { await new Promise((r) => { setTimeout(r, 400); }); return BUENOS; },
      () => true, () => undefined, [{ nodo: "vecino-lento", piezas: [4], t: 10 }]);
    expect(await pedirPorMalla(con, 4, 50)).toBeNull();
  });
  it("par mentiroso (hash distinto): se descarta y se prueba el siguiente vecino", async () => {
    let anunciado = -1;
    const con = conexión(async (nodo) => (nodo === "mentiroso" ? MENTIRA : BUENOS), (b) => b === BUENOS,
      (i) => { anunciado = i; },
      [{ nodo: "mentiroso", piezas: [4], t: 20 }, { nodo: "honesto", piezas: [4], t: 10 }]);
    expect(await pedirPorMalla(con, 4, 200)).toBe(BUENOS); expect(anunciado).toBe(4);
  });
  it("árbol de relevo: pide primero al padre y recoloca su rama si se va", async () => {
    const arbol = armarArbol({ nodoId: "origen", subidaKbps: 1000 }, [
      { nodoId: "padre", subidaKbps: 3000 },
      { nodoId: "yo", subidaKbps: 1000 },
      { nodoId: "otro", subidaKbps: 500 },
    ], 1000);
    expect(arbol.padres.yo).toBe("padre");
    const pedidos: string[] = [];
    const con = conexión(async (nodo) => {
      pedidos.push(nodo);
      return nodo === "padre" ? null : BUENOS;
    }, (b) => b === BUENOS, () => undefined,
    [{ nodo: "otro", piezas: [4], t: 20 }, { nodo: "padre", piezas: [4], t: 10 }]);
    con.arbol = arbol; con.receptor = "yo";
    expect(await pedirPorMalla(con, 4, 200)).toBe(BUENOS);
    expect(pedidos[0]).toBe("padre");
    expect(con.arbol?.padres.padre).toBeUndefined();
    expect(con.arbol?.padres.yo).toBe("origen");
  });
  it("vecino que lanza al pedir no corta la búsqueda", async () => {
    const con = conexión(async (nodo) => {
      if (nodo === "roto") throw new Error("enlace caído");
      return BUENOS;
    }, (b) => b === BUENOS, () => undefined,
    [{ nodo: "roto", piezas: [4], t: 20 }, { nodo: "honesto", piezas: [4], t: 10 }]);
    expect(await pedirPorMalla(con, 4, 200)).toBe(BUENOS);
  });
  it("vecino caducado no se consulta", async () => {
    let consultado = 0;
    const con = conexión(async () => { consultado += 1; return BUENOS; }, () => true, () => undefined,
      [{ nodo: "remoto", piezas: [4], t: 10 }], { recibidoEn: AHORA - 40_000 });
    expect(await pedirPorMalla(con, 4, 50)).toBeNull(); expect(consultado).toBe(0);
  });
  it("cargador: sin número de segmento va directo al respaldo", () => {
    RespaldoFalso.cargas = 0;
    new (crearCargadorMalla(conexión(async () => BUENOS, () => true, () => undefined, []), Respaldo))(CONFG)
      .load(contextoCarga(-2), CONF_CARGA, CB);
    expect(RespaldoFalso.cargas).toBe(1);
  });
  it("cargador: par rápido no consulta al respaldo", async () => {
    RespaldoFalso.cargas = 0;
    let exito: Uint8Array | null = null;
    const con = conexión(async () => { await new Promise((r) => { setTimeout(r, 10); }); return BUENOS; },
      (b) => b === BUENOS, () => undefined, [{ nodo: "vecino-rapido", piezas: [4], t: 10 }]);
    const cb: LoaderCallbacks<FragmentLoaderContext> = {
      ...CB, onSuccess: (r) => { exito = r.data as Uint8Array | null; },
    };
    new (crearCargadorMalla(con, Respaldo))(CONFG).load(contextoCarga(4), CONF_CARGA, cb);
    await new Promise((r) => { setTimeout(r, 30); });
    expect(exito).toBe(BUENOS); expect(RespaldoFalso.cargas).toBe(0);
  });
  it("cargador: par lento o mentiroso se vence y baja del origen", async () => {
    for (const respuesta of ["lento", "mentiroso"] as const) {
      RespaldoFalso.cargas = 0;
      let anunciado = -1;
      const con = conexión(async () => {
        if (respuesta === "lento") await new Promise((r) => { setTimeout(r, 400); });
        return respuesta === "lento" ? BUENOS : MENTIRA;
      }, (b) => b === BUENOS, (i) => { anunciado = i; }, [{ nodo: respuesta, piezas: [4], t: 10 }]);
      new (crearCargadorMalla(con, Respaldo))(CONFG).load(contextoCarga(4, 0.1), CONF_CARGA, CB);
      await new Promise((r) => { setTimeout(r, 90); });
      expect(RespaldoFalso.cargas).toBe(1); expect(anunciado).toBe(-1);
    }
  });
});
