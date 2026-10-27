// Cargador HLS por la malla (architecture/apps-en-la-malla.md §10 · tarea T, Ola 1017A).
// Puro: vecinos, verificación, anuncio, reloj y respaldo llegan inyectados. Primero la malla
// con un tope de espera (300 ms o medio segmento); si no llega, el origen. Al tenerlo se anuncia.
import { CADUCIDAD_POR_DEFECTO_MS, quienTiene, type RegistroDisponibilidad } from "./disponibilidad";
import { recolocar, type ArbolRelevo } from "./arbol-relevo";
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
  /** Árbol de relevo del contexto; sin él se pide por el orden de siempre. */
  arbol?: ArbolRelevo;
  /** Este receptor dentro del árbol: se empieza por su padre. */
  receptor?: string;
}

/** El tope de subida prestado, con ventana y gasto medidos. Sin tope medido, no se sube. */
export function puedeSubirPrestado(
  topeKbps: number | undefined, usadoVentanaBytes: number, ventanaMs: number, bytesExtra: number,
): boolean {
  if (topeKbps === undefined || ventanaMs <= 0 || bytesExtra < 0) return false;
  return usadoVentanaBytes + bytesExtra <= (topeKbps * 1000 * ventanaMs) / 8000;
}

/** Ordena los vecinos que tienen el segmento: primero su padre y sus ancestros (la rama
 * que le toca), luego su descendencia y al final el resto. Solo reordena: no inventa
 * quién tiene la pieza. */
export function vecinosPorRelevo(arbol: ArbolRelevo, receptor: string, vecinos: string[]): string[] {
  const orden: string[] = [], vistos = new Set<string>();
  let actual = arbol.padres[receptor];
  while (actual !== undefined && !vistos.has(actual)) {
    vistos.add(actual); orden.push(actual); actual = arbol.padres[actual];
  }
  const hijos: Record<string, string[]> = {};
  for (const [hijo, padre] of Object.entries(arbol.padres)) (hijos[padre] ??= []).push(hijo);
  const cola = [receptor];
  while (cola.length > 0) {
    const id = cola.shift() as string;
    for (const hijo of hijos[id] ?? []) {
      if (vistos.has(hijo)) continue;
      vistos.add(hijo); orden.push(hijo); cola.push(hijo);
    }
  }
  for (const vecino of vecinos) if (!vistos.has(vecino)) orden.push(vecino);
  const conPieza = new Set(vecinos);
  return orden.filter((id) => conPieza.has(id));
}

/** Pide el segmento a los vecinos que lo anuncian; null si nadie lo dio dentro del tope.
 * Con árbol de relevo se empieza por la rama propia; si un nodo del árbol no responde,
 * se recoloca solo su rama y se sigue por el resto. */
export async function pedirPorMalla(
  con: ConexiónCargadorMalla, indice: number, topeMs: number,
): Promise<Uint8Array | null> {
  const vivos = quienTiene(con.registro, con.elemento, indice, con.ahora(), con.caducidadMs ?? CADUCIDAD_POR_DEFECTO_MS);
  const vecinos = con.arbol && con.receptor ? vecinosPorRelevo(con.arbol, con.receptor, vivos) : vivos;
  const fin = con.ahora() + topeMs;
  for (const nodo of vecinos) {
    const restante = fin - con.ahora();
    if (restante <= 0) return null;
    let termino = false;
    let llegada: Promise<Uint8Array | null>;
    try {
      llegada = Promise.resolve(con.pedir(nodo, indice)).then(
        (b) => { termino = true; return b && con.verificar(b, indice) ? b : null; },
        () => { termino = true; return null; },
      );
    } catch {
      termino = true;
      llegada = Promise.resolve(null);
    }
    const bytes = await Promise.race([llegada, con.esperar(restante)]);
    if (bytes) { con.anunciar(indice, bytes); return bytes; }
    if (!termino) return null; // agotó la espera: va lento, no se ha ido
    const arbol = con.arbol;
    if (arbol && con.receptor && nodo !== con.receptor && arbol.padres[nodo] !== undefined) {
      con.arbol = recolocar(arbol, nodo);
    }
  }
  return null;
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
