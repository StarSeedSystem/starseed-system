/**
 * (Ola 2026-11-16) Carga del perfil en la VENTANA DE PERFIL INICIAL — PURO.
 * ═══════════════════════════════════════════════════════════════════════════
 * El `catch` de la carga del perfil se tragaba el fallo: el formulario salía
 * vacío y nadie sabía si era que la cuenta aún no tenía perfil (caso normal)
 * o que la lectura había fallado (red caída, RLS, sesión perdida). Aquí se
 * decide, sin red y sin disco, QUÉ se le dice a la persona y QUÉ se deja en
 * el log.
 *
 * Reglas del rito:
 *  · NUNCA se bloquea el formulario: un fallo es un aviso, no un muro. La
 *    persona puede escribir su perfil igual y el rito sigue su curso.
 *  · NUNCA se confunde «no hay perfil» con «falló la carga»: lo primero es
 *    el caso normal de una cuenta nueva y no debe asustar a nadie.
 *  · NUNCA se traga el error: todo fallo deja una línea en la consola para
 *    que la próxima vez se vea a la primera.
 *
 * Sin React, sin navegador, sin red: se prueba en Node.
 */

import { textoDelError } from "@/lib/onboarding/rastro-primer-arranque";

/** Fila de `profiles` tal y como la ve la ventana (todo opcional). */
export interface FilaPerfilCarga {
  handle?: string | null;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
  avatar_marco?: unknown;
  avatar_3d?: unknown;
}

/** Qué pasó al leer el perfil. */
export type EstadoCargaPerfil =
  /** Se leyó el perfil (aunque viniera a medias). */
  | "cargado"
  /** La cuenta aún no tiene perfil: se edita desde cero (caso normal). */
  | "sin-perfil"
  /** No hay sesión: no se ha podido leer nada. */
  | "sin-sesion"
  /** La lectura falló: se avisa y se deja rastro. */
  | "error";

/** Lo que la ventana sabe tras intentar leer el perfil. */
export interface EntradaCargaPerfil {
  /** ¿Hay sesión iniciada? */
  sesion: boolean;
  /** Fila leída de `profiles` (null si no hay perfil previo). */
  fila: FilaPerfilCarga | null;
  /** Error devuelto por la consulta o excepción capturada. */
  error: unknown;
}

/** Decisión de la carga: qué se pinta, qué se cuenta. */
export interface ResultadoCargaPerfil {
  estado: EstadoCargaPerfil;
  /** Fila a rellenar en el formulario (null si no se pudo leer). */
  fila: FilaPerfilCarga | null;
  /** Aviso honesto para la persona (null si no hay nada que avisar). */
  aviso: string | null;
  /** Línea de consola con el fallo (null si no hubo fallo). */
  rastro: string | null;
}

/** Aviso que se ve en la ventana cuando la lectura del perfil falla. */
export const AVISO_ERROR_CARGA =
  "No se ha podido leer tu perfil. Puedes escribirlo aquí y guardarlo.";

/** Aviso que se ve en la ventana cuando no hay sesión con la que leer. */
export const AVISO_SIN_SESION =
  "No hay sesión iniciada: tu perfil no se ha podido leer.";

/**
 * Rastro de consola: `[perfil-inicial] no se pudo <qué>: <detalle>`.
 * El detalle se reutiliza del módulo hermano (`rastro-primer-arranque`), que
 * ya lo define: no se duplica.
 */
export function rastroCargaPerfil(que: string, detalle: string): string {
  return `[perfil-inicial] no se pudo ${que}: ${detalle}`;
}

/**
 * Decide qué hacer tras intentar leer el perfil. Entrada → salida, sin red.
 */
export function evaluarCargaPerfil(entrada: EntradaCargaPerfil): ResultadoCargaPerfil {
  const { sesion, fila, error } = entrada;

  // Sin sesión no hay nada que leer: se avisa y se cuenta (no es un estado
  // normal, pero TAMPOCO bloquea: la ventana sigue editable).
  if (!sesion) {
    return {
      estado: "sin-sesion",
      fila: null,
      aviso: AVISO_SIN_SESION,
      rastro: rastroCargaPerfil("cargar tu perfil", "no hay sesión iniciada"),
    };
  }

  // Falló la lectura (error de la consulta o excepción): se avisa, se deja
  // rastro y el formulario sigue editable para no atrapar a nadie.
  if (error !== null && error !== undefined) {
    const detalle = textoDelError(error) || "error desconocido";
    return {
      estado: "error",
      fila: null,
      aviso: AVISO_ERROR_CARGA,
      rastro: rastroCargaPerfil("cargar tu perfil", detalle),
    };
  }

  // Sin fila y sin error: la cuenta aún no tiene perfil. Es el caso NORMAL
  // de una cuenta nueva: ni aviso ni rastro, que se edite desde cero.
  if (!fila) {
    return { estado: "sin-perfil", fila: null, aviso: null, rastro: null };
  }

  return { estado: "cargado", fila, aviso: null, rastro: null };
}
