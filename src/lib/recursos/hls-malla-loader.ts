// Cargador HLS por la malla (architecture/apps-en-la-malla.md §10 · tarea T, Ola 1017A).
// Puro: vecinos, verificación, anuncio, reloj y respaldo llegan inyectados. Primero la malla
// con un tope de espera (300 ms o medio segmento); si no llega, el origen. Al tenerlo se anuncia.
import { CADUCIDAD_POR_DEFECTO_MS, quienTiene, type RegistroDisponibilidad } from "./disponibilidad";
import { armarArbol, recolocar, type ArbolRelevo } from "./arbol-relevo";
import type {
  FragmentLoaderConstructor, FragmentLoaderContext, HlsConfig, Loader, LoaderConfiguration,
  LoaderCallbacks, LoaderStats,
} from "hls.js";

export const TOPE_ESPERA_MS = 300;
/** 300 ms o la mitad del segmento, lo menor: la malla no puede tardar más que el respaldo. */
export function topeEsperaMs(duracionSeg?: number): number {
  const mitad = duracionSeg && duracionSeg > 0 ? (duracionSeg * 1000) / 2 : TOPE_ESPERA_MS;
  return Math.min(TOPE_ESPERA_MS, Math.round(mitad));
}

export type ContextoMalla = "publico" | "cuenta";
export interface ContextoEstacion { enMalla?: boolean; visibilidad?: string; ownerId?: string | null }
/** La malla solo entra en estaciones anunciadas y con contexto público o de la propia cuenta. */
export function contextoMalla(e: ContextoEstacion, cuentaId?: string | null): ContextoMalla | null {
  if (!e.enMalla) return null;
  if (e.visibilidad === "publica") return "publico";
  return e.ownerId && e.ownerId === cuentaId ? "cuenta" : null;
}

/** Lo que el cargador necesita de la malla, todo inyectado (sin red, sin reloj propio). */
export interface ConexiónCargadorMalla {
  elemento: string;
  registro: RegistroDisponibilidad;
  pedir: (nodo: string, indice: number) => Promise<Uint8Array | null>;
  verificar: (bytes: Uint8Array, indice: number) => boolean;
  anunciar: (indice: number, bytes: Uint8Array) => void;
  ahora: () => number;
  esperar: (ms: number) => Promise<null>;
  caducidadMs?: number;
  arbolRelevo?: ArbolRelevo;
  receptor?: string;
}

/** El tope de subida prestado, con ventana y gasto medidos. Sin tope medido, no se sube. */
export function puedeSubirPrestado(
  topeKbps: number | undefined, usadoVentanaBytes: number, ventanaMs: number, bytesExtra: number,
): boolean {
  if (topeKbps === undefined || ventanaMs <= 0 || bytesExtra < 0) return false;
  return usadoVentanaBytes + bytesExtra <= (topeKbps * 1000 * ventanaMs) / 8000;
}

/** Pide el segmento a los vecinos que lo anuncian; null si nadie lo dio dentro del tope.
 * Si hay árbol de relevo, prioriza según el árbol para usar las neuronas con más subida.
 */
export async function pedirPorMalla(
  con: ConexiónCargadorMalla, indice: number, topeMs: number,
): Promise<Uint8Array | null> {
  let vecinos = quienTiene(con.registro, con.elemento, indice, con.ahora(), con.caducidadMs ?? CADUCIDAD_POR_DEFECTO_MS);
  
  // Si hay árbol de relevo y receptor conocido, priorizar por árbol (más cerca del origen = mejor)
  if (con.arbolRelevo && con.receptor) {
    const padreDelReceptor = con.arbolRelevo.padreDe[con.receptor];
    if (padreDelReceptor) {
      // Priorizar el padre directo y luego subir por el árbol
      vecinos = [padreDelReceptor, ...vecinos.filter(v => v !== padreDelReceptor)];
    }
  }
  
  const fin = con.ahora() + topeMs;
  for (const nodo of vecinos) {
    const restante = fin - con.ahora();
    if (restante <= 0) return null;
    let llegada: Promise<Uint8Array | null>;
    try {
      llegada = Promise.resolve(con.pedir(nodo, indice)).then((b) => (b && con.verificar(b, indice) ? b : null), () => null);
    } catch {
      continue;
    }
    const bytes = await Promise.race([llegada, con.esperar(restante)]);
    if (bytes) { con.anunciar(indice, bytes); return bytes; }
  }
  return null;
}

