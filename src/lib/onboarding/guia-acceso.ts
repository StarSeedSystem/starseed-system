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

/* ─────────── Modo de la guía: con cuenta o invitado (§5) ─────────── */

/** Cómo se recorre la guía: con una cuenta propia o como invitado (sin cuenta). */
export type ModoGuia = "cuenta" | "invitado";

/**
 * El modo que toca según si hay sesión. `haySesion === false` es invitado; con sesión o «aún no
 * se sabe» (`null`/`undefined`, `useHaySesion`) es cuenta: mientras no se sepa, no se quita nada.
 */
export function modoGuia(haySesion: boolean | null | undefined): ModoGuia {
  return haySesion === false ? "invitado" : "cuenta";
}

/** Lo que se enseña en modo invitado donde con cuenta habría «Ir»: detrás está la pantalla de acceso. */
export const ETIQUETA_SOLO_CON_CUENTA = "Disponible al entrar";

/** Acciones de un paso, según el modo (§5: en invitado no hay «Ir» ni «Hazlo por mí»). */
export interface AccionesDelPaso {
  /** «Ir/mostrar»: acompañar a la ruta o el borde del paso. */
  conIr: boolean;
  /** «Hazlo por mí»: disparar la acción real de la interfaz (anda sin cuenta, toca al sistema). */
  conHazloPorMi: boolean;
  /** Etiqueta que sustituye a «Ir» en invitado; con cuenta no se enseña (queda por si una parte la pide). */
  etiquetaSoloConCuenta: string;
}

/** Con cuenta, «Ir» y «Hazlo por mí» están; en invitado, ninguno: solo «Disponible al entrar». */
export function accionesDelPaso(modo: ModoGuia): AccionesDelPaso {
  return modo === "invitado"
    ? { conIr: false, conHazloPorMi: false, etiquetaSoloConCuenta: ETIQUETA_SOLO_CON_CUENTA }
    : { conIr: true, conHazloPorMi: true, etiquetaSoloConCuenta: ETIQUETA_SOLO_CON_CUENTA };
}

/* ─────────── Por encima de las ventanas de acceso (§5) ─────────── */

/** Elevación de la guía de Aurora HOY (`aurora-guide.tsx` la pinta en `z-[95]`). */
export const Z_GUIA_HOY = 95;

/** Elevación que le hace sitio por encima de la pantalla de acceso (`AuthGate`, z 200) y la bienvenida (z 210). */
export const Z_GUIA_SOBRE_ACCESO = 240;

/**
 * A qué altura se pinta la guía: por encima de las ventanas de acceso si se abre desde `login` o
 * `bienvenida`, o si se la recorre sin cuenta; a su altura de hoy en el resto de los casos.
 */
export function zGuia(desde: OrigenGuia, haySesion: boolean | null | undefined): number {
  const porEncima = desde === "login" || desde === "bienvenida" || haySesion === false;
  return porEncima ? Z_GUIA_SOBRE_ACCESO : Z_GUIA_HOY;
}

/* ─────────── Lo visto como invitado se une a la cuenta (§5) ─────────── */

/**
 * Une las vistas guardadas en el aparato (lo recorrido como invitado) con la marca de la cuenta,
 * sin perder ninguna: primero la de la cuenta (ya sincronizada entre medios) y detrás lo local
 * que no estuviera. Idempotente; una entrada nula o vacía cuenta como «sin vistas», no como error.
 */
export function unirVistas(
  local: readonly string[] | null | undefined,
  cuenta: readonly string[] | null | undefined,
): string[] {
  const unidas: string[] = [];
  for (const vista of [...(cuenta ?? []), ...(local ?? [])]) {
    if (!unidas.includes(vista)) unidas.push(vista);
  }
  return unidas;
}
