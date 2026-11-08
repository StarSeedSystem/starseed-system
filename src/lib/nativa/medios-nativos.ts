/*
 * medios-nativos — lo que la app nativa sabe del micrófono, la cámara y la pantalla (MIC1108A, 2026-11-08).
 * Contrato: architecture/apps-autonomas-sin-internet.md §13.
 *
 * `medios_estado` existe desde MIC1108A: si la app no lo responde (o la ACL lo rechaza), es una
 * instalación anterior, que no declara el micrófono ni la cámara al sistema. `medios_abrir_ajustes`
 * abre la pantalla de privacidad del sistema (macOS, Windows) o la ficha de la app (Android).
 * Lo de Tauri se INYECTA (`crearPuente`) para probarlo sin la app. Nunca lanza.
 */

import { crearPuente, type PuenteNativo, type TauriMinimo } from "./puente";
import {
  diagnosticarMedios,
  plataformaDeAgente,
  plataformaDeTexto,
  type AjustesMedios,
  type DiagnosticoMedios,
  type EntornoMedios,
  type PedidoMedios,
} from "@/lib/llamadas/permiso-medios";

/** Espejo de `permisos_medios::EstadoMediosNativo` (native/src-tauri/src/permisos_medios.rs). */
export interface EstadoMediosNativo {
  version: number;
  /** "macos" | "windows" | "linux" | "android" | "ios". */
  plataforma: string;
  declarados: boolean;
  abrir_ajustes: boolean;
}

export const COMANDO_ESTADO_MEDIOS = "medios_estado";
export const COMANDO_AJUSTES_MEDIOS = "medios_abrir_ajustes";

/** Valida lo que devuelve `medios_estado`. Pura. */
export function sanearEstadoMedios(x: unknown): EstadoMediosNativo | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.version !== "number" || !Number.isFinite(o.version) || o.version < 1) return null;
  if (typeof o.plataforma !== "string" || typeof o.declarados !== "boolean" || typeof o.abrir_ajustes !== "boolean") return null;
  return { version: o.version, plataforma: o.plataforma.slice(0, 20), declarados: o.declarados, abrir_ajustes: o.abrir_ajustes };
}

type PuenteMinimo = Pick<PuenteNativo, "disponible" | "llamar">;

/** Dónde corre la página y qué sabe la app (si la hay). Nunca lanza. */
export async function leerEntornoMedios(puente: PuenteMinimo, agente: string): Promise<EntornoMedios> {
  if (!puente.disponible) return { nativa: false, plataforma: plataformaDeAgente(agente), estado: null };
  const r = await puente.llamar<unknown>(COMANDO_ESTADO_MEDIOS);
  const estado = r.ok ? sanearEstadoMedios(r.valor) : null;
  return { nativa: true, plataforma: estado ? plataformaDeTexto(estado.plataforma) : plataformaDeAgente(agente), estado };
}

/** El puente de `window.__TAURI__` tal como está AHORA (sin el guardado de `puenteNativo()`). */
function puenteActual(): PuenteNativo {
  if (typeof window === "undefined") return crearPuente(null);
  return crearPuente((window as unknown as { __TAURI__?: TauriMinimo }).__TAURI__);
}

let guardado: Promise<EntornoMedios> | null = null;

/** El entorno de esta página (se pregunta a la app una sola vez). */
export function entornoMedios(): Promise<EntornoMedios> {
  if (typeof window === "undefined") return Promise.resolve({ nativa: false, plataforma: "otra", estado: null });
  if (!guardado) {
    const agente = typeof navigator !== "undefined" ? navigator.userAgent : "";
    // En la web normal el puente no está disponible y no se pregunta nada.
    guardado = leerEntornoMedios(puenteActual(), agente);
  }
  return guardado;
}

/** Por qué falló un medio en ESTA página y qué decir (pregunta a la app una sola vez). Nunca lanza. */
export async function explicarFalloMedios(err: unknown, pedido: PedidoMedios): Promise<DiagnosticoMedios> {
  let entorno: EntornoMedios = { nativa: false, plataforma: "otra", estado: null };
  try {
    entorno = await entornoMedios();
  } catch {
    /* sin entorno: los textos del navegador */
  }
  return diagnosticarMedios(err, pedido, entorno);
}

/** Solo para pruebas: olvida el entorno guardado. */
export function olvidarEntornoMedios(): void {
  guardado = null;
}

/** Abre los ajustes del sistema donde se da el permiso de `tipo`. Nunca lanza. */
export async function abrirAjustesMedios(
  tipo: AjustesMedios,
  puente: PuenteMinimo = puenteActual(),
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!puente.disponible) return { ok: false, motivo: "Los ajustes del sistema solo se abren desde la app de StarSeed." };
  const r = await puente.llamar<unknown>(COMANDO_AJUSTES_MEDIOS, { tipo });
  return r.ok ? { ok: true } : { ok: false, motivo: r.motivo };
}
