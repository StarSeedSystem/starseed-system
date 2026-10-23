/**
 * Guía de introducción · PUERTA COMÚN y modo invitado (Ola 1021 · GUI1021I).
 *
 * Una sola puerta para abrir la guía desde cualquier ventana —incluso sin
 * cuenta—: `abrirGuia({ desde, temaInicial? })` lanza el mismo evento que ya
 * escucha el tour de Aurora (`OPEN_GUIDE_EVENT` de `aurora-guide.tsx`). El
 * alcance completo está en `architecture/guias-introduccion.md` §5.
 *
 * Módulo PURO: sin `node:*`, sin red y sin disco. El único efecto es el evento
 * del navegador; sin `window` no hace nada y nunca lanza.
 */

/** Evento de apertura: el mismo de siempre (igual a `OPEN_GUIDE_EVENT`). */
export const EVENTO_ABRIR_GUIA = "starseed:open-guide";

/** Capa z del panel de la guía HOY (`z-[95]` en aurora-guide.tsx). */
export const Z_GUIA_HOY = 95;

/** Capa z POR ENCIMA de las ventanas de acceso (AuthGate z 200, bienvenida z 210). */
export const Z_GUIA_SOBRE_ACCESO = 240;

/** Etiqueta que sustituye a «Ir» y «Hazlo por mí» en modo invitado. */
export const ETIQUETA_DISPONIBLE_AL_ENTRAR = "Disponible al entrar";

/** Dónde está el botón (o la situación) que pide abrir la guía. */
export type OrigenGuia = "login" | "bienvenida" | "ajustes" | "aviso" | "boton";

/** Modo de la guía: con cuenta o en modo invitado (sin cuenta). */
export type ModoGuia = "invitado" | "cuenta";

/** Ventanas que PIDEN cuenta: sobre ellas la guía se pinta por encima. */
const ORIGENES_DE_ACCESO: readonly OrigenGuia[] = ["login", "bienvenida", "aviso"];

/** ¿Se abre la guía desde una ventana de acceso (login, bienvenida o aviso)? */
export function esOrigenDeAcceso(desde: OrigenGuia): boolean {
  return ORIGENES_DE_ACCESO.includes(desde);
}

export interface DetalleAbrirGuia {
  /** De dónde se abre (el futuro panel lo usa para su capa z y su modo). */
  desde: OrigenGuia;
  /** Tema de la guía por el que empezar, si se pide uno concreto. */
  temaInicial?: string;
}

/**
 * Una sola puerta: abre la guía desde cualquier sitio, con o sin sesión. Despacha
 * `EVENTO_ABRIR_GUIA` con `{ desde, temaInicial? }` como detalle. Sin `window`
 * (servidor, XR inmersivo, pruebas) no hace nada y nunca lanza.
 */
export function abrirGuia(
  { desde, temaInicial }: DetalleAbrirGuia,
  ventana?: Pick<Window, "dispatchEvent">,
): void {
  const destino = ventana ?? (typeof window === "undefined" ? undefined : window);
  if (!destino) return;
  const detalle: DetalleAbrirGuia = { desde };
  if (temaInicial) detalle.temaInicial = temaInicial;
  try {
    destino.dispatchEvent(new CustomEvent(EVENTO_ABRIR_GUIA, { detail: detalle }));
  } catch {
    /* la guía no puede tumbar la ventana que la abre */
  }
}

/** Modo de la guía según haya o no sesión. */
export function modoGuia(haySesion: boolean): ModoGuia {
  return haySesion ? "cuenta" : "invitado";
}

export interface AccionesPaso {
  /** «Ir/mostrar» — acompañar a la ruta real del paso. */
  puedeIr: boolean;
  /** «Hazlo por mí» — disparar la acción del paso. */
  puedeHacerlo: boolean;
  /** En invitado: la etiqueta que ocupa su lugar. En cuenta: null. */
  etiquetaDisponibleAlEntrar: string | null;
}

/**
 * Acciones disponibles en UN paso según el modo. En invitado ni «Ir» ni
 * «Hazlo por mí» (detrás está la pantalla de acceso): en su lugar,
 * «Disponible al entrar».
 */
export function accionesDelPaso(modo: ModoGuia): AccionesPaso {
  if (modo === "invitado") {
    return {
      puedeIr: false,
      puedeHacerlo: false,
      etiquetaDisponibleAlEntrar: ETIQUETA_DISPONIBLE_AL_ENTRAR,
    };
  }
  return { puedeIr: true, puedeHacerlo: true, etiquetaDisponibleAlEntrar: null };
}

/**
 * Capa z del panel de la guía: 240 (por encima de cualquier ventana de acceso)
 * si se abre desde una de ellas O si no hay sesión; si no, el valor de hoy (95).
 */
export function zGuia(desde: OrigenGuia, haySesion: boolean): number {
  if (!haySesion || esOrigenDeAcceso(desde)) return Z_GUIA_SOBRE_ACCESO;
  return Z_GUIA_HOY;
}

/**
 * Une lo VISTO de la guía: lo que marcó el aparato como invitado (`local`) se
 * une a la marca de la cuenta (`cuenta`) sin perder ninguna clave y sin
 * duplicados. Así, al entrar con cuenta, los temas ya explicados constan.
 */
export function unirVistas(local: string[], cuenta: string[]): string[] {
  const salida: string[] = [];
  for (const clave of [...(cuenta || []), ...(local || [])]) {
    if (clave && !salida.includes(clave)) salida.push(clave);
  }
  return salida;
}
