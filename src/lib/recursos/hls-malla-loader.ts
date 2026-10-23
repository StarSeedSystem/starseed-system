// Cargador HLS por la malla (architecture/apps-en-la-malla.md §10 · tarea T, Ola 1017A).
// Puro: vecinos, verificación, anuncio, reloj y respaldo llegan inyectados. Por cada segmento
// pregunta a disponibilidad.ts quién lo tiene, lo pide por la malla con un tope de espera
// (300 ms o la mitad del segmento) y si no, lo baja del origen; al tenerlo lo anuncia: ya es
// transmisor. Solo tipos de hls.js: la clase de respaldo la inyecta quien llama.
import { CADUCIDAD_POR_DEFECTO_MS, quienTiene, type RegistroDisponibilidad } from "./disponibilidad";
import type {
  FragmentLoaderConstructor, FragmentLoaderContext, HlsConfig, Loader, LoaderConfiguration,
  LoaderCallbacks, LoaderStats,
} from "hls.js";

/** Tope de espera por la malla cuando no se conoce la duración del segmento (ms). */
export const TOPE_ESPERA_MS = 300;

/** 300 ms o la mitad del segmento, lo menor: la malla no puede tardar más que el respaldo. */
export function topeEsperaMs(duracionSeg?: number): number {
  const mitad = duracionSeg && duracionSeg > 0 ? (duracionSeg * 1000) / 2 : TOPE_ESPERA_MS;
  return Math.min(TOPE_ESPERA_MS, Math.round(mitad));
}

/** Lo que el cargador necesita de la malla, todo inyectado (sin red, sin reloj propio). */
export interface ConexiónCargadorMalla {
  /** Id de la transmisión que anuncian y piden los vecinos. */
  elemento: string;
  registro: RegistroDisponibilidad;
  /** Pide el segmento a un vecino; null si lo niega, miente o no contesta. */
  pedir: (nodo: string, indice: number) => Promise<Uint8Array | null>;
  /** Verifica los bytes: el «par mentiroso» con hash distinto no se usa. */
  verificar: (bytes: Uint8Array, indice: number) => boolean;
  /** Al tener el segmento lo anuncia (respetando el tope de subida prestado). */
  anunciar: (indice: number, bytes: Uint8Array) => void;
  ahora: () => number;
  /** Promesa que resuelve null al vencer el resto del tope (inyectada para las pruebas). */
  esperar: (ms: number) => Promise<null>;
  caducidadMs?: number;
}

/** El tope de subida prestado, con ventana y gasto medidos. Sin tope medido, no se sube. */
export function puedeSubirPrestado(
  topeKbps: number | undefined, usadoVentanaBytes: number, ventanaMs: number, bytesExtra: number,
): boolean {
  if (topeKbps === undefined || ventanaMs <= 0 || bytesExtra < 0) return false;
  return usadoVentanaBytes + bytesExtra <= (topeKbps * 1000 * ventanaMs) / 8000;
}

/** Pide el segmento a los vecinos que lo anuncian; null si nadie lo dio dentro del tope. */
export async function pedirPorMalla(
  con: ConexiónCargadorMalla, indice: number, topeMs: number,
): Promise<Uint8Array | null> {
  const vecinos = quienTiene(con.registro, con.elemento, indice, con.ahora(), con.caducidadMs ?? CADUCIDAD_POR_DEFECTO_MS);
  const fin = con.ahora() + topeMs;
  for (const nodo of vecinos) {
    const restante = fin - con.ahora();
    if (restante <= 0) return null;
    const llegada = con.pedir(nodo, indice).then((b) => (b && con.verificar(b, indice) ? b : null), () => null);
    const bytes = await Promise.race([llegada, con.esperar(restante)]);
    if (bytes) {
      con.anunciar(indice, bytes); // al tenerlo se anuncia: ya es transmisor
      return bytes;
    }
  }
  return null;
}

/** Estadísticas al estilo hls.js para el segmento conseguido por la malla. */
function estadisticas(t: number, bytes: number): LoaderStats {
  return {
    aborted: false, loaded: bytes, retry: 0, total: bytes, chunkCount: 1, bwEstimate: 0,
    loading: { start: t, first: t, end: t },
    parsing: { start: t, end: t },
    buffering: { start: t, first: t, end: t },
  };
}

/**
 * Crea la clase de cargador de fragmentos para hls.js (`fLoader`, versión del repo 1.6.x).
 * Primero la malla, con su tope de espera; si nadie lo dio a tiempo —o el contexto no es un
 * fragmento segmentado, como la lista o el «initSegment»— delega en el origen.
 */
export function crearCargadorMalla(
  con: ConexiónCargadorMalla,
  Respaldo: FragmentLoaderConstructor,
): FragmentLoaderConstructor {
  return class CargadorMalla implements Loader<FragmentLoaderContext> {
    context: FragmentLoaderContext | null = null;
    stats: LoaderStats = estadisticas(0, 0);
    private confg: HlsConfig;
    private respaldoVivo: Loader<FragmentLoaderContext> | null = null;
    private vivo = true;

    constructor(confg: HlsConfig) {
      this.confg = confg;
    }

    load(c: FragmentLoaderContext, config: LoaderConfiguration, cb: LoaderCallbacks<FragmentLoaderContext>): void {
      this.context = c;
      const sn = c?.frag?.sn;
      // Sin número de segmento (lista o el «initSegment») o abortado: respaldo directo.
      if (!this.vivo || typeof sn !== "number" || sn < 0) {
        this.alRespaldo(c, config, cb);
        return;
      }
      void (async () => {
        const bytes = await pedirPorMalla(con, sn, topeEsperaMs(c?.frag?.duration));
        if (!this.vivo) return;
        if (!bytes) {
          this.alRespaldo(c, config, cb);
          return;
        }
        const t = con.ahora();
        cb.onSuccess({ url: c.url, data: bytes }, estadisticas(t, bytes.byteLength), c, undefined);
      })();
    }

    private alRespaldo(
      c: FragmentLoaderContext,
      config: LoaderConfiguration,
      cb: LoaderCallbacks<FragmentLoaderContext>,
    ): void {
      if (!this.vivo) return;
      try {
        const l = new Respaldo(this.confg);
        this.respaldoVivo = l;
        l.load(c, config, cb);
      } catch {
        cb.onError({ code: 0, text: "El fragmento no llegó ni por la malla ni por el origen" }, c, undefined, this.stats);
      }
    }

    abort(): void {
      this.vivo = false;
      this.respaldoVivo?.abort();
    }

    destroy(): void {
      this.vivo = false;
      this.respaldoVivo?.destroy();
      this.respaldoVivo = null;
      this.context = null;
    }
  };
}
