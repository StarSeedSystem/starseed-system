/*
 * puente — envolturas tipadas de los comandos de la app nativa (2026-10-10).
 * Contrato: architecture/apps-nativas-segundo-plano.md §8.
 *
 * Reglas: nunca lanza (devuelve `Resultado`), en la web normal dice «Solo en la app nativa» y
 * nunca inventa un estado. La implementación de Tauri se INYECTA (`crearPuente`) para probarla
 * sin la app; `puenteNativo()` usa la de `window.__TAURI__` (withGlobalTauri en native/).
 * Puro: sin Node, sin React.
 */

import type {
  CarpetaConcedida,
  ConfigAntenas,
  EntradaNas,
  EstadoAntenas,
  EstadoCapasDisco,
  EstadoFondo,
  ModoCarpeta,
  PeticionDescarga,
  Resultado,
  Verificacion,
} from "./tipos";
import { EVENTO_ANTENAS, EVENTO_SERIE, EVENTO_SERIE_CERRADA } from "./tipos";

export const SOLO_NATIVA = "Solo en la app nativa de StarSeed OS.";

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
type Desuscribir = () => void;
type Listen = (evento: string, cb: (e: { payload: unknown }) => void) => Promise<Desuscribir>;

/** Lo mínimo de `window.__TAURI__` que se usa. */
export interface TauriMinimo {
  core?: { invoke?: Invoke };
  event?: { listen?: Listen };
}

function motivoDe(e: unknown): string {
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "La app nativa no respondió.";
}

export interface PuenteNativo {
  disponible: boolean;
  llamar<T>(cmd: string, args?: Record<string, unknown>): Promise<Resultado<T>>;
  escuchar(evento: string, cb: (payload: unknown) => void): Promise<Desuscribir>;
  antenasEstado(): Promise<Resultado<EstadoAntenas>>;
  antenasMedir(): Promise<Resultado<EstadoAntenas>>;
  antenasConfig(): Promise<Resultado<ConfigAntenas>>;
  /** Guarda la configuración ENTERA: lee con `antenasConfig`, cambia un campo y devuélvela. */
  antenasConfigurar(config: ConfigAntenas): Promise<Resultado<EstadoAntenas>>;
  fondoEstado(): Promise<Resultado<EstadoFondo>>;
  fondoFijar(activo: boolean): Promise<Resultado<EstadoFondo>>;
  fondoArranque(activo: boolean): Promise<Resultado<EstadoFondo>>;
  fondoPedirBateria(): Promise<Resultado<EstadoFondo>>;
  carpetasListar(): Promise<Resultado<CarpetaConcedida[]>>;
  /** Abre el selector NATIVO; `valor: null` si la persona lo cerró. */
  carpetasConceder(modo: ModoCarpeta): Promise<Resultado<CarpetaConcedida | null>>;
  carpetasRevocar(ruta: string): Promise<Resultado<CarpetaConcedida[]>>;
  carpetasNas(ruta: string, activo: boolean): Promise<Resultado<CarpetaConcedida>>;
  seriePuertos(): Promise<Resultado<string[]>>;
  serieAbrir(ruta: string, baudios?: number): Promise<Resultado<null>>;
  serieEscribir(datos: Uint8Array): Promise<Resultado<null>>;
  serieCerrar(): Promise<Resultado<null>>;
  capasEstado(): Promise<Resultado<EstadoCapasDisco>>;
  capasDescargar(peticion: PeticionDescarga): Promise<Resultado<Verificacion>>;
  capasVerificar(nombre: string, sha256: string): Promise<Resultado<Verificacion>>;
  capasBorrar(nombre: string): Promise<Resultado<boolean>>;
  nasListar(ruta: string): Promise<Resultado<EntradaNas[]>>;
  /** Trozo ≤ 256 KiB de un archivo compartido (la app lo manda como ArrayBuffer). */
  nasLeer(ruta: string, desde: number, largo: number): Promise<Resultado<Uint8Array>>;
  alCambiarAntenas(cb: (e: EstadoAntenas) => void): Promise<Desuscribir>;
  alRecibirSerie(cb: (datos: Uint8Array) => void): Promise<Desuscribir>;
  alCerrarSerie(cb: (ruta: string) => void): Promise<Desuscribir>;
}

