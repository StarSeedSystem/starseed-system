/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Seguimiento de respuestas («Reply Zero» propio · Ola 1025R)
 * ---------------------------------------------------------------------------
 * Patrón reescrito desde cero a partir del README público de Inbox Zero (AGPL
 * con términos adicionales: no se copia código ni textos). Sirve al alcance
 * (¿respondieron a lo enviado desde la dirección pública?) y a Mensajes.
 *
 * Estados por hilo:
 *   · "por-responder" → el último mensaje es de otro y pasaron más de N horas
 *     sin respuesta mía (24 h por defecto).
 *   · "esperando"     → el último es mío y pasaron más de D días (14 por
 *     defecto para el alcance: recordatorio único a los 14 días).
 *   · "resuelto"      → todo lo demás (recién llegado dentro del margen,
 *     contestado hace poco o hilo sin mensajes).
 *
 * Reloj INYECTADO (`ahora: Date`) y tipos mínimos locales (`HiloLite`) para no
 * importar `os-mail.ts` (que se acopla a Supabase). Módulo puro: sin red,
 * sin disco, sin `node:*`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

/** Hilo de correo reducido a lo que el seguimiento necesita (mapea desde os-mail). */
export interface HiloLite {
  id: string;
  asunto: string;
  /** Autor del último mensaje del hilo.
   */
  ultimoDe: string;
  /** Fecha ISO del último mensaje; "" si el hilo no tiene mensajes. */
  ultimoEn: string;
  tieneAdjunto: boolean;
  etiquetas: string[];
}

export type EstadoSeguimiento = "por-responder" | "esperando" | "resuelto";

export interface ConfigSeguimiento {
  horasPorResponder?: number;
  diasEsperando?: number;
}

export interface ResumenSeguimiento {
  porResponder: string[];
  esperando: string[];
  resuelto: string[];
}

export const DEFECTO_SEGUIMIENTO: { horasPorResponder: number; diasEsperando: number } = {
  horasPorResponder: 24,
  diasEsperando: 14,
};

/* ───────────────────────────── Helpers ─────────────────────────────────── */

function esMismoAutor(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function horasDesde(iso: string, ahora: Date): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Infinity; // fecha rota: se supone más que transcurrida
  return (ahora.getTime() - t) / 3_600_000;
}

/* ────────────────────────── Clasificación ──────────────────────────────── */

export function clasificarHilo(
  hilo: HiloLite,
  yo: string,
  ahora: Date,
  cfg?: ConfigSeguimiento,
): EstadoSeguimiento {
  if (!hilo.ultimoEn) return "resuelto";
  const c = { ...DEFECTO_SEGUIMIENTO, ...cfg };
  if (esMismoAutor(hilo.ultimoDe, yo)) {
    return diasDesde(hilo.ultimoEn, ahora) > c.diasEsperando ? "esperando" : "resuelto";
  }
  return horasDesde(hilo.ultimoEn, ahora) > c.horasPorResponder ? "por-responder" : "resuelto";
}

function diasDesde(iso: string, ahora: Date): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (ahora.getTime() - t) / 86_400_000;
}

/* ───────────────────────────── Resumen ─────────────────────────────────── */

/** Resumen de seguimiento para una lista de hilos: ids de cada estado. */
export function resumenSeguimiento(
  hilos: HiloLite[],
  yo: string,
  ahora: Date,
  cfg?: ConfigSeguimiento,
): ResumenSeguimiento {
  const resumen: ResumenSeguimiento = { porResponder: [], esperando: [], resuelto: [] };
  for (const hilo of hilos) {
    const estado = clasificarHilo(hilo, yo, ahora, cfg);
    const clave = estado === "por-responder" ? "porResponder" : estado;
    resumen[clave].push(hilo.id);
  }
  return resumen;
}

