/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Bus de la ventana «Variaciones públicas» (Ola 1019V · contrato: architecture/variaciones-publicas.md §3–§4)
 * ---------------------------------------------------------------------------
 * Mismo patrón que `astraura-158-window-bus.ts`: módulo PURO (sin "use client", sin JSX ni hooks), SSR-safe y
 * que nunca lanza. Cualquier superficie del OS (el clic derecho global, los menús propios, la orbe) abre la
 * ventana con `abrirVariaciones(clave, opciones)` sin acoplarse a quien la monta; el anfitrión
 * (`variaciones-host.tsx`) escucha con `suscribirVariaciones` y apila con `apilarVariaciones`/`cerrarVariacion`.
 * La clave nombra el TIPO de elemento (`widget:clima`), nunca una instancia ni datos privados: se valida al
 * emitir y otra vez al recibir, porque el evento lo puede despachar cualquiera.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { leerClave } from "@/lib/variaciones/clave-elemento";

/** Nombre del evento (una sola constante para que nadie lo escriba distinto). */
export const VARIACIONES_ABRIR_EVENTO = "starseed:variaciones-abrir";

/** Pestañas de la ventana (§4): Variaciones · Notas · Repos externos · Fuentes y versiones. */
export const PESTANAS_VARIACIONES = ["variaciones", "notas", "repos", "fuentes"] as const;
export type PestanaVariaciones = (typeof PESTANAS_VARIACIONES)[number];
export function esPestanaVariaciones(v: unknown): v is PestanaVariaciones {
  return typeof v === "string" && (PESTANAS_VARIACIONES as readonly string[]).includes(v);
}

export interface OpcionesVariaciones {
  /** Nombre legible del elemento para el título (p. ej. «Clima»); si falta, se deduce de la clave. */
  nombre?: string;
  /** Pestaña con la que abrir (por defecto «variaciones»). */
  pestana?: PestanaVariaciones;
  /** Texto con el que abrir el buscador. */
  buscar?: string;
  /** Abrir directamente en «Publicar mi variación» (entrada del menú contextual, §3). */
  publicar?: boolean;
}
export interface DetalleVariaciones { clave: string; opciones: OpcionesVariaciones }
/** Una ventana de la pila; `vez` cuenta las aperturas de esa clave (la ventana puede reaccionar a una reapertura). */
export interface EntradaVariaciones extends DetalleVariaciones { vez: number }

/** Tope defensivo: un emisor descontrolado no apila ventanas sin límite. */
export const MAX_VENTANAS_VARIACIONES = 6;

/** Lo mínimo de `window` que usa el bus; las pruebas inyectan un `EventTarget`. */
export type DestinoEventos = Pick<EventTarget, "addEventListener" | "removeEventListener" | "dispatchEvent">;
const destinoPorDefecto = (): DestinoEventos | null => (typeof window === "undefined" ? null : window);
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : undefined);

/** Valida la clave y deja en las opciones solo lo conocido y con su tipo. */
export function sanearDetalle(clave: unknown, opciones?: unknown): DetalleVariaciones | null {
  if (typeof clave !== "string" || !leerClave(clave)) return null;
  const o = (opciones && typeof opciones === "object" ? opciones : {}) as Record<string, unknown>;
  const limpio: OpcionesVariaciones = {};
  const nombre = texto(o.nombre), buscar = texto(o.buscar);
  if (nombre) limpio.nombre = nombre;
  if (esPestanaVariaciones(o.pestana)) limpio.pestana = o.pestana;
  if (buscar) limpio.buscar = buscar;
  if (o.publicar === true) limpio.publicar = true;
  return { clave, opciones: limpio };
}

/** Abre la ventana de un elemento (o la trae al frente si ya está abierta). false = clave no válida o sin DOM. */
export function abrirVariaciones(clave: string, opciones: OpcionesVariaciones = {}, destino = destinoPorDefecto()): boolean {
  const detalle = sanearDetalle(clave, opciones);
  if (!detalle || !destino) return false;
  try {
    destino.dispatchEvent(new CustomEvent<DetalleVariaciones>(VARIACIONES_ABRIR_EVENTO, { detail: detalle }));
    return true;
  } catch {
    return false;
  }
}

/** Suscribe a las aperturas; devuelve la baja. Ignora eventos con una clave inválida. No-op en servidor. */
export function suscribirVariaciones(cb: (detalle: DetalleVariaciones) => void, destino = destinoPorDefecto()): () => void {
  if (!destino) return () => {};
  const alAbrir = (e: Event) => {
    const d: unknown = (e as CustomEvent<unknown>).detail;
    const r = (d && typeof d === "object" ? d : {}) as Partial<Record<keyof DetalleVariaciones, unknown>>;
    const detalle = sanearDetalle(r.clave, r.opciones);
    if (detalle) cb(detalle);
  };
  destino.addEventListener(VARIACIONES_ABRIR_EVENTO, alAbrir);
  return () => destino.removeEventListener(VARIACIONES_ABRIR_EVENTO, alAbrir);
}

/** Apila: la misma clave no se duplica, pasa al final (al frente) con sus opciones nuevas; nunca más de `max`. */
export function apilarVariaciones(pila: readonly EntradaVariaciones[], d: DetalleVariaciones, max = MAX_VENTANAS_VARIACIONES): EntradaVariaciones[] {
  const previa = pila.find((e) => e.clave === d.clave);
  const siguiente = [...pila.filter((e) => e.clave !== d.clave), { ...d, vez: (previa?.vez ?? 0) + 1 }];
  return siguiente.length > max ? siguiente.slice(siguiente.length - max) : siguiente;
}

export function cerrarVariacion(pila: readonly EntradaVariaciones[], clave: string): EntradaVariaciones[] {
  return pila.filter((e) => e.clave !== clave);
}

/** Título (nombre del elemento) y subtítulo (su familia) de la ventana. */
export function tituloVariaciones(d: DetalleVariaciones): { titulo: string; subtitulo: string } {
  const dosPuntos = d.clave.indexOf(":"), familia = d.clave.slice(0, dosPuntos);
  const [id, parte] = d.clave.slice(dosPuntos + 1).split("#");
  const legible = id.replace(/[-.]+/g, " ");
  const titulo = d.opciones.nombre ?? `${legible.charAt(0).toUpperCase()}${legible.slice(1)}${parte ? ` · ${parte}` : ""}`;
  return { titulo, subtitulo: `Variaciones públicas · ${familia}` };
}
