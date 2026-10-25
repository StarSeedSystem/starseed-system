/**
 * Guía de introducción · la puerta común para abrirla (§5 de `architecture/guias-introduccion.md`).
 * ═══════════════════════════════════════════════════════════════════════════
 * «Una sola puerta»: quien quiera abrir la guía (la pantalla de acceso, la bienvenida, Ajustes,
 * cada aviso «Inicia sesión para…», un botón suelto) llama a `abrirGuia({desde, temaInicial?})`,
 * que lanza el evento de siempre (`starseed:open-guide`, el que escucha `aurora-guide.tsx`) con de
 * dónde se abre y, si se quiere, el tema por el que empezar.
 *
 * Sobre la puerta vive lo que se decide sin televisión: el modo de la guía (`modoGuia`), las
 * acciones que un paso ofrece en cada modo (`accionesDelPaso`), la capa a la que sube la guía
 * cuando la abre una ventana de acceso o no hay sesión (`zGuia`) y cómo se une lo visto como
 * invitado a la marca de la cuenta (`unirVistas`). El CABLEADO de todo esto (que el panel escuche
 * el `temaInicial`, pinte la capa 240 y muestre la etiqueta) es de GUI1021J: aquí solo hay reglas,
 * sin tocar ni aurora-guide.tsx ni el rito (`onboarding_state`, GUI1021I no entra en ese flujo).
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

// ── modo de la guía: con cuenta o invitado (§5) ──────────────────────────
/** La guía mira a la sesión y decide su modo. El rito (`onboarding_state`) no interviene aquí. */
export type ModoGuia = "invitado" | "cuenta";

/** Con sesión, quien lee la guía es su cuenta; sin sesión, es un invitado en su aparato. */
export function modoGuia(haySesion: boolean): ModoGuia {
  return haySesion ? "cuenta" : "invitado";
}

// ── acciones de un paso según el modo (§5) ───────────────────────────────
/** Lo que un paso de la guía ofrece. `sustituto` solo existe en modo invitado. */
export interface AccionesDelPaso {
  /** Botón «Ir/mostrar»: disponible solo con cuenta (iría detrás del acceso). */
  ir: boolean;
  /** Botón «Hazlo por mí»: idem (no se ejecuta nada real sin cuenta). */
  hazloPorMi: boolean;
  /** La etiqueta que ocupa su sitio en invitado; `null` con cuenta. */
  sustituto: string | null;
}

/** Etiqueta honesta: lo que está detrás lo puede hacer al entrar. */
export const ETIQUETA_INVITADO = "Disponible al entrar";

export function accionesDelPaso(modo: ModoGuia): AccionesDelPaso {
  if (modo === "cuenta") return { ir: true, hazloPorMi: true, sustituto: null };
  return { ir: false, hazloPorMi: false, sustituto: ETIQUETA_INVITADO };
}

// ── por encima de las ventanas de acceso (§5) ────────────────────────────
/** Capa de hoy del panel de la guía en `aurora-guide.tsx` (`z-[95]`). */
export const Z_GUIA_HOY = 95;
/** Capa por encima de la pantalla de acceso (z 200) y de la bienvenida (z 210). */
export const Z_GUIA_SOBRE_ACCESO = 240;

/** Orígenes que son, a la vez, ventanas que piden sesión: si desde ahí se abre, sube a 240. */
export const ORIGENES_VENTANA_ACCESO = ["login", "bienvenida", "aviso"] as const;

/**
 * La capa donde pinta la guía: 240 si se abre desde una ventana de acceso (o sin sesión, que es
 * cuando la guía puede ir sola encima del acceso) o el valor de hoy si no. Pura; GUI1021J la usa.
 */
export function zGuia(desde: OrigenGuia, haySesion: boolean): number {
  return esVentanaDeAcceso(desde) || haySesion === false
    ? Z_GUIA_SOBRE_ACCESO
    : Z_GUIA_HOY;
}

function esVentanaDeAcceso(desde: OrigenGuia): boolean {
  return (ORIGENES_VENTANA_ACCESO as readonly string[]).includes(desde);
}

// ── lo visto como invitado se une a la cuenta (§5) ───────────────────────
/**
 * Al entrar con una cuenta, lo que el invitado ya vio en el aparato (claves de tema) se une a la
 * marca de la cuenta SIN perder nada: dominan los vistos de la cuenta y se suman los del invitado,
 * sin repetir. Nunca en bucle: une sin perder y no repite.
 */
export function unirVistas(local: readonly string[], cuenta: readonly string[]): string[] {
  const unidas = [...cuenta, ...local];
  return Array.from(new Set(unidas));
}
