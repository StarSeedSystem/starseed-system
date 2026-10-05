"use client";

/**
 * Aviso de versión nueva por ntfy — puerta 7 del director de producción
 * (`architecture/director-produccion.md`).
 *
 * El director publica en un TEMA FIJO (no es secreto: el cliente NUNCA confía
 * en el aviso; solo lo toma como señal para comprobar `/version.json`, donde
 * un aviso falso no hace nada). Sin Supabase Realtime, para no gastar créditos.
 *
 * La suscripción usa `EventSource` (SSE) contra `https://ntfy.sh/<tema>/sse`,
 * el mismo patrón de `src/lib/notifications/ntfy.ts` (`subscribe()` no vale aquí:
 * espejaría al Centro de Notificaciones y exigiría ajustes activos). Se cierra
 * con la pestaña oculta y reabre al volver, para no gastar conexiones en vano.
 *
 * Nada de este archivo lanza: cualquier fallo deja una limpieza no-op.
 */

/** Tema fijo de ntfy para los avisos de versión (compartido con produccion_avisar.py). */
export const TEMA_VERSION = "starseed-os-version-7f3a";

/** URL SSE del tema (exportada para pruebas y depuración). */
export const URL_SSE_VERSION = `https://ntfy.sh/${TEMA_VERSION}/sse`;

/** Mínimo estructural que usamos de un EventSource (permite inyectar uno falso). */
export interface EventSourceMinimo {
  onmessage: ((ev: { data: string }) => void) | null;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  close: () => void;
}

/** Devuelve true si NO hay nadie escribiendo y ningún formulario pendiente de guardar. */
export function puedeRecargarSuave(doc?: Pick<Document, "activeElement" | "querySelector">): boolean {
  let d: Pick<Document, "activeElement" | "querySelector"> | undefined = doc;
  if (!d && typeof document !== "undefined") d = document;
  if (!d) return true;
  try {
    if (d.querySelector("[data-sin-guardar]")) return false;
    const el = d.activeElement as (HTMLElement & { isContentEditable?: boolean }) | null;
    if (!el) return true;
    const tag = (el.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return false;
  } catch {
    /* ante cualquier fallo, preferimos no molestar */
  }
  return true;
}

export interface OpcionesAvisoVersion {
  /** Fábrica de EventSource (inyectable en pruebas; por defecto el del navegador). */
  crearEventSource?: (url: string) => EventSourceMinimo;
  /** Suscriptor de visibilidad inyectable; por defecto document.visibilitychange. */
  escucharVisibilidad?: (alCambiar: () => void) => (() => void) | null;
  esVisible?: () => boolean;
}

/**
 * Se suscribe al tema de versión por SSE. Cada mensaje válido de ntfy llama a
 * `alAvisar` SIN fiarse de su contenido (la comprobación real la hace el
 * llamador contra `/version.json`). Abierto solo con la pestaña visible; se
 * cierra al ocultarse y reabre al volver. Devuelve la función de cierre.
 */
export function suscribirseAvisoVersion(
  alAvisar: () => void,
  opciones?: OpcionesAvisoVersion,
): () => void {
  try {
    if (typeof window === "undefined" && !opciones?.crearEventSource) return () => {};
    const crear: ((url: string) => EventSourceMinimo) | null =
      opciones?.crearEventSource ||
      (typeof EventSource !== "undefined"
        ? (url) => new EventSource(url) as unknown as EventSourceMinimo
        : null);
    if (!crear) return () => {};

    const esVisible =
      opciones?.esVisible ||
      (() => typeof document === "undefined" || document.visibilityState !== "hidden");
    let cerrado = false;
    let es: EventSourceMinimo | null = null;

    const cerrar = () => {
      try { es?.close(); } catch { /* noop */ }
      es = null;
    };

    const abrir = () => {
      if (cerrado || es || !esVisible()) return;
      try {
        const fuente = crear(URL_SSE_VERSION);
        es = fuente;
        fuente.onmessage = (ev) => {
          try {
            if (!ev || typeof ev.data !== "string") return;
            const data = JSON.parse(ev.data) as { event?: string } | null;
            if (!data || data.event !== "message") return; // open/keepalive: ignorar
            alAvisar();
          } catch { /* un mensaje raro no tumba la suscripción */ }
        };
        fuente.onerror = () => { /* EventSource reconecta solo; sin cierre manual */ };
      } catch {
        es = null;
      }
    };

    const alCambiarVisibilidad = () => { if (esVisible()) abrir(); else cerrar(); };
    let quitaVisibilidad: (() => void) | null = null;
    try {
      quitaVisibilidad = opciones?.escucharVisibilidad
        ? opciones.escucharVisibilidad(alCambiarVisibilidad)
        : (() => {
            if (typeof document === "undefined") return null;
            document.addEventListener("visibilitychange", alCambiarVisibilidad);
            return () => document.removeEventListener("visibilitychange", alCambiarVisibilidad);
          })();
    } catch { /* noop */ }

    abrir();

    return () => {
      cerrado = true;
      cerrar();
      try { quitaVisibilidad?.(); } catch { /* noop */ }
    };
  } catch {
    return () => {};
  }
}
