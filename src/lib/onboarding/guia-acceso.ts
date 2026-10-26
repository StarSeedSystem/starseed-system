/**
 * Guía de introducción · la puerta común para abrirla (§5 de `architecture/guias-introduccion.md`).
 * ═══════════════════════════════════════════════════════════════════════════
 * «Una sola puerta»: quien quiera abrir la guía (la pantalla de acceso, la bienvenida, Ajustes,
 * cada aviso «Inicia sesión para…», un botón suelto) llama a `abrirGuia({desde, temaInicial?})`,
 * que lanza el evento de siempre (`starseed:open-guide`, el que escucha `aurora-guide.tsx`) con de
 * dónde se abre y, si se quiere, el tema por el que empezar.
 *
 * (Ola 1025U · GUIA1025U) La guía que abre este evento recorre el catálogo único de pasos
 * (`guia-completa.ts`, el mismo que la introducción de la ventana de acceso): `temaInicial` es el id de
 * cualquiera de esos pasos y `desde` decide qué hace el final de la guía sin cuenta (en `/login` y
 * `/bienvenida` el formulario ya está detrás; desde cualquier otro sitio se abre la ventana de acceso).
 * Sin `temaInicial`, la guía retoma por donde se quedó (`guia-progreso.ts`) o empieza desde el principio.
 *
 * Módulo PURO: sin React ni `node:*`; el destino del evento es inyectable para probarlo.
 */

import type { TemaGuia } from "./guia-temas-sistema";

/** El evento que escucha la guía (mismo nombre que `OPEN_GUIDE_EVENT` de `aurora-guide.tsx`). */
export const EVENTO_ABRIR_GUIA = "starseed:open-guide";

/** Desde dónde se puede abrir la guía. */
export const ORIGENES_GUIA = ["login", "bienvenida", "ajustes", "aviso", "boton"] as const;
export type OrigenGuia = (typeof ORIGENES_GUIA)[number];

/** Lo que viaja en el evento: de dónde se abre y, opcionalmente, la clave del tema inicial. */
export interface PeticionGuia {
  desde: OrigenGuia;
  temaInicial?: TemaGuia["key"];
}

/**
 * Abre la guía. Devuelve `true` si el evento salió y `false` si no había dónde lanzarlo (servidor)
 * o el navegador lo impidió. Nunca lanza.
 */
export function abrirGuia(peticion: PeticionGuia, destino?: EventTarget | null): boolean {
  const objetivo = destino ?? (typeof window === "undefined" ? null : window);
  if (!objetivo || typeof CustomEvent === "undefined") return false;
  const detalle: PeticionGuia = { desde: peticion.desde };
  if (peticion.temaInicial) detalle.temaInicial = peticion.temaInicial;
  try {
    objetivo.dispatchEvent(new CustomEvent<PeticionGuia>(EVENTO_ABRIR_GUIA, { detail: detalle }));
    return true;
  } catch {
    return false;
  }
}

/* ─────────── Modo invitado: qué se puede dentro de la guía ─────────── */

/**
 * El modo de la guía según haya sesión o no. Con `null` (aún no se sabe) se da
 * modo «cuenta»: hasta confirmar que no hay sesión, no se quita nada a nadie.
 */
export function modoGuia(haySesion: boolean | null): "invitado" | "cuenta" {
  return haySesion === false ? "invitado" : "cuenta";
}

/** Qué acciones ve un paso de la guía en cada modo. */
export interface AccionesPaso {
  /** Hay botón «Ir» (mostrar la zona real). */
  puedeIr: boolean;
  /** Hay botón «Hazlo por mí». */
  puedeHacerPorMi: boolean;
  /** Etiqueta que sustituye a las acciones cuando no están; `null` si sobra. */
  etiquetaSinCuenta: string | null;
}

/** En invitado no hay «Ir» ni «Hazlo por mí»: solo la etiqueta con lo que hay detrás. */
export function accionesDelPaso(modo: "invitado" | "cuenta"): AccionesPaso {
  if (modo === "invitado") {
    return { puedeIr: false, puedeHacerPorMi: false, etiquetaSinCuenta: "Disponible al entrar" };
  }
  return { puedeIr: true, puedeHacerPorMi: true, etiquetaSinCuenta: null };
}

