/**
 * ════════════════════════════════════════════════════════════════════════════
 * (1105 · VER1105K) Actualizar la app de ESCRITORIO con el updater de Tauri que ya existe.
 * Contrato: architecture/centro-versiones-1105.md §5.
 *
 * Usa los comandos que ya expone `native/src-tauri/src/lib.rs` (solo escritorio; no se toca Rust):
 *   · `check_update`              → busca, DESCARGA e INSTALA la versión nueva por el mismo camino que la
 *                                   vigilancia de 6 h y devuelve un texto («…versión X descargada…» o
 *                                   «Ya estás en la última versión.»).
 *   · `estado_actualizacion`      → el último estado emitido ({fase, version, descargado, total, mensaje,
 *                                   pendiente_reinicio}).
 *   · `reiniciar_para_actualizar` → reinicia para aplicar la versión ya instalada (lo pide la persona).
 * El progreso llega por el evento `starseed://actualizacion` con el mismo payload.
 *
 * SIN PERDER DATOS: el updater (tauri-plugin-updater, módulo `actualizacion` de lib.rs) solo reemplaza
 * el paquete de la app. Los datos viven fuera de él —la carpeta de datos de la app del sistema
 * (`app_data_dir`: antenas.json, capas, carpetas concedidas) y el almacenamiento del WebView
 * (localStorage, IndexedDB, cookies)— y la actualización no los toca.
 * Fuera de la app nativa todo devuelve `{ ok: false, motivo }` y nunca lanza.
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  normalizarEstadoActualizacion,
  type EstadoActualizacionNativa,
} from "@/lib/pwa/actualizacion-nativa-logica";
import { puenteNativo, type PuenteNativo } from "./puente";
import type { Resultado } from "./tipos";

export const COMANDOS_ACTUALIZADOR = {
  comprobar: "check_update",
  estado: "estado_actualizacion",
  reiniciar: "reiniciar_para_actualizar",
} as const;

export const EVENTO_ACTUALIZADOR = "starseed://actualizacion";

export const SOLO_ESCRITORIO = "La actualización de escritorio solo funciona en la app instalada de StarSeed OS.";

export interface ResultadoEscritorio {
  /** true si ya hay una versión nueva descargada e instalada que espera un reinicio. */
  listaParaReiniciar: boolean;
  /** La versión nueva si el texto o el último estado la dicen; `null` si no hay o no se sabe. */
  version: string | null;
  /** El texto de la app, para enseñarlo tal cual. */
  mensaje: string;
}

/** Lee el texto de `check_update` y el último estado (puro). */
export function leerComprobacion(texto: string, ultimo?: unknown): ResultadoEscritorio {
  const mensaje = String(texto ?? "").trim();
  const descargada = /descargad[ao]/i.test(mensaje);
  const enTexto = mensaje.match(/versi[oó]n\s+v?(\d+(?:\.\d+)+[\w.+-]*)/i);
  const estado = normalizarEstadoActualizacion(ultimo);
  const pendiente = Boolean((ultimo as { pendiente_reinicio?: unknown } | null | undefined)?.pendiente_reinicio === true);
  const listaParaReiniciar = descargada || pendiente || estado?.fase === "lista";
  const version = listaParaReiniciar ? (enTexto?.[1] ?? estado?.version ?? null) : null;
  return { listaParaReiniciar, version, mensaje };
}

/**
 * Busca, descarga e instala la versión nueva de escritorio y cuenta el progreso con `onProgreso`.
 * No reinicia: eso lo decide la persona con `reiniciarParaActualizar()`.
 */
export async function actualizarEscritorio(
  onProgreso?: (estado: EstadoActualizacionNativa) => void,
  puente: PuenteNativo = puenteNativo(),
): Promise<Resultado<ResultadoEscritorio>> {
  if (!puente.disponible) return { ok: false, motivo: SOLO_ESCRITORIO };
  let quitar: (() => void) | null = null;
  try {
    if (onProgreso) {
      quitar = await puente.escuchar(EVENTO_ACTUALIZADOR, (payload) => {
        const estado = normalizarEstadoActualizacion(payload);
        if (estado) onProgreso(estado);
      });
    }
    const comprobado = await puente.llamar<string>(COMANDOS_ACTUALIZADOR.comprobar);
    if (!comprobado.ok) return comprobado;
    const ultimo = await puente.llamar<unknown>(COMANDOS_ACTUALIZADOR.estado);
    return { ok: true, valor: leerComprobacion(String(comprobado.valor ?? ""), ultimo.ok ? ultimo.valor : null) };
  } finally {
    quitar?.();
  }
}

/** Reinicia la app para aplicar la versión ya instalada (los datos siguen donde estaban). */
export async function reiniciarParaActualizar(puente: PuenteNativo = puenteNativo()): Promise<Resultado<null>> {
  if (!puente.disponible) return { ok: false, motivo: SOLO_ESCRITORIO };
  const r = await puente.llamar<unknown>(COMANDOS_ACTUALIZADOR.reiniciar);
  return r.ok ? { ok: true, valor: null } : r;
}
