/**
 * Habilidad «grabar la pantalla» · el evento que abre la sección Grabar del Centro de Control (Ola 1025U · REP1026).
 *
 * Contrato entre quien PIDE grabar (la habilidad Cap de Astraura, un botón, una acción de Aurora) y quien lo HACE
 * (la sección Grabar del Centro de Control, que construye otra tarea de la ola). Se hablan solo por este evento de
 * la ventana, así que ninguno importa al otro y cada uno puede existir antes que el otro:
 *
 *   · `starseed:abrir-grabar` es un `CustomEvent` CANCELABLE con `detail: { origen, motivo }`.
 *   · Quien lo escucha (`escucharAbrirGrabar`) lo RECLAMA con `preventDefault()` y abre la sección. Que alguien lo
 *     reclame es la única prueba de que se abrió: si nadie lo hace, `abrirGrabar` devuelve `abierto: false` con
 *     `razon: "sin-oyente"` y un mensaje que lo dice tal cual. Nunca se afirma «abierta» por haber lanzado un evento.
 *
 * El evento solo ABRE la sección: grabar lo decide una persona con su dedo, y el navegador pide además su permiso para
 * capturar la pantalla. Esta habilidad nunca graba por su cuenta.
 *
 * Módulo PURO y SIN "use client": no importa nada del OS; el objetivo del evento se inyecta (por defecto, `window`).
 */

/** Nombre del evento (uno claro y propio, como `starseed:control-center-navigate`). */
export const ABRIR_GRABAR_EVENT = "starseed:abrir-grabar";

/** La web oficial de Cap, la app de escritorio opcional (no se instala desde aquí). */
export const URL_CAP = "https://cap.so";

export interface DetalleAbrirGrabar {
  /** Quién lo pide: `"astraura"`, `"aurora"`, `"biblioteca"`… (máx. 40 caracteres). */
  origen: string;
  /** Para qué se quiere grabar, en una frase, o `null` (máx. 200 caracteres). */
  motivo: string | null;
}

/** Lo mínimo que necesita el emisor de su objetivo (`window` lo cumple). */
export interface EmisorEventos {
  dispatchEvent(evento: Event): boolean;
}

export type ResultadoAbrirGrabar =
  | { abierto: true; mensaje: string }
  | { abierto: false; razon: "sin-ventana" | "sin-oyente"; mensaje: string };

export interface OpcionesAbrirGrabar {
  origen?: string;
  motivo?: string;
  /** Objetivo del evento; por defecto `window` (solo existe en el navegador). */
  destino?: EmisorEventos;
}

const MAX_ORIGEN = 40;
const MAX_MOTIVO = 200;

export const MENSAJE_ABIERTA =
  "Pedí abrir la sección Grabar del Centro de Control. Ahí eres tú quien pulsa «grabar» y el navegador te pedirá permiso para capturar la pantalla.";
export const MENSAJE_SIN_OYENTE =
  "La sección Grabar del Centro de Control todavía no está conectada a esta habilidad, así que no se ha abierto nada. Ábrela a mano desde el Centro de Control.";
export const MENSAJE_SIN_VENTANA = "Aquí no hay pantalla donde abrir la sección Grabar: solo se puede pedir desde el navegador.";

/** Texto corto y sin saltos de línea. */
function limpiar(valor: string | undefined, maximo: number): string | null {
  const texto = (valor ?? "").replace(/\s+/g, " ").trim().slice(0, maximo);
  return texto || null;
}

/** El detalle de un evento, tal como lo lee quien lo escucha (nunca falla: un evento ajeno da valores por defecto). */
export function detalleDe(evento: Event): DetalleAbrirGrabar {
  const bruto = (evento as CustomEvent<Partial<DetalleAbrirGrabar> | null>).detail;
  const origen = typeof bruto?.origen === "string" ? limpiar(bruto.origen, MAX_ORIGEN) : null;
  const motivo = typeof bruto?.motivo === "string" ? limpiar(bruto.motivo, MAX_MOTIVO) : null;
  return { origen: origen ?? "desconocido", motivo };
}

/**
 * Pide abrir la sección Grabar. Devuelve la verdad: `abierto: true` solo si un oyente reclamó el evento.
 * No lanza nunca.
 */
export function abrirGrabar(opciones: OpcionesAbrirGrabar = {}): ResultadoAbrirGrabar {
  const destino = opciones.destino ?? (typeof window !== "undefined" ? window : undefined);
  if (!destino) return { abierto: false, razon: "sin-ventana", mensaje: MENSAJE_SIN_VENTANA };
  const detalle: DetalleAbrirGrabar = {
    origen: limpiar(opciones.origen, MAX_ORIGEN) ?? "astraura",
    motivo: limpiar(opciones.motivo, MAX_MOTIVO),
  };
  try {
    const evento = new CustomEvent<DetalleAbrirGrabar>(ABRIR_GRABAR_EVENT, { detail: detalle, cancelable: true });
    // `dispatchEvent` devuelve false cuando algún oyente llamó a `preventDefault()`: así se reclama.
    const reclamado = !destino.dispatchEvent(evento);
    return reclamado ? { abierto: true, mensaje: MENSAJE_ABIERTA } : { abierto: false, razon: "sin-oyente", mensaje: MENSAJE_SIN_OYENTE };
  } catch {
    return { abierto: false, razon: "sin-oyente", mensaje: MENSAJE_SIN_OYENTE };
  }
}

/**
 * Para la sección Grabar (u otro lugar que sepa abrirla): se apunta al evento, lo RECLAMA y avisa. Devuelve la
 * función que se desapunta. Si no hay dónde escuchar (sin `window`), no hace nada.
 */
export function escucharAbrirGrabar(
  alAbrir: (detalle: DetalleAbrirGrabar) => void,
  destino: EventTarget | undefined = typeof window !== "undefined" ? window : undefined,
): () => void {
  if (!destino) return () => undefined;
  const manejador = (evento: Event): void => {
    evento.preventDefault();
    alAbrir(detalleDe(evento));
  };
  destino.addEventListener(ABRIR_GRABAR_EVENT, manejador);
  return () => destino.removeEventListener(ABRIR_GRABAR_EVENT, manejador);
}
