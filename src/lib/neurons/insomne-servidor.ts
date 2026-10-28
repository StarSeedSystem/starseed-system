/* insomne-servidor — lee el estado de Insomnia de ESTA neurona (solo servidor).
 * Contrato: architecture/neurona-insomne.md. Solo LEE `session.json` y `state.json`:
 * nunca escribe en la carpeta de Insomnia, nunca ejecuta `pmset` ni usa su regla de
 * sudoers. Ninguna ruta del disco sale de este módulo. */
import { readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

import { estadoDesdeSesionInsomnia, type EstadoInsomne, type SesionInsomniaCruda } from "./insomne";

/** Carpetas de Insomnia dentro del home de la persona, en macOS. */
const CARPETA_INSOMNIA = ["Library", "Application Support", "Insomnia"] as const;

export interface OpcionesLecturaInsomne {
  /** Instante de la lectura; por defecto, ahora. */
  ahora?: Date | number;
  /** Plataforma a simular (`darwin`, `linux`, `win32`…); por defecto, la real. */
  plataforma?: string;
  /** Carpeta de Insomnia a leer; por defecto, la del home de la persona. */
  carpeta?: string;
}

/** Ruta de la carpeta de Insomnia para un home dado (por defecto, el de la persona). */
export function carpetaInsomniaPorDefecto(home: string = homedir()): string {
  return join(home, ...CARPETA_INSOMNIA);
}

/** Lee un JSON de objeto; cualquier fallo (falta, permisos, texto roto) es «no hay datos». */
function leerJson(carpeta: string, nombre: string): Record<string, unknown> | null {
  try {
    const datos: unknown = JSON.parse(readFileSync(join(carpeta, nombre), "utf-8"));
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) return null;
    return datos as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Cierto solo en macOS: en Linux y Windows las olas insomnes son otras. */
function esMac(plataforma: string): boolean {
  const p = plataforma.trim().toLowerCase();
  return p === "darwin" || p === "mac" || p === "macos" || p.startsWith("macos");
}

/**
 * Estado insomne de esta neurona. En macOS lee la sesión de Insomnia y la pasa por
 * `estadoDesdeSesionInsomnia`; en el resto devuelve «sin proveedor activo».
 */
export function leerEstadoInsomne(opciones: OpcionesLecturaInsomne = {}): EstadoInsomne {
  const plataforma = opciones.plataforma ?? platform();
  if (!esMac(plataforma)) {
    return { activo: false, hasta: null, proveedor: "no", motivo: "sin proveedor activo en esta plataforma" };
  }
  const carpeta = opciones.carpeta ?? carpetaInsomniaPorDefecto();
  const sesion = leerJson(carpeta, "session.json");
  const estado = leerJson(carpeta, "state.json");
  if (!sesion && !estado) {
    return {
      activo: false, hasta: null, proveedor: "no",
      motivo: "Insomnia no está instalada o no tiene sesión",
    };
  }
  // `state.json` primero y `session.json` encima: lo que diga la sesión manda.
  const cruda = { ...(estado ?? {}), ...(sesion ?? {}) } as SesionInsomniaCruda;
  return estadoDesdeSesionInsomnia(cruda, opciones.ahora ?? Date.now());
}
