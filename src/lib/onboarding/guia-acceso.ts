/**
 * Guía sin cuenta · puerta común y modo invitado (Ola 1021I, §5 de
 * architecture/guias-introduccion.md).
 * ══════════════════════════════════════════════════════════════════════
 * UNA sola puerta para abrir la guía desde cualquier ventana de acceso
 * (`login`, `bienvenida`, `aviso`), desde Ajustes o desde un botón, con
 * o sin cuenta. Lanza el MISMO evento de siempre (`starseed:open-guide`),
 * así que `aurora-guide.tsx` ya la escucha aunque esta capa no exista.
 *
 * MÓDULO PURO: sin `node:*`, sin red, sin Supabase, sin disco. Los efectos
 * (montar botones, pintar por encima, unir lo visto a la cuenta) son de las
 * tareas GUI1021J–O; aquí solo viven las reglas decididas antes de actuar,
 * para que el modo invitado no quede al criterio de cada pantalla.
 *
 * Si no hay `window` (SSR, Node, script fuera del navegador), `abrirGuia`
 * no hace nada y no lanza: la guía nunca está en bucle por un medio sin DOM.
 */

// ── la puerta (evento) ────────────────────────────────────────────────────
// Debe ser EXACTAMENTE el mismo valor que `OPEN_GUIDE_EVENT` en
// `src/components/onboarding/aurora-guide.tsx`. No se importa de allí para no
// tirar un componente cliente al grafo común: la prueba lee ambos archivos y
// compara los literales.
export const EVENTO_ABRIR_GUIA = "starseed:open-guide";

/** De dónde se abre la guía esta vez. */
export type OrigenGuia = "login" | "bienvenida" | "ajustes" | "aviso" | "boton";

export interface DetalleAbrirGuia {
  desde: OrigenGuia;
  /** Tema de la guía por el que empezar, si se pide a alguien concreto. */
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

/** Altura de HOY del panel de la guía (`aurora-guide.tsx`, `z-[95]`). */
export const Z_GUIA_HOY = 95;
/** Por encima de AuthGate (z 200) y la bienvenida (z 210), con margen. */
export const Z_GUIA_SOBRE_ACCESO = 240;

// ── reglas del modo ───────────────────────────────────────────────────────

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
 * abierta a mano o desde Ajustes, la de hoy (95) para no por encima de nada.
 */
export function zGuia(desde: OrigenGuia, haySesion: boolean): number {
  const esVentanaAcceso = (VENTANAS_ACCESO as readonly string[]).includes(desde);
  return !haySesion || esVentanaAcceso ? Z_GUIA_SOBRE_ACCESO : Z_GUIA_HOY;
}

/**
 * La PUERTA: un solo evento, el de siempre, con de dónde se abre y el tema
 * inicial si lo hay. Sin `window` no hace nada (no lanza) y lo dice por su
 * valor de vuelta; en el navegador devuelve true aunque nadie escuche.
 */
export function abrirGuia(detalle: DetalleAbrirGuia): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_GUIA, { detail: detalle }));
    return true;
  } catch {
    return false;
  }
}

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