/** z de la capa de la guía abierta desde una ventana de acceso (§5: 240, por encima de AuthGate). */
export const Z_GUIA_SOBRE_ACCESO = 240;

/** z de la capa de la guía de Aurora montada en el layout, lo de hoy. */
export const Z_GUIA_GUARDADA = 95;

/**
 * A qué altura se pinta la guía. Desde una ventana de acceso (o sin sesión, porque
 * igualmente está por encima de todo lo suyo) va por encima de cualquier ventana: 240.
 * Desde Ajustes, un aviso o un botón va el valor de hoy (95); con `null` (aún no se
 * sabe) también: hasta confirmar que no hay sesión, no se mueve a nadie.
 */
export function zGuia(desde: OrigenGuia, haySesion: boolean | null): number {
  if (desde === "login" || desde === "bienvenida") return Z_GUIA_SOBRE_ACCESO;
  return haySesion === false ? Z_GUIA_SOBRE_ACCESO : Z_GUIA_GUARDADA;
}

/* ─────────── Lo visto como invitado se une a la marca de la cuenta ─────────── */

/**
 * Une lo que se vio como invitado (en el aparato) con lo que ya tenía marcado la
 * cuenta, sin perder nada. Gana primero lo de la cuenta; los ids que solo estaban
 * en el aparato se añaden al final. Acepta `null` en cualquiera de las dos.
 */
export function unirVistas(local: readonly string[] | null, cuenta: readonly string[] | null): string[] {
  const resultado: string[] = [];
  const visto = new Set<string>();
  for (const id of cuenta ?? []) {
    if (!visto.has(id)) {
      visto.add(id);
      resultado.push(id);
    }
  }
  for (const id of local ?? []) {
    if (!visto.has(id)) {
      visto.add(id);
      resultado.push(id);
    }
  }
  return resultado;
}

/* ─────────── Lo que pide la guía al terminar sin cuenta (solo en /login y /bienvenida) ─────────── */

/** El evento con el que la guía le dice a la ventana de acceso de la PÁGINA que vaya al formulario. */
export const EVENTO_ACCION_GUIA = "starseed:guia-accion";

/** Qué pidió quien terminó la guía sin cuenta. */
export type AccionGuia = "crear-cuenta" | "entrar";

/**
 * La guía (que va por encima de la página de acceso) pide ir al formulario en la pestaña que toque.
 * Devuelve `true` si el evento salió. Nunca lanza.
 */
export function pedirAccesoDesdeGuia(accion: AccionGuia, destino?: EventTarget | null): boolean {
  const objetivo = destino ?? (typeof window === "undefined" ? null : window);
  if (!objetivo || typeof CustomEvent === "undefined") return false;
  try {
    objetivo.dispatchEvent(new CustomEvent<{ accion: AccionGuia }>(EVENTO_ACCION_GUIA, { detail: { accion } }));
    return true;
  } catch {
    return false;
  }
}

/* ─────────── Por encima de la ventana de acceso y lo visto sin cuenta, unido a la cuenta ─────────── */

/** El valor de la pila de la guía hoy (el de `aurora-guide.tsx`). */
export const Z_GUIA_DE_HOY = 95;

/** El de la guía abierta desde una ventana de acceso o sin sesión: por encima de todo intento. */
export const Z_GUIA_ACCESO = 240;

/** Orígenes que son en sí ventanas de acceso (acceso, bienvenida y aviso de retomar sesión). */
const ORIGENES_DE_ACCESO: readonly OrigenGuia[] = ["login", "bienvenida", "aviso"];

/** La capa de la guía: 240 desde una ventana de acceso o sin sesión; si no, el valor de hoy. */
export function zGuia(desde: OrigenGuia, haySesion: boolean): number {
  return haySesion === false || ORIGENES_DE_ACCESO.includes(desde) ? Z_GUIA_ACCESO : Z_GUIA_DE_HOY;
}

/** Lo visto en la guía como invitado (lo del aparato) se une a la marca de la cuenta sin perder nada. */
export function unirVistas<T>(local: readonly T[] | null, cuenta: readonly T[] | null): T[] {
  const unidas: T[] = [];
  const yaEstan = new Set<T>();
  for (const item of [...(cuenta ?? []), ...(local ?? [])]) {
    if (!yaEstan.has(item)) {
      yaEstan.add(item);
      unidas.push(item);
    }
  }
  return unidas;
}
