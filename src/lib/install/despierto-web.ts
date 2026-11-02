"use client";

/**
 * KAL1101E · «Neuronas despiertas» — helper web, honesto con su límite.
 * ─────────────────────────────────────────────────────────────────────────
 * Mientras una pestaña de StarSeed corre un proceso largo (transmisión,
 * estación o contenedor) pide la Screen Wake Lock del navegador y la suelta
 * al terminar el proceso o al ocultarse la pestaña, reintentando al volver
 * visible. La pantalla apagada o la tapa cerrada duermen el equipo IGUAL:
 * el navegador no puede evitarlo — el aviso lo dice y ofrece la app nativa
 * o keepalive (aserciones de IOKit, energía de Windows, inhibidor logind).
 */

/** Procesos largos que piden mantener despierto el aparato. */
export type ProcesoLargo = "transmision" | "estacion" | "contenedor";

/** Qué hacer con el lock en este momento. */
export type AccionDespierto = "pedir" | "soltar" | "seguir" | "nada";

/** Retrato puro del mundo para decidir. */
export interface EstadoDespierto {
  /** Proceso largo activo; null si no hay ninguno. */
  proceso: ProcesoLargo | null;
  /** ¿La pestaña está visible? (el navegador suelta el lock si no). */
  visible: boolean;
  /** ¿Hay un lock vivo ahora mismo? */
  lockVivo: boolean;
}

/** Señal viva del navegador tras pedir el lock (mínima, sin tipos globales). */
export interface DespiertoSenal {
  release(): Promise<void>;
  addEventListener(tipo: string, oyente: () => void): void;
}

const ETIQUETAS: Record<ProcesoLargo, string> = {
  transmision: "Transmisión",
  estacion: "Estación",
  contenedor: "Contenedor",
};

/** Etiqueta legible del proceso para la UI. */
export function etiquetaProceso(proceso: ProcesoLargo): string {
  return ETIQUETAS[proceso];
}

/** PURA: ¿este visor (navegador) ofrece Screen Wake Lock de verdad? */
export function hayWakeLock(visor: unknown): boolean {
  if (!visor || typeof visor !== "object") return false;
  const wakeLock = (visor as { wakeLock?: unknown }).wakeLock;
  if (!wakeLock || typeof wakeLock !== "object") return false;
  return typeof (wakeLock as { request?: unknown }).request === "function";
}

/**
 * PURA · LA COSTURA: dada la realidad del proceso, la pestaña y el lock,
 * decide qué hacer. Reglas:
 *   · Sin soporte o sin proceso activo: lo que toque es soltar.
 *   · Proceso activo y pestaña visible: pedir si no hay lock, seguir si lo hay.
 *   · Pestaña oculta: el navegador ya soltó; nunca se pide.
 */
export function accionDespierto(
  e: EstadoDespierto,
  soportado: boolean,
): AccionDespierto {
  if (!soportado || !e.proceso || !e.visible) {
    return e.lockVivo ? "soltar" : "nada";
  }
  return e.lockVivo ? "seguir" : "pedir";
}

/** PURA · aviso honesto para la UI, según haya o no soporte de Wake Lock. */
export function avisoDespierto(soportado: boolean): string {
  return soportado
    ? "El navegador mantiene el aparato despierto solo con la pestaña a la vista y la pantalla encendida: si cierras la tapa o apagas la pantalla, el equipo se duerme igual. Para procesos largos sin vigilar usa la app nativa o keepalive."
    : "Este navegador no permite Screen Wake Lock: el proceso son solo mientras la pantalla siga encendida y a la vista. Para dejarlo sin vigilar usa la app nativa o keepalive.";
}

/* ═══════ Runtime SSR-safe (nunca lanza) ═══════ */

/** Pide el lock de pantalla del navegador; null si no hay soporte o falla. */
export async function pedirDespierto(): Promise<DespiertoSenal | null> {
  if (typeof navigator === "undefined") return null;
  try {
    const visor = navigator as Navigator & {
      wakeLock?: { request(tipo: "screen"): Promise<DespiertoSenal> };
    };
    if (!hayWakeLock(visor)) return null;
    return await visor.wakeLock.request("screen");
  } catch {
    return null;
  }
}

/** Suelta una señal viva; devuelve si consiguió soltarla. */
export async function soltarDespierto(
  senal: DespiertoSenal | null,
): Promise<boolean> {
  if (!senal) return false;
  try {
    await senal.release();
    return true;
  } catch {
    return false;
  }
}