/** Arma el árbol de relevo para el contexto de transmisión */
export function armarArbolParaTransmision(
  origen: string,
  receptores: Array<{ nodoId: string; subidaKbps?: number; latenciaMs?: number }>,
  kbpsFlujo: number
): ArbolRelevo {
  return armarArbol(origen, receptores, kbpsFlujo);
}

/** Recoloca cuando se va un nodo */
export function recolocarEnTransmision(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  return recolocar(arbol, seVa);
}
function estadisticas(t: number, bytes: number): LoaderStats {
  return {
    aborted: false, loaded: bytes, retry: 0, total: bytes, chunkCount: 1, bwEstimate: 0,
    loading: { start: t, first: t, end: t }, parsing: { start: t, end: t },
    buffering: { start: t, first: t, end: t },
  };
}
/** Cargador de fragmentos para hls.js (`fLoader`): malla primero y origen de respaldo. */
export function crearCargadorMalla(
  con: ConexiónCargadorMalla, Respaldo: FragmentLoaderConstructor,
): FragmentLoaderConstructor {
  return class CargadorMalla implements Loader<FragmentLoaderContext> {
    context: FragmentLoaderContext | null = null;
    stats: LoaderStats = estadisticas(0, 0);
    private confg: HlsConfig;
    private respaldoVivo: Loader<FragmentLoaderContext> | null = null;
    private vivo = true;

    constructor(confg: HlsConfig) { this.confg = confg; }
    load(c: FragmentLoaderContext, config: LoaderConfiguration, cb: LoaderCallbacks<FragmentLoaderContext>): void {
      this.context = c;
      const sn = c?.frag?.sn;
      if (!this.vivo || c?.part || typeof sn !== "number" || sn < 0) { this.alRespaldo(c, config, cb); return; }
      void (async () => {
        const bytes = await pedirPorMalla(con, sn, topeEsperaMs(c?.frag?.duration));
        if (!this.vivo) return;
        if (!bytes) { this.alRespaldo(c, config, cb); return; }
        Object.assign(this.stats, estadisticas(con.ahora(), bytes.byteLength));
        cb.onSuccess({ url: c.url, data: bytes }, this.stats, c, undefined);
      })();
    }
    private alRespaldo(c: FragmentLoaderContext, config: LoaderConfiguration, cb: LoaderCallbacks<FragmentLoaderContext>): void {
      if (!this.vivo) return;
      try {
        const l = new Respaldo(this.confg);
        this.respaldoVivo = l;
        l.load(c, config, {
          ...cb,
          onSuccess: (r, s, x, n) => { Object.assign(this.stats, s); cb.onSuccess(r, s, x, n); },
          onError: (e, x, n, s) => { if (s) Object.assign(this.stats, s); cb.onError(e, x, n, s); },
          onTimeout: (s, x, n) => { Object.assign(this.stats, s); cb.onTimeout(s, x, n); },
        });
      } catch {
        cb.onError({ code: 0, text: "El fragmento no llegó ni por la malla ni por el origen" }, c, undefined, this.stats);
      }
    }
    abort(): void { this.vivo = false; this.respaldoVivo?.abort(); }
    destroy(): void {
      this.vivo = false;
      this.respaldoVivo?.destroy();
      this.respaldoVivo = null;
      this.context = null;
    }
  };
}
