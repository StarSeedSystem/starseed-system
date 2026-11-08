/**
 * ════════════════════════════════════════════════════════════════════════════
 * (ACT1108B · 2026-11-08) El estado EN VIVO de la actualización de esta app, compartido.
 * Contrato: architecture/centro-versiones-1105.md §9.
 *
 * Quien hace el trabajo es la ventana `AvisoActualizacion` (montada en el layout). Ajustes › «Versión y
 * actualizaciones», Configuración › Esta neurona y el botón «Actualizar» de la Librería leen y mueven
 * ESTE estado: así los tres enseñan lo mismo y el botón de la Librería ya no dispara un evento al vacío.
 * Módulo sin React ni DOM obligatorio (se prueba solo).
 * ════════════════════════════════════════════════════════════════════════════
 */

import type { ErrorActualizacion } from "./errores";

/** Evento de ventana: «abre/continúa la actualización» (lo recoge `AvisoActualizacion`). */
export const EVENTO_ACTUALIZAR_VERSION = "starseed:actualizar-version";

export type FaseVida = "inactivo" | "buscando" | "disponible" | "descargando" | "lista" | "instalador" | "al-dia" | "error";

export interface EstadoVivo {
  fase: FaseVida;
  /** Texto para la persona (ya en español). */
  mensaje: string;
  /** Versión nueva ofrecida (si se sabe). */
  version: string | null;
  /** 0–100 si se sabe. */
  progreso: number | null;
  /** Solo con fase «error». */
  error: ErrorActualizacion | null;
  /** epoch ms del último cambio. */
  en: number;
}

const INICIAL: EstadoVivo = { fase: "inactivo", mensaje: "", version: null, progreso: null, error: null, en: 0 };

let actual: EstadoVivo = INICIAL;
const oyentes = new Set<() => void>();

export function leerEstadoVivo(): EstadoVivo {
  return actual;
}

/** Cambia el estado (lo que no se pasa se conserva salvo `error`/`progreso`, que se limpian si cambia la fase). */
export function publicarEstadoVivo(cambio: Partial<EstadoVivo> & { fase: FaseVida }, ahora: number = Date.now()): EstadoVivo {
  const cambiaFase = cambio.fase !== actual.fase;
  actual = {
    ...actual,
    error: cambiaFase ? null : actual.error,
    progreso: cambiaFase ? null : actual.progreso,
    ...cambio,
    en: ahora,
  };
  for (const f of [...oyentes]) {
    try {
      f();
    } catch {
      /* un oyente roto no tumba a los demás */
    }
  }
  return actual;
}

export function suscribirEstadoVivo(f: () => void): () => void {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

/** Solo para pruebas. */
export function reiniciarEstadoVivo(): void {
  actual = INICIAL;
  oyentes.clear();
}

/** ¿Hay trabajo en marcha (no se lanza otro encima)? Pura. */
export function ocupado(e: EstadoVivo): boolean {
  return e.fase === "buscando" || e.fase === "descargando";
}

/** Pide a la ventana que continúe/abra la actualización (Librería, Ajustes, Esta neurona). */
export function pedirActualizar(detalle: { version?: string; origen?: string } = {}): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_ACTUALIZAR_VERSION, { detail: detalle }));
  } catch {
    /* sin window */
  }
}

/** Etiqueta corta de la fase, para una pastilla. Pura. */
export function etiquetaFase(f: FaseVida): string {
  switch (f) {
    case "buscando":
      return "Buscando…";
    case "disponible":
      return "Versión nueva disponible";
    case "descargando":
      return "Descargando…";
    case "lista":
      return "Lista para instalar";
    case "instalador":
      return "Esperando tu confirmación";
    case "al-dia":
      return "Al día";
    case "error":
      return "No se pudo comprobar";
    default:
      return "Sin comprobar";
  }
}
