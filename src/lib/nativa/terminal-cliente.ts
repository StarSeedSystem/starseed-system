/*
 * terminal-cliente — la terminal entre neuronas vista desde la web (TRM1125B, parte 3).
 * Contrato: architecture/terminal-entre-neuronas.md. Espejo de native/src-tauri/src/terminal_remota.rs.
 *
 * La web NO ejecuta nada: valida la orden a la vista, pide a la app nativa `terminal_ejecutar` (la decisión
 * final y el permiso viven en Rust, apagados por defecto) y traduce los rechazos a frases claras. Las
 * contraseñas nunca viajan: aquí no hay ningún campo para ellas.
 * Puro: sin Node, sin React. El puente se inyecta.
 */

import type { Resultado } from "./tipos";

export const COMANDO_TERMINAL_EJECUTAR = "terminal_ejecutar";
export const COMANDO_TERMINAL_CANCELAR = "terminal_cancelar";
export const EVENTO_TERMINAL_STDOUT = "terminal:stdout";
export const EVENTO_TERMINAL_STDERR = "terminal:stderr";

/** Mismos topes por defecto que `LimitesTerminal::default()` en Rust. */
export const ORDEN_MAX_CHARS = 8_000;
export const TIEMPO_MAX_DEFECTO_MS = 30_000;
export const SALIDA_MAX_DEFECTO_BYTES = 100_000;

export type NivelTerminal = "usuario" | "administrador";

/** Lo que devuelve Rust (`TerminalRemotaResultado`). */
export interface ResultadoTerminal {
  stdout: string;
  stderr: string;
  code: number | null;
  success: boolean;
  truncada: boolean;
  tiempo_agotado: boolean;
}

/** Línea de salida en vivo (evento `terminal:stdout` o `terminal:stderr`). */
export interface LineaTerminal {
  orden: string;
  linea: string;
}

export interface OpcionesTerminal {
  nivel?: NivelTerminal;
  tiempo_max_ms?: number;
  salida_max_bytes?: number;
}

type Llamar = <T>(cmd: string, args?: Record<string, unknown>) => Promise<Resultado<T>>;

/** Motivo por el que la orden no se envía, o null si cabe. Rust vuelve a decidir: esto solo evita un viaje inútil. */
export function motivoOrdenInvalida(orden: string): string | null {
  if (orden.trim().length === 0) return "La orden está vacía.";
  if (orden.length > ORDEN_MAX_CHARS) return `La orden pasa de ${ORDEN_MAX_CHARS} caracteres.`;
  return null;
}

/** Quita los topes inválidos (no positivos o no finitos): Rust usa su defecto. */
function topeValido(n: number | undefined): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/** Parámetros exactos que espera `TerminalEjecutarParams`. */
export function paramsEjecutar(orden: string, op: OpcionesTerminal = {}): Record<string, unknown> {
  const params: Record<string, unknown> = { orden, nivel: op.nivel ?? "usuario" };
  const t = topeValido(op.tiempo_max_ms);
  const s = topeValido(op.salida_max_bytes);
  if (t !== undefined) params.tiempo_max_ms = t;
  if (s !== undefined) params.salida_max_bytes = s;
  return { params };
}

/** Frase para una persona a partir del error de Rust. Nunca enseña códigos sueltos. */
export function fraseTerminal(motivo: string | null | undefined): string {
  const m = String(motivo ?? "");
  if (/^no-aplica/.test(m)) return "Esta terminal solo funciona desde la ventana principal de la app nativa.";
  if (/^ocupado/.test(m)) return "Ya hay una orden ejecutándose en este aparato. Espera o pulsa «Terminar».";
  if (/^nivel inválido/.test(m)) return "El nivel de terminal no es válido: usa «usuario» o «administrador».";
  if (/acceso:sin-concesion/.test(m)) return "Este aparato no ha dado «acceso al equipo»: su dueño debe encenderlo en él.";
  return m.length > 0 ? m : "La terminal no respondió.";
}

/** Ejecuta una orden en el aparato. Nunca lanza; valida antes de molestar a la app. */
export async function ejecutarTerminal(
  llamar: Llamar,
  orden: string,
  op: OpcionesTerminal = {},
): Promise<Resultado<ResultadoTerminal>> {
  const invalida = motivoOrdenInvalida(orden);
  if (invalida) return { ok: false, motivo: invalida };
  const r = await llamar<ResultadoTerminal>(COMANDO_TERMINAL_EJECUTAR, paramsEjecutar(orden, op));
  return r.ok ? r : { ok: false, motivo: fraseTerminal(r.motivo) };
}

/** «Terminar»: corta la orden en curso. */
export function cancelarTerminal(llamar: Llamar): Promise<Resultado<null>> {
  return llamar<null>(COMANDO_TERMINAL_CANCELAR);
}

/** Resumen de una línea para el registro legible. */
export function resumenResultado(r: ResultadoTerminal): string {
  if (r.tiempo_agotado) return "Se cortó por tiempo agotado.";
  const fin = r.success ? "terminó bien" : `terminó con código ${r.code ?? "desconocido"}`;
  return r.truncada ? `${fin}; la salida se recortó.` : `${fin}.`;
}
