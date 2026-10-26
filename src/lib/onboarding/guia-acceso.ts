/**
 * Guía de introducción · la puerta común para abrirla y las reglas del modo
 * invitado (§5 de `architecture/guias-introduccion.md`).
 * ═══════════════════════════════════════════════════════════════════════════
 * «Una sola puerta»: quien quiera abrir la guía (la pantalla de acceso, la
 * bienvenida, Ajustes, cada aviso «Inicia sesión para…», un botón suelto) llama
 * a `abrirGuia({desde, temaInicial?})`, que lanza el evento de siempre
 * (`starseed:open-guide`, el que escucha `aurora-guide.tsx`) con de dónde se
 * abre y, si se quiere, el tema por el que empezar.
 *
 * Sin cuenta (modo invitado), la guía funciona entera pero «Ir» y «Hazlo por
 * mí» se sustituyen por «Disponible al entrar» y lo visto se une a la marca de
 * la cuenta al entrar: esas reglas viven aquí, en un solo sitio, para que no
 * queden al criterio de cada pantalla.
 *
 * MÓDULO PURO: sin React, sin `node:*`, sin red, sin Supabase, sin disco. Sin
 * `window` (SSR, Node, script fuera del navegador) `abrirGuia` no hace nada y
 * no lanza: la guía nunca queda en bucle por un medio sin DOM. El destino del
 * evento es inyectable para probarlo; el literal del evento se duplica a
 * propósito (no se importa de `aurora-guide.tsx` para no arrastrar un
 * componente cliente al grafo común) y una prueba compara ambos textos.
 */

/** El evento que escucha la guía (mismo valor que `OPEN_GUIDE_EVENT` de `aurora-guide.tsx`). */
export const EVENTO_ABRIR_GUIA = "starseed:open-guide";

/** Desde dónde se puede abrir la guía. */
export const ORIGENES_GUIA = ["login", "bienvenida", "ajustes", "aviso", "boton"] as const;
export type OrigenGuia = (typeof ORIGENES_GUIA)[number];

/** Lo que viaja en el evento: de dónde se abre y, opcionalmente, el tema inicial. */
export interface PeticionGuia {
  desde: OrigenGuia;
  temaInicial?: string;
}

// ── modo invitado ─────────────────────────────────────────────────────────
export type ModoGuia = "invitado" | "cuenta";

/**
 * Lo que se ofrece en CADA paso según el modo. En invitado «Ir» y «Hazlo por
 * mí» van detrás de la pantalla de acceso: no se ofrecen; se muestra la
 * etiqueta honesta «Disponible al entrar». Con cuenta, la guía de siempre.
 */
export interface AccionesPaso {
  /** «Ir/mostrar» — acompañar a la ruta real. */
  puedeIr: boolean;
  /** «Hazlo por mí» — disparar la acción real del paso. */
  puedeHazloPorMi: boolean;
  /** Etiqueta que sustituye esas acciones (null: hay acciones de verdad). */
  etiqueta: string | null;
}

/** Etiqueta única para las acciones reservadas a la cuenta (con acentos). */
export const ETIQUETA_SOLO_CUENTA = "Disponible al entrar";

/** Orígenes que son ventanas de acceso encima de las que la guía se pinta. */
export const VENTANAS_ACCESO: readonly OrigenGuia[] = ["login", "bienvenida", "aviso"];

/** Capa de HOY del panel de la guía (`aurora-guide.tsx`, `z-[95]`). */
export const Z_GUIA_HOY = 95;
/** Por encima de AuthGate (z 200) y la bienvenida (z 210), con margen. */
export const Z_GUIA_SOBRE_ACCESO = 240;

/** Con sesión, guía de cuenta; sin ella, invitado (nunca hay tercera cosa). */
export function modoGuia(haySesion: boolean): ModoGuia {
  return haySesion ? "cuenta" : "invitado";
}

/** Acciones del paso según el modo: en invitado se reservan a la cuenta. */
export function accionesDelPaso(modo: ModoGuia): AccionesPaso {
  if (modo === "cuenta") {
    return { puedeIr: true, puedeHazloPorMi: true, etiqueta: null };
  }
  return {
    puedeIr: false,
    puedeHazloPorMi: false,
    etiqueta: ETIQUETA_SOLO_CUENTA,
  };
}

/**
 * Capa de la guía sobre lo demás: desde una ventana de acceso, o sin sesión
 * (el invitado está AÚN más tapado), por encima de todo (240). Con sesión y
 * abierta a mano o desde Ajustes, la de hoy (95) para no ponerse encima de nada.
 */
export function zGuia(desde: OrigenGuia, haySesion: boolean): number {
  const esVentanaAcceso = (VENTANAS_ACCESO as readonly string[]).includes(desde);
  return !haySesion || esVentanaAcceso ? Z_GUIA_SOBRE_ACCESO : Z_GUIA_HOY;
}

// ── la puerta (evento) ────────────────────────────────────────────────────

/**
 * Abre la guía. Devuelve `true` si el evento salió y `false` si no había dónde
 * lanzarlo (servidor) o el navegador lo impidió. Nunca lanza.
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

/* ─────────── Unir lo visto como invitado a lo de la cuenta ─────────── */

/**
 * Une lo visto como INVITADO (claves de temas o pasos guardadas en el aparato)
 * a la marca de la CUENTA, sin perder nada y sin duplicados: primero lo que la
 * cuenta ya sabía y detrás, nuevo, lo visto en el aparato. Idempotente: unir
 * dos veces lo mismo no repite claves.
 */
export function unirVistas(local: readonly string[], cuenta: readonly string[]): string[] {
  const unidas: string[] = [];
  for (const vista of [...cuenta, ...local]) {
    const clave = (vista ?? "").trim();
    if (clave && !unidas.includes(clave)) unidas.push(clave);
  }
  return unidas;
}
