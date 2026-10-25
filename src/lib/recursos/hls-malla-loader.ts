// Cargador HLS por la malla (architecture/apps-en-la-malla.md §10 · tarea T · Ola 1017A).
// Núcleo puro: reloj, disponibilidad, transporte, huella y anuncio van inyectados.
// Cada segmento se pide a los vecinos del contexto y, si no llega a tiempo o miente, al origen;
// al tenerlo se anuncia (ya es transmisor) si el tope de subida prestado lo permite.
import type { FragmentLoaderContext, HlsConfig, Loader, LoaderCallbacks, LoaderConfiguration, LoaderStats } from "hls.js";
import { anuncio, fusionar, quienTiene, type AnuncioRecibido, type RegistroDisponibilidad } from "./disponibilidad";
import { sha256Hex } from "./cache-bandas";

export const TOPE_PAR_MS = 300;
const SESION: AnuncioRecibido[] = [];

export interface SegmentoMalla { elemento: string; indice: number; url: string; total?: number; sha256?: string }
export interface DescartadoMalla { nodo: string; motivo: "lento" | "hash" | "fallo" }
export interface ResultadoSegmentoMalla { bytes: Uint8Array; fuente: "par" | "origen"; nodo?: string; descartados: DescartadoMalla[] }
export interface DepsSegmentoMalla {
  ahora(): number; esperar(ms: number): Promise<void>; registro(): RegistroDisponibilidad; yo?: string;
  pedirAPar(nodo: string, segmento: SegmentoMalla, topeMs: number): Promise<ArrayBuffer | Uint8Array | null>;
  bajarDelOrigen(segmento: SegmentoMalla): Promise<ArrayBuffer | Uint8Array>;
  huella?(bytes: ArrayBuffer): Promise<string | null>; anunciar?(segmento: SegmentoMalla): void; puedeAnunciar?(): boolean;
}
export interface OpcionesSegmentoMalla { topeMs?: number; duracionSegmentoMs?: number }

export const contextoPermiteMalla = (v: "publica" | "grupo" | null | undefined): boolean =>
  v === "publica" || v === "grupo";

const aBytes = (x: ArrayBuffer | Uint8Array): Uint8Array => (x instanceof Uint8Array ? x : new Uint8Array(x));
const aBuffer = (x: Uint8Array): ArrayBuffer => new Uint8Array(x).buffer;

const topeDe = (o: OpcionesSegmentoMalla): number => {
  const base = o.topeMs ?? TOPE_PAR_MS;
  return Math.max(1, Math.min(base, o.duracionSegmentoMs ? o.duracionSegmentoMs / 2 : base));
};

export const reiniciarSesionMalla = (): void => { SESION.length = 0; };
export const registrarAnunciosMalla = (nuevos: AnuncioRecibido[]): void => { SESION.push(...nuevos); };
export const registroSesionMalla = (): RegistroDisponibilidad => fusionar(SESION);

export function anunciarSegmentoPropio(nodo: string, s: SegmentoMalla, ahora: number): void {
  const total = Math.max(s.total ?? 0, s.indice + 1);
  registrarAnunciosMalla(anuncio(nodo, s.elemento, total, [s.indice], ahora).map((a) => ({ anuncio: a, recibidoEn: ahora })));
}