/** Convierte lo que llega de `nas_leer` / `starseed://serie` en bytes. */
export function aBytes(x: unknown): Uint8Array | null {
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  if (Array.isArray(x) && x.every((n) => typeof n === "number" && n >= 0 && n <= 255)) return Uint8Array.from(x as number[]);
  return null;
}

export function crearPuente(tauri: TauriMinimo | null | undefined): PuenteNativo {
  const invoke = tauri?.core?.invoke;
  const listen = tauri?.event?.listen;
  const disponible = typeof invoke === "function";

  async function llamar<T>(cmd: string, args?: Record<string, unknown>): Promise<Resultado<T>> {
    if (!invoke) return { ok: false, motivo: SOLO_NATIVA };
    try {
      return { ok: true, valor: (await invoke(cmd, args)) as T };
    } catch (e) {
      return { ok: false, motivo: motivoDe(e) };
    }
  }

  async function escuchar(evento: string, cb: (payload: unknown) => void): Promise<Desuscribir> {
    if (!listen) return () => {};
    try {
      return await listen(evento, (e) => cb(e?.payload));
    } catch {
      return () => {};
    }
  }

  const nulo = async (r: Promise<Resultado<unknown>>): Promise<Resultado<null>> => {
    const x = await r;
    return x.ok ? { ok: true, valor: null } : x;
  };

  return {
    disponible,
    llamar,
    escuchar,
    antenasEstado: () => llamar("antenas_estado"),
    antenasMedir: () => llamar("antenas_medir"),
    antenasConfig: () => llamar("antenas_config"),
    antenasConfigurar: (config) => llamar("antenas_configurar", { config }),
    fondoEstado: () => llamar("fondo_estado"),
    fondoFijar: (activo) => llamar("fondo_fijar", { activo }),
    fondoArranque: (activo) => llamar("fondo_arranque", { activo }),
    fondoPedirBateria: () => llamar("fondo_pedir_bateria"),
    carpetasListar: () => llamar("carpetas_listar"),
    carpetasConceder: (modo) => llamar("carpetas_conceder", { modo }),
    carpetasRevocar: (ruta) => llamar("carpetas_revocar", { ruta }),
    carpetasNas: (ruta, activo) => llamar("carpetas_nas", { ruta, activo }),
    seriePuertos: () => llamar("serie_puertos"),
    serieAbrir: (ruta, baudios) => nulo(llamar("serie_abrir", { ruta, baudios: baudios ?? null })),
    serieEscribir: (datos) => nulo(llamar("serie_escribir", { datos: Array.from(datos) })),
    serieCerrar: () => nulo(llamar("serie_cerrar")),
    capasEstado: () => llamar("capas_estado"),
    capasDescargar: (peticion) => llamar("capas_descargar", { peticion }),
    capasVerificar: (nombre, sha256) => llamar("capas_verificar", { nombre, sha256 }),
    capasBorrar: (nombre) => llamar("capas_borrar", { nombre }),
    nasListar: (ruta) => llamar("nas_listar", { ruta }),
    nasLeer: async (ruta, desde, largo) => {
      const r = await llamar<unknown>("nas_leer", { ruta, desde, largo });
      if (!r.ok) return r;
      const b = aBytes(r.valor);
      return b ? { ok: true, valor: b } : { ok: false, motivo: "La app devolvió algo que no son bytes." };
    },
    alCambiarAntenas: (cb) => escuchar(EVENTO_ANTENAS, (p) => cb(p as EstadoAntenas)),
    alRecibirSerie: (cb) =>
      escuchar(EVENTO_SERIE, (p) => {
        const b = aBytes((p as { datos?: unknown } | null)?.datos);
        if (b && b.length) cb(b);
      }),
    alCerrarSerie: (cb) => escuchar(EVENTO_SERIE_CERRADA, (p) => cb(typeof p === "string" ? p : "")),
  };
}

/** ¿Corre dentro de la app nativa (Tauri)? */
export function esAppNativa(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { __TAURI__?: TauriMinimo };
  return typeof w.__TAURI__?.core?.invoke === "function";
}

let compartido: PuenteNativo | null = null;

/** El puente de esta ventana (en la web normal, uno que siempre responde «Solo en la app nativa»). */
export function puenteNativo(): PuenteNativo {
  if (compartido) return compartido;
  if (typeof window === "undefined") return crearPuente(null); // servidor: no se guarda
  compartido = crearPuente((window as unknown as { __TAURI__?: TauriMinimo }).__TAURI__);
  return compartido;
}
