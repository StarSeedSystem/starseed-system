/**
 * actualizador.ts — comprobación e instalación de actualizaciones (ruta pura).
 *
 * Regla del área: el rito guarda su estado en la tabla onboarding_state
 * (columnas skipped/skipped_at). Nunca dejar al usuario en bucle.
 *
 * Los datos de la app viven fuera del binario: el updater de Tauri no los toca.
 * Se comunican con los comandos de Rust en native/src-tauri/src/lib.rs:
 *   · check_update → busca y descarga
 *   · download_and_install → instala y reinicia
 *
 * Para probar sin la app nativa real, se inyecta `tauri` mockeado.
 */

export { EVENTO_ACTUALIZACION } from "./tipos";

export type FaseActualizacion = "buscando" | "descargando" | "instalando" | "lista" | "error" | "al-dia";

export interface EstadoActualizacion {
  fase: FaseActualizacion;
  version?: string;
  descargado?: number;
  total?: number;
  progreso?: number;
  mensaje?: string;
  pendiente_reinicio: boolean;
  ok: boolean;
}

export interface ResultadoActualizacion {
  ok: boolean;
  estado: EstadoActualizacion;
  error?: string;
}

export interface TauriMock {
  core?: {
    invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
  event?: {
    listen?: (event: string, cb: (e: { payload: unknown }) => void) => Promise<() => void>;
  };
  _llamadas?: Array<{ cmd: string; args?: Record<string, unknown> }>;
  _eventos?: Map<string, (e: { payload: unknown }) => void>;
}

import { EVENTO_ACTUALIZACION } from "./tipos";

export const SOLO_NATIVA = "Solo en la app nativa de StarSeed OS.";

function obtenerProgreso(estado: EstadoActualizacion): number | undefined {
  if (estado.descargado !== undefined && estado.total !== undefined && estado.total > 0) {
    return Math.round((estado.descargado / estado.total) * 100);
  }
  return undefined;
}

export function crearEstadoInicial(): EstadoActualizacion {
  return {
    fase: "buscando",
    pendiente_reinicio: false,
    ok: false,
  };
}

export function estadoActualizacion(pred: EstadoActualizacion): EstadoActualizacion {
  return {
    fase: pred.fase,
    version: pred.version,
    descargado: pred.descargado,
    total: pred.total,
    progreso: obtenerProgreso(pred),
    mensaje: pred.mensaje,
    pendiente_reinicio: pred.pendiente_reinicio,
    ok: pred.fase === "al-dia" || pred.fase === "lista",
  };
}

export async function checkUpdate(tauri: TauriMock | null | undefined): Promise<ResultadoActualizacion> {
  const invoke = tauri?.core?.invoke;
  if (!invoke) {
    return {
      ok: false,
      estado: estadoActualizacion({ fase: "error", pendiente_reinicio: false, ok: false }),
      error: SOLO_NATIVA,
    };
  }

  try {
    const resultado = await invoke("check_update") as { ok?: boolean; version?: string } | string;
    if (typeof resultado === "string") {
      return {
        ok: true,
        estado: estadoActualizacion({ fase: "al-dia", pendiente_reinicio: false, ok: true }),
      };
    }
    if (resultado?.ok === false) {
      const estado: EstadoActualizacion = {
        fase: "error",
        pendiente_reinicio: false,
        ok: false,
        mensaje: typeof resultado === "object" ? undefined : "Error desconocido",
      };
      return { ok: false, estado, error: estado.mensaje };
    }
    return {
      ok: true,
      estado: estadoActualizacion({
        fase: "descargando",
        version: resultado?.version,
        pendiente_reinicio: false,
        ok: true,
        mensaje: "Actualización descargada. Reinicia para aplicarla.",
      }),
    };
  } catch (e) {
    return {
      ok: false,
      estado: estadoActualizacion({ fase: "error", pendiente_reinicio: false, ok: false }),
      error: e instanceof Error ? e.message : "Error inesperado",
    };
  }
}

export async function descargarEInstalar(tauri: TauriMock | null | undefined): Promise<ResultadoActualizacion> {
  const invoke = tauri?.core?.invoke;
  if (!invoke) {
    return {
      ok: false,
      estado: estadoActualizacion({ fase: "error", pendiente_reinicio: false, ok: false }),
      error: SOLO_NATIVA,
    };
  }

  try {
    await invoke("check_update");
    return {
      ok: true,
      estado: estadoActualizacion({
        fase: "lista",
        pendiente_reinicio: true,
        ok: true,
        mensaje: "Actualización lista. Reinicia cuando quieras.",
      }),
    };
  } catch (e) {
    return {
      ok: false,
      estado: estadoActualizacion({ fase: "error", pendiente_reinicio: false, ok: false }),
      error: e instanceof Error ? e.message : "Error al instalar",
    };
  }
}

export function reiniciarParaActualizar(tauri: TauriMock | null | undefined): boolean {
  const invoke = tauri?.core?.invoke;
  if (!invoke) return false;
  try {
    invoke("restart_app");
    return true;
  } catch {
    return false;
  }
}

export async function obtenerEstadoActualizacion(tauri: TauriMock | null | undefined): Promise<EstadoActualizacion> {
  const invoke = tauri?.core?.invoke;
  if (!invoke) {
    return estadoActualizacion({ fase: "error", pendiente_reinicio: false, ok: false });
  }

  try {
    const resultado = await invoke("estado_actualizacion") as EstadoActualizacion;
    return estadoActualizacion(resultado);
  } catch {
    return estadoActualizacion({ fase: "error", pendiente_reinicio: false, ok: false });
  }
}

export async function escucharCambiosActualizacion(
  tauri: TauriMock | null | undefined,
  cb: (estado: EstadoActualizacion) => void
): Promise<() => void> {
  const listen = tauri?.event?.listen;
  if (!listen) return () => {};

  try {
    const desuscribir = await listen(EVENTO_ACTUALIZACION, (e: { payload: unknown }) => {
      const estado = e.payload as EstadoActualizacion;
      cb(estadoActualizacion(estado));
    });
    return desuscribir;
  } catch {
    return () => {};
  }
}