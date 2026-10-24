// Cargador HLS por la malla (architecture/apps-en-la-malla.md §10, tarea T · Ola 1017A): vecinos primero, origen si no llega a tiempo. Todo inyectado.
import type { FragmentLoaderConstructor, FragmentLoaderContext, HlsConfig, Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderStats } from "hls.js";
import { quienTiene, type RegistroDisponibilidad } from "./disponibilidad";
export const TOPE_ESPERA_PAR_MS = 300;
/** Lo que un par y el propio nodo saben hacer; sin red ni reloj propios. */
export interface FuentesPares {
  pedirANodo: (nodo: string, indice: number, senal: AbortSignal) => Promise<Uint8Array>;
  sha256: (datos: Uint8Array) => Promise<string>;
  hashEsperado: (indice: number) => string | undefined;
  esperar: (ms: number, senal: AbortSignal) => Promise<void>;
  anunciar: (indice: number, datos: Uint8Array) => void;
  puedeSubir: (bytes: number) => boolean;
}
export interface PeticionSegmento extends FuentesPares {
  elemento: string; indice: number; duracionMs: number;
  registro: RegistroDisponibilidad; ahora: number; caducidadMs?: number;
  bajarOrigen: (senal: AbortSignal) => Promise<Uint8Array>;
}
export interface ResultadoSegmento { datos: Uint8Array; fuente: "malla" | "origen"; nodo?: string; intentos: number; }
export interface AdaptadorMallaHls extends FuentesPares {
  elemento: string; registro: () => RegistroDisponibilidad; ahora: () => number; hayMalla: () => boolean;
}

/** Tope de espera de un par: 300 ms o medio segmento, lo que sea menor. */
export function topeEsperaMs(duracionMs: number): number {
  return Math.max(0, Math.min(TOPE_ESPERA_PAR_MS, Math.floor(duracionMs / 2)));
}
/** La malla solo se usa si está viva y el contexto es público o de la propia cuenta. */
export function contextoAptoMalla(estacion: { en_malla?: boolean; visibilidad?: string }, hayMalla: boolean, deLaCuenta = false): boolean {
  return hayMalla && Boolean(estacion.en_malla) && (estacion.visibilidad === "publica" || deLaCuenta);
}

/** Carrera de pares: gana el primero con el hash pactado; si todos caen, null. */
async function dePares(p: PeticionSegmento, nodos: string[], senal: AbortSignal): Promise<{ datos: Uint8Array; nodo: string } | null> {
  if (nodos.length === 0) return null;
  const tope = topeEsperaMs(p.duracionMs);
  const carreras = nodos.map(async (nodo) => {
    const esperado = p.hashEsperado(p.indice);
    const datos = await Promise.race([
      p.pedirANodo(nodo, p.indice, senal),
      p.esperar(tope, senal).then(() => Promise.reject(new Error("tiempo de espera agotado"))),
    ]);
    if (esperado !== undefined && (await p.sha256(datos)) !== esperado) throw new Error("hash distinto");
    return { datos, nodo };
  });
  return Promise.any(carreras).catch(() => null);
}
function anunciarSiCabe(p: FuentesPares, indice: number, datos: Uint8Array): void {
  if (p.puedeSubir(datos.byteLength)) p.anunciar(indice, datos);
}
/** Resuelve un segmento: primero los pares, y si ninguno sirve a tiempo, el origen. */
export async function cargarSegmento(p: PeticionSegmento): Promise<ResultadoSegmento> {
  const nodos = quienTiene(p.registro, p.elemento, p.indice, p.ahora, p.caducidadMs);
  const control = new AbortController();
  const pares = await dePares(p, nodos, control.signal);
  control.abort();
  if (pares) {
    anunciarSiCabe(p, p.indice, pares.datos);
    return { datos: pares.datos, fuente: "malla", nodo: pares.nodo, intentos: nodos.length };
  }
  const datos = await p.bajarOrigen(new AbortController().signal);
  const esperado = p.hashEsperado(p.indice);
  if (esperado !== undefined && (await p.sha256(datos)) !== esperado) throw new Error("el origen trajo otro hash");
  anunciarSiCabe(p, p.indice, datos);
  return { datos, fuente: "origen", intentos: nodos.length };
}

function estadisticas(): LoaderStats {
  return {
    aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 }, parsing: { start: 0, end: 0 }, buffering: { start: 0, first: 0, end: 0 },
  };
}
export function crearCargadorHlsMalla({ base, contexto }: {
  base: new (config: HlsConfig) => Loader<LoaderContext>;
  contexto: AdaptadorMallaHls;
}): FragmentLoaderConstructor {
  return class CargadorMalla implements Loader<FragmentLoaderContext> {
    context: FragmentLoaderContext | null = null;
    stats: LoaderStats = estadisticas();
    private origen: Loader<FragmentLoaderContext>;
    private control: AbortController | null = null;
    constructor(config: HlsConfig) { this.origen = new base(config) as Loader<FragmentLoaderContext>; }
    destroy(): void { this.control?.abort(); this.origen.destroy(); }
    abort(): void { this.control?.abort(); this.origen.abort(); }
    load(ctx: FragmentLoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<FragmentLoaderContext>): void {
      this.context = ctx;
      const sn = ctx.frag?.sn;
      const indice = typeof sn === "number" ? sn : 0;
      this.control?.abort();
      const control = new AbortController();
      this.control = control;
      const origen = (eventos: LoaderCallbacks<FragmentLoaderContext>) => {
        this.origen.load(ctx, config, {
          ...eventos,
          onSuccess: (res, stats, c, detalles) => {
            const datos = res.data instanceof ArrayBuffer ? new Uint8Array(res.data) : null;
            if (datos && contexto.puedeSubir(datos.byteLength)) contexto.anunciar(indice, datos);
            eventos.onSuccess(res, stats, c, detalles);
          },
        });
      };
      if (!contexto.hayMalla()) { origen(callbacks); return; }
      const peticion: PeticionSegmento = {
        ...contexto, indice, duracionMs: (ctx.frag?.duration ?? 0) * 1000,
        registro: contexto.registro(), ahora: contexto.ahora(),
        bajarOrigen: () => Promise.reject(new Error("el origen lo sirve el cargador base")),
      };
      const nodos = quienTiene(peticion.registro, peticion.elemento, indice, peticion.ahora, peticion.caducidadMs);
      void dePares(peticion, nodos, control.signal).then((pares) => {
        if (control.signal.aborted) { callbacks.onAbort?.(this.stats, ctx, undefined); return; }
        if (!pares) { origen(callbacks); return; }
        if (contexto.puedeSubir(pares.datos.byteLength)) contexto.anunciar(indice, pares.datos);
        const t = contexto.ahora();
        this.stats = { ...estadisticas(), loaded: pares.datos.byteLength, total: pares.datos.byteLength, loading: { start: t, first: t, end: t } };
        callbacks.onSuccess({ url: ctx.url, data: pares.datos.slice().buffer }, this.stats, ctx, undefined);
      }).catch(() => origen(callbacks));
    }
  };
}