export async function cargarSegmentoMalla(
  segmento: SegmentoMalla,
  deps: DepsSegmentoMalla,
  opciones: OpcionesSegmentoMalla = {}
): Promise<ResultadoSegmentoMalla> {
  const topeMs = topeDe(opciones);
  const huella = deps.huella ?? sha256Hex;
  const descartados: DescartadoMalla[] = [];
  const verificar = async (bytes: Uint8Array): Promise<boolean> =>
    !segmento.sha256 || (await huella(aBuffer(bytes))) === segmento.sha256;
  const anunciar = (): void => {
    if (!deps.anunciar || (deps.puedeAnunciar && !deps.puedeAnunciar())) return;
    try { deps.anunciar(segmento); } catch { /* el anuncio no tumba la reproducción */ }
  };
  const nodos = quienTiene(deps.registro(), segmento.elemento, segmento.indice, deps.ahora()).filter((n) => n !== deps.yo);
  const pendientes = new Map<string, Promise<{ nodo: string; bytes?: Uint8Array; motivo?: DescartadoMalla["motivo"] }>>();
  for (const nodo of nodos) pendientes.set(nodo, Promise.race([
    deps.pedirAPar(nodo, segmento, topeMs).then(async (crudo) => {
      if (!crudo) return { nodo, motivo: "fallo" as const };
      const bytes = aBytes(crudo);
      return (await verificar(bytes)) ? { nodo, bytes } : { nodo, motivo: "hash" as const };
    }).catch(() => ({ nodo, motivo: "fallo" as const })),
    deps.esperar(topeMs).then(() => ({ nodo, motivo: "lento" as const })),
  ]));
  while (pendientes.size > 0) {
    const r = await Promise.race(pendientes.values());
    pendientes.delete(r.nodo);
    if (r.bytes) { anunciar(); return { bytes: r.bytes, fuente: "par", nodo: r.nodo, descartados }; }
    descartados.push({ nodo: r.nodo, motivo: r.motivo ?? "fallo" });
  }
  const bytes = aBytes(await deps.bajarDelOrigen(segmento));
  if (!(await verificar(bytes))) throw new Error("El origen devolvió un segmento con huella distinta");
  anunciar();
  return { bytes, fuente: "origen", descartados };
}

function estadisticas(): LoaderStats {
  const t = { start: 0, end: 0 };
  return { aborted: false, loaded: 0, total: 0, retry: 0, chunkCount: 0, bwEstimate: 0, loading: { ...t, first: 0 }, parsing: { ...t }, buffering: { ...t, first: 0 } };
}

function segmentoDeContexto(c: FragmentLoaderContext): SegmentoMalla {
  const sn = c.frag?.sn;
  const indice = typeof sn === "number" ? sn : 0;
  let sha256: string | undefined;
  try { const v = new URL(c.url).searchParams.get("sha256"); if (v && /^[0-9a-f]{64}$/i.test(v)) sha256 = v.toLowerCase(); } catch { /* relativa: sin huella */ }
  return { elemento: c.url, indice, url: c.url, total: indice + 1, sha256 };
}

/** Clase que hls.js instancia con la opción `fLoader`: solo segmentos; las listas van por el cargador normal. */
export function crearCargadorHlsMalla(deps: DepsSegmentoMalla) {
  return class CargadorHlsMalla implements Loader<FragmentLoaderContext> {
    context: FragmentLoaderContext | null = null;
    stats: LoaderStats = estadisticas();
    private vivo = true;
    constructor(_config: HlsConfig) { void _config; }
    destroy(): void { this.abort(); }
    abort(): void { this.vivo = false; this.stats.aborted = true; }
    load(context: FragmentLoaderContext, _config: LoaderConfiguration, callbacks: LoaderCallbacks<FragmentLoaderContext>): void {
      this.context = context;
      this.vivo = true;
      this.stats = estadisticas();
      const duracion = (context.frag?.duration ?? 0) * 1000;
      cargarSegmentoMalla(segmentoDeContexto(context), deps, { duracionSegmentoMs: duracion })
        .then((r) => {
          if (!this.vivo) { callbacks.onAbort?.(this.stats, context, null); return; }
          this.stats.loaded = r.bytes.byteLength; this.stats.total = r.bytes.byteLength; this.stats.chunkCount = 1;
          callbacks.onSuccess({ url: context.url, data: aBuffer(r.bytes) }, this.stats, context, null);
        })
        .catch((error: unknown) => {
          if (!this.vivo) { callbacks.onAbort?.(this.stats, context, null); return; }
          const text = error instanceof Error ? error.message : "No se pudo cargar el segmento";
          callbacks.onError({ code: 2, text }, context, null, this.stats);
        });
    }
  };
}
